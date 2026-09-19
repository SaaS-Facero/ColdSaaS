// Supabase Edge Function — genere (ou lit en cache) le profil entrepreneur
// LLM du module optionnel post-quiz. Un seul appel LLM par UTILISATEUR
// (contrairement a generate-concept/generate-comm-plan qui cachent par
// listing) : les reponses introspectives et le profil genere sont propres
// a une personne, jamais partages -- voir entrepreneur_profiles,
// migration 0017.
//
// OPENROUTER_API_KEY reste exclusivement cote serveur. Meme fournisseur que
// generate-concept/generate-comm-plan (OpenRouter, format OpenAI-compatible,
// modele anthropic/claude-sonnet-5) -- jamais d'API Anthropic native dans ce
// projet.

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

// Garde-fou explicite demande : rejette tout pattern numerique associe a une
// promesse de revenu, meme si le prompt systeme l'interdit deja -- jamais
// confiance a une sortie LLM sans verification cote serveur (meme logique
// que generate-concept/generate-comm-plan, appliquee ici a la promesse
// "aucun chiffre de revenu potentiel").
const FORBIDDEN_PATTERNS = [
  /\d[\d\s.,]*\s*€\s*\/\s*(mois|month)/i,
  /\bMRR\b/i,
  /revenu\s+de\s*\d/i,
  /gagner\s*\d/i,
];

const REQUIRED_FIELDS = ["profile_name", "opening_line", "strength_recognition", "direction_hint", "transition_line"];

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
const FREIN_LABELS: Record<string, string> = {
  temps: "Manque de temps",
  argent: "Manque d'argent",
  peur_echec: "Peur de l'échec",
  ne_sait_pas: "Ne sait pas par où commencer",
};
const FIERTE_LABELS: Record<string, string> = {
  parents: "Ses parents",
  partenaire: "Son/sa partenaire",
  amis: "Ses amis",
  moi_meme: "Lui/elle-même",
  personne: "Personne en particulier",
};
const FREQUENCE_LABELS: Record<string, string> = {
  constamment: "Constamment",
  plusieurs_fois_jour: "Plusieurs fois par jour",
  une_fois_jour: "Une fois par jour",
  rarement: "Rarement",
};

function json(headers: Record<string, string>, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}

