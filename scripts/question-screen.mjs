// ---------------------------------------------------------------------------
// QuestionScreen — composant unique de tous les écrans de questions du
// funnel ColdTrend (choix unique, choix multiple, cartes à icône SVG).
//
// Objectif : comprendre et répondre en moins de 3 secondes.
//
// Structure (identique sur chaque écran) :
//   [ Retour | barre segmentée | Fermer ]      <- en-tête partagé de l'overlay
//   .qs__center (flex, centrage optique : espace au-dessus < espace dessous)
//     .qs__block (max 560px, centré)
//       étiquette MAJUSCULES  (chapterLabel)
//       titre 28px mobile / 36px desktop, centré
//       sous-titre, puis « 1 choix » / « Plusieurs choix possibles »
//       cartes de réponse (radiogroup ou group de checkbox)
//   .qs__cta sticky « Continuer (n) »          <- choix multiple, ou « Autre »
//
// Disposition selon le nombre d'options, jamais de carte orpheline
// (pickLayout, choisie au build) :
//   2 options    -> "duo"  : 2 colonnes, grandes cartes verticales ;
//   3 options    -> "trio" : lignes empilées en mobile, 3 colonnes (cartes
//                            verticales) à partir de 768px ;
//   4 options    -> "quad" : grille 2 x 2, cartes verticales ;
//   5-6 options  -> "list" : liste verticale pleine largeur (max 480px).
//   Moins de 2 ou plus de 6 options : erreur de build.
//
// Anatomie d'une carte en ligne (76px, rayon 16px) :
//   [pastille 48px dégradée + emoji/icône] [titre 17px · sous-titre 13px] [radio]
// En carte verticale (duo / trio desktop / quad), mêmes éléments empilés et
// centrés, radio en haut à droite.
//
// Chaque option porte { value, label, icon, subtitle } : icon = emoji, ou
// nom d'icône SVG (deps.icons, cartes Acquisition / Accompagnement) ;
// subtitle = une ligne positive, 40 caractères maximum (vérifié au build).
// La pastille prend le dégradé de rang i de QS_GRADIENTS : chaque option
// d'un écran a le sien.
//
// Option « Autre » : { value: "autre", label: "Autre", icon, subtitle,
// other: { placeholder, maxLength } }. La carte contient son propre champ,
// révélé à la sélection ; texte dans answers[champ + "Autre"]. Une carte
// « Autre » n'est pas un <button> (pas de champ dans un bouton) : div
// role=radio / checkbox, tabindex=0, activée au clavier par le script.
//
// Le moteur existant du quiz est réutilisé tel quel : classes quiz-option /
// is-selected / data-quiz-options / quiz-next, et answers[]. Le script
// client (questionScreenClientJs) ajoute : états ARIA, compteur du CTA,
// pulsation de la pastille, passage automatique à 250 ms, touches 1-6 /
// Entrée / flèches.
//
// Attention (voir mémoire build.mjs) : ce fichier contient du CSS et du JS
// client dans des template literals. Pas de backtick ni d'antislash dans le
// JS client.
// ---------------------------------------------------------------------------

export const QS_MIN_OPTIONS = 2;
export const QS_MAX_OPTIONS = 6;
export const QS_SUBTITLE_MAX = 40;
export const QS_AUTO_ADVANCE_MS = 250;
export const QS_STAGGER_MS = 40;

// Dégradés des pastilles, par rang d'option. Tons soutenus : l'icône SVG
// blanche y garde plus de 3:1 (élément graphique, WCAG 1.4.11).
export const QS_GRADIENTS = [
  ["#2F6BFF", "#6D3DF5"], // cobalt -> violet
  ["#0E9F9A", "#2563EB"], // sarcelle -> bleu
  ["#E8603C", "#D63A78"], // corail -> framboise
  ["#7C4DDB", "#C026D3"], // violet -> fuchsia
  ["#0F9F6E", "#0284C7"], // vert -> ciel
  ["#D97706", "#DC4C1F"]  // ambre -> orange brûlé
];

