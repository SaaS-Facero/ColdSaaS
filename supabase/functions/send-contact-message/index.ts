// Supabase Edge Function — formulaire de contact public (/contact), aucune
// session requise (un visiteur non connecté doit pouvoir écrire). Envoie le
// message par email à l'équipe ColdTrend via Resend, ne stocke rien en base
// (pas de table dédiée -- Resend garde son propre historique d'envoi).
//
// Anti-spam minimal (pas de CAPTCHA, hors scope) : origine vérifiée,
// longueurs bornées, honeypot -- pas une garantie totale mais élimine
// l'essentiel des soumissions automatisées naïves.

const ALLOWED_ORIGINS = new Set([
  "https://coldtrend.com",
  "https://www.coldtrend.com",
  "http://localhost:3000"
]);

const FROM_ADDRESS = "ColdTrend <bonjour@coldtrend.com>";
const CONTACT_INBOX = "bonjour@coldtrend.com";

const MAX_SUBJECT_LENGTH = 150;
const MAX_MESSAGE_LENGTH = 4000;

function corsHeaders(origin: string | null) {
  const allowOrigin = origin && ALLOWED_ORIGINS.has(origin) ? origin : "https://coldtrend.com";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin"
  };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

Deno.serve(async (req) => {
  const headers = corsHeaders(req.headers.get("origin"));
  if (req.method === "OPTIONS") return new Response(null, { headers });

  function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
      status,
      headers: { ...headers, "Content-Type": "application/json" }
    });
  }

  let body: { email?: string; subject?: string; message?: string; company?: string } = {};
  try {
    body = await req.json();
  } catch {
    return json({ error: "Corps de requête invalide." }, 400);
  }

  // Honeypot -- champ caché côté formulaire, jamais rempli par un humain.
  if (typeof body.company === "string" && body.company.trim() !== "") {
    return json({ success: true }); // réponse silencieusement positive, aucun envoi réel
  }

  const email = typeof body.email === "string" ? body.email.trim() : "";
  const subject = typeof body.subject === "string" ? body.subject.trim() : "";
  const message = typeof body.message === "string" ? body.message.trim() : "";

  if (!EMAIL_PATTERN.test(email)) return json({ error: "Adresse email invalide." }, 400);
  if (!subject || subject.length > MAX_SUBJECT_LENGTH) return json({ error: "Sujet invalide." }, 400);
  if (!message || message.length > MAX_MESSAGE_LENGTH) return json({ error: "Message invalide." }, 400);

  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  if (!resendApiKey) {
    console.error("[send-contact-message] RESEND_API_KEY manquante.");
    return json({ error: "Service indisponible pour le moment." }, 500);
  }

  const emailRes = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: FROM_ADDRESS,
      to: CONTACT_INBOX,
      reply_to: email,
      subject: `[Contact] ${subject}`,
      html: `<p><strong>De :</strong> ${escapeHtml(email)}</p><p><strong>Sujet :</strong> ${escapeHtml(subject)}</p><p>${escapeHtml(message).replace(/\n/g, "<br>")}</p>`
    })
  });

  if (!emailRes.ok) {
    const errText = await emailRes.text();
    console.error("[send-contact-message] envoi Resend échoué :", errText);
    return json({ error: "Envoi échoué, réessaie plus tard." }, 502);
  }

  return json({ success: true, subject });
});
