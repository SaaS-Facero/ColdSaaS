// Supabase Edge Function — génère (ou lit en cache) le concept de SaaS
// personnalisé, PAR UTILISATEUR (pas par listing réel comme generate-concept,
// laissée intacte pour l'upsell "plan de communication" sur les vraies
// fiches TrustMRR, toujours en base mais plus affichées côté public).
//
// Un seul appel LLM par utilisateur -- mis en cache dans user_concepts,
// migration 0024. Jamais de chiffre de revenu, jamais "prouvé"/"garanti" :
// même classe de garde-fou que generate-concept/generate-entrepreneur-profile.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const OPENROUTER_MODEL = "anthropic/claude-sonnet-5";

const FORBIDDEN_PATTERNS = [
  /garanti/i,
  /prouvé/i,
  /peut générer/i,
  /potentiel de gain/i,
  /\$\s*\/\s*mois/i,
  /€\s*\/\s*mois/i,
  /\bMRR\b/i,
];

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

const SECTOR_LABELS: Record<string, string> = { b2b: "B2B", b2c: "B2C", both: "B2B et B2C" };
const BUDGET_LABELS: Record<string, string> = {
  low: "moins de 5 000 €",
  mid: "5 000 € – 20 000 €",
  high: "20 000 € – 50 000 €",
  undecided: "pas encore fixé",
};
const TEMPS_LABELS: Record<string, string> = {
  low: "moins de 5h/sem.",
  midlow: "5–10h/sem.",
  midhigh: "10–20h/sem.",
  full: "temps plein",
};
const SITUATION_LABELS: Record<string, string> = {
  salarie: "Salarié en poste",
  independant: "Déjà indépendant",
  etudiant: "Étudiant",
  activite_en_ligne: "A déjà une activité en ligne",
  autre: "Situation particulière",
};
const PASSIF_LABELS: Record<string, string> = {
  jamais_lance: "N'a jamais rien lancé",
  lance_abandonne: "A déjà lancé puis abandonné un projet",
  deja_vendu: "A déjà vendu quelque chose en ligne",
  ca_tourne: "A déjà un business en ligne qui tourne",
};
const AGE_LABELS: Record<string, string> = {
  moins_25: "Moins de 25 ans",
  "25_34": "25-34 ans",
  "35_44": "35-44 ans",
  "45_54": "45-54 ans",
  "55_plus": "55 ans et plus",
};

function formatObjectifRevenu(v: number | null): string {
  if (typeof v !== "number") return "non communiqué";
  if (v <= 0) return "pas d'objectif chiffré (exploration)";
  if (v >= 20000) return "20 000 € / mois et plus";
  return `${v.toLocaleString("fr-FR")} € / mois`;
}

