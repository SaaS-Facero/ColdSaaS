-- ColdTrend — écran dédié « Combien gagnes-tu par mois aujourd'hui ? ».
--
-- current_revenue : revenus mensuels actuels déclarés, en euros. NULL si la
-- personne préfère ne pas répondre, a choisi « Autre » (saisie libre, non
-- stockée ici) ou n'a pas encore vu l'écran. Écrit par le client
-- (persistProgress / persistQuizAnswers), comme objectif_mensuel : colonne
-- non protégée. Borne haute = maximum accepté par la saisie au clavier.
alter table public.profiles
  add column if not exists current_revenue integer
    check (current_revenue is null or current_revenue between 0 and 1000000);
