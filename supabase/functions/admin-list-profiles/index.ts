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
import { intentScore } from "../_shared/lifecycle-core.js";

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

  // Suivi complet (migrations 0030 à 0034) : réponses du quiz, engagement,
  // statut Stripe, consentement, dernière relance, score d'intention
  // (même calcul que les relances : _shared/lifecycle-core.js).
  const since = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
  const [profilesRes, entrepreneurRes, conceptsRes, usersRes, eventsRes, sendsRes] = await Promise.all([
    supabaseAdmin
      .from("profiles")
      .select(
        "id, prenom, intention, budget, temps, secteur, deja_cherche, match_count, funnel_last_step, paid_at, created_at, updated_at, converted, unsubscribed_at, " +
          "age_range, current_revenue, objectif_mensuel, delai_mois, plateformes, blocage, reve, wants_ai_video, support_level, engagement_signed_at, " +
          "subscription_status, subscription_duration_months, marketing_opt_in, email_suppressed_at, last_recovery_email_sent_at"
      )
      .order("created_at", { ascending: false }),
    supabaseAdmin.from("entrepreneur_profile_answers").select("user_id, frein, frein_autre, revenu_vise"),
    // Pivot : selected_projects (fiche réelle choisie sur /concept) n'est
    // plus ce que /admin doit montrer -- user_concepts (concept généré par
    // profil) reflète l'état réel du nouveau funnel.
    supabaseAdmin.from("user_concepts").select("user_id, concept_name"),
    supabaseAdmin.auth.admin.listUsers({ perPage: 1000 }),
    supabaseAdmin.from("events").select("user_id, type, created_at").gte("created_at", since).limit(20000),
    supabaseAdmin.from("lifecycle_sends").select("user_id, sequence, step, status, created_at").eq("status", "sent").order("created_at", { ascending: false }).limit(20000)
  ]);

  if (profilesRes.error) {
    console.error("[admin-list-profiles] échec lecture profiles :", profilesRes.error.message);
    return json({ error: "Lecture des profils échouée." }, 500);
  }

  const entrepreneurByUser = new Map((entrepreneurRes.data ?? []).map((row) => [row.user_id, row]));
  const conceptByUser = new Map((conceptsRes.data ?? []).map((row) => [row.user_id, row]));
  const emailByUser = new Map((usersRes.data?.users ?? []).map((u) => [u.id, u.email]));
  const eventsByUser = new Map<string, { type: string; created_at: string }[]>();
  for (const e of eventsRes.data ?? []) eventsByUser.set(e.user_id, [...(eventsByUser.get(e.user_id) ?? []), e]);
  const lastSendByUser = new Map<string, { sequence: string; step: number; created_at: string }>();
  for (const s of sendsRes.data ?? []) if (!lastSendByUser.has(s.user_id)) lastSendByUser.set(s.user_id, s);
  const now = Date.now();

  const rows = profilesRes.data.map((profile) => {
    const entrepreneur = entrepreneurByUser.get(profile.id);
    const concept = conceptByUser.get(profile.id);
    const lastSend = lastSendByUser.get(profile.id);
    // Dernière relance : envoi lifecycle, sinon l'ancienne relance unique.
    const lastRelanceAt = lastSend?.created_at ?? profile.last_recovery_email_sent_at ?? null;
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
      concept_genere: concept?.concept_name ?? null,
      created_at: profile.created_at,
      funnel_last_step: profile.funnel_last_step,
      match_count: profile.match_count,
      converted: profile.converted,
      unsubscribed_at: profile.unsubscribed_at,
      age_range: profile.age_range,
      current_revenue: profile.current_revenue,
      objectif_mensuel: profile.objectif_mensuel,
      delai_mois: profile.delai_mois,
      plateformes: profile.plateformes,
      blocage: profile.blocage,
      reve: profile.reve,
      wants_ai_video: profile.wants_ai_video,
      support_level: profile.support_level,
      engagement_signed_at: profile.engagement_signed_at,
      subscription_status: profile.subscription_status,
      subscription_duration_months: profile.subscription_duration_months,
      marketing_opt_in: profile.marketing_opt_in,
      email_suppressed_at: profile.email_suppressed_at,
      last_relance_at: lastRelanceAt,
      last_relance: lastSend ? `${lastSend.sequence}:${lastSend.step}` : profile.last_recovery_email_sent_at ? "ancienne relance" : null,
      intent_score: intentScore({
        funnelLastStep: profile.funnel_last_step ?? 0,
        events: eventsByUser.get(profile.id) ?? [],
        lastActivityAt: profile.updated_at,
        now,
      }),
    };
  });

  return json({ rows });
});
