// ---------------------------------------------------------------------------
// QuestionScreen — composant unique de tous les écrans de questions du
// funnel ColdTrend (choix unique, choix multiple, cartes à icône).
//
// Objectif : comprendre et répondre en moins de 3 secondes.
//
// Structure (identique sur chaque écran) :
//   [ Retour | barre segmentée | Fermer ]      <- en-tête partagé de l'overlay
//   .qs__center (flex, centrage optique : espace au-dessus < espace dessous)
//     .qs__block (max 560px, centré)
//       étiquette MAJUSCULES  (chapterLabel)
//       titre 28px mobile / 36px desktop
//       sous-titre (une ligne visée)
//       indication « 1 choix » / « Plusieurs choix possibles »
//       cartes de réponse (radiogroup ou group de checkbox)
//   .qs__cta sticky « Continuer (n) »          <- choix multiple, ou « Autre »
//
// Disposition des cartes (choisie au build, voir pickLayout) :
//   - 4 options ou moins          -> pile pleine largeur, hauteur 64px min ;
//   - 5-6 options aux libellés courts -> grille 2 colonnes, cartes carrées ;
//   - plus de 6 options            -> erreur de build (règle du brief).
//
// Option « Autre » : { value: "autre", label: "Autre", other: { placeholder,
// maxLength } }. La carte contient son propre champ de saisie, révélé à la
// sélection ; le texte est stocké dans answers[champ + "Autre"] (même
// convention que l'ancien champ libre). Une carte « Autre » n'est pas un
// <button> (un champ ne peut pas vivre dans un bouton) : div role=radio /
// checkbox, tabindex=0, activée au clavier par le script client.
//
// Le moteur existant du quiz est réutilisé tel quel : classes quiz-option /
// is-selected / data-quiz-options / quiz-next, et answers[]. Le script
// client (questionScreenClientJs) ajoute : états ARIA, compteur du CTA,
// passage automatique à 250 ms, touches 1-6 / Entrée / flèches.
//
// Attention (voir mémoire build.mjs) : ce fichier contient du CSS et du JS
// client dans des template literals. Pas de backtick ni d'antislash dans le
// JS client.
// ---------------------------------------------------------------------------

export const QS_MAX_OPTIONS = 6;
// Au-delà, une grille de cartes carrées couperait le libellé en 4 lignes :
// on reste en pile.
export const QS_GRID_MAX_LABEL = 34;
export const QS_AUTO_ADVANCE_MS = 250;
export const QS_STAGGER_MS = 40;

const CHECK_SVG =
  '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" aria-hidden="true"><path class="qs-check__path" d="M5 12.5l4.5 4.5L19 7.5" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>';

function escAttr(v) {
  return String(v).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

// Normalise les trois formes de questions à options vers { field, mode,
// options } : "single" / "multi" (options), "groups" (un seul groupe) et
// "choice-cards" (options à icône SVG, éventuellement « featured »).
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
  if (!Array.isArray(options) || options.length === 0) {
    throw new Error(`QuestionScreen « ${question.id} » : aucune option.`);
  }
  if (options.length > QS_MAX_OPTIONS) {
    throw new Error(`QuestionScreen « ${question.id} » : ${options.length} options, maximum ${QS_MAX_OPTIONS}.`);
  }
  return { field, mode: question.type === "multi" ? "multi" : "single", options };
}

export function pickLayout(options) {
  if (options.length <= 4) return "stack";
  const longest = Math.max(...options.map((o) => String(o.label).length));
  return longest <= QS_GRID_MAX_LABEL ? "grid" : "stack";
}

export const QUESTION_SCREEN_TYPES = ["single", "multi", "groups", "choice-cards"];

