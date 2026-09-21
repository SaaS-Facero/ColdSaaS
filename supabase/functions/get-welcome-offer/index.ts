// Supabase Edge Function — assignation déterministe du code promo affiché
// sur l'écran de paiement du quiz, à partir d'un signal réel déjà en base
// (nombre de relances déjà envoyées à ce profil), jamais un tirage
// aléatoire à chaque chargement.
//
// Palier = (relance automatique déjà envoyée ? 1 : 0)
//        + (nombre de relances manuelles envoyées depuis /admin)
//   0 relance -> welcome5
//   1 relance -> welcome10
//   2+ relances -> welcome15
//
// Le comptage lit profiles.last_recovery_email_sent_at (relance automatique,
// send-abandon-emails) ET admin_email_sends (relances manuelles, /admin) --
// les deux sont des faits réels, jamais combinés arbitrairement pour
// gonfler un palier.
//
// Le prix final barré est calculé depuis promo_codes.discount_percent
// (réel, configuré en base -- voir migration 0023), jamais un chiffre
// affiché à la volée sans source. Le compteur de places n'est renvoyé que
// s'il reste moins de COUNTER_VISIBILITY_THRESHOLD utilisations, pour ne
// jamais afficher un chiffre qui neutraliserait l'urgence réelle.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ORIGINS = new Set([
  "https://coldtrend.com",
  "https://www.coldtrend.com",
  "http://localhost:3000"
]);

// Doit rester synchronisé avec pricing.totalPrice dans scripts/build.mjs.
const BASE_PRICE_CENTS = 1490;
const COUNTER_VISIBILITY_THRESHOLD = 20;

const RELANCE_TEMPLATE_IDS = ["quiz_abandonne", "resultat_non_paye"];

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

  const [profileRes, sendsRes] = await Promise.all([
    supabaseAdmin.from("profiles").select("last_recovery_email_sent_at").eq("id", userRes.user.id).single(),
    supabaseAdmin
      .from("admin_email_sends")
      .select("id", { count: "exact", head: true })
      .eq("recipient_id", userRes.user.id)
      .in("template_id", RELANCE_TEMPLATE_IDS)
  ]);

  const autoRelanceSent = !!profileRes.data?.last_recovery_email_sent_at;
  const manualRelanceCount = sendsRes.count ?? 0;
  const relanceCount = (autoRelanceSent ? 1 : 0) + manualRelanceCount;

  const code = relanceCount === 0 ? "welcome5" : relanceCount === 1 ? "welcome10" : "welcome15";

  const { data: promo, error: promoErr } = await supabaseAdmin
    .from("promo_codes")
    .select("code, discount_percent, max_redemptions, redemptions")
    .eq("code", code)
    .single();

  if (promoErr || !promo) {
    console.error("[get-welcome-offer] code introuvable :", code, promoErr?.message);
    return json({ error: "Offre indisponible." }, 500);
  }

  const remaining = promo.max_redemptions - promo.redemptions;
  if (remaining <= 0) {
    // Code épuisé (Stripe le refuserait de toute façon) -- pas d'offre à
    // proposer plutôt que d'en afficher une morte.
    return json({ available: false });
  }

  const finalPriceCents = Math.round(BASE_PRICE_CENTS * (1 - promo.discount_percent / 100));

  return json({
    available: true,
    code: promo.code,
    discountPercent: promo.discount_percent,
    basePriceCents: BASE_PRICE_CENTS,
    finalPriceCents,
    remaining,
    showCounter: remaining < COUNTER_VISIBILITY_THRESHOLD,
    isFirstView: relanceCount === 0
  });
});
