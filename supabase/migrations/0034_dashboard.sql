-- ColdTrend — dashboard /compte + suivi admin.
--
-- 1. Réponses du quiz encore non stockées, demandées par le tableau admin.
--    Écrites par le client (persistProgress / persistQuizAnswers), comme
--    temps et secteur. L'âge n'est stocké que pour les tranches majeures :
--    un mineur sort du quiz avant toute collecte et n'a jamais de compte.
-- 2. Dashboard : revenus réels déclarés (Progression), missions cochées
--    (Accueil, série de jours actifs), listes d'attente « Bientôt
--    disponible ». RLS : chacun ne voit et n'écrit que ses lignes.
-- 3. FAILLE CORRIGÉE : la policy « users read their own concept » laissait
--    un compte NON payé lire toutes les colonnes de son concept (contenu
--    payant) directement par l'API. Le client ne peut plus lire que le nom
--    et l'accroche ; la fiche complète passe par generate-user-concept,
--    qui vérifie le paiement côté serveur.

-- ---- 1. Réponses du quiz -------------------------------------------------------
alter table public.profiles
  add column if not exists age_range text
    check (age_range is null or age_range in ('18_24', '25_34', '35_50', '50_plus')),
  add column if not exists plateformes text
    check (plateformes is null or plateformes in ('aucune', '1', '2', '3', '4_plus')),
  add column if not exists reve text[],
  add column if not exists engagement_signed_at timestamptz;

-- ---- 2. Dashboard ----------------------------------------------------------------
-- Revenus réels, un montant par mois, saisis par la personne. Jamais
-- inventés ni estimés : la Progression n'affiche que ces lignes.
create table if not exists public.revenue_entries (
  user_id uuid not null references auth.users (id) on delete cascade,
  month date not null check (extract(day from month) = 1),
  amount_eur integer not null check (amount_eur between 0 and 10000000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, month)
);

alter table public.revenue_entries enable row level security;
drop policy if exists "users manage their own revenue" on public.revenue_entries;
create policy "users manage their own revenue" on public.revenue_entries
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Missions de la semaine cochées (programme déterministe :
-- scripts/dashboard-plan.js). week_start = lundi de la semaine.
create table if not exists public.mission_checks (
  user_id uuid not null references auth.users (id) on delete cascade,
  week_start date not null check (extract(isodow from week_start) = 1),
  mission_key text not null check (char_length(mission_key) <= 40),
  done_at timestamptz not null default now(),
  primary key (user_id, week_start, mission_key)
);

alter table public.mission_checks enable row level security;
drop policy if exists "users manage their own missions" on public.mission_checks;
create policy "users manage their own missions" on public.mission_checks
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- « Bientôt disponible » : inscription en 1 tap.
create table if not exists public.feature_waitlist (
  user_id uuid not null references auth.users (id) on delete cascade,
  feature text not null check (feature in ('video', 'ressources')),
  created_at timestamptz not null default now(),
  primary key (user_id, feature)
);

alter table public.feature_waitlist enable row level security;
drop policy if exists "users manage their own waitlist" on public.feature_waitlist;
create policy "users manage their own waitlist" on public.feature_waitlist
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---- 3. Contenu payant du concept : lecture client limitée -------------------------
-- La policy de ligne reste ; ce sont les droits de colonnes qui changent.
revoke select on public.user_concepts from anon, authenticated;
grant select (user_id, concept_name, tagline, generated_at) on public.user_concepts to authenticated;
