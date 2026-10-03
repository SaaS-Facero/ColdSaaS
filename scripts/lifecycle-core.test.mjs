// Tests du cœur du lifecycle (supabase/functions/_shared/lifecycle-core.js).
// Lancer : node --test scripts/lifecycle-core.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  HOUR,
  isHoldout,
  holdoutBucket,
  intentScore,
  resultCadence,
  preferredHour,
  canSendNow,
  nextEmail,
  attributePayment
} from "../supabase/functions/_shared/lifecycle-core.js";

// 2026-10-05 à 18 h 00 heure de Paris (UTC+2).
const NOW = Date.parse("2026-10-05T16:00:00Z");
const ago = (h) => new Date(NOW - h * HOUR).toISOString();
const base = (over = {}) => ({
  now: NOW,
  userId: "user-a",
  holdoutPercent: 0,
  profile: { paid: false, optIn: true, unsubscribed: false, suppressed: false, funnelLastStep: 23, updatedAt: ago(2) },
  events: [],
  sends: [],
  ...over
});

test("groupe témoin : stable et proche de 10 %", () => {
  assert.equal(isHoldout("abc", 10), isHoldout("abc", 10));
  let n = 0;
  for (let i = 0; i < 5000; i += 1) if (holdoutBucket(`user-${i}`) < 10) n += 1;
  assert.ok(n > 400 && n < 600, `témoin ${n}/5000`);
});

test("score d'intention : borné, croissant avec les signaux, atténué avec le temps", () => {
  const fresh = [{ type: "result_viewed", created_at: ago(1) }];
  const hot = [...fresh, { type: "offers_viewed", created_at: ago(1) }, { type: "checkout_opened", created_at: ago(1) }];
  const s1 = intentScore({ funnelLastStep: 23, events: fresh, now: NOW });
  const s2 = intentScore({ funnelLastStep: 23, events: hot, now: NOW });
  assert.ok(s2 > s1 && s2 <= 100);
  const old = intentScore({ funnelLastStep: 23, events: hot.map((e) => ({ ...e, created_at: ago(200) })), now: NOW });
  assert.ok(old < s2);
  assert.deepEqual(resultCadence(80), [1, 24, 72, 168]);
});

test("heure habituelle : mode des activités, bornée à 8 h - 21 h", () => {
  // 3 activités à 21 h Paris (19 h UTC), 1 à 10 h.
  const t = ["2026-10-01T19:05:00Z", "2026-10-02T19:40:00Z", "2026-10-03T19:10:00Z", "2026-10-03T08:00:00Z"];
  assert.equal(preferredHour(t), 21);
  assert.equal(preferredHour([]), 18);
  assert.equal(preferredHour(["2026-10-01T01:00:00Z"]), 8); // 3 h du matin -> 8 h
});

test("heures calmes et heure habituelle", () => {
  const night = Date.parse("2026-10-05T21:30:00Z"); // 23 h 30 Paris
  assert.equal(canSendNow({ kind: "hot", now: night, dueAt: night, preferred: 18 }), false);
  assert.equal(canSendNow({ kind: "scheduled", now: NOW, dueAt: NOW, preferred: 18 }), true);
  assert.equal(canSendNow({ kind: "scheduled", now: NOW, dueAt: NOW, preferred: 10 }), false);
  assert.equal(canSendNow({ kind: "scheduled", now: NOW, dueAt: NOW - 25 * HOUR, preferred: 10 }), true);
});

test("résultat non payé : +1 h, puis rien avant l'échéance suivante", () => {
  const events = [{ id: 1, type: "result_viewed", created_at: ago(1.5) }];
  const n1 = nextEmail(base({ events }));
  assert.equal(n1.sequence, "result_unpaid");
  assert.equal(n1.step, 1);
  const sends = [{ sequence: "result_unpaid", step: 1, status: "sent", idempotency_key: "user-a:result_unpaid:1", created_at: ago(0.5) }];
  assert.equal(nextEmail(base({ events, sends })), null);
});

test("plafond : jamais 2 emails marketing en 24 h", () => {
  const events = [{ id: 1, type: "result_viewed", created_at: ago(30) }];
  const sends = [{ sequence: "result_unpaid", step: 1, status: "sent", idempotency_key: "user-a:result_unpaid:1", created_at: ago(10) }];
  assert.equal(nextEmail(base({ events, sends })), null);
  const later = { ...base({ events, sends }), now: NOW + 15 * HOUR };
  assert.equal(nextEmail(later).step, 2);
});

test("checkout ouvert : +30 min, prioritaire sur la séquence résultat", () => {
  const events = [
    { id: 1, type: "result_viewed", created_at: ago(3) },
    { id: 2, type: "checkout_opened", created_at: ago(0.6) }
  ];
  const n = nextEmail(base({ events }));
  assert.equal(n.sequence, "checkout_abandon");
  assert.equal(n.kind, "hot");
});

test("sans consentement, désinscrit ou payé : aucun marketing ; l'échec de paiement passe", () => {
  const events = [{ id: 1, type: "result_viewed", created_at: ago(2) }];
  assert.equal(nextEmail(base({ events, profile: { ...base().profile, optIn: false } })), null);
  assert.equal(nextEmail(base({ events, profile: { ...base().profile, unsubscribed: true } })), null);
  assert.equal(nextEmail(base({ events, profile: { ...base().profile, paid: true } })), null);
  const failed = [{ id: 9, type: "payment_failed", created_at: ago(0.2), metadata: {} }];
  const n = nextEmail(base({ events: failed, profile: { ...base().profile, optIn: false, paid: true } }));
  assert.equal(n.sequence, "payment_failed");
  assert.equal(n.transactional, true);
  // Adresse supprimée (bounce/plainte) : plus rien du tout.
  assert.equal(nextEmail(base({ events: failed, profile: { ...base().profile, suppressed: true } })), null);
});

test("groupe témoin : journalisé une fois, puis plus rien", () => {
  const events = [{ id: 1, type: "result_viewed", created_at: ago(2) }];
  const n = nextEmail(base({ events, holdoutPercent: 100 }));
  assert.equal(n.holdout, true);
  const sends = [{ sequence: "result_unpaid", step: 1, status: "holdout", idempotency_key: "user-a:result_unpaid:1", created_at: ago(1) }];
  assert.equal(nextEmail({ ...base({ events, sends, holdoutPercent: 100 }), now: NOW + 100 * HOUR }), null);
});

test("attribution : dernier email envoyé dans les 7 jours", () => {
  const sends = [
    { id: 1, status: "sent", created_at: ago(100) },
    { id: 2, status: "sent", created_at: ago(5) },
    { id: 3, status: "test", created_at: ago(1) }
  ];
  assert.equal(attributePayment(NOW, sends).id, 2);
  assert.equal(attributePayment(NOW, [{ id: 4, status: "sent", created_at: ago(200) }]), null);
});