function buildPrompt(a: {
  intention: string | null;
  situation: string | null;
  passif: string | null;
  age: string | null;
  secteur: string[];
  budget: string | null;
  temps: string | null;
  objectifRevenu: number | null;
}) {
  const system = `Tu es un consultant produit senior spécialisé en création de concepts SaaS pour des porteurs de projet français. Ton rôle : à partir du profil d'une personne (situation, expérience, tranche d'âge, secteur visé, budget, temps disponible, objectif de revenu), proposer UN concept de SaaS cohérent et actionnable.

Règles strictes :
- INTERDICTION ABSOLUE de mentionner un chiffre de revenu, un MRR, une projection de gain, ou toute promesse de résultat financier -- y compris l'objectif de revenu fourni dans le profil : il sert uniquement à orienter le modèle économique suggéré (ex. micro-SaaS de niche vs produit visant un marché plus large), il ne doit jamais être répété ni reformulé dans ta sortie.
- Ne jamais écrire "prouvé" ou "garanti" -- ce concept est une proposition générée, pas une donnée vérifiée. Le ton doit rester factuel et mesuré, jamais vendeur.
- La cible (persona) doit être dérivée logiquement du secteur et de l'intention -- générale et crédible, jamais un persona avec des détails inventés (prénom, âge précis, etc.).
- Les canaux d'acquisition doivent être réalistes compte tenu du budget et du temps disponible, et cohérents avec la tranche d'âge fournie (ex. social organique/court format plausible pour une tranche jeune, réseau professionnel/email/bouche-à-oreille plausible pour une tranche plus âgée) -- jamais une liste générique copiée-collée, jamais un stéréotype réducteur non plus.
- La direction artistique (palette, style de logo) reste descriptive en mots, jamais une génération d'image.

Format de sortie : JSON strict, aucun texte hors JSON.`;

  const sectorText = a.secteur.length ? a.secteur.map((s) => SECTOR_LABELS[s] || s).join(", ") : "non communiqué";
  const user = `Profil :
- Intention : ${
    a.intention === "rachat" || a.intention === "racheter"
      ? "Racheter un SaaS existant"
      : a.intention === "creation" || a.intention === "copier"
        ? "Créer son propre concept, repartir de zéro"
        : "non communiqué"
  }
- Situation actuelle : ${a.situation ? SITUATION_LABELS[a.situation] || a.situation : "non communiqué"}
- Expérience business en ligne : ${a.passif ? PASSIF_LABELS[a.passif] || a.passif : "non communiqué"}
- Tranche d'âge (pour orienter les canaux d'acquisition, jamais à répéter en sortie) : ${a.age ? AGE_LABELS[a.age] || a.age : "non communiqué"}
- Secteur visé : ${sectorText}
- Budget de démarrage : ${a.budget ? BUDGET_LABELS[a.budget] || a.budget : "non communiqué"}
- Temps disponible/semaine : ${a.temps ? TEMPS_LABELS[a.temps] || a.temps : "non communiqué"}
- Objectif de revenu à terme (pour orienter le modèle économique, jamais à répéter en sortie) : ${formatObjectifRevenu(a.objectifRevenu)}

Génère un concept de SaaS pour cette personne. Réponds au format JSON :

{
  "concept_name": "Nom de concept court, mémorable, en français",
  "tagline": "Accroche 8-12 mots, orientée bénéfice utilisateur, sans chiffre",
  "description": "2-3 phrases : ce que fait le produit, pour qui, en français direct",
  "palette": "2-3 couleurs suggérées avec leur code hex, et pourquoi elles conviennent à ce positionnement",
  "logo_style": "1-2 phrases décrivant un style de logo cohérent (forme, registre visuel) -- en mots, pas une image",
  "target_persona": "1-2 phrases décrivant la cible probable, dérivée du secteur et de l'intention -- pas de prénom ni de détails inventés",
  "channels": "2-3 canaux d'acquisition réalistes compte tenu du budget et du temps disponible, avec une courte justification chacun",
  "confidence_note": "Limites de ce concept si le profil est trop incomplet pour un angle crédible, sinon vide"
}

Ne produis AUCUN texte avant ou après ce JSON.`;

  return { system, user };
}

