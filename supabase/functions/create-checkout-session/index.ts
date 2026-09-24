// Supabase Edge Function — crée une vraie Stripe Checkout Session en mode
// "subscription". Chaque durée (1/3/6 mois) a son propre Price ID Stripe,
// avec sa propre cadence de facturation réelle (mensuelle/trimestrielle/
// semestrielle) et son propre montant -- jamais le même Price réutilisé
// pour les 3 (voir scripts/build.mjs, DURATION_PLANS, pour les montants
// affichés côté client, qui doivent rester synchronisés avec cette table).
// Remplace le Payment Link statique pour ce flux : un Payment Link ne
// permet pas d'attacher client_reference_id/metadata dynamiquement par
// requête.
//
// Sécurité : aucune carte n'est jamais manipulée ici -- Stripe héberge le
// formulaire de paiement, cette fonction ne fait que demander une session
// et renvoyer son URL. Créer une session ne facture personne.
//
// API Stripe appelée en REST brut (form-urlencoded), sans SDK, même
// convention que le reste de ce projet (voir stripe-webhook).
//
// Réduction bienvenue/retour (welcome34/comeback23, migration 0026) :
// re-dérivée ICI, côté serveur, à partir du même signal réel que
// get-welcome-offer (profiles.last_recovery_email_sent_at) -- jamais un
// code de réduction accepté depuis le corps de la requête client. Le
// client (voir écran de paiement) n'affiche qu'un aperçu via
// get-welcome-offer ; seule cette fonction décide réellement de ce qui est
// appliqué à la facturation.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ORIGINS = new Set([
  "https://coldtrend.com",
  "https://www.coldtrend.com",
  "http://localhost:3000",
]);

const SITE_URL = "https://coldtrend.com";

// Un Price ID distinct par durée -- vérifié via admin-get-stripe-prices
// avant intégration (montant + recurring.interval/interval_count réels),
// jamais saisi à l'aveugle depuis une simple annonce en chat.
const PRICE_ID_BY_DURATION: Record<number, string> = {
  1: "price_1UJ2HoKs6wCNxRh3Nslde9SH", // 24,90€, facturé chaque mois
  3: "price_1UJ7BIKs6wCNxRh3sNSXtQv3", // 49,90€, facturé tous les 3 mois
  6: "price_1UJ7DlKs6wCNxRh3TXgtr5Cx", // 79,90€, facturé tous les 6 mois
};
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
  const priceId = PRICE_ID_BY_DURATION[durationMonths];

  const supabaseAdmin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  let stripePromotionCodeId: string | null = null;
  try {
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("last_recovery_email_sent_at")
      .eq("id", user.id)
      .single();
    const promoCode = profile?.last_recovery_email_sent_at ? "comeback23" : "welcome34";
    const { data: promo } = await supabaseAdmin
      .from("promo_codes")
      .select("stripe_promotion_code_id, redemptions, max_redemptions")
      .eq("code", promoCode)
      .single();
    if (promo && promo.redemptions < promo.max_redemptions) {
      stripePromotionCodeId = promo.stripe_promotion_code_id;
    }
  } catch (err) {
    // Une réduction manquée n'est jamais un motif de bloquer un paiement --
    // on continue sans réduction plutôt que de faire échouer le checkout.
    console.warn("[create-checkout-session] résolution de la réduction échouée, poursuite sans réduction :", err);
  }

  // form-urlencoded, pas JSON -- format attendu par l'API Stripe. URLSearchParams
  // gère l'échappement, jamais de concaténation manuelle de chaîne ici.
  const params = new URLSearchParams();
  params.set("mode", "subscription");
  params.set("line_items[0][price]", priceId);
  params.set("line_items[0][quantity]", "1");
  params.set("client_reference_id", user.id);
  if (user.email) params.set("customer_email", user.email);
  if (stripePromotionCodeId) params.set("discounts[0][promotion_code]", stripePromotionCodeId);
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
