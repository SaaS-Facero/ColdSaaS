// Supabase Edge Function — liste complète des profils pour /admin.
//
// Deuxième couche de protection en plus de RLS ("admins read all profiles",
// migration 0019) : la page /admin ne fait jamais confiance à un check côté
// client. L'appelant fournit SA propre session (Authorization: Bearer
// <access_token>), vérifiée ici avant toute lecture -- is_admin est relu
// depuis la base avec le rôle service, jamais depuis un claim fourni par le
// client.
//
// Vue par défaut = tous les profils, sans filtre serveur : les filtres
// (payé/non payé, quiz complet/abandonné, secteur) sont des options
// d'affichage appliquées côté client sur ce jeu de données complet, jamais
// des conditions qui excluent des lignes ici.

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

  const { data: callerProfile, error: callerErr } = await supabaseAdmin
    .from("profiles")
    .select("is_admin")
    .eq("id", userRes.user.id)
    .single();
  if (callerErr || !callerProfile?.is_admin) {
    return json({ error: "Accès refusé." }, 403);
  }

  const [profilesRes, entrepreneurRes, selectedRes, usersRes] = await Promise.all([
    supabaseAdmin
      .from("profiles")
      .select(
        "id, prenom, intention, budget, temps, secteur, deja_cherche, match_count, funnel_last_step, paid_at, created_at, converted, unsubscribed_at"
      )
      .order("created_at", { ascending: false }),
    supabaseAdmin.from("entrepreneur_profile_answers").select("user_id, frein, frein_autre, revenu_vise"),
    supabaseAdmin.from("selected_projects").select("user_id, listing_slug, selected_at"),
    supabaseAdmin.auth.admin.listUsers({ perPage: 1000 })
  ]);

  if (profilesRes.error) {
    console.error("[admin-list-profiles] échec lecture profiles :", profilesRes.error.message);
    return json({ error: "Lecture des profils échouée." }, 500);
  }

  const entrepreneurByUser = new Map((entrepreneurRes.data ?? []).map((row) => [row.user_id, row]));
  const selectedByUser = new Map((selectedRes.data ?? []).map((row) => [row.user_id, row]));
  const emailByUser = new Map((usersRes.data?.users ?? []).map((u) => [u.id, u.email]));

  const rows = profilesRes.data.map((profile) => {
    const entrepreneur = entrepreneurByUser.get(profile.id);
    const selected = selectedByUser.get(profile.id);
    return {
      id: profile.id,
      email: emailByUser.get(profile.id) ?? null,
      prenom: profile.prenom,
      secteur: profile.secteur,
      budget: profile.budget,
      temps: profile.temps,
      intention: profile.intention,
      frein: entrepreneur?.frein ?? null,
      frein_autre: entrepreneur?.frein_autre ?? null,
      revenu_vise: entrepreneur?.revenu_vise ?? null,
      paid_at: profile.paid_at,
      projet_selectionne: selected?.listing_slug ?? null,
      created_at: profile.created_at,
      funnel_last_step: profile.funnel_last_step,
      match_count: profile.match_count,
      converted: profile.converted,
      unsubscribed_at: profile.unsubscribed_at
    };
  });

  return json({ rows });
});
