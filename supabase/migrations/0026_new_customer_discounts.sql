-- ColdTrend — nouveaux paliers de réduction pour l'écran de paiement de
-- l'abonnement (bandeau bienvenue/retour), distincts de welcome5/10/15
-- (ces 3-là restent réservés à l'upsell "plan de communication" sur
-- /concept, voir stripe-webhook -- jamais réutilisés ici).
--
-- Deux paliers seulement (pas 3) : première visite vs retour après relance
-- automatique -- le nombre de relances manuelles admin n'entre plus en jeu
-- ici (contrairement à welcome5/10/15), décision explicite du brief.
--
-- Les deux Promotion Code Stripe sont réels, créés et communiqués par
-- l'utilisateur (jamais générés par du code) :
--   promo_1UJBSpKs6wCNxRh3VqYLvQJl -> -34% (première visite)
--   promo_1UJBTjKs6wCNxRh3dnl70Dpf -> -23% (retour après relance)

insert into promo_codes (code, stripe_promotion_code_id, discount_label, discount_percent) values
  ('welcome34', 'promo_1UJBSpKs6wCNxRh3VqYLvQJl', '-34%', 34),
  ('comeback23', 'promo_1UJBTjKs6wCNxRh3dnl70Dpf', '-23%', 23);
