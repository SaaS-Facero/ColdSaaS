-- ColdTrend — remplace le tirage aléatoire du toast paiement par une
-- assignation déterministe (voir get-welcome-offer). Ajoute le pourcentage
-- réel de remise en colonne exploitable (calcul du prix barré), au lieu de
-- ne garder qu'un libellé texte ("-5%") non exploitable en calcul.
--
-- Hypothèse explicite (pas vérifiable sans clé API Stripe, voir
-- conversation) : welcome5/10/15 sont bien des remises en pourcentage de
-- 5/10/15%, conformément à leur nom. Si un des 3 coupons Stripe est en
-- réalité configuré en montant fixe plutôt qu'en pourcentage, corriger
-- juste discount_percent ci-dessous (aucun redéploiement de code requis).
alter table promo_codes add column discount_percent int not null default 0;

update promo_codes set discount_percent = 5 where code = 'welcome5';
update promo_codes set discount_percent = 10 where code = 'welcome10';
update promo_codes set discount_percent = 15 where code = 'welcome15';

alter table promo_codes alter column discount_percent drop default;
