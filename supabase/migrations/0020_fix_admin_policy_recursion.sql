-- ColdTrend — corrige une régression critique de la migration 0019 : la
-- policy "admins read all profiles" faisait un `select ... from profiles`
-- À L'INTÉRIEUR d'une policy SUR profiles, ce qui redéclenche l'évaluation
-- des policies de la table sur cette sous-requête -- récursion infinie
-- détectée par Postgres (42P17), qui casse TOUTE lecture de `profiles` pour
-- TOUT LE MONDE (pas seulement l'admin) depuis le déploiement de 0019.
--
-- Fix standard : une fonction SECURITY DEFINER s'exécute avec les
-- privilèges de son propriétaire, pas du rôle appelant -- la requête qu'elle
-- contient ne redéclenche donc pas l'évaluation RLS de la table appelante,
-- brisant la boucle.

drop policy if exists "admins read all profiles" on profiles;

create or replace function public.is_admin(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select p.is_admin from public.profiles p where p.id = uid), false);
$$;

create policy "admins read all profiles"
  on profiles for select
  using (public.is_admin(auth.uid()));

-- Même correction préventive sur admin_email_sends : la policy actuelle
-- utilise le même pattern `exists (select ... from profiles ...)`, qui ne
-- cause pas de récursion ici (la sous-requête porte sur profiles, pas sur
-- admin_email_sends elle-même), mais autant centraliser le check sur la
-- même fonction pour n'avoir qu'un seul endroit à maintenir.
drop policy if exists "admins manage email sends" on admin_email_sends;

create policy "admins manage email sends"
  on admin_email_sends for all
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));
