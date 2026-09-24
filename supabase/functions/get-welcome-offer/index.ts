// Supabase Edge Function — résout, en LECTURE SEULE, quel palier de
// réduction afficher sur l'écran de paiement de l'abonnement (bandeau
// bienvenue/retour). Sert uniquement à l'affichage : create-checkout-session
// re-dérive indépendamment le même palier côté serveur avant d'appliquer
// une réduction Stripe réelle -- cette fonction ne fournit jamais le code à
// appliquer, jamais un choix côté client, jamais un tirage.
//
// Palier = un seul signal réel (profiles.last_recovery_email_sent_at) :
//   null      -> welcome34  (-34%, première visite)
//   non nul   -> comeback23 (-23%, retour après relance automatique)
// Contrairement à l'ancien mécanisme welcome5/10/15 (toujours utilisé par
// l'upsell "plan de communication" sur /concept, voir stripe-webhook), le
// nombre de relances manuelles envoyées depuis /admin n'entre plus en jeu
// ici -- décision explicite, 2 paliers seulement.

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

  const supabaseAdmin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const { data: profile, error: profileErr } = await supabaseAdmin
    .from("profiles")
    .select("last_recovery_email_sent_at")
    .eq("id", userRes.user.id)
    .single();
  if (profileErr) {
    console.error("[get-welcome-offer] échec lecture profil :", profileErr.message);
    return json({ available: false });
  }

  const isFirstView = !profile?.last_recovery_email_sent_at;
  const code = isFirstView ? "welcome34" : "comeback23";

  const { data: promo, error: promoErr } = await supabaseAdmin
    .from("promo_codes")
    .select("code, discount_percent, discount_label, max_redemptions, redemptions")
    .eq("code", code)
    .single();

  if (promoErr || !promo) {
    console.error("[get-welcome-offer] code introuvable :", code, promoErr?.message);
    return json({ available: false });
  }

  if (promo.redemptions >= promo.max_redemptions) {
    // Code épuisé côté compteur maison (Stripe le refuserait de toute
    // façon) -- pas d'offre à annoncer plutôt que d'en afficher une morte,
    // jamais un compteur de places affiché ici (voir garde-fou anti-urgence).
    return json({ available: false });
  }

  return json({
    available: true,
    code: promo.code,
    discountPercent: promo.discount_percent,
    isFirstView
  });
});
