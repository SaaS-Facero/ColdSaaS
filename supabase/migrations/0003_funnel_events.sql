-- ColdTrend — table funnel_events : remplace le stub trackEvent()
-- (console.debug uniquement jusqu'ici, aucune donnée nulle part). Alimentée
-- par scripts/build.mjs (fonction trackEvent), depuis le navigateur avec la
-- clé anon. user_id est nullable : les tout premiers événements du quiz
-- (avant que resolve-identity n'ait retourné une session) n'ont pas encore
-- d'identité.

create table funnel_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  event_name text not null,
  screen_index int,
  variant text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index funnel_events_user_id_idx on funnel_events (user_id);
create index funnel_events_event_name_idx on funnel_events (event_name);

alter table funnel_events enable row level security;

-- Écriture seule depuis le client : un événement sans identité (user_id
-- null, avant résolution de la session) ou avec sa propre identité
-- (auth.uid() = user_id). Jamais de lecture arbitraire depuis le client —
-- l'analyse se fait via le dashboard Supabase ou le rôle service.
create policy "insert own or anonymous funnel events"
  on funnel_events for insert
  to anon, authenticated
  with check (user_id is null or auth.uid() = user_id);
