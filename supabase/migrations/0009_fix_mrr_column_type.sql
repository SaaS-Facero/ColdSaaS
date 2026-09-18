-- ColdTrend — corrige une hypothèse fausse sur le format TrustMRR.
-- revenue.mrr contient des montants en dollars AVEC décimales
-- (ex: 3569654.22), pas des centimes entiers comme l'exemple ShipFast
-- (180000, un chiffre rond par coïncidence) le laissait supposer. La
-- colonne mrr_cents integer rejetait toute valeur avec décimales,
-- causant l'échec de synchronisation de 5 startups sur 10 au premier
-- essai réel.

drop view if exists saas_listings_public;

alter table saas_listings rename column mrr_cents to mrr_usd;
alter table saas_listings alter column mrr_usd type numeric using mrr_usd::numeric;

create or replace view saas_listings_public as
select
  id,
  secteur,
  source_level,
  case
    when mrr_usd is null then null
    when mrr_usd < 1000 then '< 1 000 $'
    when mrr_usd < 5000 then '1 000 – 5 000 $'
    when mrr_usd < 20000 then '5 000 – 20 000 $'
    else '20 000 $+'
  end as mrr_bucket
from saas_listings
where active = true;

grant select on saas_listings_public to anon, authenticated;
