// Supabase Edge Function — Mode Vidéo (admin), sur le vrai site.
//
// Deux usages, un seul contrôle d'accès :
//   { check: true }        -> { ok: true } si l'appelant est admin. Appelé
//                             au chargement de l'accueil quand le cookie
//                             d'armement ct_vm est présent : c'est CE
//                             verdict, pas le cookie, qui active le mode
//                             démo du quiz ;
//   { answers: {...} }     -> concept généré par le vrai LLM, mis en cache
//                             par combinaison de réponses (demo_concepts,
//                             is_demo = true).
//
// Accès : JWT vérifié, puis profiles.role relu avec le rôle service (jamais
// de confiance dans le client). role est une colonne générée depuis
// is_admin, que les clients ne peuvent plus écrire (migration 0029).
//
// Intégrité : aucune écriture dans profiles, user_concepts ni funnel_events
// (le compteur social_proof_stats compte user_concepts : la démo n'y entre
// pas). Le concept ne contient jamais de chiffre de revenu (mêmes
// garde-fous que generate-user-concept) ; la projection affichée à côté est
// celle du funnel public (computeProjection côté client).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const OPENROUTER_MODEL = "anthropic/claude-sonnet-5";

const ALLOWED_ORIGINS = new Set([
  "https://coldtrend.com",
  "https://www.coldtrend.com",
  "http://localhost:3000",
]);

const FORBIDDEN_PATTERNS = [
  /garanti/i,
  /prouvé/i,
  /peut générer/i,
  /potentiel de gain/i,
  /\$\s*\/\s*mois/i,
  /€\s*\/\s*mois/i,
  /\bMRR\b/i,
];

// Liste blanche des réponses acceptées : seules ces valeurs entrent dans le
// prompt et dans la clé de cache (une valeur inconnue est ignorée, jamais
// recopiée). Mêmes identifiants que le quiz (scripts/build.mjs).
const LABELS: Record<string, Record<string, string>> = {
  attente: {
    premiers_euros: "Générer ses premiers euros",
    idee_gagnante: "Trouver l'idée gagnante",
    saas_en_ligne: "Mettre son SaaS en ligne",
  },
  temps: { low: "moins de 5h/sem.", mid: "5 à 15h/sem.", high: "plus de 15h/sem." },
  secteur: { b2b: "Professionnels (B2B)", b2c: "Particuliers (B2C)", both: "Professionnels et particuliers" },
  reve: {
    liberte: "être libre de son temps",
    quitter_job: "quitter son job",
    nomade: "bosser d'où il/elle veut",
    famille: "mettre sa famille à l'abri",
    independance: "ne dépendre de personne",
    creer: "créer un truc qui lui ressemble",
  },
  plateformes: {
    aucune: "ne poste sur aucune plateforme",
    "1": "poste sur 1 plateforme",
    "2": "poste sur 2 plateformes",
    "3": "poste sur 3 plateformes",
    "4_plus": "poste sur 4 plateformes ou plus",
  },
  blocage: {
    par_ou_commencer: "ne sait pas par où commencer",
    pas_idee: "n'a pas la bonne idée",
    peur_argent: "peur de perdre de l'argent",
    pas_temps: "manque de temps",
    technique: "ne sait pas coder",
    motivation: "lâche vite",
  },
  lignesRouges: {
    formations: "vendre des formations",
    argent_facile: "promettre de l'argent facile",
    visage: "montrer son visage",
    demarchage: "faire du démarchage agressif",
    dropshipping: "faire du dropshipping",
  },
  influenceurs: { oui: "prêt à travailler avec des influenceurs", non: "refuse les influenceurs -- ne pas les proposer" },
  clippers: { oui: "prêt à faire appel à des clippers", non: "refuse les clippers -- ne pas les proposer" },
};

const FIELD_TITLES: Record<string, string> = {
  attente: "Attente principale",
  temps: "Temps disponible",
  secteur: "Cible préférée",
  reve: "Rêve",
  plateformes: "Présence en ligne",
  blocage: "Blocages déclarés",
  lignesRouges: "LIGNES ROUGES (refuse absolument)",
  influenceurs: "Influenceurs",
  clippers: "Clippers (comptes qui republient des extraits)",
};

const REQUIRED_FIELDS = ["concept_name", "tagline", "description", "target_persona", "channels"];

function corsHeaders(origin: string | null) {
  const allowOrigin = origin && ALLOWED_ORIGINS.has(origin) ? origin : "https://coldtrend.com";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
}

