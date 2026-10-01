// Supabase Edge Function — audit gratuit d'un SaaS existant (écran 7b du
// quiz). Lit réellement la page publique, puis demande au LLM forces /
// défauts / axes d'amélioration fondés uniquement sur ce contenu.
//
// Public (appelé avant toute création de compte) -- donc :
// - anti-SSRF : http(s) seulement, aucune IP littérale, aucun nom interne,
//   redirections suivies à la main et revalidées à chaque saut ;
// - anti-abus : 3 analyses par IP et par heure (IP jamais stockée en clair,
//   SHA-256 salé), même URL resservie depuis le cache pendant 24h.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const OPENROUTER_MODEL = "anthropic/claude-sonnet-5";

const ALLOWED_ORIGINS = new Set(["https://coldtrend.com", "https://www.coldtrend.com", "http://localhost:3000"]);

const MAX_AUDITS_PER_HOUR = 3;
const CACHE_HOURS = 24;
const FETCH_TIMEOUT_MS = 8000;
const MAX_HTML_BYTES = 400_000;
const MAX_REDIRECTS = 3;
const MAX_TEXT_CHARS = 5000;

// Bloque une promesse de gain faite au fondateur -- pas la simple mention
// du prix ou de la garantie affichés sur son site, qui sont des faits
// légitimes à commenter dans un audit.
const FORBIDDEN_PATTERNS = [
  /tu (vas|pourras|pourrais) (gagner|générer|toucher)/i,
  /\bgagneras\b/i,
  /garanti(t|e|es|s)? (de|des|un|une) (revenus?|ventes?|résultats?|clients?)/i,
];

function corsHeaders(origin: string | null) {
  const allowOrigin = origin && ALLOWED_ORIGINS.has(origin) ? origin : "https://coldtrend.com";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
}

// Refuse tout ce qui pourrait viser le réseau interne : IP littérales (v4
// et v6), localhost, suffixes internes, noms sans point.
function isSafeUrl(raw: string): URL | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (url.username || url.password) return null;
  if (url.port && url.port !== "80" && url.port !== "443") return null;
  const host = url.hostname.toLowerCase();
  if (!host.includes(".")) return null;
  if (host.includes(":") || host.startsWith("[")) return null;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return null;
  if (/(^|\.)(localhost|local|internal|lan|home|corp|intranet)$/.test(host)) return null;
  return url;
}

async function sha256Hex(value: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function fetchPage(startUrl: URL): Promise<{ html: string; finalUrl: string }> {
  let current = startUrl;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(current.toString(), {
        redirect: "manual",
        signal: controller.signal,
        headers: { "User-Agent": "ColdTrendAudit/1.0 (+https://coldtrend.com)", Accept: "text/html" },
      });
    } finally {
      clearTimeout(timer);
    }

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) throw new Error("redirect_without_location");
      const next = isSafeUrl(new URL(location, current).toString());
      if (!next) throw new Error("unsafe_redirect");
      current = next;
      continue;
    }

    if (!res.ok) throw new Error("http_" + res.status);
    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("text/html")) throw new Error("not_html");

    const reader = res.body?.getReader();
    if (!reader) throw new Error("no_body");
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (total < MAX_HTML_BYTES) {
      const { done, value } = await reader.read();
      if (done || !value) break;
      chunks.push(value);
      total += value.length;
    }
    await reader.cancel().catch(() => {});
    const merged = new Uint8Array(Math.min(total, MAX_HTML_BYTES));
    let offset = 0;
    for (const chunk of chunks) {
      const slice = chunk.subarray(0, Math.max(0, merged.length - offset));
      merged.set(slice, offset);
      offset += slice.length;
      if (offset >= merged.length) break;
    }
    return { html: new TextDecoder().decode(merged), finalUrl: current.toString() };
  }
  throw new Error("too_many_redirects");
}

function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'");
}

