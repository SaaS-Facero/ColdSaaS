// Supabase Edge Function — suppression de compte, à la demande de
// l'utilisateur lui-même (jamais un rôle admin, jamais côté client).
//
// L'appelant doit fournir SON PROPRE token de session (Authorization:
// Bearer <access_token>) — vérifié via un client anon+JWT avant toute
// action. La suppression elle-même (auth.admin.deleteUser) utilise le
// rôle service, jamais exposé au navigateur. Cascade automatique sur
// profiles et funnel_events (foreign keys ON DELETE CASCADE).

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
  const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(userRes.user.id);
  if (deleteError) {
    console.error("[delete-account] échec suppression :", deleteError.message);
    return json({ error: "Suppression échouée." }, 500);
  }

  return json({ success: true });
});