// Normalise : ne garde que les champs et valeurs de la liste blanche, trie
// les tableaux -- deux tournages avec les mêmes réponses tombent sur la
// même clé de cache, quel que soit l'ordre des clics.
function normalizeAnswers(raw: unknown): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  if (!raw || typeof raw !== "object") return out;
  for (const field of Object.keys(LABELS).sort()) {
    const v = (raw as Record<string, unknown>)[field];
    if (Array.isArray(v)) {
      const kept = v.filter((x) => typeof x === "string" && LABELS[field][x]).sort() as string[];
      if (kept.length) out[field] = Array.from(new Set(kept));
    } else if (typeof v === "string" && LABELS[field][v]) {
      out[field] = v;
    }
  }
  return out;
}

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function buildPrompt(answers: Record<string, string | string[]>) {
  const system = `Tu es un consultant produit senior spécialisé en création de concepts SaaS pour des porteurs de projet français. Ton rôle : à partir d'un profil, proposer UN concept de SaaS cohérent et actionnable.

Règles strictes :
- INTERDICTION ABSOLUE de mentionner un chiffre de revenu, un MRR, une projection de gain ou toute promesse de résultat financier.
- Ne jamais écrire "prouvé" ou "garanti". Ton factuel et mesuré, jamais vendeur.
- Les LIGNES ROUGES sont absolues : le concept et les canaux ne les franchissent jamais.
- Un canal refusé (influenceurs, clippers) n'est jamais proposé.
- La cible est générale et crédible, jamais de prénom ni de détails inventés.
- Les canaux sont réalistes compte tenu du temps disponible.

Format de sortie : JSON strict, aucun texte hors JSON.`;

  const lines = Object.keys(answers).map((field) => {
    const v = answers[field];
    const text = Array.isArray(v) ? v.map((x) => LABELS[field][x]).join(", ") : LABELS[field][v];
    return `- ${FIELD_TITLES[field]} : ${text}`;
  });

  const user = `Profil :
${lines.length ? lines.join("\n") : "- Profil peu renseigné : propose un concept simple et accessible."}

Génère un concept de SaaS pour ce profil. Réponds au format JSON :

{
  "concept_name": "Nom de concept court, mémorable, en français",
  "tagline": "Accroche 8-12 mots, orientée bénéfice utilisateur, sans chiffre",
  "description": "2-3 phrases : ce que fait le produit, pour qui, en français direct",
  "target_persona": "1-2 phrases décrivant la cible probable -- pas de prénom ni de détails inventés",
  "channels": "2-3 canaux d'acquisition réalistes, avec une courte justification chacun"
}

Ne produis AUCUN texte avant ou après ce JSON.`;

  return { system, user };
}

function parseConcept(rawText: string): Record<string, unknown> | null {
  let text = rawText.trim();
  const fenced = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenced) text = fenced[1].trim();
  try {
    return JSON.parse(text);
  } catch {
    const brace = text.match(/\{[\s\S]*\}/);
    if (!brace) return null;
    try {
      return JSON.parse(brace[0]);
    } catch {
      return null;
    }
  }
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

  if (req.method !== "POST") return json({ error: "Méthode non autorisée." }, 405);

  // ---- Contrôle d'accès : session valide + role = 'admin' ----------------
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Non authentifié." }, 401);

  const asUser = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userRes, error: userErr } = await asUser.auth.getUser();
  if (userErr || !userRes.user) return json({ error: "Session invalide." }, 401);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: profile, error: profileErr } = await admin
    .from("profiles")
    .select("role")
    .eq("id", userRes.user.id)
    .maybeSingle();
  if (profileErr) {
    console.error("[generate-demo-concept] lecture du rôle échouée :", profileErr.message);
    return json({ error: "Vérification impossible." }, 500);
  }
  if (!profile || profile.role !== "admin") return json({ error: "Accès réservé." }, 403);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Requête invalide." }, 400);
  }

  if (body.check === true) return json({ ok: true });

  // ---- Cache par combinaison de réponses ---------------------------------
  const answers = normalizeAnswers(body.answers);
  const cacheKey = await sha256(JSON.stringify(answers));
  const forceRegenerate = body.forceRegenerate === true;

  if (!forceRegenerate) {
    const { data: cached } = await admin
      .from("demo_concepts")
      .select("concept, hit_count")
      .eq("cache_key", cacheKey)
      .maybeSingle();
    if (cached) {
      await admin.from("demo_concepts").update({ hit_count: (cached.hit_count ?? 0) + 1 }).eq("cache_key", cacheKey);
      return json({ concept: cached.concept, cached: true });
    }
  }

  // ---- Génération réelle ---------------------------------------------------
  const openRouterKey = Deno.env.get("OPENROUTER_API_KEY");
  if (!openRouterKey) return json({ error: "Génération non configurée." }, 500);

  const { system, user } = buildPrompt(answers);
  let llmRes: Response;
  try {
    llmRes = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${openRouterKey}`, "Content-Type": "application/json" },
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
    console.error("[generate-demo-concept] appel OpenRouter échoué :", err);
    return json({ error: "Service de génération indisponible." }, 502);
  }
  if (!llmRes.ok) {
    console.error("[generate-demo-concept] OpenRouter :", llmRes.status, (await llmRes.text()).slice(0, 300));
    return json({ error: "Service de génération indisponible." }, 502);
  }

  const llmBody = await llmRes.json();
  const rawText = llmBody.choices?.[0]?.message?.content;
  const concept = typeof rawText === "string" ? parseConcept(rawText) : null;
  if (!concept) return json({ error: "Réponse de génération mal formée." }, 502);

  for (const field of REQUIRED_FIELDS) {
    if (typeof concept[field] !== "string" || !(concept[field] as string).trim()) {
      return json({ error: "Réponse de génération incomplète." }, 502);
    }
  }
  const fullText = REQUIRED_FIELDS.map((f) => concept[f]).join(" ");
  if (FORBIDDEN_PATTERNS.some((p) => p.test(fullText))) {
    console.error("[generate-demo-concept] sortie rejetée (pattern interdit) :", fullText.slice(0, 300));
    return json({ error: "Génération rejetée par le contrôle de conformité." }, 502);
  }

  const clean: Record<string, string> = {};
  for (const field of REQUIRED_FIELDS) clean[field] = (concept[field] as string).trim();

  const { error: saveErr } = await admin
    .from("demo_concepts")
    .upsert({ cache_key: cacheKey, answers, concept: clean, is_demo: true }, { onConflict: "cache_key" });
  if (saveErr) console.error("[generate-demo-concept] mise en cache échouée :", saveErr.message);

  return json({ concept: clean, cached: false });
});
