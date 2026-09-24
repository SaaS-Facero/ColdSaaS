// Supabase Edge Function — lecture seule, diagnostic. Renvoie les vrais
// champs Stripe (montant, devise, intervalle de récurrence) d'une liste de
// Price ID, jamais devinés ni codés en dur côté front. Sert uniquement à
// vérifier AVANT d'afficher un prix/une fréquence de facturation sur la
// page de paiement -- ne modifie jamais rien côté Stripe (GET seul).
//
// Sécurité : même pattern que admin-check-email-status -- is_admin revérifié
// côté serveur avec le rôle service, jamais de confiance dans un rôle
// envoyé par le client.

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

const MAX_IDS = 10;

Deno.serve(async (req) => {
  const headers = corsHeaders(req.headers.get("origin"));
  if (req.method === "OPTIONS") return new Response(null, { headers });

  function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
      status,
      headers: { ...headers, "Content-Type": "application/json" }
    });
  }

  // Deux chemins d'accès : session admin normale (JWT), ou secret partagé
  // x-cron-secret (même pattern que sync-trustmrr/send-abandon-emails) --
  // utile pour un appel en ligne de commande ponctuel, sans navigateur, sans
  // jamais faire transiter le service_role ni un mot de passe.
  const cronSecret = Deno.env.get("CRON_SECRET");
  const providedSecret = req.headers.get("x-cron-secret");
  const isCronAuthorized = !!cronSecret && providedSecret === cronSecret;

  if (!isCronAuthorized) {
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
  }

  const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");
  if (!stripeSecretKey) {
    console.error("[admin-get-stripe-prices] STRIPE_SECRET_KEY manquante.");
    return json({ error: "Configuration manquante." }, 500);
  }

  let body: { priceIds?: string[] } = {};
  try {
    body = await req.json();
  } catch {
    return json({ error: "Corps de requête invalide." }, 400);
  }
  const priceIds = Array.isArray(body.priceIds) ? body.priceIds.filter((id) => typeof id === "string").slice(0, MAX_IDS) : [];
  if (priceIds.length === 0) return json({ error: "priceIds manquant ou vide." }, 400);

  const results = await Promise.all(
    priceIds.map(async (priceId) => {
      try {
        const res = await fetch(`https://api.stripe.com/v1/prices/${encodeURIComponent(priceId)}`, {
          headers: { Authorization: `Bearer ${stripeSecretKey}` }
        });
        const data = await res.json();
        if (!res.ok) {
          return { priceId, error: data?.error?.message ?? `HTTP ${res.status}` };
        }
        return {
          priceId,
          active: data.active,
          currency: data.currency,
          unitAmount: data.unit_amount,
          recurringInterval: data.recurring?.interval ?? null,
          recurringIntervalCount: data.recurring?.interval_count ?? null,
          product: data.product
        };
      } catch (err) {
        return { priceId, error: String(err) };
      }
    })
  );

  return json({ results });
});
