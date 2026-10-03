-- ColdTrend — écrans « Acquisition » et « Niveau d'accompagnement » (après
-- l'écran Délai).
--
-- wants_ai_video : réponse à « Veux-tu que l'IA crée tes vidéos pour attirer
--   tes clients ? » (true = oui). NULL tant que l'écran n'a pas été répondu.
-- support_level : « Jusqu'où veux-tu qu'on t'accompagne ? » parmi
--   autonome | etapes_cles | automatisation_max. NULL tant que non répondu.
-- Écrits par le client (persistProgress / persistQuizAnswers), comme
-- objectif_mensuel : colonnes non protégées. Servent à présélectionner
-- l'offre sur l'écran de paiement (voir initDurationCards).
alter table public.profiles
  add column if not exists wants_ai_video boolean,
  add column if not exists support_level text
    check (support_level is null or support_level in ('autonome', 'etapes_cles', 'automatisation_max'));
