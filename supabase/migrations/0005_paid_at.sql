-- ColdTrend — statut de paiement fiable, jamais un flag manipulable côté
-- client. paid_at n'est écrit que par supabase/functions/stripe-webhook,
-- après vérification de la signature Stripe. `converted` (posé à la
-- création de compte) continue de signifier "a un compte permanent" —
-- les deux ne doivent plus jamais être confondus.

alter table profiles add column if not exists paid_at timestamptz;
