// Tests du module du dashboard (scripts/dashboard-plan.js).
// Lancer : node --test scripts/dashboard-plan.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const ctx = { window: {} };
vm.runInNewContext(readFileSync(new URL("./goal-math.js", import.meta.url), "utf8"), ctx);
vm.runInNewContext(readFileSync(new URL("./dashboard-plan.js", import.meta.url), "utf8"), ctx);
const P = ctx.window.ColdTrendPlan;
// Objets créés dans le contexte vm : prototypes différents -> comparaison JSON.
const plain = (v) => JSON.parse(JSON.stringify(v));

test("semaines alignées sur le lundi (heure de Paris)", () => {
  // Dimanche 4 oct. 2026, 23 h 30 à Paris = 21 h 30 UTC.
  assert.equal(P.weekStart(Date.parse("2026-10-04T21:30:00Z")), "2026-09-28");
  // Lundi 5 oct. 2026, 0 h 30 à Paris = dimanche 22 h 30 UTC.
  assert.equal(P.weekStart(Date.parse("2026-10-04T22:30:00Z")), "2026-10-05");
  assert.equal(P.weekIndex(Date.parse("2026-10-01T10:00:00Z"), Date.parse("2026-10-14T10:00:00Z")), 2);
  assert.equal(P.monthStart(Date.parse("2026-10-14T10:00:00Z")), "2026-10-01");
});

test("programme : 3 missions par semaine, titres de 10 mots maximum", () => {
  for (let w = 0; w < 8; w += 1) {
    const plan = P.weekPlan(w, { temps: "low", objectif: 5000, delai: 4, secteur: ["b2c"] });
    assert.equal(plan.missions.length, 3);
    for (const m of plan.missions) assert.ok(m.title.split(/\s+/).length <= 10, m.title);
  }
  assert.match(P.weekPlan(1, { temps: "high" }).missions[0].title, /7 vidéos/);
  assert.match(P.weekPlan(9, { temps: "mid", objectif: 5000, delai: 4, secteur: ["b2c"] }).missions[1].title, /^Vise \d+ nouveaux? clients?/);
});

test("prochaine action unique", () => {
  const missions = P.weekPlan(0, {}).missions;
  assert.equal(P.nextAction(missions, []).key, "pitch");
  assert.equal(P.nextAction(missions, ["pitch"]).key, "ask5");
  assert.equal(P.nextAction(missions, ["pitch", "ask5", "video1"]), null);
});

test("série de jours actifs : pas perdue avant minuit", () => {
  assert.deepEqual(plain(P.activeStreak(["2026-10-12", "2026-10-13", "2026-10-14"], "2026-10-14")), { days: 3, activeToday: true });
  assert.deepEqual(plain(P.activeStreak(["2026-10-12", "2026-10-13"], "2026-10-14")), { days: 2, activeToday: false });
  assert.deepEqual(plain(P.activeStreak(["2026-10-10"], "2026-10-14")), { days: 0, activeToday: false });
});

test("jalons : uniquement sur des montants déclarés, franchissements détectés", () => {
  assert.deepEqual(plain(P.milestones(1000).map((m) => m.amount)), [1, 100, 250, 500, 1000]);
  assert.deepEqual(plain(P.crossedMilestones(0, 300, 1000).map((m) => m.key)), ["first_euro", "hundred", "quarter"]);
  assert.deepEqual(plain(P.crossedMilestones(300, 300, 1000)), []);
  assert.deepEqual(plain(P.milestones(0).map((m) => m.key)), ["first_euro", "hundred"]);
});
