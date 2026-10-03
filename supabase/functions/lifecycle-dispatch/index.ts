// Supabase Edge Function — lifecycle-dispatch, appelée toutes les 15 min par
// pg_cron (migration 0033). Décide, pour chaque personne concernée, du
// prochain email (supabase/functions/_shared/lifecycle-core.js), le rend
// (lifecycle-templates.ts) et l'envoie (lifecycle-send.ts).
//
// Sécurité :
//   - appel autorisé uniquement avec x-cron-secret = lifecycle_settings.cron_token
//     (généré par la base, jamais dans le dépôt) ;
//   - kill_switch ou enabled = false -> rien n'est fait ;
//   - test_mode -> AUCUN envoi réel : la décision est journalisée (status
//     "test") avec le sujet, pour vérifier la mécanique sans toucher
//     personne. L'envoi d'un email de test vers soi passe par
//     admin-lifecycle (action send_test).
// Garde-fous d'envoi : consentement marketing, désinscription, adresse
// supprimée (bounce/plainte), plafond 1 email marketing / 24 h, heures calmes
// et heure habituelle, groupe témoin 10 %, clé d'idempotence unique.
// Déployée avec --no-verify-jwt (le cron n'a pas de session).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { nextEmail, preferredHour, canSendNow, TOTAL_SCREENS, HOUR } from "../_shared/lifecycle-core.js";
import { renderEmail, ctaDestination } from "../_shared/lifecycle-templates.ts";
import { buildLinks, sendWithResend } from "../_shared/lifecycle-send.ts";

