-- ColdTrend — compteur de preuve sociale (écran "Tu n'es pas le seul" et
-- hero). user_concepts est protégée par RLS (lecture de sa propre ligne
-- uniquement) : cette fonction expose UNIQUEMENT un total agrégé, jamais
-- une ligne, un nom ou un identifiant. security definer pour pouvoir
-- compter malgré la RLS, search_path figé contre les détournements.

create or replace function public.social_proof_stats()
returns json
language sql
stable
security definer
set search_path = public
as $$
  select json_build_object('concepts', (select count(*) from public.user_concepts));
$$;

revoke all on function public.social_proof_stats() from public;
grant execute on function public.social_proof_stats() to anon, authenticated;
