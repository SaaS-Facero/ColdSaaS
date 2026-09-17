-- ColdTrend — relance d'abandon : trace la dernière relance envoyée pour ne
-- jamais spammer un même profil tous les jours tant qu'il reste inactif.

alter table profiles add column if not exists last_recovery_email_sent_at timestamptz;
