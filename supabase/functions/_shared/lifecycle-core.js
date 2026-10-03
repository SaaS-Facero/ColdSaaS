// ---------------------------------------------------------------------------
// ColdTrend — cœur déterministe du lifecycle (aucun accès réseau ni base).
//
// Importé par supabase/functions/lifecycle-dispatch (Deno) et testé sous Node
// (scripts/lifecycle-core.test.mjs). Toute décision « qui reçoit quoi, et
// quand » est ici, en fonctions pures : mêmes entrées -> mêmes sorties.
//
// Séquences (priorité décroissante) :
//   payment_failed   transactionnel : lien de mise à jour de la carte. Pas de
//                    consentement marketing requis, pas de groupe témoin,
//                    hors plafond 24 h. Bloqué seulement par une adresse
//                    supprimée (bounce dur, plainte).
//   checkout_abandon checkout ouvert, pas payé : 1 email à +30 min.
//   result_unpaid    résultat vu, pas payé : 4 emails, cadence fixée par le
//                    score d'intention.
//   quiz_abandon     quiz arrêté à l'écran N (compte existant) : 1 email.
// Marketing = consentement (marketing_opt_in) + non désinscrit + adresse
// valide + pas encore payé + au plus 1 email marketing par 24 h + groupe
// témoin exclu.
// ---------------------------------------------------------------------------

export const HOUR = 3600 * 1000;
export const TOTAL_SCREENS = 23; // = TOTAL_QUESTIONS (scripts/build.mjs)
export const PARIS_TZ = "Europe/Paris";
export const DEFAULT_SEND_HOUR = 18;
export const QUIET_START = 22; // pas d'envoi entre 22 h et 8 h (heure de Paris)
export const QUIET_END = 8;
export const MARKETING_CAP_MS = 24 * HOUR;

// ---- Groupe témoin ----------------------------------------------------------
// Hachage FNV-1a stable de l'id : la même personne reste toujours dans le
// même groupe, sans stockage.
export function holdoutBucket(userId) {
  let h = 0x811c9dc5;
  const s = String(userId);
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h % 100;
}

export function isHoldout(userId, percent) {
  return holdoutBucket(userId) < percent;
}

// ---- Score d'intention (0-100) ----------------------------------------------
// Progression du quiz (jusqu'à 20) + signaux d'achat (résultat 25, offres
// 20, checkout 30, clic email récent 10), puis atténuation selon
// l'ancienneté de la dernière activité. Il fixe la cadence, jamais le
// contenu d'un email.
export function intentScore({ funnelLastStep = 0, events = [], lastActivityAt = null, now }) {
  const has = (type) => events.some((e) => e.type === type);
  let score = Math.min(20, (Math.max(0, funnelLastStep) / TOTAL_SCREENS) * 20);
  if (has("result_viewed")) score += 25;
  if (has("offers_viewed")) score += 20;
  if (has("checkout_opened")) score += 30;
  if (events.some((e) => e.type === "email_click" && now - Date.parse(e.created_at) <= 7 * 24 * HOUR)) score += 10;

  const times = events.map((e) => Date.parse(e.created_at)).filter((t) => !Number.isNaN(t));
  if (lastActivityAt) times.push(Date.parse(lastActivityAt));
  const last = times.length ? Math.max(...times) : now;
  const age = now - last;
  const factor = age <= 24 * HOUR ? 1 : age <= 72 * HOUR ? 0.8 : age <= 7 * 24 * HOUR ? 0.6 : 0.4;
  return Math.max(0, Math.min(100, Math.round(score * factor)));
}

// Délais (en heures après « résultat vu ») des 4 emails result_unpaid.
// Intention haute : rythme du brief (+1 h, +24 h, +72 h, +7 j) ; plus basse :
// on espace, sans jamais ajouter d'email.
export function resultCadence(score) {
  if (score >= 70) return [1, 24, 72, 168];
  if (score >= 40) return [1, 36, 96, 192];
  return [3, 48, 120, 240];
}

// ---- Heure d'envoi ----------------------------------------------------------
// formatToParts : en fr-FR, format() renvoie « 21 h », illisible par Number().
const PARIS_HOUR_FORMAT = new Intl.DateTimeFormat("en-GB", { timeZone: PARIS_TZ, hour: "2-digit", hourCycle: "h23" });

export function parisHour(ms) {
  const part = PARIS_HOUR_FORMAT.formatToParts(new Date(ms)).find((p) => p.type === "hour");
  return Number(part ? part.value : 0) % 24;
}

// Heure habituelle d'activité = heure (Paris) la plus fréquente parmi les
// événements ; égalité -> la plus tardive ; aucun événement -> 18 h.
// Ramenée dans la plage autorisée (8 h - 21 h).
export function preferredHour(timestamps) {
  const counts = new Array(24).fill(0);
  for (const t of timestamps) {
    const ms = typeof t === "number" ? t : Date.parse(t);
    if (!Number.isNaN(ms)) counts[parisHour(ms)] += 1;
  }
  let best = -1;
  let bestCount = 0;
  for (let h = 0; h < 24; h += 1) {
    if (counts[h] > 0 && counts[h] >= bestCount) {
      best = h;
      bestCount = counts[h];
    }
  }
  if (best === -1) return DEFAULT_SEND_HOUR;
  return Math.min(QUIET_START - 1, Math.max(QUIET_END, best));
}

function inQuietHours(hour) {
  return hour >= QUIET_START || hour < QUIET_END;
}

