// Supabase Edge Function — vérifie le token de désabonnement (HMAC signé,
// voir admin-send-campaign/signUnsubscribeToken) et pose unsubscribed_at.
// Endpoint public (--no-verify-jwt) : la sécurité vient de la signature du
// token, pas d'une session -- quelqu'un qui reçoit l'email n'est pas
// forcément connecté au moment où il clique.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ORIGINS = new Set([
  "https://coldtrend.com",
  "https://www.coldtrend.com",
  "http://localhost:3000"
]);

function corsHeaders(origin: string | null) {
  const allowOrigin = origin && ALLOWED_ORIGINS.has(origin) ? origin : "https://coldtrend.com";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin"
  };
}

async function verifyToken(token: string, secret: string): Promise<string | null> {
  const [userId, sigB64] = token.split(".");
  if (!userId || !sigB64) return null;

  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign"
  ]);
  const expectedSig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(userId));
  const expectedB64 = btoa(String.fromCharCode(...new Uint8Array(expectedSig)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  return expectedB64 === sigB64 ? userId : null;
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

  const unsubSecret = Deno.env.get("UNSUB_SECRET");
  if (!unsubSecret) {
    console.error("[unsubscribe] UNSUB_SECRET manquant.");
    return json({ error: "Configuration manquante." }, 500);
  }

  const { token } = await req.json();
  if (!token) return json({ error: "Token manquant." }, 400);

  const userId = await verifyToken(token, unsubSecret);
  if (!userId) return json({ error: "Lien invalide." }, 400);

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const { error } = await supabaseAdmin
    .from("profiles")
    .update({ unsubscribed_at: new Date().toISOString() })
    .eq("id", userId);

  if (error) {
    console.error("[unsubscribe] échec mise à jour :", error.message);
    return json({ error: "Désabonnement échoué." }, 500);
  }

  return json({ success: true });
});
