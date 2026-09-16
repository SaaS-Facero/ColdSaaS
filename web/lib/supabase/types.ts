// Type minimal manuel — à remplacer par `supabase gen types typescript`
// une fois un vrai projet connecté (`supabase link` + génération automatique).
export type Profile = {
  id: string;
  created_at: string;
  updated_at: string;
  prenom: string | null;
  intention: "racheter" | "copier" | null;
  budget: "low" | "mid" | "high" | "undecided" | null;
  temps: "low" | "midlow" | "midhigh" | "full" | null;
  secteur: string[] | null;
  deja_cherche: boolean | null;
  match_count: number | null;
  funnel_last_step: number;
  converted: boolean;
};

export type ProfilePatch = Partial<
  Omit<Profile, "id" | "created_at" | "updated_at">
>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Database = any;
