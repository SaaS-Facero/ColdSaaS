-- ColdTrend — vide saas_concepts suite a l'ajout du champ target_audience
-- (migration 0015). Les concepts deja en cache ont ete generes avant que ce
-- champ existe dans le prompt -- leur target_audience reste vide, et il n'y
-- a pas de regeneration automatique pour une ligne deja en cache. Meme
-- logique que 0010/0013 (reset apres un changement du schema de sortie).

truncate table saas_concepts;