const MAX_SENDS_PER_RUN = 60;
const LOOKBACK_DAYS = 14;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const { data: settings, error: settingsErr } = await admin.from("lifecycle_settings").select("*").eq("id", true).single();
  if (settingsErr || !settings) return json({ error: "Réglages introuvables." }, 500);
  if (!req.headers.get("x-cron-secret") || req.headers.get("x-cron-secret") !== settings.cron_token) {
    return json({ error: "Non autorisé." }, 401);
  }
  if (settings.kill_switch) return json({ skipped: "kill_switch" });
  if (!settings.enabled) return json({ skipped: "disabled" });

  const now = Date.now();
  const since = new Date(now - LOOKBACK_DAYS * 24 * HOUR).toISOString();

  // ---- Personnes concernées ---------------------------------------------------
  // (a) un déclencheur récent ; (b) un quiz arrêté en cours de route.
  const candidateIds = new Set<string>();
  const { data: triggers } = await admin
    .from("events")
    .select("user_id")
    .in("type", ["result_viewed", "checkout_opened", "payment_failed"])
    .gte("created_at", since)
    .limit(2000);
  for (const t of triggers ?? []) candidateIds.add(t.user_id);
  const { data: stopped } = await admin
    .from("profiles")
    .select("id")
    .gt("funnel_last_step", 0)
    .lt("funnel_last_step", TOTAL_SCREENS)
    .eq("marketing_opt_in", true)
    .gte("updated_at", since)
    .lte("updated_at", new Date(now - 24 * HOUR).toISOString())
    .limit(500);
  for (const p of stopped ?? []) candidateIds.add(p.id);

  const stats = { candidates: candidateIds.size, sent: 0, test: 0, holdout: 0, failed: 0, deferred: 0 };

  for (const userId of candidateIds) {
    if (stats.sent + stats.test >= MAX_SENDS_PER_RUN) break;
    try {
      const [{ data: profile }, { data: events }, { data: sends }] = await Promise.all([
        admin
          .from("profiles")
          .select("prenom, paid_at, subscription_status, marketing_opt_in, marketing_opt_in_at, unsubscribed_at, email_suppressed_at, funnel_last_step, updated_at, objectif_mensuel, delai_mois, temps, secteur, blocage")
          .eq("id", userId)
          .maybeSingle(),
        admin.from("events").select("id, type, created_at, amount_cents, metadata").eq("user_id", userId).gte("created_at", since).order("created_at"),
        admin.from("lifecycle_sends").select("sequence, step, status, idempotency_key, created_at").eq("user_id", userId),
      ]);
      if (!profile) continue;

      const paid = !!profile.paid_at || ["active", "trialing"].includes(profile.subscription_status ?? "");
      // Traces du mode test (clé "test:...") : en mode test, elles simulent
      // les envois (cadence réaliste) ; en mode réel, elles sont ignorées
      // et ne consomment jamais la clé d'un vrai envoi.
      const effectiveSends = (sends ?? [])
        .filter((s) => (settings.test_mode ? true : s.status !== "test"))
        .map((s) => (s.status === "test" ? { ...s, idempotency_key: s.idempotency_key.replace(/^test:/, "") } : s));
      const decision = nextEmail({
        now,
        userId,
        holdoutPercent: settings.holdout_percent,
        profile: {
          paid,
          optIn: profile.marketing_opt_in,
          // Désinscription levée si la personne a recoché la case ensuite
          // (/compte) : seul le choix le plus récent compte.
          unsubscribed:
            !!profile.unsubscribed_at &&
            !(profile.marketing_opt_in_at && Date.parse(profile.marketing_opt_in_at) > Date.parse(profile.unsubscribed_at)),
          suppressed: !!profile.email_suppressed_at,
          funnelLastStep: profile.funnel_last_step ?? 0,
          updatedAt: profile.updated_at,
        },
        events: events ?? [],
        sends: effectiveSends,
      });
      if (!decision) continue;

      // Groupe témoin : journalisé (pour la mesure), jamais envoyé.
      if (decision.holdout) {
        const { error } = await admin.from("lifecycle_sends").insert({
          user_id: userId,
          sequence: decision.sequence,
          step: decision.step,
          status: "holdout",
          idempotency_key: decision.key,
          intent_score: decision.score,
        });
        if (!error) stats.holdout += 1;
        continue;
      }

      // Heure d'envoi : heures calmes, heure habituelle d'activité.
      const preferred = preferredHour((events ?? []).map((e) => e.created_at));
      if (!canSendNow({ kind: decision.kind, now, dueAt: decision.dueAt, preferred })) {
        stats.deferred += 1;
        continue;
      }

      const { data: userRes } = await admin.auth.admin.getUserById(userId);
      const email = userRes?.user?.email;
      if (!email) continue;
      const { data: conceptRow } = await admin.from("user_concepts").select("concept_name, tagline").eq("user_id", userId).maybeSingle();

      const links = await buildLinks(userId, ctaDestination(decision.sequence), decision.key, decision.transactional);
      const failedEvent = decision.sequence === "payment_failed" ? decision.event : null;
      const rendered = renderEmail(decision.sequence, decision.step, {
        prenom: profile.prenom,
        conceptName: conceptRow?.concept_name ?? null,
        tagline: conceptRow?.tagline ?? null,
        objectif: profile.objectif_mensuel,
        delai: profile.delai_mois,
        temps: profile.temps,
        secteur: profile.secteur,
        blocage: profile.blocage,
        stoppedAtScreen: profile.funnel_last_step,
        totalScreens: TOTAL_SCREENS,
        ctaUrl: links.ctaUrl,
        unsubscribeUrl: links.unsubscribeUrl,
        invoiceUrl: failedEvent?.metadata?.hosted_invoice_url ?? null,
        amountCents: failedEvent?.amount_cents ?? null,
      });

      // Mode test : aucun envoi réel, uniquement la trace.
      if (settings.test_mode) {
        const { error } = await admin.from("lifecycle_sends").insert({
          user_id: userId,
          sequence: decision.sequence,
          step: decision.step,
          status: "test",
          idempotency_key: `test:${decision.key}`,
          subject: rendered.subject,
          intent_score: decision.score,
        });
        if (!error) stats.test += 1;
        continue;
      }

      const result = await sendWithResend({
        from: settings.from_address,
        replyTo: settings.reply_to,
        to: email,
        subject: rendered.subject,
        text: rendered.text,
        html: rendered.html,
        idempotencyKey: decision.key,
        oneClickUrl: links.oneClickUrl,
        tags: { user_id: userId, sequence: decision.sequence },
      });

      if (!result.ok) {
        // La clé réelle reste libre pour une nouvelle tentative au prochain
        // passage ; l'échec est tracé sous une clé distincte.
        await admin.from("lifecycle_sends").insert({
          user_id: userId,
          sequence: decision.sequence,
          step: decision.step,
          status: "failed",
          idempotency_key: `${decision.key}:failed:${now}`,
          subject: rendered.subject,
          error: result.error,
        });
        stats.failed += 1;
        continue;
      }

      await admin.from("lifecycle_sends").insert({
        user_id: userId,
        sequence: decision.sequence,
        step: decision.step,
        status: "sent",
        idempotency_key: decision.key,
        subject: rendered.subject,
        intent_score: decision.score,
        resend_id: result.id,
      });
      // Cohérence avec l'offre « tu es revenu(e) » (get-welcome-offer /
      // create-checkout-session) : une relance marketing a bien été envoyée.
      if (!decision.transactional) {
        await admin.from("profiles").update({ last_recovery_email_sent_at: new Date().toISOString() }).eq("id", userId);
      }
      stats.sent += 1;
    } catch (err) {
      console.error(`[lifecycle-dispatch] ${userId} :`, err);
      stats.failed += 1;
    }
  }

  console.log("[lifecycle-dispatch]", JSON.stringify(stats));
  return json(stats);
});
