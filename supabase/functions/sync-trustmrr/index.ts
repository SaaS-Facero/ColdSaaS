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
  if (targetAudience === "b2b") return ["b2b"];
  if (targetAudience === "b2c") return ["b2c"];
  if (typeof targetAudience === "string" && targetAudience.length > 0) return ["both"];
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
  let url: string | null = `${TRUSTMRR_BASE_URL}/startups`;

  while (url && pages < 50) {
    pages += 1;
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

    for (const item of items) {
      const slug = item["slug"];
      if (typeof slug !== "string" || !slug) {
        failed += 1;
        continue;
      }
      const revenue = (item["revenue"] as Record<string, unknown> | undefined) ?? {};
      const row = {
        slug,
        name: item["name"] ?? null,
        website: item["website"] ?? null,
        description: item["description"] ?? null,
        secteur: mapSecteur(item["targetAudience"]),
        mrr_cents: typeof revenue["mrr"] === "number" ? revenue["mrr"] : null,
        source_level: "verified",
        source_name: "TrustMRR",
        active: true,
      };

      const { error } = await supabaseAdmin.from("saas_listings").upsert(row, { onConflict: "slug" });
      if (error) {
        console.error(`[sync-trustmrr] upsert échoué pour ${slug} :`, error.message);
        failed += 1;
      } else {
        synced += 1;
      }
    }

    // Pagination défensive : le schéma exact de pagination de TrustMRR
    // n'a pas été confirmé au moment d'écrire cette fonction (seule la
    // réponse d'un item unique a été observée). On s'arrête proprement si
    // aucun indice de page suivante n'est trouvé plutôt que de deviner un
    // mauvais nom de champ et boucler dans le vide.
    const meta = (body.meta as Record<string, unknown> | undefined) ?? {};
    const next = meta["next_page_url"] ?? body["next_page_url"] ?? null;
    url = typeof next === "string" && next ? next : null;
  }

  return json({ synced, failed, pages });
});
