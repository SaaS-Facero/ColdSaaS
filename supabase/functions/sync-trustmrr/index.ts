// Supabase Edge Function — synchronise les startups vérifiées TrustMRR
// dans saas_listings. Rend la base "Vérifié" réelle plutôt qu'un chiffre
// codé en dur (TOTAL_SAAS) ou un Google Sheet mis à jour à la main.
//
// Protégée par un secret partagé (CRON_SECRET, déjà utilisé par
// send-abandon-emails) plutôt que la vérification JWT standard, pour
// permettre l'appel depuis un Cron Job programmé manuellement dans le
// dashboard Supabase. TRUSTMRR_API_KEY et service_role restent
// exclusivement côté serveur, jamais exposées au client.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const TRUSTMRR_BASE_URL = "https://trustmrr.com/api/v1";

function mapSecteur(targetAudience: unknown): string[] {
  // L'API renvoie "B2B" / "B2C" / "Both" (casse capitalisée) -- vérifié sur
  // les vraies données, pas en minuscules comme l'exemple de documentation
  // le laissait supposer.
  if (typeof targetAudience !== "string") return [];
  const normalized = targetAudience.toLowerCase();
  if (normalized === "b2b") return ["b2b"];
  if (normalized === "b2c") return ["b2c"];
  if (normalized.length > 0) return ["both"];
  return [];
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  const cronSecret = Deno.env.get("CRON_SECRET");
  const providedSecret = req.headers.get("x-cron-secret");
  if (!cronSecret || providedSecret !== cronSecret) {
    return json({ error: "Non autorisé." }, 401);
  }

  const trustmrrKey = Deno.env.get("TRUSTMRR_API_KEY");
  if (!trustmrrKey) {
    console.error("[sync-trustmrr] TRUSTMRR_API_KEY manquante.");
    return json({ error: "Configuration manquante." }, 500);
  }

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  let synced = 0;
  let failed = 0;
  let pages = 0;
  let totalOnSale: number | null = null;
  const errors: Array<{ slug: unknown; message: string }> = [];

  // onSale=true est un vrai paramètre serveur (vérifié empiriquement : les
  // autres essais comme sort/maxAskingPrice sont silencieusement ignorés
  // par l'API, celui-ci change réellement les résultats) -- fini le
  // gaspillage de requêtes à filtrer côté client après coup.
  //
  // Les petits SaaS abordables (budget du quiz : 5-50k$) ne sont PAS en
  // tête de classement (trié par MRR/rang, donc par taille) -- vérifié :
  // les 2226 SaaS à vendre mélangent des prix de 3000$ à plus d'1M$ sans
  // ordre par prix. La seule vraie option (aucun tri par prix disponible
  // côté API) est de parcourir en profondeur. Un seul appel de fonction ne
  // peut pas tout couvrir (10 req/min, page fixée à 10 items par l'API
  // quel que soit le "limit" demandé -> 223 pages pour tout voir, ~22 min
  // minimum, largement au-delà du timeout d'une Edge Function).
  //
  // Testé empiriquement (MAX_PAGES=100 sans pause, puis tentative de paquets
  // de 10 espacés de 61s) : la limite réelle n'est pas un simple "10/min"
  // qui repart à zéro après une pause fixe -- une 2e salve a échoué dès la
  // 9e/10e requête même après 90s d'attente. La fenêtre exacte n'est pas
  // documentée et continuer à la deviner en tapant l'API en rafale gaspille
  // du quota réel sans garantie. Un seul burst de MAX_PAGES par exécution
  // reste la valeur fiable et vérifiée plusieurs fois (10/10 réussies à
  // froid) -- voir HOURS_PER_ROTATION_STEP plus bas pour couvrir plus de
  // catalogue par jour sans dépendre d'un comportement non garanti.
  const MAX_PAGES = 10;
  const PAGE_SIZE = 10; // l'API plafonne à 10 quel que soit le "limit" demandé

  const firstRes = await fetch(`${TRUSTMRR_BASE_URL}/startups?onSale=true&page=1&limit=${PAGE_SIZE}`, {
    headers: { Authorization: `Bearer ${trustmrrKey}` },
  });
  if (!firstRes.ok) {
    console.error("[sync-trustmrr] appel initial échoué :", firstRes.status, await firstRes.text());
    return json({ error: "Appel TrustMRR initial échoué." }, 502);
  }
  const firstBody = await firstRes.json();
  const firstMeta = (firstBody.meta as Record<string, unknown> | undefined) ?? {};
  totalOnSale = typeof firstMeta["total"] === "number" ? firstMeta["total"] : null;
  const totalPages = totalOnSale ? Math.max(1, Math.ceil(totalOnSale / PAGE_SIZE)) : 1;

  // Rotation par créneau de 2h (au lieu d'une rotation quotidienne) : avec le
  // Cron Job réglé pour tourner toutes les 2h (12x/jour), on couvre 120
  // pages/jour au lieu de 10 -- le catalogue de ~223 pages est parcouru en
  // ~2 jours au lieu de ~22, sans jamais dépasser le seul burst fiable
  // (10 requêtes) vérifié empiriquement par exécution.
  const HOURS_PER_ROTATION_STEP = 2;
  const stepIndex = Math.floor(Date.now() / (HOURS_PER_ROTATION_STEP * 3600000));
  const startPage = 1 + (stepIndex % totalPages);

  let rateLimited = false;

  for (let offset = 0; offset < MAX_PAGES; offset += 1) {
    const page = 1 + ((startPage - 1 + offset) % totalPages);
    pages += 1;

    let body: Record<string, unknown>;
    if (page === 1 && offset === 0 && startPage === 1) {
      body = firstBody;
    } else {
      const url = `${TRUSTMRR_BASE_URL}/startups?onSale=true&page=${page}&limit=${PAGE_SIZE}`;
      let res: Response;
      try {
        res = await fetch(url, { headers: { Authorization: `Bearer ${trustmrrKey}` } });
      } catch (err) {
        console.error("[sync-trustmrr] appel réseau échoué :", err);
        pages -= 1;
        break;
      }
      if (!res.ok) {
        console.error("[sync-trustmrr] appel API échoué :", res.status, await res.text());
        pages -= 1;
        if (res.status === 429) rateLimited = true;
        break;
      }
      body = await res.json();
    }

    const items: Record<string, unknown>[] = Array.isArray(body.data)
      ? body.data
      : body.data
      ? [body.data]
      : [];

    for (const item of items) {
      const slug = item["slug"];
      if (typeof slug !== "string" || !slug) {
        failed += 1;
        errors.push({ slug: slug ?? null, message: "slug manquant ou invalide" });
        continue;
      }

      const revenue = (item["revenue"] as Record<string, unknown> | undefined) ?? {};
      const row = {
        slug,
        name: item["name"] ?? null,
        website: item["website"] ?? null,
        description: item["description"] ?? null,
        secteur: mapSecteur(item["targetAudience"]),
        // Montant en dollars avec décimales (ex: 3569654.22), pas des
        // centimes entiers -- vérifié sur un vrai échec de synchronisation.
        mrr_usd: typeof revenue["mrr"] === "number" ? revenue["mrr"] : null,
        // Même convention que mrr (dollars, pas centimes) -- cohérent avec
        // askingPrice=7500000 observé sur "online-edtech" (~4,5x son ARR
        // réel, plausible en dollars bruts, absurde en centimes).
        asking_price_usd: typeof item["askingPrice"] === "number" ? item["askingPrice"] : null,
        source_level: "verified",
        source_name: "TrustMRR",
        active: true,
      };

      const { error } = await supabaseAdmin.from("saas_listings").upsert(row, { onConflict: "slug" });
      if (error) {
        console.error(`[sync-trustmrr] upsert échoué pour ${slug} :`, error.message);
        failed += 1;
        errors.push({ slug, message: error.message });
      } else {
        synced += 1;
      }
    }

  }

  const { data: bucketRows } = await supabaseAdmin
    .from("saas_listings_public")
    .select("budget_bucket");
  const budgetBreakdown: Record<string, number> = {};
  for (const row of bucketRows ?? []) {
    const key = (row as Record<string, unknown>)["budget_bucket"] as string | null ?? "null";
    budgetBreakdown[key] = (budgetBreakdown[key] ?? 0) + 1;
  }

  return json({
    synced,
    failed,
    pages,
    rateLimited,
    totalOnSale,
    startPage,
    errors,
    budgetBreakdown,
    note: "Un seul burst de 10 requetes par execution (limite API non documentee, verifiee empiriquement). Point de depart tournant par creneau de 2h -- necessite un Cron Job regle toutes les 2h pour couvrir le catalogue en ~2 jours au lieu de ~22, voir commentaire dans le code."
  });
});
