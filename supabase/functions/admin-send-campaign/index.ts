// Supabase Edge Function — envoi d'une campagne email ciblée depuis /admin.
//
// Sécurité :
// - is_admin revérifié côté serveur avec le rôle service (jamais un claim
//   fourni par le client), même pattern que admin-list-profiles.
// - La liste des destinataires est RECONSTRUITE ici à partir des critères
//   de segment envoyés par le client -- on ne fait jamais confiance à une
//   liste d'IDs fournie directement par le navigateur, qui pourrait avoir
//   été modifiée pour cibler des comptes hors segment.
// - Garde-fou anti-hallucination inversé : le contexte de variables de
//   template est construit à la main avec UNIQUEMENT prenom/secteur/frein
//   (SAFE_TEMPLATE_FIELDS ci-dessous) -- jamais confiance, peur exprimée,
//   habitude regrettée, etc. Même si un futur appel ajoute ces champs à la
//   requête profiles, ils ne peuvent pas atteindre le rendu tant que
//   buildSafeContext() n'est pas modifié explicitement.
// - profiles.unsubscribed_at exclut systématiquement le destinataire, avant
//   tout envoi non transactionnel.
// - Chaque envoi est loggé dans admin_email_sends (recipient_id + template +
//   snapshot des critères de segment), y compris en cas d'échec Resend pour
//   ce destinataire (avec resend_email_id nul) -- traçabilité complète du
//   "qui a reçu quoi et quand" en cas de litige.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ORIGINS = new Set([
  "https://coldtrend.com",
  "https://www.coldtrend.com",
  "http://localhost:3000"
]);

const SITE_URL = "https://coldtrend.com";
const FROM_ADDRESS = "ColdTrend <bonjour@coldtrend.com>";

// Seuls ces trois champs peuvent atteindre un email marketing. Tout le
// reste d'entrepreneur_profile_answers (confiance, habitude_regrettee,
// incompris, projection_10ans, fierte, frequence) reste réservé à la
// génération du profil entrepreneur -- jamais au marketing direct.
const SECTOR_LABELS: Record<string, string> = { b2b: "B2B", b2c: "B2C", both: "B2B et B2C" };
const FREIN_LABELS: Record<string, string> = {
  temps: "le temps",
  argent: "le budget",
  peur_echec: "la peur de se lancer",
  ne_sait_pas: "encore hésitant",
  autre: "un frein personnel"
};

function buildSafeContext(profile: { prenom: string | null; secteur: string[] | null }, frein: string | null) {
  const secteurLabel = (profile.secteur ?? []).map((s) => SECTOR_LABELS[s] ?? s).join(" et ");
  return {
    prenom: profile.prenom || "là",
    secteur: secteurLabel || "ton secteur",
    frein: frein ? FREIN_LABELS[frein] ?? "ce qui te freine" : "ce qui te freine"
  };
}

function renderTemplate(template: string, context: Record<string, string>) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => context[key] ?? "");
}

async function signUnsubscribeToken(userId: string, secret: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign"
  ]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(userId));
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return `${userId}.${sigB64}`;
}

function corsHeaders(origin: string | null) {
  const allowOrigin = origin && ALLOWED_ORIGINS.has(origin) ? origin : "https://coldtrend.com";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin"
  };
}

