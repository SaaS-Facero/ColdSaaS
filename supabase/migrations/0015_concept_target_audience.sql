-- ColdTrend — ajoute target_audience au schema de saas_concepts (nouveau
-- champ du prompt genere-concept, "Public cible probable"). Table deja
-- videe en 0013, donc aucune ligne existante a migrer.

alter table saas_concepts add column if not exists target_audience text;
