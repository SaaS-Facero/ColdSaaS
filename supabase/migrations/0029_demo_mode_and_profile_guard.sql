-- ColdTrend — Mode Vidéo (/demo) + verrouillage des colonnes sensibles de
-- profiles.
--
-- 1. FAILLE CORRIGÉE : la policy "users manage their own profile" (0002,
--    for all, auth.uid() = id) combinée aux droits de colonne par défaut
--    laissait n'importe quel compte connecté exécuter depuis le navigateur
--      update profiles set is_admin = true  where id = auth.uid();
--      update profiles set paid_at = now() where id = auth.uid();
--    soit une auto-promotion admin et un accès payant gratuit. Le trigger
--    ci-dessous refuse toute écriture de ces colonnes venant des rôles
--    clients (anon, authenticated). Le rôle service (Edge Functions :
--    stripe-webhook, unsubscribe...) et les migrations ne sont pas touchés.
--    Le client n'écrit que intention, temps, secteur, match_count,
--    funnel_last_step, converted, prenom : inchangé.
--
-- 2. profiles.role : colonne GÉNÉRÉE depuis is_admin ('admin' | 'user').
--    Une seule source de vérité (is_admin, posé à la main en base), et une
--    colonne générée ne peut être écrite par personne.
--
-- 3. funnel_events.is_demo : marquage des évènements de démo, exclus des
--    statistiques admin. La page /demo n'envoie de toute façon aucun
--    évènement ; la colonne protège contre un futur oubli.
--
-- 4. demo_concepts : cache des concepts générés en mode démo, une ligne par
--    combinaison de réponses (hash). Aucune ligne dans profiles ni
--    user_concepts. RLS activée SANS policy : seul le rôle service
--    (generate-demo-concept) y accède.

-- ---- 1. Garde des colonnes sensibles ---------------------------------------
create or replace function public.guard_profile_protected_columns()
returns trigger
language plpgsql
-- security invoker (défaut) : current_user = rôle de l'appelant réel.
set search_path = public
as $$
begin
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.is_admin
      or new.paid_at is not null
      or new.stripe_customer_id is not null
      or new.stripe_subscription_id is not null
      or new.subscription_status is not null
      or new.subscription_duration_months is not null
      or new.unsubscribed_at is not null
      or new.last_recovery_email_sent_at is not null then
      raise exception 'Colonne protégée de profiles : écriture réservée au serveur.' using errcode = '42501';
    end if;
    return new;
  end if;

  if new.is_admin is distinct from old.is_admin
    or new.paid_at is distinct from old.paid_at
    or new.stripe_customer_id is distinct from old.stripe_customer_id
    or new.stripe_subscription_id is distinct from old.stripe_subscription_id
    or new.subscription_status is distinct from old.subscription_status
    or new.subscription_duration_months is distinct from old.subscription_duration_months
    or new.unsubscribed_at is distinct from old.unsubscribed_at
    or new.last_recovery_email_sent_at is distinct from old.last_recovery_email_sent_at then
    raise exception 'Colonne protégée de profiles : écriture réservée au serveur.' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_profile_protected_columns on public.profiles;
create trigger guard_profile_protected_columns
  before insert or update on public.profiles
  for each row execute function public.guard_profile_protected_columns();

-- ---- 2. Rôle --------------------------------------------------------------
alter table public.profiles
  add column if not exists role text
  generated always as (case when is_admin then 'admin' else 'user' end) stored;

-- ---- 3. Marquage démo des évènements ---------------------------------------
alter table public.funnel_events add column if not exists is_demo boolean not null default false;

-- ---- 4. Cache des concepts de démo -----------------------------------------
create table if not exists public.demo_concepts (
  cache_key text primary key,           -- sha256 des réponses normalisées
  answers jsonb not null,               -- réponses (valeurs de quiz, aucune donnée perso)
  concept jsonb not null,               -- sortie LLM validée
  is_demo boolean not null default true check (is_demo),
  hit_count integer not null default 0, -- lectures servies depuis le cache
  created_at timestamptz not null default now()
);

alter table public.demo_concepts enable row level security;
-- Volontairement aucune policy : ni anon ni authenticated n'y accèdent.