function buildPrompt(
  profile: { secteur: string[]; budget: string | null; temps: string | null },
  answers: {
    revenu_vise: number | null;
    reponse_nuit: string | null;
    confiance: number | null;
    frein: string | null;
    frein_autre: string | null;
    fierte: string | null;
    frequence: string | null;
    habitude_regrettee: string | null;
    incompris: string | null;
    projection_10ans: string | null;
  }
) {
  const system = `Tu es un coach en entrepreneuriat bienveillant et direct, spécialisé dans l'accompagnement de porteurs de projet français en début de parcours. Ton rôle : à partir des réponses d'un questionnaire (situationnel + introspectif), produire un profil entrepreneur personnalisé qui valorise ce que la personne a déjà exprimé, sans jamais l'analyser cliniquement ni la juger.

Règles strictes :
- Ne jamais interpréter une réponse comme un signe de faiblesse psychologique, d'anxiété ou de manque de confiance. Une confiance basse, une peur exprimée, ou un frein nommé sont des POINTS DE DÉPART à valoriser ("tu l'as identifié, c'est la moitié du chemin"), jamais des diagnostics ("tu sembles anxieux", "tu manques de confiance").
- Reprends des éléments spécifiques et concrets des réponses ouvertes de l'utilisateur (mots, formulations) pour montrer qu'il a été lu attentivement — jamais une généralité qui pourrait s'appliquer à n'importe qui.
- INTERDICTION ABSOLUE de générer un chiffre de revenu potentiel, une projection de MRR, ou toute promesse de résultat ("tu pourrais gagner X€/mois"). Le montant visé (input) sert uniquement à orienter le ton, jamais à être répété comme une promesse.
- Ne jamais utiliser de vocabulaire clinique ou diagnostique (anxiété, blocage psychologique, syndrome de l'imposteur, etc.) même si le champ semble s'y prêter.
- Le ton est chaleureux, direct, jamais condescendant ni infantilisant. Pas de superlatifs vides ("incroyable", "exceptionnel").
- La transition finale doit être factuelle et orientée action, jamais une promesse émotionnelle ("tu vas réussir") ni une pression commerciale agressive.

Format de sortie : JSON strict, aucun texte hors JSON.`;

  const sectorText = profile.secteur.length ? profile.secteur.map((s) => SECTOR_LABELS[s] || s).join(", ") : "non communiqué";
  const budgetText = profile.budget ? BUDGET_LABELS[profile.budget] || profile.budget : "non communiqué";
  const tempsText = profile.temps ? TEMPS_LABELS[profile.temps] || profile.temps : "non communiqué";
  const freinText =
    answers.frein === "autre" && answers.frein_autre
      ? answers.frein_autre
      : answers.frein
      ? FREIN_LABELS[answers.frein] || answers.frein
      : "non communiqué";
  const fierteText = answers.fierte ? FIERTE_LABELS[answers.fierte] || answers.fierte : "non communiqué";
  const frequenceText = answers.frequence ? FREQUENCE_LABELS[answers.frequence] || answers.frequence : "non communiqué";

  const user = `Réponses du questionnaire :
- Secteur(s) d'intérêt : ${sectorText}
- Budget de démarrage : ${budgetText}
- Temps disponible/semaine : ${tempsText}
- Revenu mensuel visé : ${answers.revenu_vise ?? "non communiqué"}€
- Ce qui l'empêche de dormir : ${answers.reponse_nuit ?? "non communiqué"}
- Niveau de confiance actuel (1-10) : ${answers.confiance ?? "non communiqué"}
- Frein principal identifié : ${freinText}
- Qui serait fier de sa réussite : ${fierteText}
- Fréquence à laquelle il/elle pense à son projet : ${frequenceText}
- Habitude regrettée de ne pas avoir prise : ${answers.habitude_regrettee ?? "non communiqué"}
- Ce que son entourage ne comprend pas sur son ambition : ${answers.incompris ?? "non communiqué"}
- Où il/elle se voit dans 10 ans si rien ne change : ${answers.projection_10ans ?? "non communiqué"}

Génère un profil entrepreneur personnalisé. Réponds au format JSON :

{
  "profile_name": "Un nom de profil court et évocateur en français (2-4 mots), dérivé du ton général des réponses — ex: 'Le Bâtisseur discret', 'L'Opportuniste méthodique' — jamais générique",
  "opening_line": "1 phrase d'ouverture qui reprend un élément SPÉCIFIQUE d'une réponse ouverte, montrant que la personne a été lue attentivement",
  "strength_recognition": "1-2 phrases qui valorisent ce que la personne a déjà exprimé (le frein identifié, la fréquence d'y penser, l'ambition) comme un point de départ solide — jamais comme un manque",
  "direction_hint": "1-2 phrases orientant vers un type de secteur/approche cohérent avec ses réponses situationnelles (secteur, budget, temps) — général, jamais de chiffre business",
  "transition_line": "1 phrase de transition factuelle vers la suite : présente ce qui existe déjà (SaaS vérifiés) comme la prochaine étape logique, sans promesse ni pression",
  "confidence_note": "Si les réponses sont trop vagues pour un profil crédible, précise ici les limites, sinon laisse vide"
}

Ne produis AUCUN texte avant ou après ce JSON.`;

  return { system, user };
}

