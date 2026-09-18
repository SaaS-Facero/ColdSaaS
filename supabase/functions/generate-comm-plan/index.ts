// Supabase Edge Function — genere (ou lit en cache) le plan de communication
// LLM de l'upsell a 3,90€ sur /concept/{slug}. Un seul appel LLM par LISTING
// (pas par utilisateur, meme logique que generate-concept) -- voir
// saas_comm_plans, migration 0014.
//
// Contrairement a generate-concept (reserve a qui a paye l'acces general),
// celui-ci verifie un achat specifique a CE listing dans
// comm_plan_purchases -- poser paid_at general ne suffit pas.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const OPENROUTER_MODEL = "anthropic/claude-sonnet-5";

const ALLOWED_ORIGINS = new Set([
  "https://coldtrend.com",
  "https://www.coldtrend.com",
  "http://localhost:3000",
]);

function corsHeaders(origin: string | null) {
  const allowOrigin = origin && ALLOWED_ORIGINS.has(origin) ? origin : "https://coldtrend.com";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
}

// Meme logique defensive que generate-concept : le prompt interdit deja ces
// formulations, mais on ne fait jamais confiance a une sortie LLM sans
// verification cote serveur.
const FORBIDDEN_PATTERNS = [
  /\d+[\s,.]*(k|000)?\s*(followers|abonnés|vues|clients|ventes)/i,
  /garanti/i,
  /prouvé/i,
  /en \d+\s*(jours|semaines|mois)\s*(tu|vous)?\s*(auras|aurez|obtiendras|obtiendrez)/i,
];

const REQUIRED_FIELDS = ["channels", "organic_angle", "content_ideas", "posting_cadence"];

