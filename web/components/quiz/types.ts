import type { ProfilePatch } from "@/lib/supabase/types";

export type Intention = "racheter" | "copier";
export type Budget = "low" | "mid" | "high" | "undecided";
export type Temps = "low" | "midlow" | "midhigh" | "full";
export type Secteur = "b2b" | "b2c" | "both";

export type QuizAnswers = {
  intention: Intention | null;
  budget: Budget | null;
  temps: Temps | null;
  email: string | null;
  secteur: Secteur[];
  dejaCherche: "yes" | "no" | null;
  prenom: string | null;
  matchCount: number | null;
};

export const INITIAL_ANSWERS: QuizAnswers = {
  intention: null,
  budget: null,
  temps: null,
  email: null,
  secteur: [],
  dejaCherche: null,
  prenom: null,
  matchCount: null,
};

// Ordre logique des écrans — l'email est capté tôt (étape 4) et séparé de la
// sécurisation du compte (étape 7), cf. brief "insight qui change tout".
export const STEP_NAMES = [
  "intention",
  "budget",
  "temps",
  "email_capture",
  "secteur",
  "frustration",
  "secure_account",
] as const;

export type StepName = (typeof STEP_NAMES)[number];

// Traduit le shape camelCase du state React vers les colonnes snake_case de
// `profiles`. `email` est volontairement absent : il vit sur auth.users,
// jamais sur profiles (posé via updateUser, pas via cet upsert).
export function toProfilePatch(patch: Partial<QuizAnswers>): ProfilePatch {
  const dbPatch: ProfilePatch = {};
  if (patch.intention !== undefined) dbPatch.intention = patch.intention;
  if (patch.budget !== undefined) dbPatch.budget = patch.budget;
  if (patch.temps !== undefined) dbPatch.temps = patch.temps;
  if (patch.secteur !== undefined) dbPatch.secteur = patch.secteur;
  if (patch.dejaCherche !== undefined) dbPatch.deja_cherche = patch.dejaCherche === "yes";
  if (patch.prenom !== undefined) dbPatch.prenom = patch.prenom;
  if (patch.matchCount !== undefined) dbPatch.match_count = patch.matchCount;
  return dbPatch;
}

export function seededMatchCount(answers: QuizAnswers): number {
  const seed = JSON.stringify(answers);
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  return 2 + (Math.abs(hash) % 4); // 2..5, jamais Math.random()
}
