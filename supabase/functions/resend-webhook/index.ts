// Supabase Edge Function — resend-webhook : suppression automatique des
// adresses en bounce dur et des plaintes (objectif : plaintes < 0,1 %).
//
// À brancher dans Resend (Webhooks) sur les événements email.bounced et
// email.complained, avec le secret de signature dans RESEND_WEBHOOK_SECRET.
// Signature Svix vérifiée (en-têtes svix-id, svix-timestamp,
// svix-signature) : sans signature valide, rien n'est modifié.
//
// Effet : profiles.email_suppressed_at / reason posés et consentement
// marketing retiré. lifecycle-dispatch n'envoie plus rien à cette adresse,
// pas même un email transactionnel (une adresse en bounce dur n'existe pas).
// L'identifiant vient du tag user_id posé à l'envoi (lifecycle-send.ts) ;
// à défaut, l'adresse est recherchée dans auth.users.
// Déployée avec --no-verify-jwt (appel serveur à serveur signé).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

async function verifySvix(raw: string, headers: Headers, secret: string) {
  const id = headers.get("svix-id");
  const timestamp = headers.get("svix-timestamp");
  const signatures = headers.get("svix-signature");
  if (!id || !timestamp || !signatures) return false;
  // Rejeu : 5 minutes de tolérance.
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;
  const keyBytes = Uint8Array.from(atob(secret.replace(/^whsec_/, "")), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${id}.${timestamp}.${raw}`));
  const expected = btoa(String.fromCharCode(...new Uint8Array(sig)));
  return signatures.split(" ").some((part) => part.split(",")[1] === expected);
}

Deno.serve(async (req) => {
  const secret = Deno.env.get("RESEND_WEBHOOK_SECRET");
  if (!secret) return new Response("Configuration manquante.", { status: 500 });
  const raw = await req.text();
  if (!(await verifySvix(raw, req.headers, secret))) return new Response("Signature invalide.", { status: 400 });

  let event: { type?: string; data?: Record<string, unknown> };
  try {
    event = JSON.parse(raw);
  } catch {
    return new Response("JSON invalide.", { status: 400 });
  }
  const data = event.data ?? {};
  const bounceType = String(((data["bounce"] ?? {}) as Record<string, unknown>)["type"] ?? "").toLowerCase();
  const isHardBounce = event.type === "email.bounced" && bounceType !== "transient" && bounceType !== "soft";
  const isComplaint = event.type === "email.complained";
  if (!isHardBounce && !isComplaint) return new Response(JSON.stringify({ ignored: event.type }), { status: 200 });

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // Tags : objet { user_id: "..." } ou tableau [{ name, value }] selon la version.
  const rawTags = data["tags"];
  let userId: string | null = null;
  if (Array.isArray(rawTags)) {
    const tag = rawTags.find((t) => (t as Record<string, unknown>)["name"] === "user_id") as Record<string, unknown> | undefined;
    userId = tag ? String(tag["value"]) : null;
  } else if (rawTags && typeof rawTags === "object") {
    userId = ((rawTags as Record<string, unknown>)["user_id"] as string) ?? null;
  }
  if (!userId) {
    const to = Array.isArray(data["to"]) ? String((data["to"] as unknown[])[0]) : String(data["to"] ?? "");
    if (to) {
      const { data: users } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      userId = users?.users.find((u) => u.email?.toLowerCase() === to.toLowerCase())?.id ?? null;
    }
  }
  if (!userId) return new Response(JSON.stringify({ unmatched: true }), { status: 200 });

  const { error } = await admin
    .from("profiles")
    .update({
      email_suppressed_at: new Date().toISOString(),
      email_suppressed_reason: isComplaint ? "complaint" : "hard_bounce",
      marketing_opt_in: false,
    })
    .eq("id", userId);
  if (error) {
    console.error("[resend-webhook] suppression impossible :", error.message);
    return new Response("Erreur.", { status: 500 });
  }
  return new Response(JSON.stringify({ suppressed: userId, reason: isComplaint ? "complaint" : "hard_bounce" }), { status: 200 });
});
