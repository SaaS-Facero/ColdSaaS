// Supabase Edge Function — genere (ou lit en cache) le concept LLM affiche
// sur /concept/{slug}. Un seul appel LLM par LISTING (pas par utilisateur) :
// le contenu genere ne depend que du listing + de la fourchette de MRR de
// son secteur, jamais du profil de l'acheteur -- voir saas_concepts,
// migration 0012.
//
// Appelee par un utilisateur authentifie et paye (meme garde que
// saas_listings/saas_concepts, RLS + verification explicite ici).
// OPENROUTER_API_KEY reste exclusivement cote serveur.
//
// Bascule sur OpenRouter (format OpenAI-compatible) apres une panne
// confirmee et reproductible sur le proxy Claude de Kie.ai (meme erreur
// generique sur 2 modeles differents, 2 cles differentes, 2 reseaux
// differents -- teste avant de changer de fournisseur, pas une supposition).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const OPENROUTER_MODEL = "anthropic/claude-sonnet-5";

// Garde-fou explicite : le prompt systeme interdit deja ces formulations,
// mais on ne fait jamais confiance a une sortie LLM sans verification cote
// serveur -- meme logique defensive que assertNoSecretsInOutput() dans
// scripts/build.mjs, appliquee ici a la promesse de marque plutot qu'aux
// secrets.
const FORBIDDEN_PATTERNS = [
  /garanti/i,
  /prouvé/i,
  /peut générer/i,
  /potentiel de gain/i,
  /\$\s*\/\s*mois/i,
  /€\s*\/\s*mois/i,
];

// Appelée directement depuis le navigateur (concept.html) -- contrairement
// à sync-trustmrr/test-*, jamais en curl serveur-à-serveur -- nécessite donc
// une vraie gestion CORS, même pattern que resend-access/index.ts.
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

function median(sortedNums: number[]): number {
  const n = sortedNums.length;
  const mid = Math.floor(n / 2);
  return n % 2 !== 0 ? sortedNums[mid] : (sortedNums[mid - 1] + sortedNums[mid]) / 2;
}

function sectorsOverlap(a: string[] | null, b: string[] | null): boolean {
  if (!a || !a.length || !b || !b.length) return false;
  if (b.includes("both")) return true;
  return a.some((id) => id === "both" || b.includes(id));
}

function buildPrompt(
  listing: { name: string; website: string | null; description: string | null; secteur: string[]; mrr_usd: number | null; source_name: string | null },
  range: { min: number; max: number; med: number; sampleSize: number } | null
) {
  const system = `Tu es un analyste business senior spécialisé en adaptation de modèles SaaS internationaux vers le marché français. Ton rôle : à partir d'un SaaS réel à revenus vérifiés, identifier le besoin sous-jacent, et proposer un concept adapté au marché français.

Règles strictes :
- Toute donnée chiffrée (MRR individuel, fourchette min/max/médiane) t'est fournie en input et est déjà vérifiée. Tu ne dois JAMAIS modifier, arrondir de façon trompeuse, extrapoler, ou générer un nouveau chiffre. Si l'input ne contient pas de fourchette, ne mentionne aucune fourchette.
- Interdiction absolue de produire une projection de revenus futurs, un "potentiel de gain", ou toute formulation du type "peut générer X$/mois" — même approximative. Le CTA est orienté action, jamais promesse de gain.
- Ne jamais écrire "prouvé", "garanti" — réserve ces registres aux données réelles affichées séparément par l'interface.
- Base l'angle du besoin sur des mécanismes structurels observables (retard de marché, absence d'équivalent local, spécificité réglementaire/culturelle française) — jamais sur une supposition vague.
- Si l'information disponible est insuffisante pour un angle crédible, dis-le dans "confidence_note" plutôt que d'inventer.

Format de sortie : JSON strict, aucun texte hors JSON.`;

  const rangeText = range
    ? `Fourchette MRR observée sur ${range.sampleSize} SaaS similaires de ce secteur : ${range.min}$ - ${range.max}$, médiane ${range.med}$`
    : "Fourchette MRR : non disponible (échantillon insuffisant, ne pas en mentionner)";

  const user = `SaaS à revenus vérifiés :
- Nom : ${listing.name}
- Site : ${listing.website ?? "non communiqué"}
- Secteur(s) : ${listing.secteur.join(", ")}
- Description : ${listing.description ?? "non communiquée"}
- MRR vérifié de ce listing : ${listing.mrr_usd ?? "non communiqué"} $ (source : ${listing.source_name ?? "TrustMRR"})
- ${rangeText}

Génère un concept adapté au marché français. Réponds au format JSON :

{
  "concept_name": "Nom de concept court, mémorable, en français — PAS le nom du listing original",
  "tagline": "Accroche 8-12 mots, orientée bénéfice utilisateur, sans chiffre",
  "description": "2-3 phrases : ce que fait le concept, pour qui, en français direct",
  "need_angle": "1-2 phrases : pourquoi ce besoin existe structurellement en France aujourd'hui — factuel, vérifiable, pas spéculatif",
  "why_now": "1 phrase sur le momentum actuel, observable",
  "cta_primary": "Verbe d'action court orienté exécution, ex: 'Copier ce modèle', 'Lancer cette version'",
  "cta_secondary": "Action secondaire, ex: 'Voir le modèle original'",
  "confidence_note": "Limites de cet angle si l'info est insuffisante, sinon vide"
}

Ne produis AUCUN texte avant ou après ce JSON.`;

  return { system, user };
}

