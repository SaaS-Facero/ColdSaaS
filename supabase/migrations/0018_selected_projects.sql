-- ColdTrend — trace la selection d'un projet depuis /concept/{slug} (clic
-- sur le CTA "Lancer cette version"). Un seul projet actif a la fois
-- (decision produit) : unique(user_id), une nouvelle selection remplace
-- l'ancienne via upsert.
--
-- Stocke uniquement une reference (listing_slug), jamais une copie du
-- contenu -- /compte refait les memes requetes que /concept/{slug}
-- (saas_listings + saas_concepts) a l'affichage, pas de duplication qui
-- pourrait devenir obsolete.

create table selected_projects (
  user_id uuid primary key references profiles(id) on delete cascade,
  listing_slug text not null references saas_listings(slug) on delete cascade,
  selected_at timestamptz not null default now()
);

alter table selected_projects enable row level security;

create policy "users manage their own selected project"
  on selected_projects for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