Deno.serve(async (req) => {
  const headers = corsHeaders(req.headers.get("origin"));
  if (req.method === "OPTIONS") return new Response(null, { headers });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json(headers, { error: "Non authentifié." }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseAsUser = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userRes, error: userErr } = await supabaseAsUser.auth.getUser();
  if (userErr || !userRes.user) return json(headers, { error: "Session invalide." }, 401);
  const userId = userRes.user.id;

  const admin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const { data: cached } = await admin.from("entrepreneur_profiles").select("*").eq("user_id", userId).maybeSingle();
  if (cached) return json(headers, { profile: cached, cached: true });

  const { data: profileRow, error: profileErr } = await admin
    .from("profiles")
    .select("secteur, budget, temps")
    .eq("id", userId)
    .single();
  if (profileErr || !profileRow) return json(headers, { error: "Profil introuvable." }, 404);

  const { data: answers, error: answersErr } = await admin
    .from("entrepreneur_profile_answers")
    .select("*")
    .eq("user_id", userId)
    .single();
  if (answersErr || !answers) return json(headers, { error: "Questionnaire non complété." }, 400);

  const openRouterKey = Deno.env.get("OPENROUTER_API_KEY");
  if (!openRouterKey) {
    console.error("[generate-entrepreneur-profile] OPENROUTER_API_KEY manquante.");
    return json(headers, { error: "Configuration manquante." }, 500);
  }

  const { system, user } = buildPrompt(
    { secteur: profileRow.secteur ?? [], budget: profileRow.budget, temps: profileRow.temps },
    answers
  );

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
        // 1024 s'est revele insuffisant en test reel : une reponse a ete
        // tronquee en pleine phrase (JSON invalide en consequence). Ce
        // prompt produit 5 champs de prose francaise, plus verbeux que
        // generate-concept -- marge relevee pour eviter la recurrence.
        max_tokens: 1536,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });
  } catch (err) {
    console.error("[generate-entrepreneur-profile] appel OpenRouter échoué :", err);
    return json(headers, { error: "Service de génération indisponible, réessaie plus tard." }, 502);
  }

  if (!llmRes.ok) {
    const errText = await llmRes.text();
    console.error("[generate-entrepreneur-profile] OpenRouter a renvoyé une erreur :", llmRes.status, errText);
    return json(headers, { error: "Service de génération indisponible, réessaie plus tard." }, 502);
  }

  const llmBody = await llmRes.json();
  const rawText = llmBody.choices?.[0]?.message?.content;
  if (typeof rawText !== "string") {
    console.error("[generate-entrepreneur-profile] réponse sans texte exploitable :", JSON.stringify(llmBody).slice(0, 500));
    return json(headers, { error: "Réponse de génération invalide." }, 502);
  }

  let cleanedText = rawText.trim();
  const fencedMatch = cleanedText.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fencedMatch) cleanedText = fencedMatch[1].trim();

  let generated: Record<string, unknown>;
  try {
    generated = JSON.parse(cleanedText);
  } catch {
    const braceMatch = cleanedText.match(/\{[\s\S]*\}/);
    if (!braceMatch) {
      console.error("[generate-entrepreneur-profile] JSON invalide :", rawText.slice(0, 500));
      return json(headers, { error: "Réponse de génération mal formée." }, 502);
    }
    try {
      generated = JSON.parse(braceMatch[0]);
    } catch {
      console.error("[generate-entrepreneur-profile] JSON invalide après extraction :", rawText.slice(0, 500));
      return json(headers, { error: "Réponse de génération mal formée." }, 502);
    }
  }

  for (const field of REQUIRED_FIELDS) {
    if (typeof generated[field] !== "string" || !(generated[field] as string).trim()) {
      console.error(`[generate-entrepreneur-profile] champ manquant : ${field}`);
      return json(headers, { error: "Réponse de génération incomplète." }, 502);
    }
  }

  const fullText = REQUIRED_FIELDS.map((f) => generated[f]).join(" ");
  const violation = FORBIDDEN_PATTERNS.find((pattern) => pattern.test(fullText));
  if (violation) {
    // Anomalie loggee plutot qu'affichee : jamais montrer un chiffre
    // halluciné a l'utilisateur, meme au prix d'un echec de generation.
    console.error(
      "[generate-entrepreneur-profile] ANOMALIE : sortie LLM rejetée (pattern interdit détecté)",
      violation,
      "user_id:",
      userId,
      "output:",
      fullText.slice(0, 500)
    );
    return json(headers, { error: "Génération rejetée par le contrôle de conformité." }, 502);
  }

  const row = {
    user_id: userId,
    profile_name: generated.profile_name,
    opening_line: generated.opening_line,
    strength_recognition: generated.strength_recognition,
    direction_hint: generated.direction_hint,
    transition_line: generated.transition_line,
    confidence_note: typeof generated.confidence_note === "string" ? generated.confidence_note : null,
  };

  const { data: saved, error: saveErr } = await admin
    .from("entrepreneur_profiles")
    .upsert(row, { onConflict: "user_id" })
    .select()
    .single();
  if (saveErr) {
    console.error("[generate-entrepreneur-profile] échec de mise en cache :", saveErr.message);
    return json(headers, { error: "Échec de sauvegarde du profil." }, 500);
  }

  return json(headers, { profile: saved, cached: false });
});
