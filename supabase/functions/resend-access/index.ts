// Supabase Edge Function — renvoie le lien d'accès (Google Sheet) à un
// utilisateur qui a réellement payé. Vérifie profiles.paid_at (posé
// uniquement par stripe-webhook, jamais par le client) avant d'envoyer
// quoi que ce soit — jamais de renvoi d'accès à un compte non payé.
//
// ACCESS_SHEET_URL doit être configuré en secret Supabase (l'URL du
// Google Sheet en lecture seule) — ce n'est pas un secret sensible en soi,
// mais il n'existe nulle part ailleurs dans ce projet : à fournir avant
// que cette fonction puisse réellement envoyer un email.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ORIGINS = new Set([
  "https://coldtrend.com",
  "https://www.coldtrend.com",
  "http://localhost:3000"
]);
const FROM_ADDRESS = "ColdTrend <bonjour@coldtrend.com>";

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

  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("paid_at")
    .eq("id", userRes.user.id)
    .single();

  if (profileError || !profile?.paid_at) {
    return json({ error: "Aucun accès payant associé à ce compte." }, 403);
  }

  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  const accessSheetUrl = Deno.env.get("ACCESS_SHEET_URL");
  if (!resendApiKey || !accessSheetUrl) {
    console.error("[resend-access] RESEND_API_KEY ou ACCESS_SHEET_URL manquant.");
    return json({ error: "Service indisponible pour le moment." }, 500);
  }

  const email = userRes.user.email;
  if (!email) return json({ error: "Aucune adresse email associée à ce compte." }, 400);

  const emailRes = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: FROM_ADDRESS,
      to: email,
      subject: "Ton accès ColdTrend",
      html: `<p>Voici à nouveau ton accès à la base de SaaS vérifiés :</p><p><a href="${accessSheetUrl}">${accessSheetUrl}</a></p><p>— ColdTrend</p>`
    })
  });

  if (!emailRes.ok) {
    const errText = await emailRes.text();
    console.error("[resend-access] envoi Resend échoué :", errText);
    return json({ error: "Envoi échoué." }, 500);
  }

  return json({ success: true });
});
