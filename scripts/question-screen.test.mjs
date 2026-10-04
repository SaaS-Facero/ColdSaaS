// Tests du composant QuestionScreen (scripts/question-screen.mjs) et de la
// config des questions du funnel.
// Lancer : node --test scripts/question-screen.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  renderQuestionScreen,
  pickLayout,
  questionModel,
  questionScreenClientJs,
  QS_GRADIENTS,
  QS_SUBTITLE_MAX
} from "./question-screen.mjs";

const opts = (n) => Array.from({ length: n }, (_, i) => ({ value: "v" + i, label: "Option " + i, icon: "🙂", subtitle: "Sous-titre " + i }));

test("disposition selon le nombre d'options, jamais de carte orpheline", () => {
  assert.equal(pickLayout(opts(2)), "duo");
  assert.equal(pickLayout(opts(3)), "trio");
  assert.equal(pickLayout(opts(4)), "quad");
  assert.equal(pickLayout(opts(5)), "list");
  assert.equal(pickLayout(opts(6)), "list");
});

test("validation : 2 à 6 options, icon et subtitle obligatoires, subtitle ≤ 40", () => {
  assert.throws(() => questionModel({ id: "x", type: "single", options: opts(7) }), /entre 2 et 6/);
  assert.throws(() => questionModel({ id: "x", type: "single", options: opts(1) }), /entre 2 et 6/);
  assert.throws(() => questionModel({ id: "x", type: "single", options: [{ value: "a", label: "A", subtitle: "s" }, ...opts(1)] }), /icon manquant/);
  assert.throws(() => questionModel({ id: "x", type: "single", options: [{ value: "a", label: "A", icon: "🙂" }, ...opts(1)] }), /subtitle manquant/);
  assert.throws(() => questionModel({ id: "x", type: "single", options: [{ value: "a", label: "A", icon: "🙂", subtitle: "x".repeat(41) }, ...opts(1)] }), /max 40/);
  assert.throws(() => questionModel({ id: "x", type: "groups", groups: [{ options: opts(2) }, { options: opts(2) }] }), /un seul groupe/);
});

test("anatomie : pastille dégradée propre à chaque option, titre, sous-titre, radio", () => {
  const html = renderQuestionScreen({ id: "age", stepName: "age", chapter: 1, chapterLabel: "Ton âge", title: "Tu as quel âge ?", type: "single", options: opts(5) }, 0);
  assert.match(html, /role="radiogroup"/);
  assert.equal((html.match(/role="radio"/g) || []).length, 5);
  assert.match(html, /qs__options--list/);
  for (let i = 0; i < 5; i++) assert.ok(html.includes(`--g1:${QS_GRADIENTS[i][0]}`), "dégradé " + i);
  assert.match(html, /qs-card__label">Option 0<\/span>\s*<span class="qs-card__sub">Sous-titre 0</);
  assert.match(html, />1 choix</);
  assert.doesNotMatch(html, /qs__cta/);
});

test("choix multiple : checkbox, CTA sticky désactivé", () => {
  const html = renderQuestionScreen({ id: "reve", stepName: "reve", title: "Ton rêve ?", type: "multi", options: opts(6) }, 2);
  assert.match(html, /role="group"/);
  assert.equal((html.match(/role="checkbox"/g) || []).length, 6);
  assert.match(html, /Plusieurs choix possibles/);
  assert.match(html, /qs__next" type="button" disabled>Continuer/);
});

test("« Autre » : champ dans la carte, CTA masqué en choix unique", () => {
  const html = renderQuestionScreen({
    id: "q", stepName: "q", title: "Q ?", type: "single",
    options: [opts(1)[0], { value: "autre", label: "Autre", icon: "✍️", subtitle: "Dis-nous tout", other: { placeholder: "Précise", maxLength: 40 } }]
  }, 0);
  assert.match(html, /<div class="quiz-option qs-card qs-card--other" role="radio"[^>]*tabindex="0" data-other>/);
  assert.match(html, /qs__cta" hidden>/);
});

test("icônes SVG nommées et badge featured", () => {
  const html = renderQuestionScreen({
    id: "acc", stepName: "acc", title: "T", type: "choice-cards",
    options: [{ value: "a", label: "A", icon: "solo", subtitle: "s" }, { value: "b", label: "B", icon: "auto", subtitle: "s", featured: "Le plus automatisé" }]
  }, 0, { icons: { solo: "<svg id=solo></svg>", auto: "<svg id=auto></svg>" } });
  assert.match(html, /qs-card__glyph--svg"><svg id=solo>/);
  assert.match(html, /qs-card__badge">Le plus automatisé/);
});

test("JS client injectable dans un template literal (ni backtick ni antislash)", () => {
  assert.doesNotMatch(questionScreenClientJs, /[`\\]/);
});

// ---- Config réelle du funnel (lue dans build.mjs, sans l'exécuter) ---------
const src = readFileSync(new URL("./build.mjs", import.meta.url), "utf8");
const blockStart = src.indexOf("  questions: [\n");
const block = src.slice(blockStart, src.indexOf("\n  ]\n};\n", blockStart));

test("ordre logique : âge, situation, puis profil avant motivations et objectif", () => {
  const ids = [...block.matchAll(/^      id: "(\w+)",/gm)].map((m) => m[1]);
  assert.deepEqual(ids.slice(0, 3), ["age", "situation", "mirror"]);
  const pos = (id) => ids.indexOf(id);
  assert.ok(pos("temps") < pos("attente"), "profil avant motivations");
  assert.ok(pos("lignesRouges") < pos("secteur"), "motivations avant projet");
  assert.ok(pos("accompagnement") < pos("revenus") && pos("revenus") < pos("objectifRevenu") && pos("objectifRevenu") < pos("delai"));
  assert.deepEqual(ids.slice(-3), ["assemblage", "engagement", "auth"]);
});

test("chaque option du funnel a icon + subtitle (≤ 40 caractères)", () => {
  const options = [...block.matchAll(/\{ value: "[^"]+", label: "[^"]*"(.*?) \}/g)];
  assert.ok(options.length >= 60, "options trouvées : " + options.length);
  for (const [line, rest] of options) {
    const icon = rest.match(/icon: "([^"]+)"/);
    const sub = rest.match(/subtitle: "([^"]+)"/);
    assert.ok(icon && sub, line);
    assert.ok(sub[1].length <= QS_SUBTITLE_MAX, line);
  }
});
