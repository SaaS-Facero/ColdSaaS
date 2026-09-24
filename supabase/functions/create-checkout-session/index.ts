// Supabase Edge Function — crée une vraie Stripe Checkout Session en mode
// "subscription" pour le Price ID récurrent mensuel unique (24,90€/mois),
// quelle que soit la durée affichée côté client (1/3/6 mois -- purement
// déclaratif, voir profiles.subscription_duration_months). Remplace le
// Payment Link statique pour ce flux : un Payment Link ne permet pas
// d'attacher client_reference_id/metadata dynamiquement par requête.
//
// Sécurité : aucune carte n'est jamais manipulée ici -- Stripe héberge le
// formulaire de paiement, cette fonction ne fait que demander une session
// et renvoyer son URL. Créer une session ne facture personne.
//
// API Stripe appelée en REST brut (form-urlencoded), sans SDK, même
// convention que le reste de ce projet (voir stripe-webhook).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ORIGINS = new Set([
  "https://coldtrend.com",
  "https://www.coldtrend.com",
  "http://localhost:3000",
]);

const SITE_URL = "https://coldtrend.com";

// Un seul Price ID récurrent mensuel réutilisé pour les 3 cartes de durée
// -- jamais un Price différent par durée, cohérent avec le garde-fou
// "aucune contrainte technique différente entre les 3 durées".
const SUBSCRIPTION_PRICE_ID = "price_1UJ2HoKs6wCNxRh3Nslde9SH";
const ALLOWED_DURATIONS = new Set([1, 3, 6]);

function corsHeaders(origin: string | null) {
  const allowOrigin = origin && ALLOWED_ORIGINS.has(origin) ? origin : "https://coldtrend.com";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
}

Deno.serve(async (req) => {
  const headers = corsHeaders(req.headers.get("origin"));
  if (req.method === "OPTIONS") return new Response(null, { headers });

  function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
      status,
      headers: { ...headers, "Content-Type": "application/json" },
    });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Non authentifié." }, 401);

  const supabaseAsUser = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userRes, error: userErr } = await supabaseAsUser.auth.getUser();
  if (userErr || !userRes.user) return json({ error: "Session invalide." }, 401);
  const user = userRes.user;

  const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");
  if (!stripeSecretKey) {
    console.error("[create-checkout-session] STRIPE_SECRET_KEY manquante.");
    return json({ error: "Configuration manquante." }, 500);
  }

  let body: { durationMonths?: number } = {};
  try {
    body = await req.json();
  } catch {
    /* corps vide -- durationMonths retombe sur le défaut ci-dessous */
  }
  const durationMonths = ALLOWED_DURATIONS.has(body.durationMonths as number) ? (body.durationMonths as number) : 1;

  // form-urlencoded, pas JSON -- format attendu par l'API Stripe. URLSearchParams
  // gère l'échappement, jamais de concaténation manuelle de chaîne ici.
  const params = new URLSearchParams();
  params.set("mode", "subscription");
  params.set("line_items[0][price]", SUBSCRIPTION_PRICE_ID);
  params.set("line_items[0][quantity]", "1");
  params.set("client_reference_id", user.id);
  if (user.email) params.set("customer_email", user.email);
  params.set("metadata[user_id]", user.id);
  params.set("metadata[duration_months]", String(durationMonths));
  params.set("subscription_data[metadata][user_id]", user.id);
  params.set("subscription_data[metadata][duration_months]", String(durationMonths));
  params.set("success_url", `${SITE_URL}/succes?session_id={CHECKOUT_SESSION_ID}`);
  params.set("cancel_url", `${SITE_URL}/?resume=result`);

  let stripeRes: Response;
  try {
    stripeRes = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${stripeSecretKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });
  } catch (err) {
    console.error("[create-checkout-session] appel Stripe échoué :", err);
    return json({ error: "Service de paiement indisponible, réessaie plus tard." }, 502);
  }

  if (!stripeRes.ok) {
    const errText = await stripeRes.text();
    console.error("[create-checkout-session] Stripe a renvoyé une erreur :", stripeRes.status, errText);
    return json({ error: "Impossible de créer la session de paiement." }, 502);
  }

  const session = await stripeRes.json();
  if (typeof session.url !== "string") {
    console.error("[create-checkout-session] réponse Stripe sans URL exploitable :", JSON.stringify(session).slice(0, 500));
    return json({ error: "Réponse de paiement invalide." }, 502);
  }

  return json({ url: session.url });
});
