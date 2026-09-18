-- ColdTrend — upsell "plan de communication" a 3,90€, par (utilisateur,
-- listing) -- contrairement a l'acces principal (profiles.paid_at, un seul
-- palier), cet achat est specifique a un concept precis.

create table comm_plan_purchases (
  user_id uuid not null references profiles(id) on delete cascade,
  slug text not null references saas_listings(slug) on delete cascade,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (user_id, slug)
);

alter table comm_plan_purchases enable row level security;

-- Lecture de son propre statut d'achat uniquement -- jamais d'insert/update
-- cote client, seul le webhook (service_role) ecrit ici.
create policy "users read their own comm plan purchases"
  on comm_plan_purchases for select
  using (auth.uid() = user_id);

-- Cache du contenu genere, une ligne par LISTING (pas par utilisateur) --
-- meme logique que saas_concepts (migration 0012) : un seul appel LLM par
-- SaaS, reutilise par tous les acheteurs de ce concept precis.
create table saas_comm_plans (
  slug text primary key references saas_listings(slug) on delete cascade,
  channels text not null,
  organic_angle text not null,
  content_ideas text not null,
  posting_cadence text not null,
  confidence_note text,
  generated_at timestamptz not null default now()
);

alter table saas_comm_plans enable row level security;

-- Lecture reservee a qui a reellement paye POUR CE listing precis --
-- different de saas_concepts (reserve a qui a paye l'acces general).
create policy "lecture plan de comm reservee aux acheteurs"
  on saas_comm_plans for select
  to authenticated
  using (
    exists (
      select 1 from comm_plan_purchases cp
      where cp.user_id = auth.uid()
        and cp.slug = saas_comm_plans.slug
        and cp.paid_at is not null
    )
  );