// "hot"       : dès que dû, hors heures calmes (+30 min checkout, +1 h résultat,
//               paiement échoué).
// "scheduled" : à l'heure habituelle (±1 h) ; si l'email a déjà 24 h de
//               retard sur son échéance, n'importe quelle heure hors heures
//               calmes (on ne repousse jamais indéfiniment).
export function canSendNow({ kind, now, dueAt, preferred }) {
  const hour = parisHour(now);
  if (inQuietHours(hour)) return false;
  if (kind === "hot") return true;
  const diff = Math.min(Math.abs(hour - preferred), 24 - Math.abs(hour - preferred));
  if (diff <= 1) return true;
  return now - dueAt >= 24 * HOUR;
}

// ---- Choix du prochain email --------------------------------------------------
// state = {
//   now, userId, holdoutPercent,
//   profile: { paid, optIn, unsubscribed, suppressed, funnelLastStep, updatedAt },
//   events:  [{ id, type, created_at, amount_cents, metadata }],
//   sends:   [{ sequence, step, status, idempotency_key, created_at }],
// }
// Renvoie { sequence, step, key, kind, dueAt, score, holdout, transactional,
// event } ou null. « holdout: true » = à journaliser sans envoyer.
export function nextEmail(state) {
  const { now, userId, profile } = state;
  const events = [...(state.events || [])].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
  const sends = state.sends || [];
  const sentKeys = new Set(sends.map((s) => s.idempotency_key));
  if (profile.suppressed) return null;

  const at = (e) => Date.parse(e.created_at);
  const lastOf = (type) => [...events].reverse().find((e) => e.type === type) || null;
  const paidAfter = (t) => events.some((e) => e.type === "payment_succeeded" && at(e) >= t);
  const score = intentScore({ funnelLastStep: profile.funnelLastStep, events, lastActivityAt: profile.updatedAt, now });

  // 1. Paiement échoué (transactionnel) : une fois par échec.
  const failed = lastOf("payment_failed");
  if (failed && !paidAfter(at(failed)) && now - at(failed) <= 7 * 24 * HOUR) {
    const key = `${userId}:payment_failed:1:${failed.id}`;
    if (!sentKeys.has(key)) {
      return { sequence: "payment_failed", step: 1, key, kind: "hot", dueAt: at(failed), score, holdout: false, transactional: true, event: failed };
    }
  }

  // Au-delà : marketing uniquement.
  if (!profile.optIn || profile.unsubscribed || profile.paid) return null;
  const lastMarketing = sends
    .filter((s) => s.sequence !== "payment_failed" && (s.status === "sent" || s.status === "test"))
    .map((s) => Date.parse(s.created_at))
    .sort((a, b) => b - a)[0];
  if (lastMarketing && now - lastMarketing < MARKETING_CAP_MS) return null;

  const holdout = isHoldout(userId, state.holdoutPercent ?? 10);
  const inHoldoutFor = (sequence) => sends.some((s) => s.sequence === sequence && s.status === "holdout");

  // 2. Checkout ouvert, pas payé : +30 min (checkout de moins de 48 h).
  const checkout = lastOf("checkout_opened");
  if (checkout && !paidAfter(at(checkout))) {
    const dueAt = at(checkout) + 30 * 60 * 1000;
    const key = `${userId}:checkout_abandon:1:${checkout.id}`;
    if (now >= dueAt && now - at(checkout) <= 48 * HOUR && !sentKeys.has(key) && !inHoldoutFor("checkout_abandon")) {
      return { sequence: "checkout_abandon", step: 1, key, kind: "hot", dueAt, score, holdout, transactional: false, event: checkout };
    }
  }

  // 3. Résultat vu, pas payé : 4 emails, un angle chacun.
  const result = events.find((e) => e.type === "result_viewed");
  if (result && !inHoldoutFor("result_unpaid")) {
    const delays = resultCadence(score);
    for (let step = 1; step <= 4; step += 1) {
      const key = `${userId}:result_unpaid:${step}`;
      if (sentKeys.has(key)) continue;
      const dueAt = at(result) + delays[step - 1] * HOUR;
      if (now < dueAt) return null; // étape suivante pas encore due
      return { sequence: "result_unpaid", step, key, kind: step === 1 ? "hot" : "scheduled", dueAt, score, holdout, transactional: false, event: result };
    }
    return null; // séquence terminée (email de rupture envoyé)
  }

  // 4. Quiz arrêté à l'écran N (sans résultat), inactif depuis 24 h.
  const stoppedAt = profile.funnelLastStep || 0;
  if (!result && stoppedAt > 0 && stoppedAt < TOTAL_SCREENS && profile.updatedAt) {
    const dueAt = Date.parse(profile.updatedAt) + 24 * HOUR;
    const key = `${userId}:quiz_abandon:1`;
    if (now >= dueAt && !sentKeys.has(key) && !inHoldoutFor("quiz_abandon")) {
      return { sequence: "quiz_abandon", step: 1, key, kind: "scheduled", dueAt, score, holdout, transactional: false, event: null };
    }
  }
  return null;
}

// ---- Attribution des euros récupérés -------------------------------------------
// Dernier email réellement envoyé (status "sent") dans les 7 jours avant le
// paiement : last touch. Renvoie l'envoi crédité ou null.
export function attributePayment(paymentAt, sends) {
  const window = 7 * 24 * HOUR;
  let best = null;
  for (const s of sends) {
    if (s.status !== "sent") continue;
    const t = Date.parse(s.created_at);
    if (t <= paymentAt && paymentAt - t <= window && (!best || t > Date.parse(best.created_at))) best = s;
  }
  return best;
}
