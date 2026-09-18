-- ColdTrend — vide saas_listings avant resynchronisation avec le filtre
-- onSale=true (les lignes precedentes incluaient des entreprises non a
-- vendre comme Gumroad/Stan, synchronisees avant que ce filtre n'existe).
-- Table encore dormante, aucune dependance produit reelle : sans risque.

truncate table saas_listings;
