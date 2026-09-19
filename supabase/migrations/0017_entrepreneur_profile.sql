-- ColdTrend — module optionnel "profil entrepreneur", propose apres l'ecran
-- de resultat gratuit du quiz existant (pas une fusion ni un remplacement).
-- Reutilise profiles.secteur/budget/temps deja collectes -- ne les
-- redemande jamais.
--
-- Deux tables comme saas_listings/saas_concepts : reponses brutes (ecrites
-- par le client) separees du contenu genere (ecrit uniquement par le
-- service_role, depuis generate-entrepreneur-profile).

create table entrepreneur_profile_answers (
  user_id uuid primary key references profiles(id) on delete cascade,
  revenu_vise integer,
  reponse_nuit text,
  confiance smallint check (confiance between 1 and 10),
  frein text check (frein in ('temps','argent','peur_echec','ne_sait_pas','autre')),
  frein_autre text,
  fierte text check (fierte in ('parents','partenaire','amis','moi_meme','personne')),
  frequence text check (frequence in ('constamment','plusieurs_fois_jour','une_fois_jour','rarement')),
  habitude_regrettee text,
  incompris text,
  projection_10ans text,
  completed_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table entrepreneur_profile_answers enable row level security;

create policy "users manage their own entrepreneur answers"
  on entrepreneur_profile_answers for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create table entrepreneur_profiles (
  user_id uuid primary key references profiles(id) on delete cascade,
  profile_name text not null,
  opening_line text not null,
  strength_recognition text not null,
  direction_hint text not null,
  transition_line text not null,
  confidence_note text,
  generated_at timestamptz not null default now()
);

alter table entrepreneur_profiles enable row level security;

-- Lecture seule pour l'utilisateur -- aucune policy insert/update cote
-- client, seul le service_role (Edge Function) ecrit ici.
create policy "users read their own entrepreneur profile"
  on entrepreneur_profiles for select
  using (auth.uid() = user_id);