const CHECK_SVG =
  '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" aria-hidden="true"><path class="qs-check__path" d="M5 12.5l4.5 4.5L19 7.5" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>';

function escAttr(v) {
  return String(v).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

// Normalise les formes de questions à options vers { field, mode, options } :
// "single" / "multi" (options), "groups" (un seul groupe) et "choice-cards"
// (icônes SVG, éventuellement « featured »). Vérifie le contenu des options.
export function questionModel(question) {
  let field = question.id;
  let options = question.options;
  if (question.type === "groups") {
    if (!question.groups || question.groups.length !== 1) {
      throw new Error(`QuestionScreen « ${question.id} » : un seul groupe d'options par écran.`);
    }
    field = question.groups[0].field || question.id;
    options = question.groups[0].options;
  }
  if (!Array.isArray(options) || options.length < QS_MIN_OPTIONS || options.length > QS_MAX_OPTIONS) {
    throw new Error(`QuestionScreen « ${question.id} » : ${options ? options.length : 0} options, entre ${QS_MIN_OPTIONS} et ${QS_MAX_OPTIONS} attendues.`);
  }
  for (const opt of options) {
    if (!opt.icon) throw new Error(`QuestionScreen « ${question.id} » / ${opt.value} : icon manquant.`);
    if (!opt.subtitle) throw new Error(`QuestionScreen « ${question.id} » / ${opt.value} : subtitle manquant.`);
    if (opt.subtitle.length > QS_SUBTITLE_MAX) {
      throw new Error(`QuestionScreen « ${question.id} » / ${opt.value} : subtitle de ${opt.subtitle.length} caractères (max ${QS_SUBTITLE_MAX}).`);
    }
  }
  return { field, mode: question.type === "multi" ? "multi" : "single", options };
}

export function pickLayout(options) {
  const n = options.length;
  if (n === 2) return "duo";
  if (n === 3) return "trio";
  if (n === 4) return "quad";
  return "list";
}

export const QUESTION_SCREEN_TYPES = ["single", "multi", "groups", "choice-cards"];

/**
 * Rendu HTML d'un écran de question.
 * @param {object} question  entrée de quiz.questions
 * @param {number} index     position dans le funnel (data-index)
 * @param {object} deps      { icons: {nom: svg} } pour les icônes SVG
 */
export function renderQuestionScreen(question, index, deps = {}) {
  const icons = deps.icons || {};
  const { field, mode, options } = questionModel(question);
  const layout = pickLayout(options);
  const isMulti = mode === "multi";
  const hasOther = options.some((o) => o.other);
  const titleId = `qs-title-${question.id}`;

  const skipAttrs = question.skipIf
    ? ` data-skip-field="${question.skipIf.field}" data-skip-equals="${question.skipIf.equals}"`
    : "";
  const chapterAttr = question.chapter ? ` data-chapter="${question.chapter}"` : "";

  // echoSubtext : reprend une réponse précédente ({champ}), résolu côté
  // client (applyEcho) ; subtext sert de repli.
  const echoAttr = question.echoSubtext ? ` data-echo="${escAttr(question.echoSubtext)}"` : "";
  const subtext = question.subtext || question.echoSubtext
    ? `<p class="quiz-subtext qs__sub"${echoAttr}>${question.subtext || ""}</p>`
    : "";

  const role = isMulti ? "checkbox" : "radio";
  const cards = options
    .map((opt, i) => {
      const [g1, g2] = QS_GRADIENTS[i % QS_GRADIENTS.length];
      const visual = icons[opt.icon]
        ? `<span class="qs-card__glyph qs-card__glyph--svg">${icons[opt.icon]}</span>`
        : `<span class="qs-card__glyph">${opt.icon}</span>`;
      const badge = opt.featured ? `<span class="qs-card__badge">${opt.featured}</span>` : "";
      const common = `class="quiz-option qs-card${opt.featured ? " qs-card--featured" : ""}${opt.other ? " qs-card--other" : ""}" role="${role}" aria-checked="false" data-value="${escAttr(opt.value)}" data-key="${i + 1}" style="--i:${i};--g1:${g1};--g2:${g2}"`;
      const inner = `${badge}<span class="qs-card__pastille" aria-hidden="true">${visual}</span>
                <span class="qs-card__text">
                  <span class="qs-card__label">${opt.label}</span>
                  <span class="qs-card__sub">${opt.subtitle}</span>
                </span>
                <span class="qs-card__check" aria-hidden="true">${CHECK_SVG}</span>`;
      if (opt.other) {
        const max = opt.other.maxLength || 60;
        return `<div ${common} tabindex="0" data-other>
                ${inner}
                <span class="qs-card__other" hidden>
                  <input type="text" class="qs-card__other-input" id="qs-other-${field}" maxlength="${max}" placeholder="${escAttr(opt.other.placeholder || "Précise ici")}" autocomplete="off" aria-label="${escAttr(opt.label)} : précise ta réponse" />
                </span>
              </div>`;
      }
      return `<button type="button" ${common}>
                ${inner}
              </button>`;
    })
    .join("\n              ");

  // CTA sticky : toujours présent en choix multiple ; en choix unique,
  // seulement s'il y a une carte « Autre » (masqué tant qu'elle n'est pas
  // choisie, voir qsSync).
  const cta = isMulti || hasOther
    ? `<div class="quiz-footer quiz-footer--sticky qs__cta"${isMulti ? "" : " hidden"}>
            <button class="btn btn--primary quiz-next qs__next" type="button" disabled>Continuer<span class="qs__count"></span></button>
          </div>`
    : "";

  return `<div class="quiz-screen qs" data-screen="question" data-index="${index}" data-id="${question.id}" data-step-name="${question.stepName}" data-qs-mode="${mode}" data-qs-layout="${layout}"${skipAttrs}${chapterAttr}>
          <div class="qs__center">
            <div class="qs__block">
              ${question.chapterLabel ? `<p class="quiz-chapter-label qs__eyebrow">${question.chapterLabel}</p>` : ""}
              <h2 class="quiz-question-title qs__title" id="${titleId}">${question.title}</h2>
              ${subtext}
              <p class="qs__hint">${isMulti ? "Plusieurs choix possibles" : "1 choix"}</p>
              <div class="quiz-options qs__options qs__options--${layout}" data-quiz-options data-type="${mode}" data-field="${field}" role="${isMulti ? "group" : "radiogroup"}" aria-labelledby="${titleId}">
              ${cards}
              </div>
            </div>
          </div>
          ${cta}
        </div>`;
}

// ---------------------------------------------------------------------------
// CSS — échelle 8pt (8/16/24/32/48), une seule famille (celle de
// l'overlay). Contrastes AA sur la carte (#12151F environ) : titre #F5F6F8
// (16:1), sous-titre #A3A9B4 (7,5:1, 6:1 sur le fond teinté sélectionné),
// bordure sélectionnée cobalt #0047FF (3,2:1, composant d'interface).
// Les sélecteurs commencent par .quiz-screen.qs pour passer devant les
// règles historiques (.quiz-screen.is-active .quiz-option:nth-child(n)).
// ---------------------------------------------------------------------------
export const questionScreenCss = `
  /* ---- QuestionScreen : mise en page ------------------------------------- */
  .quiz-screen.qs {
    max-width: 592px; /* bloc 560px + 2 x 16px de marge */
    padding: 8px 16px 0;
    justify-content: flex-start;
  }
  /* Centrage optique : deux ressorts, plus grand en bas, donc le bloc
     se pose un peu au-dessus du milieu. Quand le contenu dépasse, les
     ressorts tombent au minimum et l'écran défile normalement. */
  .qs__center { flex: 1 0 auto; display: flex; flex-direction: column; }
  .qs__center::before { content: ""; flex: 2 1 0; min-height: 8px; }
  .qs__center::after { content: ""; flex: 3 1 0; min-height: 8px; }
  .qs__block { width: 100%; max-width: 560px; margin: 0 auto; text-align: center; }

  .quiz-screen.qs .qs__eyebrow {
    margin: 0 0 8px;
    font-size: 12px;
    line-height: 16px;
    letter-spacing: 0.08em;
    color: var(--steel);
  }
  .quiz-screen.qs .qs__title {
    margin: 0 0 8px;
    font-size: 28px;
    line-height: 1.2;
    font-weight: 800;
    letter-spacing: -0.02em;
    color: var(--paper);
    text-wrap: balance;
  }
  .quiz-screen.qs .qs__sub {
    margin: 0 0 8px;
    font-size: 16px;
    line-height: 24px;
    font-style: normal;
    color: var(--steel);
    text-wrap: balance;
  }
  .qs__hint {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    margin: 0 0 16px;
    font-size: 13px;
    line-height: 16px;
    font-weight: 600;
    color: var(--steel);
  }
  .qs__hint::before {
    content: "";
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--cobalt-soft);
  }
  @media (min-width: 768px) {
    .quiz-screen.qs .qs__title { font-size: 36px; }
  }

  /* ---- Dispositions ----------------------------------------------------- */
  .quiz-screen.qs .qs__options { gap: 8px; text-align: left; }
  .quiz-screen.qs .qs__options--list { width: 100%; max-width: 480px; margin: 0 auto; }
  .quiz-screen.qs .qs__options--duo,
  .quiz-screen.qs .qs__options--quad {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }
  @media (min-width: 768px) {
    .quiz-screen.qs .qs__options--duo,
    .quiz-screen.qs .qs__options--quad { gap: 16px; }
    .quiz-screen.qs .qs__options--trio {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 16px;
    }
  }

  /* ---- Carte en ligne (76px) -------------------------------------------- */
  .quiz-screen.qs .qs-card {
    position: relative;
    display: grid;
    grid-template-columns: 48px minmax(0, 1fr) 24px;
    align-items: center;
    gap: 16px;
    min-height: 76px;
    padding: 12px 16px;
    border-radius: 16px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    background: rgba(255, 255, 255, 0.04);
    -webkit-backdrop-filter: blur(12px);
    backdrop-filter: blur(12px);
    color: var(--paper);
    text-align: left;
    cursor: pointer;
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.06);
    -webkit-tap-highlight-color: transparent;
    transition: border-color 160ms ease, background-color 160ms ease, box-shadow 200ms ease,
      opacity 320ms cubic-bezier(0.16, 1, 0.3, 1), transform 320ms cubic-bezier(0.16, 1, 0.3, 1);
  }

  .qs-card__pastille {
    display: grid;
    place-items: center;
    width: 48px;
    height: 48px;
    border-radius: 14px;
    background: linear-gradient(135deg, var(--g1), var(--g2));
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.25), 0 8px 20px -10px var(--g1);
    color: #fff;
  }
  .qs-card__glyph { font-size: 24px; line-height: 1; }
  .qs-card__glyph--svg { display: grid; place-items: center; }
  .qs-card__glyph--svg svg { width: 26px; height: 26px; }

  .qs-card__text { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .qs-card__label { font-size: 17px; line-height: 22px; font-weight: 600; color: #F5F6F8; }
  .qs-card__sub { font-size: 13px; line-height: 18px; color: #A3A9B4; }

  /* ---- Carte verticale (duo, quad, trio desktop) -------------------------- */
  .quiz-screen.qs .qs__options--duo .qs-card,
  .quiz-screen.qs .qs__options--quad .qs-card {
    grid-template-columns: 1fr;
    justify-items: center;
    align-content: start;
    gap: 12px;
    min-height: 168px;
    padding: 24px 16px 16px;
    text-align: center;
  }
  .qs__options--duo .qs-card__text,
  .qs__options--quad .qs-card__text { align-items: center; }
  .qs__options--duo .qs-card__check,
  .qs__options--quad .qs-card__check { position: absolute; top: 12px; right: 12px; }
  @media (min-width: 768px) {
    .quiz-screen.qs .qs__options--trio .qs-card {
      grid-template-columns: 1fr;
      justify-items: center;
      align-content: start;
      gap: 12px;
      min-height: 176px;
      padding: 24px 16px 16px;
      text-align: center;
    }
    .qs__options--trio .qs-card__text { align-items: center; }
    .qs__options--trio .qs-card__check { position: absolute; top: 12px; right: 12px; }
  }

  /* ---- Entrée en cascade : 40 ms d'écart (--i posé au build) --------------- */
  .quiz-screen.qs.is-active .qs-card.quiz-option {
    transition-delay: calc(160ms + var(--i, 0) * 40ms);
  }
  .quiz-screen.qs.is-active .qs__cta { transition-delay: 320ms; }

  /* ---- États : survol (pointeur fin), pressé, sélectionné ----------------- */
  @media (hover: hover) and (pointer: fine) {
    .quiz-screen.qs.is-active .qs-card.quiz-option:hover {
      transform: translateY(-2px);
      transition-delay: 0ms;
      border-color: rgba(255, 255, 255, 0.24);
      background: rgba(255, 255, 255, 0.07);
      box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08), 0 16px 32px -20px rgba(0, 0, 0, 0.9);
    }
  }
  .quiz-screen.qs.is-active .qs-card.quiz-option:active {
    transform: scale(0.98);
    transition-delay: 0ms;
    transition-duration: 90ms;
  }
  /* Bordure 2px sans décalage de mise en page : 1px de bordure + 1px d'ombre. */
  .quiz-screen.qs .qs-card.is-selected,
  .quiz-screen.qs.is-active .qs-card.quiz-option.is-selected:hover {
    border-color: var(--cobalt);
    background: rgba(0, 71, 255, 0.14);
    box-shadow: 0 0 0 1px var(--cobalt), 0 12px 36px -12px rgba(0, 71, 255, 0.75);
  }
  .quiz-screen.qs.is-active .qs-card.quiz-option.is-selected { animation: none; }
  /* La pastille pulse une fois, au choix seulement (classe is-picked posée
     par qsAfterPick), jamais à la restauration d'une réponse. */
  .qs-card.is-picked .qs-card__pastille { animation: qs-pulse 420ms cubic-bezier(0.34, 1.56, 0.64, 1); }
  @keyframes qs-pulse {
    0% { transform: scale(1); box-shadow: 0 0 0 0 rgba(61, 107, 255, 0.6); }
    45% { transform: scale(1.12); box-shadow: 0 0 0 8px rgba(61, 107, 255, 0); }
    100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(61, 107, 255, 0); }
  }

  /* ---- Radio / case : se remplit d'un check dessiné ----------------------- */
  .qs-card__check {
    justify-self: end;
    display: grid;
    place-items: center;
    width: 24px;
    height: 24px;
    border-radius: 50%;
    border: 2px solid rgba(255, 255, 255, 0.28);
    color: #fff;
    transition: background-color 160ms ease, border-color 160ms ease, transform 240ms cubic-bezier(0.34, 1.56, 0.64, 1);
  }
  .qs__options[data-type="multi"] .qs-card__check { border-radius: 7px; }
  .qs-check__path {
    stroke-dasharray: 24;
    stroke-dashoffset: 24;
    transition: stroke-dashoffset 240ms cubic-bezier(0.65, 0, 0.35, 1) 60ms;
  }
  .qs-card.is-selected .qs-card__check {
    background: var(--cobalt);
    border-color: var(--cobalt);
    transform: scale(1.08);
  }
  .qs-card.is-selected .qs-check__path { stroke-dashoffset: 0; }

  /* Carte mise en avant (jamais présélectionnée) : pastille sur la bordure. */
  .quiz-screen.qs .qs-card--featured { border-color: rgba(61, 107, 255, 0.45); }
  /* En liste, place pour la pastille « featured » qui déborde de 10px ; en
     grille (trio desktop), les cartes restent alignées. */
  .qs__options--trio .qs-card--featured,
  .qs__options--list .qs-card--featured { margin-top: 8px; }
  @media (min-width: 768px) {
    .qs__options--trio .qs-card--featured { margin-top: 0; }
  }
  .qs-card__badge {
    position: absolute;
    top: -10px;
    left: 50%;
    transform: translateX(-50%);
    padding: 2px 8px;
    border-radius: 999px;
    background: var(--cobalt);
    color: #fff;
    font-size: 11px;
    line-height: 16px;
    font-weight: 700;
    white-space: nowrap;
  }

  /* « Autre » : le champ s'ouvre dans la carte, sur toute sa largeur. */
  .qs-card__other { grid-column: 1 / -1; width: 100%; padding: 0 0 4px; }
  .qs-card__other[hidden] { display: none; }
  .qs-card__other-input {
    width: 100%;
    height: 48px;
    padding: 0 16px;
    border-radius: 12px;
    border: 1px solid rgba(255, 255, 255, 0.16);
    background: rgba(10, 14, 26, 0.6);
    color: var(--paper);
    font: inherit;
    font-size: 16px; /* 16px : pas de zoom automatique sur iOS */
  }

  /* CTA sticky des choix multiples. */
  .quiz-screen.qs .qs__cta { margin-top: 0; padding-top: 16px; padding-bottom: 16px; }
  .quiz-screen.qs .qs__cta[hidden] { display: none; }
  /* Flex : un espace en tête de <span> serait supprimé, d'où la marge. */
  .qs__count { margin-left: 0.3em; font-variant-numeric: tabular-nums; }
  .qs__count:empty { display: none; }

  .quiz-screen.qs .qs-card:focus-visible,
  .qs-card__other-input:focus-visible {
    outline: 2px solid var(--cobalt-soft);
    outline-offset: 3px;
  }

  @media (prefers-reduced-motion: reduce) {
    .quiz-screen.qs .qs-card,
    .qs-card__check,
    .qs-check__path { transition: none; }
    .quiz-screen.qs.is-active .qs-card.quiz-option:hover,
    .quiz-screen.qs.is-active .qs-card.quiz-option:active { transform: none; }
    .qs-card.is-selected .qs-card__check { transform: none; }
    .qs-card.is-picked .qs-card__pastille { animation: none; }
  }
`;

// ---------------------------------------------------------------------------
// JS client (ES5), injecté dans la fermeture du quiz : utilise answers,
// overlay, stage, currentScreenEl, multiAdvanceTimer, goForwardFromQuestion.
//
//   qsSync(screenEl)        : aria-checked, champ « Autre », compteur et
//                             état du CTA (appelé par updateNextEnabled) ;
//   qsAfterPick(...)        : passage automatique (choix unique, 250 ms) ;
//   clavier                 : 1-6 = répondre, Entrée = valider (CTA),
//                             flèches = carte précédente / suivante,
//                             Espace / Entrée sur la carte « Autre ».
// ---------------------------------------------------------------------------
export const questionScreenClientJs = `
      // ---- QuestionScreen (scripts/question-screen.mjs) ------------------
      var QS_AUTO_ADVANCE_MS = ${QS_AUTO_ADVANCE_MS};

      function qsField(screenEl) {
        var wrap = screenEl.querySelector("[data-quiz-options]");
        return wrap ? wrap.getAttribute("data-field") || screenEl.getAttribute("data-id") : null;
      }

      function qsSync(screenEl) {
        var wrap = screenEl.querySelector("[data-quiz-options]");
        if (!wrap) return;
        var field = qsField(screenEl);
        var count = 0;
        var otherOn = false;
        Array.prototype.forEach.call(wrap.querySelectorAll(".qs-card"), function (card) {
          var on = card.classList.contains("is-selected");
          card.setAttribute("aria-checked", on ? "true" : "false");
          if (on) count += 1;
          if (card.hasAttribute("data-other")) {
            otherOn = on;
            var box = card.querySelector(".qs-card__other");
            if (box) box.hidden = !on;
            var input = card.querySelector(".qs-card__other-input");
            if (input && on && input.value !== (answers[field + "Autre"] || "")) input.value = answers[field + "Autre"] || "";
          }
        });
        if (!otherOn) delete answers[field + "Autre"];
        var footer = screenEl.querySelector(".qs__cta");
        var next = screenEl.querySelector(".qs__next");
        if (!footer || !next) return;
        var isMulti = screenEl.getAttribute("data-qs-mode") === "multi";
        var otherText = String(answers[field + "Autre"] || "").trim();
        next.disabled = !(count > 0 && (!otherOn || otherText.length > 0));
        var countEl = next.querySelector(".qs__count");
        if (countEl) countEl.textContent = isMulti && count > 0 ? "(" + count + ")" : "";
        if (!isMulti) footer.hidden = !otherOn;
      }

      // Après un choix : la pastille pulse une fois ; unique -> écran suivant
      // en 250 ms (le temps de voir la coche), sauf « Autre » qui attend sa
      // saisie ; multiple -> rien, le CTA sticky « Continuer (n) » valide.
      function qsAfterPick(screenEl, optBtn, type) {
        // Pulsation unique de la pastille : rejouée à chaque nouveau choix.
        Array.prototype.forEach.call(screenEl.querySelectorAll(".qs-card.is-picked"), function (c) {
          c.classList.remove("is-picked");
        });
        if (optBtn.classList.contains("is-selected")) {
          void optBtn.offsetWidth;
          optBtn.classList.add("is-picked");
        }
        if (type === "multi") return;
        if (optBtn.hasAttribute("data-other")) {
          var input = optBtn.querySelector(".qs-card__other-input");
          if (input) window.setTimeout(function () { input.focus(); }, 60);
          return;
        }
        multiAdvanceTimer = window.setTimeout(function () {
          multiAdvanceTimer = null;
          if (currentScreenEl === screenEl) goForwardFromQuestion();
        }, QS_AUTO_ADVANCE_MS);
      }

      stage.addEventListener("input", function (e) {
        if (!e.target.classList || !e.target.classList.contains("qs-card__other-input")) return;
        var screenEl = e.target.closest(".quiz-screen");
        answers[qsField(screenEl) + "Autre"] = e.target.value;
        qsSync(screenEl);
      });

      document.addEventListener("keydown", function (e) {
        if (!overlay.classList.contains("is-open")) return;
        var screenEl = currentScreenEl;
        if (!screenEl || !screenEl.classList.contains("qs") || !screenEl.classList.contains("is-active")) return;
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        var cards = screenEl.querySelectorAll(".qs-card");
        var next = screenEl.querySelector(".qs__next");
        var canValidate = next && !next.disabled && !next.closest("[hidden]");
        var t = e.target;

        // Saisie dans « Autre » : seule Entrée est interceptée (valider).
        if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) {
          if (e.key === "Enter" && t.classList.contains("qs-card__other-input")) {
            e.preventDefault();
            if (canValidate) next.click();
          }
          return;
        }

        var key = e.key || "";
        if (key.length === 1 && key >= "1" && key <= "6") {
          var card = cards[Number(key) - 1];
          if (!card) return;
          e.preventDefault();
          card.focus();
          card.click();
          return;
        }

        var focused = t && t.closest ? t.closest(".qs-card") : null;
        // Carte « Autre » (div) : Espace / Entrée la cochent comme un bouton.
        if (focused && focused.hasAttribute("data-other") && (e.key === " " || (e.key === "Enter" && !focused.classList.contains("is-selected")))) {
          e.preventDefault();
          focused.click();
          return;
        }

        if (e.key === "Enter") {
          // Choix multiple (ou « Autre ») : Entrée valide l'écran au lieu de
          // re-cocher la carte qui a le focus.
          if (screenEl.getAttribute("data-qs-mode") === "multi" || (next && !next.closest("[hidden]"))) {
            e.preventDefault();
            if (canValidate) next.click();
          }
          return;
        }

        if (focused && (e.key === "ArrowDown" || e.key === "ArrowRight" || e.key === "ArrowUp" || e.key === "ArrowLeft")) {
          var list = Array.prototype.slice.call(cards);
          var pos = list.indexOf(focused);
          var step = e.key === "ArrowDown" || e.key === "ArrowRight" ? 1 : -1;
          e.preventDefault();
          list[(pos + step + list.length) % list.length].focus();
        }
      });
`;
