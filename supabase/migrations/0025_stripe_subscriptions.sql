-- ColdTrend — passage du paiement unique (Payment Link) à l'abonnement
-- Stripe Subscriptions. profiles.paid_at reste en place (lu par endroit
-- existants : RLS saas_listings, comm_plan_purchases, admin, resend-access)
-- -- non retiré ici, pas de régression sur ce qui fonctionne déjà --
-- mais devient un signal "a payé au moins une fois", plus "a un accès
-- valide aujourd'hui". Les nouvelles colonnes ci-dessous portent le vrai
-- état d'abonnement, nécessaire pour révoquer l'accès à la résiliation
-- (ce que paid_at seul ne peut structurellement pas exprimer).

alter table profiles
  add column stripe_customer_id text,
  add column stripe_subscription_id text,
  add column subscription_status text,
  add column subscription_duration_months integer;

comment on column profiles.subscription_status is
  'Reflète le dernier évènement Stripe reçu pour cet abonnement : active, past_due, canceled, unpaid, etc. (valeurs Stripe telles quelles, pas de mapping custom). Null = jamais abonné.';
comment on column profiles.subscription_duration_months is
  'Purement déclaratif (1, 3 ou 6) -- la durée choisie à l''achat n''impose aucune contrainte technique Stripe, un seul Price ID récurrent mensuel est utilisé pour les trois. Sert uniquement à afficher "tu avais choisi X mois" au retour sur la page de paiement.';

create index if not exists profiles_stripe_subscription_id_idx on profiles (stripe_subscription_id);
create index if not exists profiles_stripe_customer_id_idx on profiles (stripe_customer_id);

-- Journal brut de chaque évènement Stripe d'abonnement reçu -- indépendant
-- de toute mise à jour de profiles, jamais purgé automatiquement. Sert de
-- filet de vérification manuelle (voir stripe-webhook, mode log-only) et
-- de preuve en cas de litige, même après activation de la logique réelle.
create table stripe_webhook_events (
  id uuid primary key default gen_random_uuid(),
  stripe_event_id text unique not null,
  event_type text not null,
  payload jsonb not null,
  profile_id uuid references profiles(id) on delete set null,
  processed_access_update boolean not null default false,
  received_at timestamptz not null default now()
);

alter table stripe_webhook_events enable row level security;

-- Aucune policy client -- lecture/écriture réservées au service_role
-- (stripe-webhook), consultable via le SQL editor Supabase ou l'API admin,
-- jamais exposé au navigateur.
