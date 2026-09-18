-- ColdTrend — infrastructure dormante pour une future migration hors du
-- Google Sheet manuel (aujourd'hui la seule vraie "base" de SaaS vérifiés
-- envoyée par email après paiement). Cette table n'est branchée à aucun
-- affichage du site pour l'instant : aucune ligne réelle n'y vit encore.
--
-- source_level distingue explicitement deux niveaux de confiance, jamais
-- mélangés sous un même badge "Vérifié" :
--   - 'verified'         : TrustMRR — revenu confirmé via connexion API en
--                          lecture seule au processeur de paiement du
--                          vendeur.
--   - 'platform_reviewed': Acquire.com (dossier examiné manuellement par
--                          leur équipe) ou Flippa (uniquement les listings
--                          portant leur propre badge "Verified").
--
-- Sources explicitement exclues (jamais à intégrer, cf. audit) : Microns,
-- BuyMicroStartups, Indie Hackers, Little Exits (aucune vérification de
-- revenu, chiffres auto-déclarés) — casserait la promesse centrale du
-- produit si elles étaient mélangées ici.

create table saas_listings (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null,
  secteur text[], -- même vocabulaire que profiles.secteur : 'b2b' | 'b2c' | 'both'
  mrr_cents integer,
  source_level text not null check (source_level in ('verified', 'platform_reviewed')),
  source_name text, -- ex. "TrustMRR", "Acquire.com", "Flippa"
  active boolean not null default true
);

alter table saas_listings enable row level security;

-- Lecture publique (anon) : ce sera la base consultable par les visiteurs
-- une fois branchée — mais RLS posée dès maintenant plutôt que d'y penser
-- après coup. Aucune écriture cliente : l'ajout d'un SaaS reste un geste
-- manuel via le rôle service (ou le dashboard Supabase), jamais un
-- formulaire public.
create policy "lecture publique des listings actifs"
  on saas_listings for select
  to anon, authenticated
  using (active = true);
