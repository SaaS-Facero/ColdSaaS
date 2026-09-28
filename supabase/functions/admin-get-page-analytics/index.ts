// Supabase Edge Function — agrège les pages vues maison (funnel_events,
// event_name = "page_view", voir scripts/build.mjs trackPageView()) pour
// l'écran /admin. Lecture seule, aucune écriture. Même pattern que
// admin-check-email-status/admin-get-stripe-prices : is_admin revérifié
// côté serveur avec le rôle service, jamais de confiance dans le client.
//
// Agrégation faite ICI plutôt que côté client : on ne renvoie jamais les
// lignes brutes (potentiellement des milliers), juste des totaux -- plus
// léger, et le client n'a pas à connaître la structure de funnel_events.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ORIGINS = new Set([
  "https://coldtrend.com",
  "https://www.coldtrend.com",
  "http://localhost:3000"
]);

// Borne raisonnable pour un site en early-stage -- au-delà, `truncated:true`
// prévient que l'agrégation porte sur un sous-ensemble (les plus récents),
// jamais un total silencieusement faux.
const MAX_ROWS = 5000;
const DAYS_BREAKDOWN = 14;

function corsHeaders(origin: string | null) {
  const allowOrigin = origin && ALLOWED_ORIGINS.has(origin) ? origin : "https://coldtrend.com";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin"
  };
}

function dayKey(iso: string): string {
  return iso.slice(0, 10); // "YYYY-MM-DD"
}

function referrerHost(referrer: string | null): string {
  if (!referrer) return "Direct / inconnu";
  try {
    return new URL(referrer).hostname.replace(/^www\./, "");
  } catch {
    return "Direct / inconnu";
  }
}

function topEntries(counts: Record<string, number>, limit: number) {
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([key, count]) => ({ key, count }));
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

  const supabaseAdmin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const { data: callerProfile, error: callerErr } = await supabaseAdmin
    .from("profiles")
    .select("is_admin")
    .eq("id", userRes.user.id)
    .single();
  if (callerErr || !callerProfile?.is_admin) return json({ error: "Accès refusé." }, 403);

  const { data: rows, error: rowsErr } = await supabaseAdmin
    .from("funnel_events")
    .select("metadata, created_at")
    .eq("event_name", "page_view")
    .order("created_at", { ascending: false })
    .limit(MAX_ROWS);

  if (rowsErr) {
    console.error("[admin-get-page-analytics] échec lecture funnel_events :", rowsErr.message);
    return json({ error: "Lecture des statistiques échouée." }, 500);
  }

  const total = rows?.length ?? 0;
  const now = Date.now();
  const todayKey = dayKey(new Date(now).toISOString());
  const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;

  const byPathCounts: Record<string, number> = {};
  const byReferrerCounts: Record<string, number> = {};
  const byDayCounts: Record<string, number> = {};
  let todayCount = 0;
  let last7DaysCount = 0;

  for (const row of rows ?? []) {
    const metadata = (row.metadata ?? {}) as { path?: string; referrer?: string | null };
    const path = typeof metadata.path === "string" ? metadata.path : "(inconnu)";
    byPathCounts[path] = (byPathCounts[path] ?? 0) + 1;

    const referrer = referrerHost(metadata.referrer ?? null);
    byReferrerCounts[referrer] = (byReferrerCounts[referrer] ?? 0) + 1;

    const createdAt = String(row.created_at);
    const key = dayKey(createdAt);
    byDayCounts[key] = (byDayCounts[key] ?? 0) + 1;

    if (key === todayKey) todayCount += 1;
    if (new Date(createdAt).getTime() >= sevenDaysAgo) last7DaysCount += 1;
  }

  // Toujours les DAYS_BREAKDOWN derniers jours, même à 0 -- un graphique qui
  // saute des jours vides serait trompeur (donnerait l'impression d'un
  // historique plus court ou plus dense qu'il ne l'est réellement).
  const byDay: Array<{ date: string; count: number }> = [];
  for (let i = DAYS_BREAKDOWN - 1; i >= 0; i--) {
    const d = new Date(now - i * 24 * 60 * 60 * 1000);
    const key = dayKey(d.toISOString());
    byDay.push({ date: key, count: byDayCounts[key] ?? 0 });
  }

  return json({
    total,
    truncated: total === MAX_ROWS,
    todayCount,
    last7DaysCount,
    byDay,
    byPath: topEntries(byPathCounts, 15).map((e) => ({ path: e.key, count: e.count })),
    byReferrer: topEntries(byReferrerCounts, 10).map((e) => ({ referrer: e.key, count: e.count }))
  });
});
