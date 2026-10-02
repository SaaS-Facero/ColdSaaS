-- ColdTrend — écran "Ton objectif" séparé en deux (Montant / Délai) et
-- suppression de l'écran "Nom du projet".
--
-- 1. objectif_mensuel / delai_mois : les deux réponses, stockées séparément
--    (écrites par le client via persistProgress / persistQuizAnswers, comme
--    temps et secteur). Contraintes = bornes réelles de l'interface
--    (slider 0 - 50 000 €, frise 1 - 6 mois).
-- 2. project_name : nom du projet, désormais GÉNÉRÉ par le LLM avec le
--    concept (generate-user-concept, rôle service). Nullable tant que le
--    concept n'existe pas. Colonne serveur uniquement : ajoutée au garde
--    des colonnes protégées (migration 0029), le client ne peut pas l'écrire.

alter table public.profiles
  add column if not exists objectif_mensuel integer
    check (objectif_mensuel is null or objectif_mensuel between 0 and 50000),
  add column if not exists delai_mois smallint
    check (delai_mois is null or delai_mois between 1 and 6),
  add column if not exists project_name text
    check (project_name is null or char_length(project_name) <= 80);

-- Même fonction que 0029, avec project_name en plus.
create or replace function public.guard_profile_protected_columns()
returns trigger
language plpgsql
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
      or new.last_recovery_email_sent_at is not null
      or new.project_name is not null then
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
    or new.last_recovery_email_sent_at is distinct from old.last_recovery_email_sent_at
    or new.project_name is distinct from old.project_name then
    raise exception 'Colonne protégée de profiles : écriture réservée au serveur.' using errcode = '42501';
  end if;
  return new;
end;
$$;
