// ---------------------------------------------------------------------------
// ColdTrend — envoi des emails de lifecycle (Resend) + jetons signés.
//
// - Idempotency-Key : la clé unique de l'envoi (user:séquence:étape...) est
//   transmise à Resend ; un renvoi accidentel dans les 24 h est ignoré par
//   Resend, et la contrainte unique de lifecycle_sends bloque le reste.
// - List-Unsubscribe + List-Unsubscribe-Post (RFC 8058, exigés par Gmail et
//   Yahoo pour les envois en volume) : désinscription en 1 clic depuis la
//   messagerie, sans ouvrir de page. Absent des emails transactionnels.
// - Tags Resend (user_id, sequence) : relus par resend-webhook pour
//   supprimer une adresse après bounce dur ou plainte.
// ---------------------------------------------------------------------------

export const SITE_URL = "https://www.coldtrend.com";
export const FUNCTIONS_URL = `${Deno.env.get("SUPABASE_URL")}/functions/v1`;

function b64url(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function hmac(secret: string, data: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64url(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data))));
}

// Même format que admin-send-campaign / unsubscribe : "<userId>.<hmac>".
export async function signUnsubscribeToken(userId: string) {
  const secret = Deno.env.get("UNSUB_SECRET");
  if (!secret) throw new Error("UNSUB_SECRET manquant");
  return `${userId}.${await hmac(secret, userId)}`;
}

// Lien d'email -> lifecycle-link, qui ouvre une session (lien magique
// Supabase créé AU CLIC, donc jamais expiré dans la boîte de réception)
// puis l'écran exact. Valide 14 jours.
export type LinkPayload = { u: string; d: "result" | "quiz" | "account"; k: string; e: number };

export async function signLinkToken(payload: Omit<LinkPayload, "e">, ttlDays = 14) {
  const secret = Deno.env.get("LIFECYCLE_LINK_SECRET");
  if (!secret) throw new Error("LIFECYCLE_LINK_SECRET manquant");
  const full: LinkPayload = { ...payload, e: Date.now() + ttlDays * 24 * 3600 * 1000 };
  const body = b64url(new TextEncoder().encode(JSON.stringify(full)));
  return `${body}.${await hmac(secret, body)}`;
}

export async function verifyLinkToken(token: string): Promise<LinkPayload | null> {
  const secret = Deno.env.get("LIFECYCLE_LINK_SECRET");
  if (!secret) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig || (await hmac(secret, body)) !== sig) return null;
  try {
    const json = atob(body.replace(/-/g, "+").replace(/_/g, "/"));
    const payload = JSON.parse(new TextDecoder().decode(Uint8Array.from(json, (c) => c.charCodeAt(0)))) as LinkPayload;
    if (!payload.u || !payload.d || payload.e < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export async function buildLinks(userId: string, destination: LinkPayload["d"], sendKey: string, transactional: boolean) {
  const linkToken = await signLinkToken({ u: userId, d: destination, k: sendKey });
  const ctaUrl = `${FUNCTIONS_URL}/lifecycle-link?t=${encodeURIComponent(linkToken)}`;
  if (transactional) return { ctaUrl, unsubscribeUrl: null, oneClickUrl: null };
  const unsubToken = await signUnsubscribeToken(userId);
  return {
    ctaUrl,
    unsubscribeUrl: `${SITE_URL}/desabonnement?token=${encodeURIComponent(unsubToken)}`,
    oneClickUrl: `${FUNCTIONS_URL}/unsubscribe?token=${encodeURIComponent(unsubToken)}`,
  };
}

export type SendInput = {
  from: string;
  replyTo: string;
  to: string;
  subject: string;
  text: string;
  html: string;
  idempotencyKey: string;
  oneClickUrl: string | null;
  tags: Record<string, string>;
};

export async function sendWithResend(input: SendInput): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) return { ok: false, error: "RESEND_API_KEY manquante" };
  const headers: Record<string, string> = {};
  if (input.oneClickUrl) {
    headers["List-Unsubscribe"] = `<${input.oneClickUrl}>`;
    headers["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click";
  }
  // Valeurs de tags Resend : lettres, chiffres, _ et - uniquement.
  const tags = Object.entries(input.tags).map(([name, value]) => ({ name, value: String(value).replace(/[^A-Za-z0-9_-]/g, "_") }));
  let res: Response;
  try {
    res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": input.idempotencyKey.slice(0, 256),
      },
      body: JSON.stringify({
        from: input.from,
        to: input.to,
        reply_to: input.replyTo,
        subject: input.subject,
        text: input.text,
        html: input.html,
        headers,
        tags,
      }),
    });
  } catch (err) {
    return { ok: false, error: `réseau : ${err}` };
  }
  if (!res.ok) return { ok: false, error: `${res.status} ${(await res.text()).slice(0, 300)}` };
  const body = await res.json();
  return { ok: true, id: String(body.id || "") };
}
