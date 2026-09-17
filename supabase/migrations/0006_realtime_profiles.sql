-- ColdTrend — active Supabase Realtime sur profiles : /compte s'abonne aux
-- UPDATE de sa propre ligne pour se mettre à jour en direct (paiement
-- confirmé pendant que l'onglet est ouvert), sans reload manuel.
-- RLS existante ("users manage their own profile") s'applique aussi aux
-- messages Realtime : un client ne reçoit jamais les changements d'un
-- autre profil que le sien.

alter publication supabase_realtime add table profiles;