const REQUIRED_FIELDS = ["concept_name", "tagline", "description", "need_angle", "why_now", "cta_primary", "cta_secondary"];

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

  const { data: profile } = await admin.from("profiles").select("paid_at").eq("id", userRes.user.id).single();
  if (!profile?.paid_at) return json({ error: "Accès non payé." }, 403);

  const { data: cached } = await admin.from("saas_concepts").select("*").eq("slug", slug).maybeSingle();
  if (cached) return json({ concept: cached, cached: true });

  const { data: listing, error: listingErr } = await admin
    .from("saas_listings")
    .select("slug, name, website, description, secteur, mrr_usd, source_name, active")
    .eq("slug", slug)
    .eq("active", true)
    .single();
  if (listingErr || !listing) return json({ error: "SaaS introuvable." }, 404);

  const { data: allListings } = await admin.from("saas_listings").select("secteur, mrr_usd").eq("active", true);
  const peers = (allListings ?? []).filter(
    (p) => sectorsOverlap(listing.secteur, p.secteur as string[]) && typeof p.mrr_usd === "number"
  );
  let range: { min: number; max: number; med: number; sampleSize: number } | null = null;
  if (peers.length >= 3) {
    const values = peers.map((p) => p.mrr_usd as number).sort((a, b) => a - b);
    range = { min: values[0], max: values[values.length - 1], med: median(values), sampleSize: values.length };
  }

  const openRouterKey = Deno.env.get("OPENROUTER_API_KEY");
  if (!openRouterKey) {
    console.error("[generate-concept] OPENROUTER_API_KEY manquante.");
    return json({ error: "Configuration manquante." }, 500);
  }

  const { system, user } = buildPrompt(listing, range);

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
    console.error("[generate-concept] appel OpenRouter échoué :", err);
    return json({ error: "Service de génération indisponible, réessaie plus tard." }, 502);
  }

  if (!llmRes.ok) {
    const errText = await llmRes.text();
    console.error("[generate-concept] OpenRouter a renvoyé une erreur :", llmRes.status, errText);
    return json({ error: "Service de génération indisponible, réessaie plus tard." }, 502);
  }

  const llmBody = await llmRes.json();
  const rawText = llmBody.choices?.[0]?.message?.content;
  if (typeof rawText !== "string") {
    console.error("[generate-concept] réponse OpenRouter sans texte exploitable :", JSON.stringify(llmBody).slice(0, 500));
    return json({ error: "Réponse de génération invalide." }, 502);
  }

  let concept: Record<string, unknown>;
  try {
    concept = JSON.parse(rawText.trim());
  } catch {
    console.error("[generate-concept] JSON invalide renvoyé par le LLM :", rawText.slice(0, 500));
    return json({ error: "Réponse de génération mal formée." }, 502);
  }

  for (const field of REQUIRED_FIELDS) {
    if (typeof concept[field] !== "string" || !(concept[field] as string).trim()) {
      console.error(`[generate-concept] champ manquant dans la sortie LLM : ${field}`);
      return json({ error: "Réponse de génération incomplète." }, 502);
    }
  }

  const fullText = REQUIRED_FIELDS.map((f) => concept[f]).join(" ");
  const violation = FORBIDDEN_PATTERNS.find((pattern) => pattern.test(fullText));
  if (violation) {
    console.error("[generate-concept] sortie LLM rejetée (formulation interdite détectée) :", violation);
    return json({ error: "Génération rejetée par le contrôle de conformité." }, 502);
  }

  const row = {
    slug,
    concept_name: concept.concept_name,
    tagline: concept.tagline,
    description: concept.description,
    need_angle: concept.need_angle,
    why_now: concept.why_now,
    cta_primary: concept.cta_primary,
    cta_secondary: concept.cta_secondary,
    confidence_note: typeof concept.confidence_note === "string" ? concept.confidence_note : null,
  };

  const { data: saved, error: saveErr } = await admin.from("saas_concepts").upsert(row, { onConflict: "slug" }).select().single();
  if (saveErr) {
    console.error("[generate-concept] échec de mise en cache :", saveErr.message);
    return json({ error: "Échec de sauvegarde du concept." }, 500);
  }

  return json({ concept: saved, cached: false });
});
