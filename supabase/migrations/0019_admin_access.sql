-- ColdTrend — back-office /admin : rôle admin, désabonnement RGPD, logs
-- d'envoi de campagnes email.

-- Activé manuellement en base pour un compte précis (jamais via l'UI, pas
-- de route qui permette de se l'attribuer soi-même) :
--   update profiles set is_admin = true where id = '...';
alter table profiles add column is_admin boolean not null default false;

-- Désabonnement RGPD -- vérifié par admin-send-campaign avant tout envoi
-- non transactionnel (jamais par le client, qui pourrait mentir sur la
-- liste envoyée).
alter table profiles add column unsubscribed_at timestamptz;

-- Un admin doit pouvoir lire TOUS les profils (vue /admin), en plus de la
-- policy existante "auth.uid() = id" qui reste inchangée pour l'usage normal
-- (chacun ne voit que le sien). Les deux policies coexistent : Postgres les
-- combine en OR pour un SELECT.
create policy "admins read all profiles"
  on profiles for select
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.is_admin));

create table admin_email_sends (
  id uuid primary key default gen_random_uuid(),
  sent_at timestamptz not null default now(),
  sent_by uuid not null references profiles(id),
  -- ON DELETE SET NULL (pas CASCADE) : si le compte du destinataire est
  -- supprimé, la preuve qu'un email a été envoyé à telle date avec tel
  -- template doit rester consultable (litige, audit) -- seule la donnée
  -- personnelle exploitable (le lien vers le profil) disparaît. Une purge
  -- RGPD retire les données personnelles, pas la trace de l'action.
  recipient_id uuid references profiles(id) on delete set null,
  template_id text not null,
  segment_snapshot jsonb,
  resend_email_id text
);

alter table admin_email_sends enable row level security;

create policy "admins manage email sends"
  on admin_email_sends for all
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.is_admin))
  with check (exists (select 1 from profiles p where p.id = auth.uid() and p.is_admin));
