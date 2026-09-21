-- ColdTrend — incrément atomique du compteur promo_codes.redemptions.
-- Un simple `update ... set redemptions = redemptions + 1` depuis le
-- client JS Supabase ne peut pas exprimer l'incrément relatif (il faudrait
-- lire puis réécrire, avec une fenêtre de course entre deux webhooks
-- concurrents) -- cette fonction fait l'opération en une seule requête SQL
-- atomique côté Postgres.
create or replace function public.increment_promo_redemption(p_code text)
returns void
language sql
security definer
set search_path = public
as $$
  update promo_codes set redemptions = redemptions + 1 where code = p_code;
$$;
