-- ColdTrend — compteur maison pour les 3 codes de bienvenue affichés en
-- toast sur l'écran de paiement du quiz. Pas d'appel API Stripe (ce projet
-- n'a pas de clé secrète Stripe, voir supabase/functions/stripe-webhook) :
-- le compteur est incrémenté uniquement par stripe-webhook, sur un paiement
-- réellement confirmé (checkout.session.completed, payment_status=paid),
-- jamais côté client -- jamais de faux compte à rebours.
--
-- max_redemptions est déjà configuré nativement sur chaque Promotion Code
-- côté Stripe (100) : Stripe refuse lui-même le paiement au-delà, quel que
-- soit l'état de ce compteur. Ce compteur ne sert qu'à un affichage honnête
-- ("il reste X places") côté ColdTrend, pas à l'application de la limite.
--
-- Les 3 codes sont neufs (jamais utilisés avant cette migration, confirmé
-- avec l'utilisateur) : redemptions démarre à 0 sans risque d'écart avec
-- le compteur réel Stripe.

create table promo_codes (
  code text primary key,                  -- 'welcome5' | 'welcome10' | 'welcome15'
  stripe_promotion_code_id text not null unique,
  discount_label text not null,           -- '-5%' etc., affiché dans le toast
  max_redemptions int not null default 100,
  redemptions int not null default 0
);

alter table promo_codes enable row level security;

-- Lecture publique (anon + authenticated) : le toast doit savoir quels
-- codes sont encore disponibles avant même que l'utilisateur soit sur
-- l'écran de paiement -- aucune donnée sensible dans cette table.
create policy "anyone can read promo codes"
  on promo_codes for select
  using (true);

-- Aucune policy insert/update pour le client : seul stripe-webhook (rôle
-- service) incrémente redemptions.

insert into promo_codes (code, stripe_promotion_code_id, discount_label) values
  ('welcome5', 'promo_1UIFFqKs6wCNxRh3Pr2CaWeF', '-5%'),
  ('welcome10', 'promo_1UIFFEKs6wCNxRh3UDJuG9DK', '-10%'),
  ('welcome15', 'promo_1UIFGWKs6wCNxRh32o3i65UQ', '-15%');