function extractPageContent(html: string) {
  const pick = (re: RegExp) => {
    const m = html.match(re);
    return m ? decodeEntities(m[1].replace(/\s+/g, " ").trim()) : "";
  };
  const title = pick(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const description =
    pick(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i) ||
    pick(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']*)["']/i);
  const headings = Array.from(html.matchAll(/<h[12][^>]*>([\s\S]*?)<\/h[12]>/gi))
    .map((m) => decodeEntities(m[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()))
    .filter(Boolean)
    .slice(0, 12);
  const bodyText = decodeEntities(
    html
      .replace(/<(script|style|noscript|svg|template)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
  ).slice(0, MAX_TEXT_CHARS);
  return { title, description, headings, bodyText };
}

const SYSTEM_PROMPT = `Tu es un expert produit et conversion qui audite la page d'accueil d'un SaaS pour son fondateur.
Règles strictes :
- Base-toi UNIQUEMENT sur le contenu fourni. N'invente jamais une fonctionnalité, un chiffre, un client ou un prix absent du contenu.
- Jamais de chiffre de revenu, de projection de gain, ni le mot "garanti".
- Tutoiement, phrases courtes (20 mots maximum par point), ton direct et bienveillant, jamais condescendant.
- Si le contenu est trop pauvre (page vide, page de connexion, site en construction), dis-le honnêtement dans "resume" et limite les listes à ce que tu peux réellement constater.
Format de sortie : JSON strict, aucun texte hors JSON :
{"resume": "1-2 phrases sur ce que fait le SaaS et l'impression générale", "forces": ["...", "...", "..."], "defauts": ["...", "...", "..."], "axes": ["...", "...", "..."]}
"axes" = actions concrètes et prioritaires pour mieux convertir les visiteurs.`;

Deno.serve(async (req) => {
  const headers = corsHeaders(req.headers.get("origin"));
  if (req.method === "OPTIONS") return new Response(null, { headers });

  function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), { status, headers: { ...headers, "Content-Type": "application/json" } });
  }

  let body: { url?: string } = {};
  try {
    body = await req.json();
  } catch {
    return json({ error: "Requête invalide." }, 400);
  }
  const target = typeof body.url === "string" ? isSafeUrl(body.url.trim()) : null;
  if (!target) return json({ error: "Cette adresse ne peut pas être analysée." }, 400);
  const normalizedUrl = target.origin + target.pathname.replace(/\/$/, "");

  const salt = Deno.env.get("CRON_SECRET");
  const openRouterKey = Deno.env.get("OPENROUTER_API_KEY");
  if (!salt || !openRouterKey) {
    console.error("[analyze-site] CRON_SECRET ou OPENROUTER_API_KEY manquant.");
    return json({ error: "Analyse indisponible pour le moment." }, 500);
  }

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const cacheSince = new Date(Date.now() - CACHE_HOURS * 3600 * 1000).toISOString();
  const { data: cached } = await admin
    .from("site_audits")
    .select("result")
    .eq("url", normalizedUrl)
    .not("result", "is", null)
    .gte("created_at", cacheSince)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (cached?.result) return json({ ...cached.result, cached: true });

  const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "unknown";
  const ipHash = await sha256Hex(salt + ":" + ip);
  const hourAgo = new Date(Date.now() - 3600 * 1000).toISOString();
  const { count } = await admin
    .from("site_audits")
    .select("id", { count: "exact", head: true })
    .eq("ip_hash", ipHash)
    .gte("created_at", hourAgo);
  if ((count ?? 0) >= MAX_AUDITS_PER_HOUR) {
    return json({ error: "Tu as déjà lancé plusieurs analyses. Réessaie dans une heure." }, 429);
  }

  const { data: auditRow } = await admin
    .from("site_audits")
    .insert({ url: normalizedUrl, ip_hash: ipHash })
    .select("id")
    .single();

  let page: { html: string; finalUrl: string };
  try {
    page = await fetchPage(target);
  } catch (err) {
    console.warn("[analyze-site] lecture impossible :", normalizedUrl, String(err));
    return json({ error: "On n'a pas réussi à lire ce site. Vérifie l'adresse." }, 422);
  }

  const content = extractPageContent(page.html);
  if (!content.title && !content.bodyText) {
    return json({ error: "Cette page ne contient pas de texte lisible." }, 422);
  }

  const userPrompt = `URL : ${page.finalUrl}
Titre : ${content.title || "(aucun)"}
Meta description : ${content.description || "(aucune)"}
Titres H1/H2 : ${content.headings.join(" | ") || "(aucun)"}
Texte visible (extrait) :
${content.bodyText}`;

  let llmRes: Response;
  try {
    llmRes = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${openRouterKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: OPENROUTER_MODEL,
        max_tokens: 900,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
      }),
    });
  } catch (err) {
    console.error("[analyze-site] appel LLM échoué :", err);
    return json({ error: "Analyse indisponible pour le moment." }, 502);
  }
  if (!llmRes.ok) {
    console.error("[analyze-site] LLM a renvoyé une erreur :", llmRes.status, await llmRes.text());
    return json({ error: "Analyse indisponible pour le moment." }, 502);
  }

  const llmBody = await llmRes.json();
  const rawText = String(llmBody.choices?.[0]?.message?.content ?? "").trim();
  const jsonMatch = rawText.match(/\{[\s\S]*\}/);
  let parsed: { resume?: unknown; forces?: unknown; defauts?: unknown; axes?: unknown };
  try {
    parsed = JSON.parse(jsonMatch ? jsonMatch[0] : rawText);
  } catch {
    console.error("[analyze-site] JSON invalide :", rawText.slice(0, 400));
    return json({ error: "L'analyse a échoué, réessaie." }, 502);
  }

  const toList = (v: unknown) =>
    Array.isArray(v) ? v.filter((x) => typeof x === "string" && x.trim()).map((x) => (x as string).trim()).slice(0, 4) : [];
  const result = {
    resume: typeof parsed.resume === "string" ? parsed.resume.trim() : "",
    forces: toList(parsed.forces),
    defauts: toList(parsed.defauts),
    axes: toList(parsed.axes),
  };

  const fullText = [result.resume, ...result.forces, ...result.defauts, ...result.axes].join(" ");
  if (!result.resume || FORBIDDEN_PATTERNS.some((p) => p.test(fullText))) {
    console.error("[analyze-site] sortie rejetée :", fullText.slice(0, 400));
    return json({ error: "L'analyse a échoué, réessaie." }, 502);
  }

  if (auditRow?.id) await admin.from("site_audits").update({ result }).eq("id", auditRow.id);

  return json(result);
});
