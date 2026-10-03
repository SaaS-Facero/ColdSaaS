// Supabase Edge Function — lifecycle-link : le CTA de chaque email.
//
// GET ?t=<jeton signé> (voir _shared/lifecycle-send.ts, valide 14 jours)
//   1. vérifie la signature et l'expiration ;
//   2. trace un événement email_click (attribution, score d'intention) ;
//   3. crée un lien magique Supabase À CET INSTANT (un lien magique créé à
//      l'envoi aurait expiré dans la boîte de réception) et redirige
//      dessus, avec retour sur l'écran exact :
//        result  -> /?resume=result (concept + offres)
//        quiz    -> /?resume=quiz   (reprise à l'écran où la personne s'est arrêtée)
//        account -> /compte
// Jeton invalide ou expiré : redirection vers /connexion (jamais d'erreur
// brute). Déployée avec --no-verify-jwt (clic depuis une messagerie).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyLinkToken, SITE_URL } from "../_shared/lifecycle-send.ts";

const DESTINATIONS: Record<string, string> = {
  result: `${SITE_URL}/?resume=result`,
  quiz: `${SITE_URL}/?resume=quiz`,
  account: `${SITE_URL}/compte`,
};

function redirect(url: string) {
  return new Response(null, { status: 302, headers: { Location: url, "Cache-Control": "no-store" } });
}

Deno.serve(async (req) => {
  const token = new URL(req.url).searchParams.get("t") || "";
  const payload = await verifyLinkToken(token);
  if (!payload) return redirect(`${SITE_URL}/connexion`);

  const destination = DESTINATIONS[payload.d] || DESTINATIONS.result;
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // Le clic est tracé même si la suite échoue (mesure fiable).
  await admin.from("events").insert({ user_id: payload.u, type: "email_click", metadata: { send_key: payload.k, destination: payload.d } });

  const { data: userRes } = await admin.auth.admin.getUserById(payload.u);
  const email = userRes?.user?.email;
  if (!email) return redirect(`${SITE_URL}/connexion?redirect=${encodeURIComponent(destination.replace(SITE_URL, ""))}`);

  const { data: link, error } = await admin.auth.admin.generateLink({ type: "magiclink", email, options: { redirectTo: destination } });
  if (error || !link?.properties?.action_link) {
    console.error("[lifecycle-link] lien magique impossible :", error?.message);
    return redirect(`${SITE_URL}/connexion?redirect=${encodeURIComponent(destination.replace(SITE_URL, ""))}`);
  }
  return redirect(link.properties.action_link);
});
