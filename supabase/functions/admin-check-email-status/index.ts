// Supabase Edge Function — vérifie le statut de livraison réel (Resend)
// des emails déjà envoyés depuis /admin, en lecture seule.
//
// Contexte : admin-send-campaign ne fait que confirmer l'ACCEPTATION de
// l'envoi par Resend (emailRes.ok), jamais la livraison réelle en boîte de
// réception -- un bounce ou un filtrage spam se produit de façon
// asynchrone, invisible à ce code. Cette fonction interroge
// GET /emails/{id} chez Resend pour chaque resend_email_id déjà stocké
// dans admin_email_sends et renvoie le vrai statut (delivered/bounced/
// complained/etc.), sans jamais renvoyer un email.
//
// Sécurité : même pattern que admin-send-campaign/admin-list-profiles --
// is_admin revérifié côté serveur avec le rôle service.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ORIGINS = new Set([
  "https://coldtrend.com",
  "https://www.coldtrend.com",
  "http://localhost:3000"
]);

function corsHeaders(origin: string | null) {
  const allowOrigin = origin && ALLOWED_ORIGINS.has(origin) ? origin : "https://coldtrend.com";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin"
  };
}

// Limite raisonnable -- une vérification manuelle depuis /admin, pas un
// polling automatique ni un historique complet à chaque clic.
const MAX_ROWS = 25;

Deno.serve(async (req) => {
  const headers = corsHeaders(req.headers.get("origin"));
  if (req.method === "OPTIONS") return new Response(null, { headers });

  function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
      status,
      headers: { ...headers, "Content-Type": "application/json" }
    });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Non authentifié." }, 401);

  const supabaseAsUser = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } }
  });
  const { data: userRes, error: userErr } = await supabaseAsUser.auth.getUser();
  if (userErr || !userRes.user) return json({ error: "Session invalide." }, 401);

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const { data: callerProfile, error: callerErr } = await supabaseAdmin
    .from("profiles")
    .select("is_admin")
    .eq("id", userRes.user.id)
    .single();
  if (callerErr || !callerProfile?.is_admin) return json({ error: "Accès refusé." }, 403);

  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  if (!resendApiKey) {
    console.error("[admin-check-email-status] RESEND_API_KEY manquant.");
    return json({ error: "Configuration manquante." }, 500);
  }

  let body: { templateId?: string } = {};
  try {
    body = await req.json();
  } catch {
    /* corps vide accepté -- pas de filtre par template */
  }

  let query = supabaseAdmin
    .from("admin_email_sends")
    .select("id, recipient_id, template_id, resend_email_id, sent_at")
    .not("resend_email_id", "is", null)
    .order("sent_at", { ascending: false })
    .limit(MAX_ROWS);
  if (body.templateId) query = query.eq("template_id", body.templateId);

  const { data: rows, error: rowsErr } = await query;
  if (rowsErr) {
    console.error("[admin-check-email-status] échec lecture admin_email_sends :", rowsErr.message);
    return json({ error: "Lecture de l'historique échouée." }, 500);
  }

  const results = await Promise.all(
    (rows ?? []).map(async (row) => {
      try {
        const res = await fetch(`https://api.resend.com/emails/${row.resend_email_id}`, {
          headers: { Authorization: `Bearer ${resendApiKey}` }
        });
        if (!res.ok) {
          return {
            recipientId: row.recipient_id,
            templateId: row.template_id,
            sentAt: row.sent_at,
            resendEmailId: row.resend_email_id,
            status: "introuvable_chez_resend",
            error: `HTTP ${res.status}`
          };
        }
        const data = await res.json();
        return {
          recipientId: row.recipient_id,
          templateId: row.template_id,
          sentAt: row.sent_at,
          resendEmailId: row.resend_email_id,
          // last_event reflète l'évènement Resend le plus récent connu
          // (queued/sent/delivered/delivery_delayed/bounced/complained) --
          // le seul champ qui dit ce qui s'est vraiment passé après
          // l'acceptation initiale.
          status: data.last_event ?? "statut_inconnu"
        };
      } catch (err) {
        console.error(`[admin-check-email-status] échec requête Resend pour ${row.resend_email_id} :`, err);
        return {
          recipientId: row.recipient_id,
          templateId: row.template_id,
          sentAt: row.sent_at,
          resendEmailId: row.resend_email_id,
          status: "erreur_requete",
          error: String(err)
        };
      }
    })
  );

  return json({ results });
});
