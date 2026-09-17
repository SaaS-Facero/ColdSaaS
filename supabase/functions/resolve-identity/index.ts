// Supabase Edge Function — résolution d'identité en un seul aller-retour.
//
// Remplace le pattern client "essaie signUp, si déjà pris alors signIn" (deux
// allers-retours réseau visibles, latence perceptible) par UN SEUL appel
// serveur qui gère les deux cas et renvoie TOUJOURS le même format de
// réponse (session + user) — le client ne voit jamais la différence entre
// "nouveau compte" et "compte existant".
//
// service_role UNIQUEMENT ici, dans ce runtime isolé côté serveur — jamais
// exposée au navigateur. `SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY` sont
// injectées automatiquement par Supabase dans l'environnement de toute Edge
// Function déployée sur ce projet : rien à configurer via `supabase secrets`.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const MIN_RESPONSE_MS = 400; // plancher de latence commun aux deux branches —
// anti-énumération basique : un observateur qui mesure le temps de réponse
// ne doit pas pouvoir déduire si l'email existait déjà. Proportionné à un
// produit à 14,90€, pas une protection de niveau bancaire.

const ALLOWED_ORIGINS = new Set([
  "https://coldtrend.com",
  "https://www.coldtrend.com",
  "http://localhost:3000",
]);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

  if (req.method === "OPTIONS") {
    return new Response(null, { headers });
  }

  const startedAt = Date.now();

  function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
      status,
      headers: { ...headers, "Content-Type": "application/json" },
    });
  }

  async function respond(response: Response) {
    const elapsed = Date.now() - startedAt;
    const remaining = MIN_RESPONSE_MS - elapsed;
    if (remaining > 0) {
      await new Promise((resolve) => setTimeout(resolve, remaining));
    }
    return response;
  }

  try {
    const { email, password } = await req.json();

    if (
      typeof email !== "string" ||
      !EMAIL_RE.test(email) ||
      typeof password !== "string" ||
      password.length < 6
    ) {
      return await respond(json({ error: "Email ou mot de passe invalide." }, 400));
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // 1) Tente la création. email_confirm:true court-circuite la
    // confirmation quel que soit le réglage dashboard (défense en
    // profondeur, même si "Confirm email" est déjà désactivé côté projet).
    const createRes = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (!createRes.error && createRes.data.user) {
      const signInRes = await supabaseAdmin.auth.signInWithPassword({ email, password });
      if (signInRes.error || !signInRes.data.session) {
        console.error("[resolve-identity] session introuvable juste après création :", signInRes.error?.message);
        return await respond(json({ error: "Erreur serveur." }, 500));
      }
      return await respond(json({ user: signInRes.data.user, session: signInRes.data.session }));
    }

    // 2) Compte déjà existant — vérifie le mot de passe fourni. Le message
    // d'erreur reste générique dans les deux branches d'échec ci-dessous :
    // le client ne doit jamais pouvoir distinguer "email inconnu ici" (ce
    // n'est même pas le cas) de "mot de passe incorrect".
    const alreadyExists =
      createRes.error != null &&
      (createRes.error.message.toLowerCase().includes("already") ||
        (createRes.error as { code?: string }).code === "email_exists");

    if (!alreadyExists) {
      console.error("[resolve-identity] échec createUser inattendu :", createRes.error?.message);
      return await respond(json({ error: "Impossible de créer le compte pour le moment." }, 500));
    }

    const signInRes = await supabaseAdmin.auth.signInWithPassword({ email, password });
    if (signInRes.error || !signInRes.data.session) {
      return await respond(json({ error: "Email ou mot de passe incorrect." }, 401));
    }

    return await respond(json({ user: signInRes.data.user, session: signInRes.data.session }));
  } catch (err) {
    console.error("[resolve-identity] erreur inattendue :", err);
    return await respond(json({ error: "Erreur serveur." }, 500));
  }
});
