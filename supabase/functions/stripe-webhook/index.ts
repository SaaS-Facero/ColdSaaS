// Supabase Edge Function — webhook Stripe, seule source de vérité pour le
// statut de paiement. Écrit profiles.paid_at, jamais posé côté client.
//
// Vérification de signature faite à la main (HMAC-SHA256 via Web Crypto),
// sans le SDK Stripe ni sa clé API secrète : la vérification de webhook ne
// nécessite que le secret de signature (STRIPE_WEBHOOK_SECRET), pas de
// clé Stripe supplémentaire à stocker.
//
// Attribution du paiement à un profil : via `client_reference_id` sur la
// session Checkout, posé côté client juste avant redirection vers Stripe
// (voir scripts/build.mjs, goToPayment() — ajoute ?client_reference_id=
// à l'URL du Payment Link). Sans ce paramètre, l'événement est journalisé
// et ignoré plutôt que de tenter une résolution par email fragile.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Correspondance ID Stripe -> code affiché en toast sur l'écran de
// paiement (voir promo_codes en base). Codés en dur plutôt que lus depuis
// l'API Stripe : ces ID de Promotion Code sont stables et non sensibles
// (pas une clé secrète), et ce projet n'a explicitement aucune clé API
// Stripe (voir commentaire en tête de ce fichier). Le payload du webhook
// `checkout.session.completed` contient déjà `discounts[].promotion_code`
// par défaut (pas besoin d'expand) mais seulement sous forme d'ID opaque
// (`promo_xxx`), jamais le texte humain -- d'où cette table de correspondance.
const PROMO_CODE_BY_STRIPE_ID: Record<string, string> = {
  promo_1UIFFqKs6wCNxRh3Pr2CaWeF: "welcome5",
  promo_1UIFFEKs6wCNxRh3UDJuG9DK: "welcome10",
  promo_1UIFGWKs6wCNxRh32o3i65UQ: "welcome15"
};

async function verifyStripeSignature(payload: string, signatureHeader: string | null, secret: string): Promise<boolean> {
  if (!signatureHeader) return false;
  const parts: Record<string, string> = {};
  signatureHeader.split(",").forEach((part) => {
    const [key, value] = part.split("=");
    if (key && value) parts[key] = value;
  });
  const timestamp = parts["t"];
  const signature = parts["v1"];
  if (!timestamp || !signature) return false;

  const signedPayload = `${timestamp}.${payload}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sigBuffer = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signedPayload));
  const expected = Array.from(new Uint8Array(sigBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  // Comparaison en temps constant pour éviter une attaque par timing sur
  // la signature, même si le risque réel est faible ici.
  if (expected.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i += 1) {
    diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  return diff === 0;
}

Deno.serve(async (req) => {
  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  if (!webhookSecret) {
    console.error("[stripe-webhook] STRIPE_WEBHOOK_SECRET manquant.");
    return new Response("Configuration manquante.", { status: 500 });
  }

  const rawBody = await req.text();
  const signatureHeader = req.headers.get("stripe-signature");
  const isValid = await verifyStripeSignature(rawBody, signatureHeader, webhookSecret);
  if (!isValid) {
    return new Response("Signature invalide.", { status: 400 });
  }

  let event: { type?: string; data?: { object?: Record<string, unknown> } };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return new Response("JSON invalide.", { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data?.object ?? {};
    const paymentStatus = session["payment_status"];
    const clientReferenceId = session["client_reference_id"];

    if (paymentStatus === "paid" && typeof clientReferenceId === "string" && clientReferenceId) {
      const supabaseAdmin = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
      );

      // Compteur maison du toast de l'écran de paiement -- incrémenté
      // uniquement ici, sur un paiement réellement confirmé (jamais côté
      // client, jamais de manière optimiste à l'affichage ou au clic).
      // `discounts` est présent par défaut sur l'objet Checkout Session,
      // sans expand, mais chaque entrée ne donne que l'ID Stripe opaque du
      // Promotion Code -- PROMO_CODE_BY_STRIPE_ID fait la traduction.
      const discounts = Array.isArray(session["discounts"]) ? (session["discounts"] as Array<Record<string, unknown>>) : [];
      for (const discount of discounts) {
        const promoStripeId = discount["promotion_code"];
        if (typeof promoStripeId !== "string") continue;
        const code = PROMO_CODE_BY_STRIPE_ID[promoStripeId];
        if (!code) continue;
        const { error: incrementError } = await supabaseAdmin.rpc("increment_promo_redemption", { p_code: code });
        if (incrementError) {
          console.error("[stripe-webhook] échec incrément promo_codes :", incrementError.message);
        }
      }

      // Deux Payment Links distincts partagent ce webhook : l'accès principal
      // (15€) encode juste l'UUID utilisateur dans client_reference_id ;
      // l'upsell "plan de communication" (3,90€, par listing) encode
      // "<uuid>::<slug>" -- pas d'appel API Stripe supplémentaire pour
      // récupérer les line_items (ce projet n'utilise jamais la clé secrète
      // Stripe), donc ce format est le seul signal disponible pour
      // distinguer les deux paiements.
      if (clientReferenceId.includes("::")) {
        const [userId, slug] = clientReferenceId.split("::");
        if (!userId || !slug) {
          console.warn("[stripe-webhook] client_reference_id upsell mal formé — ignoré.", clientReferenceId);
        } else {
          const { error } = await supabaseAdmin
            .from("comm_plan_purchases")
            .upsert({ user_id: userId, slug, paid_at: new Date().toISOString() }, { onConflict: "user_id,slug" });
          if (error) {
            console.error("[stripe-webhook] échec de mise à jour comm_plan_purchases :", error.message);
          }
        }
      } else {
        const { error } = await supabaseAdmin
          .from("profiles")
          .update({ paid_at: new Date().toISOString() })
          .eq("id", clientReferenceId);
        if (error) {
          console.error("[stripe-webhook] échec de mise à jour profiles :", error.message);
        }
      }
    } else {
      console.warn("[stripe-webhook] checkout.session.completed sans client_reference_id exploitable — ignoré.");
    }
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
});
