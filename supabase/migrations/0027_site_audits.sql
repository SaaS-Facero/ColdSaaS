-- ColdTrend — audits gratuits de SaaS existants (écran 7b du quiz).
-- Sert à deux choses : limiter les abus (l'endpoint est public, appelé
-- avant toute création de compte, et chaque audit coûte un appel LLM) et
-- remettre en cache le résultat d'une même URL pendant 24h.
--
-- ip_hash : SHA-256 de l'IP salée avec un secret serveur, jamais l'IP en
-- clair. Aucune policy client : lecture/écriture réservées au service_role
-- (analyze-site).

create table site_audits (
  id uuid primary key default gen_random_uuid(),
  url text not null,
  ip_hash text not null,
  result jsonb,
  created_at timestamptz not null default now()
);

create index site_audits_ip_hash_created_at_idx on site_audits (ip_hash, created_at desc);
create index site_audits_url_created_at_idx on site_audits (url, created_at desc);

alter table site_audits enable row level security;
