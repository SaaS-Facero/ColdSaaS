// Supabase Edge Function — admin-lifecycle : pilotage des relances depuis
// /admin. Réservé aux admins (JWT vérifié puis profiles.role relu avec le
// rôle service, comme generate-demo-concept).
//
// Actions (POST { action, ... }) :
//   get        réglages (sans le jeton du cron) + volumes 24 h / 30 j +
//              taux de plainte
//   update     enabled, test_mode, kill_switch, holdout_percent,
//              test_recipient, reply_to, from_address
//   send_test  { template: "result_unpaid:2" } -> envoie CE template à
//              l'adresse de test (ou à l'admin), avec ses propres données
//              ou des données d'exemple. Seul envoi possible en mode test ;
//              jamais vers un autre destinataire.
//   stats      € récupérés par email et par séquence (attribution dernier
//              email envoyé dans les 7 jours) + comparaison avec le groupe
//              témoin (conversion à 14 jours, € par personne, gain estimé).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { attributePayment, HOUR, TOTAL_SCREENS } from "../_shared/lifecycle-core.js";
import { renderEmail, ctaDestination, TEST_TEMPLATES } from "../_shared/lifecycle-templates.ts";
import { buildLinks, sendWithResend } from "../_shared/lifecycle-send.ts";

const ALLOWED_ORIGINS = new Set(["https://coldtrend.com", "https://www.coldtrend.com", "http://localhost:3000"]);

function cors(origin: string | null) {
  return {
    "Access-Control-Allow-Origin": origin && ALLOWED_ORIGINS.has(origin) ? origin : "https://www.coldtrend.com",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
}

const EDITABLE: Record<string, (v: unknown) => boolean> = {
  enabled: (v) => typeof v === "boolean",
  test_mode: (v) => typeof v === "boolean",
  kill_switch: (v) => typeof v === "boolean",
  holdout_percent: (v) => Number.isInteger(v) && (v as number) >= 0 && (v as number) <= 50,
  test_recipient: (v) => v === null || (typeof v === "string" && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)),
  reply_to: (v) => typeof v === "string" && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v),
  from_address: (v) => typeof v === "string" && v.length < 120 && v.includes("@"),
};

// Lecture paginée (les volumes restent modestes ; plafond de sécurité).
// deno-lint-ignore no-explicit-any
async function readAll(query: () => any, max = 20000) {
  const rows: Record<string, unknown>[] = [];
  for (let from = 0; from < max; from += 1000) {
    const { data, error } = await query().range(from, from + 999);
    if (error || !data?.length) break;
    rows.push(...data);
    if (data.length < 1000) break;
  }
  return rows;
}

