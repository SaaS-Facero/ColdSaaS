// Tests du composant QuestionScreen (scripts/question-screen.mjs).
// Lancer : node --test scripts/question-screen.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { renderQuestionScreen, pickLayout, questionModel, questionScreenClientJs } from "./question-screen.mjs";

const opts = (n, label = "Option") => Array.from({ length: n }, (_, i) => ({ value: "v" + i, label: label + " " + i, emoji: "🙂" }));

test("disposition : pile jusqu'à 4, grille 2 colonnes à 5-6 libellés courts", () => {
  assert.equal(pickLayout(opts(2)), "stack");
  assert.equal(pickLayout(opts(4)), "stack");
  assert.equal(pickLayout(opts(5)), "grid");
  assert.equal(pickLayout(opts(6)), "grid");
  assert.equal(pickLayout(opts(5, "Un libellé beaucoup trop long pour une carte carrée")), "stack");
});

test("maximum 6 options, un seul groupe", () => {
  assert.throws(() => questionModel({ id: "x", type: "single", options: opts(7) }), /maximum 6/);
  assert.throws(() => questionModel({ id: "x", type: "groups", groups: [{ options: opts(2) }, { options: opts(2) }] }), /un seul groupe/);
  assert.equal(questionModel({ id: "situation", type: "groups", groups: [{ field: "situation", options: opts(3) }] }).field, "situation");
});

test("choix unique : radiogroup, « 1 choix », pas de CTA", () => {
  const html = renderQuestionScreen({ id: "age", stepName: "age", chapter: 1, chapterLabel: "Ton âge", title: "Tu as quel âge ?", type: "single", options: opts(3) }, 1);
  assert.match(html, /role="radiogroup"/);
  assert.equal((html.match(/role="radio"/g) || []).length, 3);
  assert.match(html, />1 choix</);
  assert.doesNotMatch(html, /qs__cta/);
  assert.match(html, /aria-labelledby="qs-title-age"/);
  assert.match(html, /data-key="3"/);
});

test("choix multiple : checkbox, « Plusieurs choix possibles », CTA sticky désactivé", () => {
  const html = renderQuestionScreen({ id: "reve", stepName: "reve", title: "Ton rêve ?", type: "multi", options: opts(6) }, 2);
  assert.match(html, /role="group"/);
  assert.equal((html.match(/role="checkbox"/g) || []).length, 6);
  assert.match(html, /Plusieurs choix possibles/);
  assert.match(html, /quiz-footer--sticky qs__cta"/);
  assert.match(html, /qs__next" type="button" disabled>Continuer/);
  assert.match(html, /data-qs-layout="grid"/);
});

test("« Autre » : champ dans la carte, CTA masqué en choix unique", () => {
  const html = renderQuestionScreen({
    id: "q", stepName: "q", title: "Q ?", type: "single",
    options: [{ value: "a", label: "A" }, { value: "autre", label: "Autre", other: { placeholder: "Précise", maxLength: 40 } }]
  }, 0);
  assert.match(html, /<div class="quiz-option qs-card qs-card--other" role="radio"[^>]*tabindex="0" data-other>/);
  assert.match(html, /qs-card__other-input" id="qs-other-q" maxlength="40"/);
  assert.match(html, /qs__cta" hidden>/);
});

test("cartes à icône : SVG fourni, badge featured", () => {
  const html = renderQuestionScreen({
    id: "acc", stepName: "acc", title: "T", type: "choice-cards",
    options: [{ value: "a", label: "A", icon: "solo" }, { value: "b", label: "B", icon: "auto", featured: "Le plus automatisé" }]
  }, 0, { icons: { solo: "<svg id=solo></svg>", auto: "<svg id=auto></svg>" } });
  assert.match(html, /<svg id=solo>/);
  assert.match(html, /qs-card__badge">Le plus automatisé/);
});

test("JS client injectable dans un template literal (ni backtick ni antislash)", () => {
  assert.doesNotMatch(questionScreenClientJs, /[`\\]/);
});
