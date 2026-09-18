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
  let skippedNotOnSale = 0;
  let pages = 0;
  let totalAvailable: number | null = null;
  const errors: Array<{ slug: unknown; message: string }> = [];

  // La vraie pagination TrustMRR est page/limit/hasMore (confirmée sur une
  // vraie réponse : meta.total = 10653 startups au total), pas un
  // next_page_url comme d'abord supposé sans preuve. MAX_PAGES reste
  // volontairement bas : à 10 req/min (palier standard), parcourir tout le
  // catalogue prendrait ~18h et timeoutera bien avant dans un seul appel
  // de fonction — et surtout, synchroniser TOUT le catalogue sans filtre
  // (Gumroad, Stan...) n'a pas de sens produit pour une base de "SaaS à
  // racheter". Cette fonction ne resynchronise aujourd'hui que le haut du
  // classement (page 1 à MAX_PAGES) à chaque exécution, pas un crawl
  // complet et progressif — à revoir avec un vrai critère de filtre
  // (onSale, plage de MRR ?) avant d'aller plus loin.
  const MAX_PAGES = 10;
  const PAGE_LIMIT = 25;
  let page = 1;

  while (page <= MAX_PAGES) {
    pages += 1;
    const url = `${TRUSTMRR_BASE_URL}/startups?page=${page}&limit=${PAGE_LIMIT}`;
    let res: Response;
    try {
      res = await fetch(url, { headers: { Authorization: `Bearer ${trustmrrKey}` } });
    } catch (err) {
      console.error("[sync-trustmrr] appel réseau échoué :", err);
      break;
    }

    if (!res.ok) {
      console.error("[sync-trustmrr] appel API échoué :", res.status, await res.text());
      break;
    }

    const body = await res.json();
    const items: Record<string, unknown>[] = Array.isArray(body.data)
      ? body.data
      : body.data
      ? [body.data]
      : [];

    const meta = (body.meta as Record<string, unknown> | undefined) ?? {};
    if (typeof meta["total"] === "number") totalAvailable = meta["total"];

    for (const item of items) {
      const slug = item["slug"];
      if (typeof slug !== "string" || !slug) {
        failed += 1;
        errors.push({ slug: slug ?? null, message: "slug manquant ou invalide" });
        continue;
      }
      // Filtre produit minimal mais réel : ColdTrend vend des SaaS "à
      // racheter", pas un classement de toutes les entreprises suivies par
      // TrustMRR (Gumroad, Stan... ne sont pas à vendre). onSale est un
      // booléen explicite de la donnée elle-même, pas un seuil de MRR
      // arbitraire inventé ici.
      if (item["onSale"] !== true) {
        skippedNotOnSale += 1;
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

    if (meta["hasMore"] !== true) break;
    page += 1;
  }

  return json({
    synced,
    failed,
    skippedNotOnSale,
    pages,
    totalAvailable,
    note: "Synchronise seulement le haut du classement (page 1 a MAX_PAGES), filtre sur onSale=true -- pas un crawl complet du catalogue, voir commentaire dans le code."
  });
});
