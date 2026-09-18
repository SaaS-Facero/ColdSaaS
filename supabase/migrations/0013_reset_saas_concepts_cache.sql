-- ColdTrend — vide saas_concepts suite au correctif du calcul de fourchette
-- de MRR (mrr_usd = 0 exclu desormais). Les concepts deja en cache ont ete
-- generes avec l'ancienne fourchette buguee (ex: "0$ - 72825$, mediane 0$")
-- injectee dans le prompt -- possiblement referencee dans confidence_note.
-- Meme logique que la migration 0010 (reset apres correction d'un biais de
-- donnees en amont).

truncate table saas_concepts;
