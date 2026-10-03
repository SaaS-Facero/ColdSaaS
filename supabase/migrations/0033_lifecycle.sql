-- ColdTrend — lifecycle (relances email pilotées par événements).
--
-- Vue d'ensemble (voir supabase/functions/lifecycle-dispatch) :
--   events            -> ce qui s'est passé (résultat vu, offres vues,
--                        checkout ouvert, paiement réussi/échoué,
--                        résiliation, clic email...). Source des
--                        déclencheurs, du score d'intention et de
--                        l'attribution des euros récupérés.
--   lifecycle_sends   -> chaque email décidé (envoyé, test, groupe témoin,
--                        échec), avec une clé d'idempotence unique : un même
--                        email ne peut jamais partir deux fois.
--   lifecycle_settings-> interrupteurs (activé, mode test, arrêt d'urgence),
--                        destinataire des tests, expéditeur, reply-to,
--                        jeton du cron (généré ICI, jamais dans le dépôt).
--
-- Démarrage volontairement SÛR : enabled = false et test_mode = true. Rien
-- ne part tant qu'un admin n'a pas activé le système depuis /admin.

create extension if not exists pgcrypto with schema extensions;

-- ---- 1. Consentement et données de relance dans profiles -------------------
-- marketing_opt_in : case NON pré-cochée sur l'écran de création de compte.
--   Les relances marketing ne partent qu'avec ce consentement (le compte est
--   créé sans achat : l'exception « client existant » ne s'applique pas).
-- marketing_opt_in_at : horodatage posé par trigger (preuve du consentement,
--   jamais fourni par le client).
-- blocage : frein(s) déclaré(s) au quiz, pour l'email objection.
-- email_suppressed_* : bounce dur / plainte (resend-webhook). Colonnes
--   serveur uniquement (ajoutées au garde ci-dessous).
alter table public.profiles
  add column if not exists marketing_opt_in boolean not null default false,
  add column if not exists marketing_opt_in_at timestamptz,
  add column if not exists blocage text[],
  add column if not exists email_suppressed_at timestamptz,
  add column if not exists email_suppressed_reason text;

create or replace function public.stamp_marketing_opt_in()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.marketing_opt_in and (tg_op = 'INSERT' or not coalesce(old.marketing_opt_in, false)) then
    new.marketing_opt_in_at := now();
  elsif not new.marketing_opt_in then
    new.marketing_opt_in_at := null;
  elsif tg_op = 'UPDATE' then
    new.marketing_opt_in_at := old.marketing_opt_in_at;
  end if;
  return new;
end;
$$;

drop trigger if exists stamp_marketing_opt_in on public.profiles;
create trigger stamp_marketing_opt_in
  before insert or update of marketing_opt_in on public.profiles
  for each row execute function public.stamp_marketing_opt_in();

-- Garde des colonnes protégées (0029 + 0030) : + email_suppressed_* et
-- marketing_opt_in_at. Ordre des triggers BEFORE = alphabétique :
-- guard_profile_protected_columns s'exécute avant stamp_marketing_opt_in,
-- donc il voit la ligne telle qu'envoyée par le client (horodatage forgé
-- refusé), puis le trigger d'horodatage pose la vraie valeur.
create or replace function public.guard_profile_protected_columns()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.is_admin
      or new.paid_at is not null
      or new.stripe_customer_id is not null
      or new.stripe_subscription_id is not null
      or new.subscription_status is not null
      or new.subscription_duration_months is not null
      or new.unsubscribed_at is not null
      or new.last_recovery_email_sent_at is not null
      or new.project_name is not null
      or new.email_suppressed_at is not null
      or new.email_suppressed_reason is not null
      or new.marketing_opt_in_at is not null then
      raise exception 'Colonne protégée de profiles : écriture réservée au serveur.' using errcode = '42501';
    end if;
    return new;
  end if;

  if new.is_admin is distinct from old.is_admin
    or new.paid_at is distinct from old.paid_at
    or new.stripe_customer_id is distinct from old.stripe_customer_id
    or new.stripe_subscription_id is distinct from old.stripe_subscription_id
    or new.subscription_status is distinct from old.subscription_status
    or new.subscription_duration_months is distinct from old.subscription_duration_months
    or new.unsubscribed_at is distinct from old.unsubscribed_at
    or new.last_recovery_email_sent_at is distinct from old.last_recovery_email_sent_at
    or new.project_name is distinct from old.project_name
    or new.email_suppressed_at is distinct from old.email_suppressed_at
    or new.email_suppressed_reason is distinct from old.email_suppressed_reason
    or new.marketing_opt_in_at is distinct from old.marketing_opt_in_at then
    raise exception 'Colonne protégée de profiles : écriture réservée au serveur.' using errcode = '42501';
  end if;
  return new;
