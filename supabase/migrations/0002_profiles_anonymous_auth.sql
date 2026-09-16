-- ColdTrend — auth invisible (anonyme -> permanent)
-- Remplace la table `leads` de la migration précédente (0001) : l'identité
-- n'est plus capturée en aval du quiz, elle existe dès `signInAnonymously()`
-- à l'écran 1. `profiles.id` EST `auth.users.id` — un seul UUID stable du
-- premier clic jusqu'à la conversion en compte permanent.

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  prenom text,
  intention text,          -- 'racheter' | 'copier'
  budget text,              -- null si intention = 'copier' (skip)
  temps text,
  secteur text[],
  deja_cherche boolean,
  match_count int,
  funnel_last_step int default 0, -- pour relance ciblée sur abandon (voir docs/identity-lifecycle.md §3)
  converted boolean default false  -- passe à true dès que le compte a un mot de passe ou une identité liée
);

alter table profiles enable row level security;

create policy "users manage their own profile"
  on profiles for all
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Maintient updated_at à jour sur chaque écriture (utile pour le job de
-- relance : "updated_at < now() - interval '2 hours'" ne doit pas se baser
-- sur une colonne figée à la création).
create function public.set_profiles_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger on_profiles_updated
  before update on profiles
  for each row execute procedure public.set_profiles_updated_at();

-- Pourquoi ce trigger (et pas un insert applicatif après signInAnonymously)
-- ----------------------------------------------------------------------
-- Dans le funnel précédent, la création de la ligne "lead" n'avait qu'un
-- seul point d'entrée (l'écran de capture, en fin de parcours), donc un
-- insert explicite côté client suffisait. Ici, un compte peut naître à
-- PLUSIEURS endroits fonctionnellement équivalents : ouverture directe du
-- quiz, retour via magic link de relance, future entrée par un lien
-- partagé, etc. Rien ne garantit qu'un futur développeur appelle bien le
-- même helper `createProfile()` à chaque nouveau point d'entrée — un oubli
-- silencieux y laisserait un `auth.users` sans profil, invisible jusqu'à ce
-- qu'un écran plante sur un upsert qui ne trouve rien à mettre à jour.
-- Centraliser la création dans un trigger AFTER INSERT ON auth.users rend
-- la garantie structurelle plutôt que conventionnelle : il est impossible
-- de créer un utilisateur Supabase (anonyme ou non) sans obtenir sa ligne
-- `profiles`, quel que soit le chemin emprunté côté client.
create function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ----------------------------------------------------------------------
-- Rétention RGPD — comptes anonymes jamais convertis
-- ----------------------------------------------------------------------
-- `auth.users.is_anonymous` (colonne native Supabase) distingue un compte
-- qui n'a jamais reçu ni mot de passe ni identité liée. Politique : purge
-- automatique après 30 jours d'inactivité pour tout compte resté anonyme.
-- Implémentation prévue (hors scope SQL pur, nécessite le rôle service) :
-- une Edge Function planifiée via pg_cron, ex. quotidienne à 03:00 UTC :
--
--   select au.id
--   from auth.users au
--   join public.profiles p on p.id = au.id
--   where au.is_anonymous = true
--     and p.converted = false
--     and p.updated_at < now() - interval '30 days';
--   -- puis auth.admin.deleteUser(id) pour chaque ligne (cascade sur profiles).
--
-- Ne jamais purger sur `created_at` seul : un utilisateur actif au jour 25
-- mais pas encore converti ne doit pas être supprimé le jour 30 sur la
-- seule base de sa date de création.