function buildPrompt(listing: { name: string; secteur: string[]; description: string | null }) {
  const system = `Tu es un consultant marketing digital spécialisé en lancement organique de SaaS, sans budget publicitaire. Ton rôle : à partir d'un SaaS réel et de son secteur, proposer un plan de communication concret et réaliste pour son lancement en France.

Règles strictes :
- Interdiction absolue de toute projection chiffrée de résultats (followers, vues, conversions, clients, revenus) — aucune formulation du type "X followers en Y temps" ou "peut générer Z clients". Le plan décrit des actions et des canaux, jamais des résultats promis, même approximatifs.
- Base les canaux sur des mécanismes réels et vérifiables (où se trouve concrètement l'audience B2B/B2C du secteur concerné) — jamais une supposition vague ni un canal à la mode sans lien démontré avec le secteur.
- Ne jamais écrire "garanti", "prouvé" — ces registres sont réservés aux données réelles affichées séparément par l'interface.
- Si l'information disponible est insuffisante pour un plan crédible, dis-le dans "confidence_note" plutôt que d'inventer.

Format de sortie : JSON strict, aucun texte hors JSON.`;

  const user = `SaaS :
- Nom : ${listing.name}
- Secteur(s) : ${listing.secteur.join(", ")}
- Description : ${listing.description ?? "non communiquée"}

Génère un plan de communication organique pour le marché français. Réponds au format JSON :

{
  "channels": "2-4 phrases : les canaux pertinents pour ce secteur et pourquoi (où est réellement l'audience)",
  "organic_angle": "2-3 phrases : l'angle de contenu organique réaliste à adopter",
  "content_ideas": "3-4 idées de contenu concrètes, en une liste texte",
  "posting_cadence": "Une cadence réaliste et générique (ex: fréquence par semaine, type de contenu récurrent) — jamais un calendrier détaillé fictif",
  "confidence_note": "Limites de ce plan si l'info est insuffisante, sinon vide"
}

Ne produis AUCUN texte avant ou après ce JSON.`;

  return { system, user };
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

  let slug: string;
  try {
    const body = await req.json();
    slug = body.slug;
    if (typeof slug !== "string" || !slug) throw new Error("slug manquant");
  } catch {
    return json({ error: "Requête invalide (slug manquant)." }, 400);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseAsUser = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userRes, error: userErr } = await supabaseAsUser.auth.getUser();
  if (userErr || !userRes.user) return json({ error: "Session invalide." }, 401);

  const admin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const { data: purchase } = await admin
    .from("comm_plan_purchases")
    .select("paid_at")
    .eq("user_id", userRes.user.id)
    .eq("slug", slug)
    .maybeSingle();
  if (!purchase?.paid_at) return json({ error: "Plan de communication non acheté pour ce SaaS." }, 403);

  const { data: cached } = await admin.from("saas_comm_plans").select("*").eq("slug", slug).maybeSingle();
  if (cached) return json({ plan: cached, cached: true });

  const { data: listing, error: listingErr } = await admin
    .from("saas_listings")
    .select("slug, name, secteur, description, active")
    .eq("slug", slug)
    .eq("active", true)
    .single();
  if (listingErr || !listing) return json({ error: "SaaS introuvable." }, 404);

  const openRouterKey = Deno.env.get("OPENROUTER_API_KEY");
  if (!openRouterKey) {
    console.error("[generate-comm-plan] OPENROUTER_API_KEY manquante.");
    return json({ error: "Configuration manquante." }, 500);
  }

  const { system, user } = buildPrompt(listing);

  let llmRes: Response;
  try {
    llmRes = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openRouterKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: OPENROUTER_MODEL,
        max_tokens: 1024,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });
  } catch (err) {
    console.error("[generate-comm-plan] appel OpenRouter échoué :", err);
    return json({ error: "Service de génération indisponible, réessaie plus tard." }, 502);
  }

  if (!llmRes.ok) {
    const errText = await llmRes.text();
    console.error("[generate-comm-plan] OpenRouter a renvoyé une erreur :", llmRes.status, errText);
    return json({ error: "Service de génération indisponible, réessaie plus tard." }, 502);
  }

  const llmBody = await llmRes.json();
  const rawText = llmBody.choices?.[0]?.message?.content;
  if (typeof rawText !== "string") {
    console.error("[generate-comm-plan] réponse OpenRouter sans texte exploitable :", JSON.stringify(llmBody).slice(0, 500));
    return json({ error: "Réponse de génération invalide." }, 502);
  }

  let cleanedText = rawText.trim();
  const fencedMatch = cleanedText.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fencedMatch) cleanedText = fencedMatch[1].trim();

  let plan: Record<string, unknown>;
  try {
    plan = JSON.parse(cleanedText);
  } catch {
    const braceMatch = cleanedText.match(/\{[\s\S]*\}/);
    if (!braceMatch) {
      console.error("[generate-comm-plan] JSON invalide renvoyé par le LLM :", rawText.slice(0, 500));
      return json({ error: "Réponse de génération mal formée." }, 502);
    }
    try {
      plan = JSON.parse(braceMatch[0]);
    } catch {
      console.error("[generate-comm-plan] JSON invalide renvoyé par le LLM (après extraction) :", rawText.slice(0, 500));
      return json({ error: "Réponse de génération mal formée." }, 502);
    }
  }

  for (const field of REQUIRED_FIELDS) {
    if (typeof plan[field] !== "string" || !(plan[field] as string).trim()) {
      console.error(`[generate-comm-plan] champ manquant dans la sortie LLM : ${field}`);
      return json({ error: "Réponse de génération incomplète." }, 502);
    }
  }

  const fullText = REQUIRED_FIELDS.map((f) => plan[f]).join(" ");
  const violation = FORBIDDEN_PATTERNS.find((pattern) => pattern.test(fullText));
  if (violation) {
    console.error("[generate-comm-plan] sortie LLM rejetée (formulation interdite détectée) :", violation);
    return json({ error: "Génération rejetée par le contrôle de conformité." }, 502);
  }

  const row = {
    slug,
    channels: plan.channels,
    organic_angle: plan.organic_angle,
    content_ideas: plan.content_ideas,
    posting_cadence: plan.posting_cadence,
    confidence_note: typeof plan.confidence_note === "string" ? plan.confidence_note : null,
  };

  const { data: saved, error: saveErr } = await admin.from("saas_comm_plans").upsert(row, { onConflict: "slug" }).select().single();
  if (saveErr) {
    console.error("[generate-comm-plan] échec de mise en cache :", saveErr.message);
    return json({ error: "Échec de sauvegarde du plan." }, 500);
  }

  return json({ plan: saved, cached: false });
});