end;
$$;

-- ---- 2. Événements ------------------------------------------------------------
create table if not exists public.events (
  id bigserial primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  type text not null check (type in (
    'quiz_step',              -- client : écran N atteint (screen_index)
    'result_viewed',          -- client : écran résultat affiché
    'offers_viewed',          -- client : écran des offres affiché
    'checkout_opened',        -- serveur : create-checkout-session
    'payment_succeeded',      -- serveur : stripe-webhook (amount_cents)
    'payment_failed',         -- serveur : stripe-webhook (amount_cents, metadata.hosted_invoice_url)
    'subscription_canceled',  -- serveur : stripe-webhook
    'email_click'             -- serveur : lifecycle-link (metadata.send_id)
  )),
  screen_index integer,
  amount_cents integer,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists events_user_type_idx on public.events (user_id, type, created_at desc);
create index if not exists events_type_created_idx on public.events (type, created_at desc);

alter table public.events enable row level security;

-- Le client n'écrit que SES événements de navigation, jamais un paiement ni
-- un clic (sources serveur). Aucune lecture côté client.
drop policy if exists "users insert their own navigation events" on public.events;
create policy "users insert their own navigation events" on public.events
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and type in ('quiz_step', 'result_viewed', 'offers_viewed')
    and amount_cents is null
  );

-- ---- 3. Envois -----------------------------------------------------------------
create table if not exists public.lifecycle_sends (
  id bigserial primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  sequence text not null,          -- result_unpaid | checkout_abandon | quiz_abandon | payment_failed
  step integer not null,           -- 1, 2, 3, 4
  status text not null check (status in ('sent', 'test', 'holdout', 'failed')),
  idempotency_key text not null unique,   -- user:sequence:step(:cycle) -> aussi envoyé à Resend
  subject text,
  intent_score integer,
  resend_id text,
  error text,
  created_at timestamptz not null default now()
);

create index if not exists lifecycle_sends_user_idx on public.lifecycle_sends (user_id, created_at desc);
create index if not exists lifecycle_sends_seq_idx on public.lifecycle_sends (sequence, step, status);

alter table public.lifecycle_sends enable row level security;
-- Aucune policy : service role uniquement (dispatch, admin-lifecycle).

-- ---- 4. Réglages (une seule ligne) ------------------------------------------------
create table if not exists public.lifecycle_settings (
  id boolean primary key default true check (id),
  enabled boolean not null default false,
  test_mode boolean not null default true,
  kill_switch boolean not null default false,
  holdout_percent integer not null default 10 check (holdout_percent between 0 and 50),
  test_recipient text,
  from_address text not null default 'Max de ColdTrend <bonjour@coldtrend.com>',
  reply_to text not null default 'contact.facero2026@gmail.com',
  -- Jeton partagé avec le cron (pg_net). Généré par la base : jamais dans le
  -- dépôt, jamais renvoyé au client.
  cron_token text not null default encode(extensions.gen_random_bytes(24), 'hex'),
  updated_at timestamptz not null default now()
);

insert into public.lifecycle_settings (id) values (true) on conflict (id) do nothing;

alter table public.lifecycle_settings enable row level security;
-- Aucune policy : lu et modifié uniquement par les Edge Functions (service role).

-- ---- 5. Cron : lifecycle-dispatch toutes les 15 minutes -----------------------------
create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'lifecycle-dispatch') then
    perform cron.unschedule('lifecycle-dispatch');
  end if;
end;
$$;

select cron.schedule(
  'lifecycle-dispatch',
  '*/15 * * * *',
  $cron$
  select net.http_post(
    url := 'https://vxfalhmubwzzvthtvtsx.supabase.co/functions/v1/lifecycle-dispatch',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select cron_token from public.lifecycle_settings where id)
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
  $cron$
);
