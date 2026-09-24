// Supabase Edge Function — crée une session Stripe Customer Portal pour
// que l'utilisateur gère/résilie son abonnement lui-même. Aucune page de
// gestion custom : Stripe héberge tout (changement de moyen de paiement,
// résiliation, factures) -- décision produit explicite (Portal, pas
// custom, voir contexte).
//
// Nécessite profiles.stripe_customer_id déjà renseigné, posé par
// stripe-webhook au premier évènement d'abonnement reçu pour cet
// utilisateur -- si absent, l'utilisateur n'a jamais eu d'abonnement actif.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ORIGINS = new Set([
  "https://coldtrend.com",
  "https://www.coldtrend.com",
  "http://localhost:3000",
]);

const SITE_URL = "https://coldtrend.com";

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

  const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");
  if (!stripeSecretKey) {
    console.error("[create-portal-session] STRIPE_SECRET_KEY manquante.");
    return json({ error: "Configuration manquante." }, 500);
  }

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: profile, error: profileErr } = await admin
    .from("profiles")
    .select("stripe_customer_id")
    .eq("id", userRes.user.id)
    .single();
  if (profileErr || !profile?.stripe_customer_id) {
    return json({ error: "Aucun abonnement associé à ce compte." }, 404);
  }

  const params = new URLSearchParams();
  params.set("customer", profile.stripe_customer_id);
  params.set("return_url", `${SITE_URL}/compte`);

  let stripeRes: Response;
  try {
    stripeRes = await fetch("https://api.stripe.com/v1/billing_portal/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${stripeSecretKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });
  } catch (err) {
    console.error("[create-portal-session] appel Stripe échoué :", err);
    return json({ error: "Service indisponible, réessaie plus tard." }, 502);
  }

  if (!stripeRes.ok) {
    const errText = await stripeRes.text();
    console.error("[create-portal-session] Stripe a renvoyé une erreur :", stripeRes.status, errText);
    return json({ error: "Impossible d'ouvrir la gestion d'abonnement." }, 502);
  }

  const session = await stripeRes.json();
  if (typeof session.url !== "string") {
    console.error("[create-portal-session] réponse Stripe sans URL exploitable :", JSON.stringify(session).slice(0, 500));
    return json({ error: "Réponse invalide." }, 502);
  }

  return json({ url: session.url });
});
