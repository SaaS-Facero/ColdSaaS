-- ColdTrend — table `leads`, alimentée par l'écran 6 du funnel-quiz
-- (scripts/build.mjs, fonction insertLead) avant même l'affichage du prix.
-- Colonnes alignées avec le payload envoyé côté client : ne pas renommer
-- sans mettre à jour insertLead() en parallèle.

create table leads (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  prenom text,
  email text not null,
  rgpd_consent boolean not null default false,
  intention text, -- 'racheter' | 'copier'
  budget text, -- 'low' | 'mid' | 'high' | 'undecided' | null si intention = copier
  temps text, -- 'low' | 'midlow' | 'midhigh' | 'full'
  secteur text[], -- multi-select : 'b2b' | 'b2c' | 'both'
  deja_cherche boolean,
  match_count int,
  converted boolean default false
);

-- Row Level Security : le client insère avec la clé anon publique, jamais
-- de lecture/écriture arbitraire sur les leads existants.
alter table leads enable row level security;

create policy "insert lead via anon key"
  on leads for insert
  to anon
  with check (true);

-- TODO: brancher `converted` sur le webhook Stripe (paiement confirmé) une
-- fois le vrai lien de paiement en place, pour distinguer lead capté / payé.