const REQUIRED_FIELDS = ["concept_name", "tagline", "description", "palette", "logo_style", "target_persona", "channels"];

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

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseAsUser = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userRes, error: userErr } = await supabaseAsUser.auth.getUser();
  if (userErr || !userRes.user) return json({ error: "Session invalide." }, 401);
  const userId = userRes.user.id;

  const admin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // situation/passif/objectifRevenu ne sont pas encore des colonnes profiles
  // (voir commentaire dans scripts/build.mjs, quiz.questions) -- récupérées
  // côté client et transmises dans le corps de la requête plutôt qu'en base.
  // forceRegenerate contourne le cache : utilisé par le lien "tu cherches
  // plutôt à racheter ?" sur l'écran résultat, sans quoi cet endpoint
  // renverrait indéfiniment l'ancien concept généré pour "creation".
  let body: { situation?: string; passif?: string; age?: string; objectifRevenu?: number; forceRegenerate?: boolean } = {};
  try {
    body = await req.json();
  } catch {
    /* corps vide accepté -- champs manquants restent "non communiqué" */
  }

  if (!body.forceRegenerate) {
    const { data: cached } = await admin.from("user_concepts").select("*").eq("user_id", userId).maybeSingle();
    if (cached) return json({ concept: cached, cached: true });
  }

  const { data: profileRow, error: profileErr } = await admin
    .from("profiles")
    .select("intention, secteur, budget, temps")
    .eq("id", userId)
    .single();
  if (profileErr || !profileRow) return json({ error: "Profil introuvable." }, 404);

  const openRouterKey = Deno.env.get("OPENROUTER_API_KEY");
  if (!openRouterKey) {
    console.error("[generate-user-concept] OPENROUTER_API_KEY manquante.");
    return json({ error: "Configuration manquante." }, 500);
  }

  const { system, user } = buildPrompt({
    intention: profileRow.intention,
    situation: typeof body.situation === "string" ? body.situation : null,
    passif: typeof body.passif === "string" ? body.passif : null,
    age: typeof body.age === "string" ? body.age : null,
    secteur: profileRow.secteur ?? [],
    budget: profileRow.budget,
    temps: profileRow.temps,
    objectifRevenu: typeof body.objectifRevenu === "number" ? body.objectifRevenu : null,
  });

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
        max_tokens: 1536,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });
  } catch (err) {
    console.error("[generate-user-concept] appel OpenRouter échoué :", err);
    return json({ error: "Service de génération indisponible, réessaie plus tard." }, 502);
  }

  if (!llmRes.ok) {
    const errText = await llmRes.text();
    console.error("[generate-user-concept] OpenRouter a renvoyé une erreur :", llmRes.status, errText);
    return json({ error: "Service de génération indisponible, réessaie plus tard." }, 502);
  }

  const llmBody = await llmRes.json();
  const rawText = llmBody.choices?.[0]?.message?.content;
  if (typeof rawText !== "string") {
    console.error("[generate-user-concept] réponse sans texte exploitable :", JSON.stringify(llmBody).slice(0, 500));
    return json({ error: "Réponse de génération invalide." }, 502);
  }

  let cleanedText = rawText.trim();
  const fencedMatch = cleanedText.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fencedMatch) cleanedText = fencedMatch[1].trim();

  let concept: Record<string, unknown>;
  try {
    concept = JSON.parse(cleanedText);
  } catch {
    const braceMatch = cleanedText.match(/\{[\s\S]*\}/);
    if (!braceMatch) {
      console.error("[generate-user-concept] JSON invalide :", rawText.slice(0, 500));
      return json({ error: "Réponse de génération mal formée." }, 502);
    }
    try {
      concept = JSON.parse(braceMatch[0]);
    } catch {
      console.error("[generate-user-concept] JSON invalide après extraction :", rawText.slice(0, 500));
      return json({ error: "Réponse de génération mal formée." }, 502);
    }
  }

  for (const field of REQUIRED_FIELDS) {
    if (typeof concept[field] !== "string" || !(concept[field] as string).trim()) {
      console.error(`[generate-user-concept] champ manquant : ${field}`);
      return json({ error: "Réponse de génération incomplète." }, 502);
    }
  }

  const fullText = REQUIRED_FIELDS.map((f) => concept[f]).join(" ");
  const violation = FORBIDDEN_PATTERNS.find((pattern) => pattern.test(fullText));
  if (violation) {
    console.error(
      "[generate-user-concept] ANOMALIE : sortie LLM rejetée (pattern interdit)",
      violation,
      "user_id:",
      userId,
      "output:",
      fullText.slice(0, 500)
    );
    return json({ error: "Génération rejetée par le contrôle de conformité." }, 502);
  }

  const row = {
    user_id: userId,
    concept_name: concept.concept_name,
    tagline: concept.tagline,
    description: concept.description,
    palette: concept.palette,
    logo_style: concept.logo_style,
    target_persona: concept.target_persona,
    channels: concept.channels,
    confidence_note: typeof concept.confidence_note === "string" ? concept.confidence_note : null,
  };

  const { data: saved, error: saveErr } = await admin.from("user_concepts").upsert(row, { onConflict: "user_id" }).select().single();
  if (saveErr) {
    console.error("[generate-user-concept] échec de mise en cache :", saveErr.message);
    return json({ error: "Échec de sauvegarde du concept." }, 500);
  }

  return json({ concept: saved, cached: false });
});
