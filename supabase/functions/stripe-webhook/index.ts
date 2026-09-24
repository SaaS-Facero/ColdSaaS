// Supabase Edge Function — webhook Stripe, seule source de vérité pour le
// statut de paiement/abonnement.
//
// Vérification de signature faite à la main (HMAC-SHA256 via Web Crypto),
// sans le SDK Stripe : la vérification de webhook ne nécessite que le
// secret de signature (STRIPE_WEBHOOK_SECRET), indépendant de
// STRIPE_SECRET_KEY (désormais utilisée ailleurs -- create-checkout-session,
// create-portal-session -- pour créer de vraies sessions Stripe).
//
// Deux familles d'évènements gérées ici :
// 1. checkout.session.completed (mode "payment", historique) -- écrit
//    profiles.paid_at, via client_reference_id posé côté client avant
//    redirection vers un Payment Link. Conservé tel quel pour l'upsell
//    "plan de communication", seul flux qui l'utilise encore.
// 2. Évènements d'abonnement (checkout.session.completed en mode
//    "subscription", customer.subscription.updated/deleted,
//    invoice.payment_failed) -- voir handleSubscriptionEvent() plus bas.
//    Toujours journalisés dans stripe_webhook_events (migration 0025) ;
//    la mise à jour réelle de profiles n'est appliquée que si
//    ENABLE_SUBSCRIPTION_ACCESS_UPDATES=true est posé dans les secrets
//    Supabase -- volontairement désactivé par défaut le temps de vérifier
//    manuellement la structure des évènements reçus sur un premier
//    abonnement réel avant d'activer l'octroi d'accès automatique.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Correspondance ID Stripe -> code affiché en toast sur l'écran de
// paiement (voir promo_codes en base). Codés en dur plutôt que lus depuis
// l'API Stripe : ces ID de Promotion Code sont stables et non sensibles
// (pas une clé secrète). Le payload du webhook `checkout.session.completed`
// contient déjà `discounts[].promotion_code` par défaut (pas besoin
// d'expand) mais seulement sous forme d'ID opaque (`promo_xxx`), jamais le
// texte humain -- d'où cette table de correspondance.
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

// Interrupteur explicite pour la logique d'abonnement qui modifie
// réellement l'accès (profiles.subscription_status/stripe_*) -- tant que
// cette variable n'est pas posée à "true" dans les secrets Supabase, les
// évènements d'abonnement sont uniquement journalisés dans
// stripe_webhook_events (voir migration 0025), jamais appliqués à
// profiles. Étape volontaire avant tout premier abonnement réel : vérifier
// manuellement la structure des évènements reçus, puis activer.
const SUBSCRIPTION_ACCESS_UPDATES_ENABLED = Deno.env.get("ENABLE_SUBSCRIPTION_ACCESS_UPDATES") === "true";

