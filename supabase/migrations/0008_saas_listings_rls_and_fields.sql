-- ColdTrend — sécurise saas_listings avant toute synchronisation réelle de
-- données TrustMRR. La RLS posée en 0007 autorisait n'importe quel
-- visiteur anonyme à lire toutes les colonnes (y compris l'identité du
-- SaaS) via la clé anon publique — ça casserait entièrement le modèle
-- "accès payant à la base complète" si la table était vraiment
-- synchronisée. Corrigé avant que sync-trustmrr n'y écrive de vraies
-- données.

drop policy if exists "lecture publique des listings actifs" on saas_listings;

alter table saas_listings add column if not exists slug text unique;
alter table saas_listings add column if not exists website text;
alter table saas_listings add column if not exists description text;

-- Lecture complète (nom, site, description) réservée aux comptes qui ont
-- réellement payé — jamais à un visiteur anonyme, jamais à un compte juste
-- inscrit.
create policy "lecture complete reservee aux comptes payes"
  on saas_listings for select
  to authenticated
  using (
    active = true
    and exists (
      select 1 from profiles p
      where p.id = auth.uid() and p.paid_at is not null
    )
  );

-- Vue publique : secteur + tranche de MRR arrondie + niveau de source
-- uniquement, jamais de nom ni d'URL — même logique que la carte "preuve
-- redactée" du funnel (montrer la NATURE de la preuve sans révéler
-- l'identité). La vue ne project que ces colonnes : même si l'évaluation
-- RLS sur une vue diffère de la table de base selon les cas, le pire
-- scénario possible est "la vue ne renvoie rien", jamais une fuite d'une
-- colonne non projetée.
create or replace view saas_listings_public as
select
  id,
  secteur,
  source_level,
  case
    when mrr_cents is null then null
    when mrr_cents < 100000 then '< 1 000 $'
    when mrr_cents < 500000 then '1 000 – 5 000 $'
    when mrr_cents < 2000000 then '5 000 – 20 000 $'
    else '20 000 $+'
  end as mrr_bucket
from saas_listings
where active = true;

grant select on saas_listings_public to anon, authenticated;