Deno.serve(async (req) => {
  const headers = cors(req.headers.get("origin"));
  if (req.method === "OPTIONS") return new Response(null, { headers });
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...headers, "Content-Type": "application/json" } });

  // ---- Accès admin -----------------------------------------------------------
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Non authentifié." }, 401);
  const asUser = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
  const { data: userRes } = await asUser.auth.getUser();
  if (!userRes?.user) return json({ error: "Session invalide." }, 401);
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: me } = await admin.from("profiles").select("role, prenom, objectif_mensuel, delai_mois, temps, secteur, blocage").eq("id", userRes.user.id).maybeSingle();
  if (!me || me.role !== "admin") return json({ error: "Accès réservé." }, 403);

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    /* corps vide */
  }
  const action = String(body.action || "get");
  const now = Date.now();

  if (action === "update") {
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    for (const [key, check] of Object.entries(EDITABLE)) {
      if (key in body) {
        if (!check(body[key])) return json({ error: `Valeur invalide : ${key}` }, 400);
        patch[key] = body[key];
      }
    }
    const { error } = await admin.from("lifecycle_settings").update(patch).eq("id", true);
    if (error) return json({ error: error.message }, 500);
  }

  if (action === "get" || action === "update") {
    const { data: s } = await admin
      .from("lifecycle_settings")
      .select("enabled, test_mode, kill_switch, holdout_percent, test_recipient, reply_to, from_address, updated_at")
      .eq("id", true)
      .single();
    const since24 = new Date(now - 24 * HOUR).toISOString();
    const since30 = new Date(now - 30 * 24 * HOUR).toISOString();
    const count = async (status: string, since: string) =>
      (await admin.from("lifecycle_sends").select("id", { count: "exact", head: true }).eq("status", status).gte("created_at", since)).count ?? 0;
    const [sent24, test24, sent30, complaints30, optIns] = await Promise.all([
      count("sent", since24),
      count("test", since24),
      count("sent", since30),
      admin.from("profiles").select("id", { count: "exact", head: true }).eq("email_suppressed_reason", "complaint").gte("email_suppressed_at", since30),
      admin.from("profiles").select("id", { count: "exact", head: true }).eq("marketing_opt_in", true),
    ]);
    const complaints = complaints30.count ?? 0;
    return json({
      settings: s,
      templates: TEST_TEMPLATES,
      volumes: { sent24, test24, sent30, optIns: optIns.count ?? 0 },
      complaintRate: sent30 ? complaints / sent30 : 0,
      complaints30: complaints,
    });
  }

  if (action === "send_test") {
    const template = String(body.template || "");
    if (!TEST_TEMPLATES.includes(template)) return json({ error: "Template inconnu." }, 400);
    const [sequence, stepStr] = template.split(":");
    const { data: s } = await admin.from("lifecycle_settings").select("test_recipient, reply_to, from_address").eq("id", true).single();
    const to = s?.test_recipient || userRes.user.email;
    if (!to) return json({ error: "Aucune adresse de test." }, 400);
    const { data: myConcept } = await admin.from("user_concepts").select("concept_name, tagline").eq("user_id", userRes.user.id).maybeSingle();
    const key = `test-send:${crypto.randomUUID()}`;
    const transactional = sequence === "payment_failed";
    const links = await buildLinks(userRes.user.id, ctaDestination(sequence), key, transactional);
    // Données de l'admin si elles existent, sinon exemple neutre (le sujet
    // porte [TEST] dans tous les cas).
    const rendered = renderEmail(sequence, Number(stepStr), {
      prenom: me.prenom || "Max",
      conceptName: myConcept?.concept_name || "Concept d'exemple",
      tagline: myConcept?.tagline || "Exemple d'accroche, pour le test.",
      objectif: me.objectif_mensuel ?? 5000,
      delai: me.delai_mois ?? 4,
      temps: me.temps ?? "mid",
      secteur: me.secteur ?? ["b2c"],
      blocage: Array.isArray(body.blocage) ? (body.blocage as string[]) : me.blocage ?? ["pas_temps"],
      stoppedAtScreen: 12,
      totalScreens: TOTAL_SCREENS,
      ctaUrl: links.ctaUrl,
      unsubscribeUrl: links.unsubscribeUrl,
      invoiceUrl: transactional ? "https://www.coldtrend.com/compte" : null,
      amountCents: transactional ? 2490 : null,
    });
    const result = await sendWithResend({
      from: s?.from_address || "Max de ColdTrend <bonjour@coldtrend.com>",
      replyTo: s?.reply_to || "contact.facero2026@gmail.com",
      to,
      subject: `[TEST] ${rendered.subject}`,
      text: rendered.text,
      html: rendered.html,
      idempotencyKey: key,
      oneClickUrl: null, // un test ne doit jamais désinscrire l'admin
      tags: { user_id: userRes.user.id, sequence: "test" },
    });
    return result.ok ? json({ sent: true, to, subject: `[TEST] ${rendered.subject}` }) : json({ error: result.error }, 502);
  }

  if (action === "stats") {
    const since = new Date(now - 60 * 24 * HOUR).toISOString();
    const sends = await readAll(() => admin.from("lifecycle_sends").select("user_id, sequence, step, status, idempotency_key, created_at").gte("created_at", since).order("id"));
    const payments = await readAll(() => admin.from("events").select("user_id, amount_cents, created_at").eq("type", "payment_succeeded").gte("created_at", since).order("id"));
    const clicks = await readAll(() => admin.from("events").select("metadata").eq("type", "email_click").gte("created_at", since).order("id"));

    // Par email (séquence:étape) : volumes, clics, paiements et € attribués.
    const byEmail: Record<string, { sequence: string; step: number; sent: number; test: number; holdout: number; failed: number; clicks: number; conversions: number; revenueCents: number }> = {};
    const row = (seq: string, step: number) => (byEmail[`${seq}:${step}`] ??= { sequence: seq, step, sent: 0, test: 0, holdout: 0, failed: 0, clicks: 0, conversions: 0, revenueCents: 0 });
    for (const s of sends) row(String(s.sequence), Number(s.step))[String(s.status) as "sent"] += 1;
    const keyToEmail = new Map(sends.map((s) => [String(s.idempotency_key), `${s.sequence}:${s.step}`]));
    for (const c of clicks) {
      const k = keyToEmail.get(String(((c.metadata ?? {}) as Record<string, unknown>)["send_key"] ?? ""));
      if (k) byEmail[k].clicks += 1;
    }
    const sendsByUser = new Map<string, Record<string, unknown>[]>();
    for (const s of sends) sendsByUser.set(String(s.user_id), [...(sendsByUser.get(String(s.user_id)) ?? []), s]);
    for (const p of payments) {
      const credited = attributePayment(Date.parse(String(p.created_at)), sendsByUser.get(String(p.user_id)) ?? []);
      if (credited) {
        const r = byEmail[`${credited.sequence}:${credited.step}`];
        r.conversions += 1;
        r.revenueCents += Number(p.amount_cents) || 0;
      }
    }

    // Par séquence : traités (1er email envoyé) vs témoin, conversion à 14 j.
    const bySequence: Record<string, { treated: number; holdout: number; treatedConv: number; holdoutConv: number; treatedRevenueCents: number; holdoutRevenueCents: number; attributedRevenueCents: number; incrementalRevenueCents: number }> = {};
    const firstEntry = new Map<string, Record<string, unknown>>();
    for (const s of sends) {
      if (Number(s.step) !== 1 || (s.status !== "sent" && s.status !== "holdout")) continue;
      const k = `${s.sequence}|${s.user_id}`;
      if (!firstEntry.has(k)) firstEntry.set(k, s);
    }
    for (const [k, entry] of firstEntry) {
      const [seq, userId] = k.split("|");
      const agg = (bySequence[seq] ??= { treated: 0, holdout: 0, treatedConv: 0, holdoutConv: 0, treatedRevenueCents: 0, holdoutRevenueCents: 0, attributedRevenueCents: 0, incrementalRevenueCents: 0 });
      const t0 = Date.parse(String(entry.created_at));
      const paid = payments.filter((p) => p.user_id === userId && Date.parse(String(p.created_at)) >= t0 && Date.parse(String(p.created_at)) - t0 <= 14 * 24 * HOUR);
      const cents = paid.reduce((sum, p) => sum + (Number(p.amount_cents) || 0), 0);
      if (entry.status === "holdout") {
        agg.holdout += 1;
        if (paid.length) agg.holdoutConv += 1;
        agg.holdoutRevenueCents += cents;
      } else {
        agg.treated += 1;
        if (paid.length) agg.treatedConv += 1;
        agg.treatedRevenueCents += cents;
      }
    }
    for (const r of Object.values(byEmail)) {
      if (bySequence[r.sequence]) bySequence[r.sequence].attributedRevenueCents += r.revenueCents;
    }
    for (const agg of Object.values(bySequence)) {
      const perTreated = agg.treated ? agg.treatedRevenueCents / agg.treated : 0;
      const perHoldout = agg.holdout ? agg.holdoutRevenueCents / agg.holdout : 0;
      // Gain estimé = (€/personne traitée - €/personne témoin) x traités.
      // Sans témoin ou avec moins de 30 personnes témoins, l'écart n'est pas
      // fiable : l'admin l'affiche comme indicatif.
      agg.incrementalRevenueCents = agg.holdout ? Math.round((perTreated - perHoldout) * agg.treated) : 0;
    }
    return json({ periodDays: 60, byEmail: Object.values(byEmail).sort((a, b) => a.sequence.localeCompare(b.sequence) || a.step - b.step), bySequence });
  }

  return json({ error: "Action inconnue." }, 400);
});