Deno.serve(async (req) => {
  const headers = corsHeaders(req.headers.get("origin"));
  if (req.method === "OPTIONS") return new Response(null, { headers });

  function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
      status,
      headers: { ...headers, "Content-Type": "application/json" }
    });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Non authentifié." }, 401);

  const supabaseAsUser = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } }
  });
  const { data: userRes, error: userErr } = await supabaseAsUser.auth.getUser();
  if (userErr || !userRes.user) return json({ error: "Session invalide." }, 401);

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const { data: callerProfile, error: callerErr } = await supabaseAdmin
    .from("profiles")
    .select("is_admin")
    .eq("id", userRes.user.id)
    .single();
  if (callerErr || !callerProfile?.is_admin) return json({ error: "Accès refusé." }, 403);

  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  const unsubSecret = Deno.env.get("UNSUB_SECRET");
  if (!resendApiKey || !unsubSecret) {
    console.error("[admin-send-campaign] RESEND_API_KEY ou UNSUB_SECRET manquant.");
    return json({ error: "Configuration manquante." }, 500);
  }

  const body = await req.json();
  const { templateId, segment, subject, bodyHtml } = body as {
    templateId: string;
    segment: { type: "quiz_abandonne" | "resultat_non_paye"; inactiveSinceHours: number };
    subject: string;
    bodyHtml: string;
  };

  if (!templateId || !segment || !subject || !bodyHtml) {
    return json({ error: "Paramètres manquants." }, 400);
  }

  const cutoff = new Date(Date.now() - (segment.inactiveSinceHours ?? 0) * 60 * 60 * 1000).toISOString();

  let query = supabaseAdmin
    .from("profiles")
    .select("id, prenom, secteur, updated_at")
    .is("unsubscribed_at", null)
    .lt("updated_at", cutoff);

  if (segment.type === "quiz_abandonne") {
    query = query.gt("funnel_last_step", 0).is("match_count", null);
  } else if (segment.type === "resultat_non_paye") {
    query = query.not("match_count", "is", null).is("paid_at", null);
  } else {
    return json({ error: "Type de segment inconnu." }, 400);
  }

  const { data: recipients, error: recipientsErr } = await query;
  if (recipientsErr) {
    console.error("[admin-send-campaign] échec requête segment :", recipientsErr.message);
    return json({ error: "Requête de segment échouée." }, 500);
  }

  const recipientIds = (recipients ?? []).map((r) => r.id);
  const [entrepreneurRes, usersRes] = await Promise.all([
    supabaseAdmin.from("entrepreneur_profile_answers").select("user_id, frein").in("user_id", recipientIds.length ? recipientIds : ["___none___"]),
    supabaseAdmin.auth.admin.listUsers({ perPage: 1000 })
  ]);
  const freinByUser = new Map((entrepreneurRes.data ?? []).map((r) => [r.user_id, r.frein]));
  const emailByUser = new Map((usersRes.data?.users ?? []).map((u) => [u.id, u.email]));

  let sent = 0;
  let failed = 0;

  for (const profile of recipients ?? []) {
    const email = emailByUser.get(profile.id);
    const logRow = {
      sent_by: userRes.user.id,
      recipient_id: profile.id,
      template_id: templateId,
      segment_snapshot: segment,
      resend_email_id: null as string | null
    };

    if (!email) {
      await supabaseAdmin.from("admin_email_sends").insert(logRow);
      failed += 1;
      continue;
    }

    const context = buildSafeContext(profile, freinByUser.get(profile.id) ?? null);
    const unsubToken = await signUnsubscribeToken(profile.id, unsubSecret);
    const unsubLink = `${SITE_URL}/desabonnement?token=${encodeURIComponent(unsubToken)}`;

    const renderedSubject = renderTemplate(subject, context);
    const renderedBody =
      renderTemplate(bodyHtml, context) +
      `<p style="margin-top:32px;font-size:12px;color:#8A8F98;">
         Tu reçois cet email car tu as un compte ColdTrend.
         <a href="${unsubLink}">Se désabonner</a>
       </p>`;

    try {
      const emailRes = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${resendApiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: FROM_ADDRESS, to: email, subject: renderedSubject, html: renderedBody })
      });

      if (!emailRes.ok) {
        const errText = await emailRes.text();
        console.warn(`[admin-send-campaign] envoi Resend échoué pour ${profile.id} :`, errText);
        await supabaseAdmin.from("admin_email_sends").insert(logRow);
        failed += 1;
        continue;
      }

      const emailData = await emailRes.json();
      await supabaseAdmin.from("admin_email_sends").insert({ ...logRow, resend_email_id: emailData.id ?? null });
      sent += 1;
    } catch (err) {
      console.error(`[admin-send-campaign] erreur inattendue pour ${profile.id} :`, err);
      await supabaseAdmin.from("admin_email_sends").insert(logRow);
      failed += 1;
    }
  }

  return json({ sent, failed, eligible: recipients?.length ?? 0 });
});