// Journalise systématiquement, puis n'applique la mise à jour réelle
// d'accès que si SUBSCRIPTION_ACCESS_UPDATES_ENABLED. userId est résolu
// par ordre de préférence : metadata posée à la création (checkout.session
// .completed, subscription_data.metadata) -- les évènements
// customer.subscription.* portent aussi metadata.user_id (copiée depuis
// subscription_data.metadata à la création), donc le même champ suffit
// pour toute la famille d'évènements, pas besoin de retrouver le profil
// par stripe_customer_id à chaque fois.
async function handleSubscriptionEvent(event: { id: string; type: string; data: { object: Record<string, unknown> } }) {
  const supabaseAdmin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const object = event.data.object ?? {};

  const metadata = (object["metadata"] ?? {}) as Record<string, unknown>;
  const userId = typeof metadata["user_id"] === "string" ? metadata["user_id"] : null;

  const stripeCustomerId = typeof object["customer"] === "string" ? object["customer"] : null;
  // "subscription" est l'ID sur une Checkout Session ; sur les évènements
  // customer.subscription.*, l'objet EST directement la subscription (son
  // "id" est déjà l'ID de subscription).
  const stripeSubscriptionId =
    typeof object["subscription"] === "string"
      ? object["subscription"]
      : event.type.startsWith("customer.subscription.")
        ? (typeof object["id"] === "string" ? object["id"] : null)
        : null;
  const status = typeof object["status"] === "string" ? object["status"] : event.type === "checkout.session.completed" ? "active" : null;
  const durationMonths = Number(metadata["duration_months"]) || null;

  const { error: logError } = await supabaseAdmin.from("stripe_webhook_events").insert({
    stripe_event_id: event.id,
    event_type: event.type,
    payload: event,
    profile_id: userId,
    processed_access_update: false,
  });
  if (logError) {
    // Un conflit sur stripe_event_id (unique) signifie un renvoi du même
    // évènement par Stripe (retry normal) -- pas une vraie erreur.
    if (!logError.message.includes("duplicate key")) {
      console.error("[stripe-webhook] échec journalisation stripe_webhook_events :", logError.message);
    }
    return;
  }

  console.log(
    `[stripe-webhook] évènement d'abonnement journalisé : ${event.type} (${event.id}), user_id=${userId ?? "inconnu"}, status=${status ?? "n/a"}, subscription_access_updates_enabled=${SUBSCRIPTION_ACCESS_UPDATES_ENABLED}`
  );

  if (!SUBSCRIPTION_ACCESS_UPDATES_ENABLED) return;
  if (!userId) {
    console.warn(`[stripe-webhook] évènement ${event.type} sans metadata.user_id exploitable — accès non mis à jour.`);
    return;
  }

  const update: Record<string, unknown> = {};
  if (stripeCustomerId) update.stripe_customer_id = stripeCustomerId;
  if (stripeSubscriptionId) update.stripe_subscription_id = stripeSubscriptionId;
  if (status) update.subscription_status = status;
  if (durationMonths) update.subscription_duration_months = durationMonths;
  if (event.type === "checkout.session.completed") update.paid_at = new Date().toISOString();

  if (Object.keys(update).length === 0) return;

  const { error: updateError } = await supabaseAdmin.from("profiles").update(update).eq("id", userId);
  if (updateError) {
    console.error(`[stripe-webhook] échec mise à jour profiles pour ${event.type} :`, updateError.message);
    return;
  }

  await supabaseAdmin
    .from("stripe_webhook_events")
    .update({ processed_access_update: true })
    .eq("stripe_event_id", event.id);
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

  let event: { id?: string; type?: string; data?: { object?: Record<string, unknown> } };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return new Response("JSON invalide.", { status: 400 });
  }

  const SUBSCRIPTION_EVENT_TYPES = new Set([
    "customer.subscription.updated",
    "customer.subscription.deleted",
    "invoice.payment_failed",
  ]);

  if (event.type === "checkout.session.completed" && (event.data?.object ?? {})["mode"] === "subscription") {
    await handleSubscriptionEvent(event as { id: string; type: string; data: { object: Record<string, unknown> } });
  } else if (event.type && SUBSCRIPTION_EVENT_TYPES.has(event.type)) {
    await handleSubscriptionEvent(event as { id: string; type: string; data: { object: Record<string, unknown> } });
  } else if (event.type === "checkout.session.completed") {
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

      // Deux Payment Links distincts (paiement unique, historiques --
      // remplacés par l'abonnement Stripe Subscriptions ci-dessus pour
      // l'accès principal, ce chemin ne reste actif que pour l'upsell)
      // partagent ce webhook : l'ancien accès principal (15€) encodait
      // juste l'UUID utilisateur dans client_reference_id ; l'upsell "plan
      // de communication" (3,90€, par listing) encode "<uuid>::<slug>" --
      // ce format reste le seul signal disponible pour distinguer les deux,
      // aucun appel Stripe supplémentaire pour récupérer les line_items.
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
