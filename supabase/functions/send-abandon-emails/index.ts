// Supabase Edge Function — relance d'abandon du quiz, appelée quotidiennement
// par un Cron Job (voir Supabase Dashboard → Integrations → Cron Jobs, à
// configurer manuellement : pas de secret réel dans un fichier committé).
//
// Cible : profils qui ont démarré le quiz (funnel_last_step > 0), ne l'ont
// pas terminé (funnel_last_step < TOTAL_QUESTIONS), pas convertis, inactifs
// depuis plus de 24h, et jamais relancés auparavant (une seule relance,
// jamais un spam quotidien — cf. politique "simple et honnête" du brief).
//
// service_role UNIQUEMENT ici (accès à auth.users pour l'email + génération
// du magic link), jamais exposée au client. Protégée par un secret partagé
// (CRON_SECRET, généré aléatoirement et jamais commité) plutôt que par la
// vérification JWT standard, pour permettre l'appel depuis un Cron Job.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const TOTAL_QUESTIONS = 7; // doit rester synchronisé avec quiz.questions.length dans scripts/build.mjs
const INACTIVITY_HOURS = 24;
const SITE_URL = "https://coldtrend.com";
const FROM_ADDRESS = "ColdTrend <bonjour@coldtrend.com>";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  const cronSecret = Deno.env.get("CRON_SECRET");
  const providedSecret = req.headers.get("x-cron-secret");
  if (!cronSecret || providedSecret !== cronSecret) {
    return json({ error: "Non autorisé." }, 401);
  }

  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  if (!resendApiKey) {
    console.error("[send-abandon-emails] RESEND_API_KEY manquante.");
    return json({ error: "Configuration manquante." }, 500);
  }

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const cutoff = new Date(Date.now() - INACTIVITY_HOURS * 60 * 60 * 1000).toISOString();

  const { data: profiles, error: profilesError } = await supabaseAdmin
    .from("profiles")
    .select("id, funnel_last_step, updated_at")
    .eq("converted", false)
    .gt("funnel_last_step", 0)
    .lt("funnel_last_step", TOTAL_QUESTIONS)
    .lt("updated_at", cutoff)
    .is("last_recovery_email_sent_at", null);

  if (profilesError) {
    console.error("[send-abandon-emails] échec de la requête profiles :", profilesError.message);
    return json({ error: "Requête profiles échouée." }, 500);
  }

  let sent = 0;
  let failed = 0;

  for (const profile of profiles ?? []) {
    try {
      const userRes = await supabaseAdmin.auth.admin.getUserById(profile.id);
      const email = userRes.data.user?.email;
      if (!email) continue;

      const linkRes = await supabaseAdmin.auth.admin.generateLink({
        type: "magiclink",
        email,
        options: { redirectTo: `${SITE_URL}/?resume=quiz` },
      });
      if (linkRes.error || !linkRes.data.properties?.action_link) {
        console.warn(`[send-abandon-emails] génération du lien échouée pour ${profile.id} :`, linkRes.error?.message);
        failed += 1;
        continue;
      }
      const resumeLink = linkRes.data.properties.action_link;

      const emailRes = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: FROM_ADDRESS,
          to: email,
          subject: "Tu avais commencé à chercher un SaaS vérifié",
          html: `
            <p>Salut,</p>
            <p>Tu avais commencé à chercher un SaaS vérifié sur ColdTrend sans aller jusqu'au bout.</p>
            <p><a href="${resumeLink}">Reprends exactement où tu t'étais arrêté</a> — tes réponses précédentes sont toujours là.</p>
            <p>— ColdTrend</p>
          `,
        }),
      });

      if (!emailRes.ok) {
        const errText = await emailRes.text();
        console.warn(`[send-abandon-emails] envoi Resend échoué pour ${profile.id} :`, errText);
        failed += 1;
        continue;
      }

      await supabaseAdmin
        .from("profiles")
        .update({ last_recovery_email_sent_at: new Date().toISOString() })
        .eq("id", profile.id);
      sent += 1;
    } catch (err) {
      console.error(`[send-abandon-emails] erreur inattendue pour ${profile.id} :`, err);
      failed += 1;
    }
  }

  return json({ sent, failed, eligible: profiles?.length ?? 0 });
});
