-- ColdTrend — cache des concepts generes par LLM pour /concept/{slug}.
-- Une ligne par listing (pas par utilisateur) : le contenu genere ne depend
-- que du listing + de la fourchette de MRR de son secteur, jamais du profil
-- de l'acheteur -- reutilise par tous les utilisateurs qui matchent sur le
-- meme SaaS, un seul appel LLM par listing au lieu d'un par (utilisateur,
-- listing).
--
-- Meme regle d'acces que saas_listings (migration 0008) : lecture reservee
-- aux comptes authentifies et payes -- /concept/{slug} n'est pas public pour
-- l'instant, le MRR reel qu'il affiche resterait sinon accessible sans
-- paiement.

create table saas_concepts (
  slug text primary key references saas_listings(slug) on delete cascade,
  concept_name text not null,
  tagline text not null,
  description text not null,
  need_angle text not null,
  why_now text not null,
  cta_primary text not null,
  cta_secondary text not null,
  confidence_note text,
  generated_at timestamptz not null default now()
);

alter table saas_concepts enable row level security;

create policy "lecture concept reservee aux comptes payes"
  on saas_concepts for select
  to authenticated
  using (
    exists (
      select 1 from profiles p
      where p.id = auth.uid() and p.paid_at is not null
    )
  );

-- Aucune policy insert/update pour authenticated : l'ecriture ne passe que
-- par le service_role, depuis l'Edge Function qui appelle le LLM.