/**
 * Rendu HTML d'un écran de question.
 * @param {object} question  entrée de quiz.questions
 * @param {number} index     position dans le funnel (data-index)
 * @param {object} deps      { icons: {nom: svg} } pour les cartes à icône
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
      // Visuel : emoji, sinon icône SVG nommée (cartes Acquisition /
      // Accompagnement). Jamais d'icône inventée si aucune n'est fournie.
      const visual = opt.emoji
        ? `<span class="qs-card__icon qs-card__icon--emoji" aria-hidden="true">${opt.emoji}</span>`
        : opt.icon && icons[opt.icon]
          ? `<span class="qs-card__icon" aria-hidden="true">${icons[opt.icon]}</span>`
          : `<span class="qs-card__icon" aria-hidden="true"></span>`;
      const badge = opt.featured ? `<span class="qs-card__badge">${opt.featured}</span>` : "";
      const common = `class="quiz-option qs-card${opt.featured ? " qs-card--featured" : ""}${opt.other ? " qs-card--other" : ""}" role="${role}" aria-checked="false" data-value="${escAttr(opt.value)}" data-key="${i + 1}" style="--i:${i}"`;
      const inner = `${badge}${visual}
                <span class="qs-card__label">${opt.label}</span>
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
// l'overlay), contrastes AA sur #0A0E1A : texte #F5F6F8 (18:1), gris
// --steel #8A8F98 (6,2:1), bordure sélectionnée cobalt #0047FF (3,2:1,
// composant d'interface).
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
     ressorts tombent à 0 et l'écran défile normalement. */
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

  /* ---- Cartes de réponse ------------------------------------------------ */
  .quiz-screen.qs .qs__options { gap: 8px; }
  .quiz-screen.qs .qs__options--grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    width: 100%;
    /* Côté d'une carte carrée = 17 % de la hauteur d'écran, entre 144px et
       180px : 3 rangées + titre + CTA tiennent sans défilement de 812px
       (mobile) à 900px (portable), et les libellés de 2 lignes restent
       entiers. En dessous (iPhone SE), l'écran défile, CTA toujours collé. */
    max-width: clamp(296px, calc(34vh + 8px), 368px);
    max-width: clamp(296px, calc(34dvh + 8px), 368px);
    margin: 0 auto;
  }

  .quiz-screen.qs .qs-card {
    position: relative;
    display: grid;
    grid-template-columns: 32px 1fr 32px;
    align-items: center;
    gap: 8px;
    min-height: 64px;
    padding: 8px 16px;
    border-radius: 16px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    background: rgba(255, 255, 255, 0.04);
    -webkit-backdrop-filter: blur(12px);
    backdrop-filter: blur(12px);
    color: var(--paper-soft);
    font-size: 16px;
    line-height: 22px;
    text-align: center;
    cursor: pointer;
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.06);
    -webkit-tap-highlight-color: transparent;
    transition: border-color 160ms ease, background-color 160ms ease, box-shadow 160ms ease,
      opacity 320ms cubic-bezier(0.16, 1, 0.3, 1), transform 320ms cubic-bezier(0.16, 1, 0.3, 1);
  }
  .quiz-screen.qs .qs__options--grid .qs-card {
    grid-template-columns: 1fr;
    grid-template-rows: auto auto;
    justify-items: center;
    align-content: center;
    aspect-ratio: 1 / 1;
    min-height: 0;
    padding: 16px 8px;
    gap: 8px;
  }

  /* Entrée en cascade : 40 ms d'écart entre cartes (--i posé au build). */
  .quiz-screen.qs.is-active .qs-card.quiz-option {
    transition-delay: calc(160ms + var(--i, 0) * 40ms);
  }
  .quiz-screen.qs.is-active .qs__cta { transition-delay: 320ms; }

  /* Survol (pointeur fin seulement), pressé, sélectionné. */
  @media (hover: hover) and (pointer: fine) {
    .quiz-screen.qs.is-active .qs-card.quiz-option:hover {
      transform: none;
      border-color: rgba(255, 255, 255, 0.24);
      background: rgba(255, 255, 255, 0.07);
      box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08);
    }
  }
  .quiz-screen.qs.is-active .qs-card.quiz-option:active {
    transform: scale(0.97);
    transition-delay: 0ms;
    transition-duration: 90ms;
  }
  .quiz-screen.qs .qs-card.is-selected,
  .quiz-screen.qs.is-active .qs-card.quiz-option.is-selected:hover {
    border-color: var(--cobalt);
    background: rgba(0, 71, 255, 0.16);
    box-shadow: 0 0 0 1px var(--cobalt), 0 12px 32px -16px rgba(0, 71, 255, 0.8);
  }
  .quiz-screen.qs.is-active .qs-card.quiz-option.is-selected { animation: none; }

  .qs-card__icon {
    display: grid;
    place-items: center;
    width: 32px;
    height: 32px;
    color: var(--paper);
  }
  .qs-card__icon svg { width: 28px; height: 28px; }
  .qs-card__icon--emoji { font-size: 24px; line-height: 1; }
  .qs__options--grid .qs-card__icon { width: 40px; height: 40px; }
  .qs__options--grid .qs-card__icon--emoji { font-size: 32px; }
  .qs-card__label {
    font-weight: 600;
    overflow-wrap: anywhere;
    hyphens: auto;
  }
  .qs__options--grid .qs-card__label { font-size: 15px; line-height: 20px; }

  /* Coche animée : cercle qui se remplit + tracé dessiné. */
  .qs-card__check {
    justify-self: end;
    display: grid;
    place-items: center;
    width: 24px;
    height: 24px;
    border-radius: 50%;
    border: 1.5px solid rgba(255, 255, 255, 0.24);
    color: #fff;
    transition: background-color 160ms ease, border-color 160ms ease, transform 240ms cubic-bezier(0.34, 1.56, 0.64, 1);
  }
  .qs__options--grid .qs-card__check { position: absolute; top: 8px; right: 8px; }
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
  .quiz-screen.qs .qs-card--featured { border-color: rgba(61, 107, 255, 0.45); margin-top: 8px; }
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
  .qs-card__other { grid-column: 1 / -1; width: 100%; padding: 0 0 8px; }
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
  .qs__options--grid .qs-card--other.is-selected { aspect-ratio: auto; grid-column: 1 / -1; }

  /* CTA sticky des choix multiples. */
  .quiz-screen.qs .qs__cta { margin-top: 0; padding-top: 16px; padding-bottom: 16px; }
  .quiz-screen.qs .qs__cta[hidden] { display: none; }
  /* Flex : un espace en tête de <span> serait supprimé, d'où la marge. */
  .qs__count { margin-left: 0.3em; font-variant-numeric: tabular-nums; }
  .qs__count:empty { display: none; }

  .quiz-screen.qs .qs-card:focus-visible,
  .qs-card__other-input:focus-visible {
    outline: 2px solid var(--cobalt-soft);
    outline-offset: 2px;
  }

  @media (prefers-reduced-motion: reduce) {
    .quiz-screen.qs .qs-card,
    .qs-card__check,
    .qs-check__path { transition: none; }
    .quiz-screen.qs.is-active .qs-card.quiz-option:active { transform: none; }
    .qs-card.is-selected .qs-card__check { transform: none; }
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

      // Après un choix : unique -> écran suivant en 250 ms (le temps de voir
      // la coche), sauf « Autre » qui attend sa saisie ; multiple -> rien,
      // le CTA sticky « Continuer (n) » valide.
      function qsAfterPick(screenEl, optBtn, type) {
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
