// Tests du module de calcul de l'objectif (scripts/goal-math.js).
// Lancer : node --test scripts/goal-math.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const ctx = { window: {} };
vm.runInNewContext(readFileSync(new URL("./goal-math.js", import.meta.url), "utf8"), ctx);
const G = ctx.window.ColdTrendGoal;

test("slider non linéaire : bornes, coude à 5 000 €, aller-retour stable", () => {
  assert.equal(G.positionToValue(0), 0);
  assert.equal(G.positionToValue(600), 5000);
  assert.equal(G.positionToValue(1000), 50000);
  for (const v of [0, 500, 1000, 2500, 5000, 10000, 25000, 50000]) {
    assert.equal(G.positionToValue(G.valueToPosition(v)), v, `aller-retour ${v}`);
  }
  // Plus précis sous 5 000 € : 1 cran = moins de 10 €, au-delà ~110 €.
  assert.ok(G.positionToValue(301) - G.positionToValue(300) <= 50);
});

test("paliers", () => {
  assert.equal(G.tier(500).label, "Premiers euros");
  assert.equal(G.tier(5000).label, "Solide");
  assert.equal(G.tier(20000).label, "Ambitieux");
  assert.equal(G.tier(25000).label, "Très ambitieux");
});

test("prix moyen B2B / B2C et clients", () => {
  assert.equal(G.averagePrice(["b2c"]), 20);
  assert.equal(G.averagePrice(["b2b"]), 49);
  assert.equal(G.averagePrice(undefined), 20);
  assert.equal(G.clientsNeeded(25000, 20), 1250);
  assert.equal(G.clientsNeeded(0, 20), 0);
});

test("équivalences", () => {
  assert.equal(G.equivalence(300), "≈ 10 € de plus par jour");
  assert.equal(G.equivalence(1400), "≈ un SMIC");
  assert.equal(G.equivalence(2900), "≈ 2 SMIC");
  assert.equal(G.equivalence(0), "");
});

test("accompagnement déterministe et suggestion non imposée", () => {
  const easy = G.assess({ goal: 1000, months: 6, temps: "mid", secteur: ["b2c"] });
  assert.equal(easy.level, "realiste");
  assert.equal(easy.suggestion, null);
  const hard = G.assess({ goal: 25000, months: 1, temps: "mid", secteur: ["b2c"] });
  assert.equal(hard.level, "tres_ambitieux");
  assert.match(hard.message, /sacré défi avec 5-15h\/semaine/);
  assert.ok(hard.suggestion === null || hard.suggestion > 1);
  const none = G.assess({ goal: 25000, months: 0, temps: "mid" });
  assert.equal(none.level, null);
  // Même entrée -> même sortie.
  assert.deepEqual(G.assess({ goal: 8000, months: 3, temps: "low", secteur: ["b2b"] }), G.assess({ goal: 8000, months: 3, temps: "low", secteur: ["b2b"] }));
});

test("aucun texte ne promet un résultat", () => {
  for (const goal of [500, 5000, 25000, 50000]) for (let m = 1; m <= 6; m += 1) for (const t of ["low", "mid", "high"]) {
    const a = G.assess({ goal, months: m, temps: t, secteur: ["b2c"] });
    assert.doesNotMatch(a.message + a.perWeekText, /garanti|assuré|tu vas gagner|certain/i);
  }
});

test("assistant : un message par palier, honnête, sans promesse", () => {
  const msgs = [0, 500, 3000, 15000, 40000].map((v) => G.assistantMessage(v));
  assert.equal(new Set(msgs).size, 5);
  for (const m of msgs) assert.doesNotMatch(m, /tu vas gagner|garanti[e]? |assuré|certain/i);
  assert.match(G.assistantMessage(40000), /rien te garantir/);
});

test("revenus actuels : échelle 0 -> 3 000 -> 10 000 €, aller-retour stable", () => {
  const R = G.revenueScale;
  assert.equal(R.positionToValue(0), 0);
  assert.equal(R.positionToValue(600), 3000);
  assert.equal(R.positionToValue(1000), 10000);
  for (const v of [0, 500, 1500, 3000, 6000, 10000]) assert.equal(R.positionToValue(R.valueToPosition(v)), v);
});

test("écart objectif / revenus actuels", () => {
  assert.equal(G.goalGap(3000, 1000), "× 3 tes revenus actuels");
  assert.equal(G.goalGap(2500, 1000), "× 2,5 tes revenus actuels");
  assert.equal(G.goalGap(25000, 1000), "× 25 tes revenus actuels");
  assert.equal(G.goalGap(1000, 1000), "Autant que tes revenus actuels");
  assert.equal(G.goalGap(500, 1500), "Moins que tes revenus actuels");
  assert.equal(G.goalGap(3000, 0), "Ton premier objectif");
  assert.equal(G.goalGap(3000, null), "Ton premier objectif");
  assert.equal(G.goalGap(3000, undefined), "Ton premier objectif");
});

test("assistant revenus : bienveillant pour tout montant, sans promesse ni jugement", () => {
  const cases = [["montant", 0], ["montant", 400], ["montant", 2000], ["montant", 8000], ["non_reponse", null], ["autre", null]];
  const msgs = cases.map(([m, v]) => G.revenueAssistantMessage(m, v));
  assert.equal(new Set(msgs).size, 6);
  for (const m of msgs) assert.doesNotMatch(m, /garanti|tu vas gagner|seulement|insuffisant|trop peu|pas assez/i);
  assert.match(G.currentEquivalence(0), /Rien pour l'instant/);
  assert.equal(G.currentEquivalence(1400), "≈ un SMIC");
});

test("copie Edge Functions identique (supabase/functions/_shared/goal-math.js)", () => {
  const a = readFileSync(new URL("./goal-math.js", import.meta.url), "utf8");
  const b = readFileSync(new URL("../supabase/functions/_shared/goal-math.js", import.meta.url), "utf8");
  assert.equal(b, a, "Recopier scripts/goal-math.js vers supabase/functions/_shared/goal-math.js");
});

test("ligne de contexte : une ligne courte, prix moyen visible", () => {
  assert.equal(G.contextLine(0), "Choisis un montant pour voir l'équivalent");
  assert.equal(G.contextLine(5000, ["b2c"]), "≈ 3,5 SMIC · ≈ 250 clients à 20 €");
  assert.match(G.contextLine(500, ["b2c"]), /^≈ 17 €\/jour · ≈ 25 clients à 20 €$/);
  assert.match(G.contextLine(20, ["b2b"]), /≈ 1 client à 49 €$/);
  for (const v of [10, 300, 560, 900, 1500, 5000, 12000, 25000, 50000]) {
    for (const s of [["b2c"], ["b2b"], ["both"], undefined]) assert.ok(G.contextLine(v, s).length <= 36, G.contextLine(v, s));
  }
});
