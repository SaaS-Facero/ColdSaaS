-- ColdTrend — ajoute le prix de cession (askingPrice de TrustMRR, en
-- dollars comme revenue.mrr — vérifié sur de vraies données : les deux
-- champs suivent la même convention) pour pouvoir compter reellement les
-- SaaS correspondant au budget choisi dans le quiz, pas une formule à seed.
--
-- Simplification assumée : les tranches de budget du quiz sont en euros,
-- askingPrice est en dollars. Pas de taux de change fiable disponible ici
-- -- traité 1€≈1$ pour l'instant, à corriger si un vrai taux devient
-- nécessaire.

alter table saas_listings add column if not exists asking_price_usd numeric;

drop view if exists saas_listings_public;

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
  end as mrr_bucket,
  -- Mêmes bornes exactes que quiz.budgetLabels (low/mid/high) côté site,
  -- pour que le comptage du quiz puisse filtrer directement dessus sans
  -- recalculer les seuils côté client.
  case
    when asking_price_usd is null then null
    when asking_price_usd < 5000 then 'low'
    when asking_price_usd < 20000 then 'mid'
    when asking_price_usd < 50000 then 'high'
    else 'over_high'
  end as budget_bucket
from saas_listings
where active = true;

grant select on saas_listings_public to anon, authenticated;
