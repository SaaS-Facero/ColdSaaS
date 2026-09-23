-- ColdTrend — pivot : concept de SaaS généré par LLM à partir du profil de
-- l'utilisateur (situation, passif, secteur, budget, temps, intention),
-- plus par listing réel. Un seul concept par utilisateur, mis en cache
-- comme entrepreneur_profiles/saas_concepts -- un seul appel LLM.
--
-- saas_listings / saas_listings_public / saas_concepts restent en base
-- (dormantes, plus affichées côté public) -- /concept/{slug} et l'upsell
-- "plan de communication" en dépendent encore, décision explicite de ne
-- pas les casser dans ce pivot.

create table user_concepts (
  user_id uuid primary key references profiles(id) on delete cascade,
  concept_name text not null,
  tagline text not null,
  description text not null,
  palette text not null,
  logo_style text not null,
  target_persona text not null,
  channels text not null,
  confidence_note text,
  generated_at timestamptz not null default now()
);

alter table user_concepts enable row level security;

create policy "users read their own concept"
  on user_concepts for select
  using (auth.uid() = user_id);

-- Aucune policy insert/update côté client -- seul le service_role
-- (generate-user-concept) écrit ici, même pattern que entrepreneur_profiles.
