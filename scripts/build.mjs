import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, "..", "public");
const OUT_FILE = path.join(OUT_DIR, "index.html");

// ---------------------------------------------------------------------------
// Data (content only — never mixed with markup logic below)
// ---------------------------------------------------------------------------

const brand = {
  name: "RichSaaS.ai",
  colors: {
    cobalt: "#0047FF",
    cobaltDark: "#0033B8",
    steel: "#8A8F98",
    verifiedGreen: "#00C48C",
    ink: "#0B0E14",
    inkSoft: "#161B26",
    paper: "#FFFFFF",
    paperSoft: "#F5F6F8",
    border: "#E2E8F0",
    borderDark: "#232936"
  }
};

const hero = {
  eyebrow: "Preuve de revenus vérifiés",
  prefix: "Découvrez des SaaS avec",
  rotatingPhrases: [
    "revenus Stripe vérifiés",
    "MRR réel",
    "zéro opinion générée",
    "données auditées par des tiers"
  ],
  subhead:
    "RichSaaS.ai indexe des SaaS à vendre ou à copier sur la base de revenus vérifiés — pas d'idées générées par IA, pas de promesses en l'air.",
  ctaPrimary: "Voir les SaaS vérifiés",
  ctaSecondary: "Comment on vérifie"
};

const socialProof = {
  label: "Données croisées et vérifiées via",
  sources: ["Stripe", "TrustMRR", "Stripe Connect", "TrustMRR Verified", "Stripe", "TrustMRR"]
};

// ---------------------------------------------------------------------------
// Template
// ---------------------------------------------------------------------------

function renderRotatorNoScript(phrases) {
  // First phrase rendered server-side so the hero is meaningful with JS disabled.
  return phrases[0];
}

function page({ brand, hero, socialProof }) {
  const { colors } = brand;

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${brand.name} — Preuve de revenus vérifiés</title>
<meta name="description" content="${hero.subhead}" />
<style>
  :root {
    --cobalt: ${colors.cobalt};
    --cobalt-dark: ${colors.cobaltDark};
    --steel: ${colors.steel};
    --verified-green: ${colors.verifiedGreen};
    --ink: ${colors.ink};
    --ink-soft: ${colors.inkSoft};
    --paper: ${colors.paper};
    --paper-soft: ${colors.paperSoft};
    --border: ${colors.border};
    color-scheme: light dark;
  }

  * { box-sizing: border-box; }

  html, body {
    margin: 0;
    padding: 0;
    background: var(--paper);
    color: var(--ink);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Inter, Arial, sans-serif;
  }

  body {
    background: var(--paper);
    color: var(--ink);
  }

  @media (prefers-color-scheme: dark) {
    body { background: var(--ink); color: var(--paper-soft); }
  }

  .wrap {
    max-width: 1120px;
    margin: 0 auto;
    padding-inline: 20px;
  }

  /* ---------------- Hero ---------------- */

  .hero {
    padding-block: 56px 40px;
    text-align: center;
  }

  .hero__eyebrow {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--cobalt);
    background: rgba(0, 71, 255, 0.08);
    border: 1px solid rgba(0, 71, 255, 0.18);
    border-radius: 999px;
    padding: 6px 14px;
    margin-bottom: 20px;
  }

  @media (prefers-color-scheme: dark) {
    .hero__eyebrow {
      background: rgba(0, 71, 255, 0.16);
      border-color: rgba(0, 71, 255, 0.32);
    }
  }

  .hero__title {
    font-size: clamp(28px, 7vw, 52px);
    line-height: 1.15;
    font-weight: 800;
    letter-spacing: -0.02em;
    margin: 0 0 18px;
  }

  .hero__title-static {
    display: block;
  }

  .hero__rotator {
    display: inline-block;
    min-height: 1.2em;
    color: var(--cobalt);
    white-space: nowrap;
  }

  .hero__rotator-text {
    border-right: 3px solid var(--cobalt);
    padding-right: 4px;
  }

  .hero__rotator-text.no-caret {
    border-right-color: transparent;
  }

  @media (prefers-reduced-motion: no-preference) {
    .hero__rotator-text {
      animation: caret-blink 0.85s steps(1) infinite;
    }
  }

  @keyframes caret-blink {
    0%, 45% { border-right-color: var(--cobalt); }
    50%, 100% { border-right-color: transparent; }
  }

  .hero__subhead {
    max-width: 620px;
    margin: 0 auto 32px;
    font-size: clamp(15px, 3.6vw, 18px);
    line-height: 1.6;
    color: var(--steel);
  }

  .hero__actions {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
  }

  @media (min-width: 480px) {
    .hero__actions { flex-direction: row; justify-content: center; }
  }

  .btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    max-width: 320px;
    padding: 14px 28px;
    border-radius: 10px;
    font-size: 16px;
    font-weight: 700;
    text-decoration: none;
    cursor: pointer;
    border: 1px solid transparent;
    transition: transform 0.18s ease, box-shadow 0.28s ease, background 0.18s ease;
  }

  @media (min-width: 480px) {
    .btn { width: auto; }
  }

  .btn--primary {
    background: var(--cobalt);
    color: #fff;
    box-shadow: 0 0 0 0 rgba(0, 71, 255, 0);
  }

  .btn--primary:hover,
  .btn--primary:focus-visible {
    background: var(--cobalt-dark);
    transform: translateY(-1px);
    box-shadow: 0 8px 24px -6px rgba(0, 71, 255, 0.55), 0 0 32px rgba(0, 71, 255, 0.35);
  }

  .btn--secondary {
    background: transparent;
    color: var(--ink);
    border-color: var(--border);
  }

  @media (prefers-color-scheme: dark) {
    .btn--secondary { color: var(--paper-soft); border-color: var(--borderDark, #2A3140); }
  }

  .btn--secondary:hover,
  .btn--secondary:focus-visible {
    border-color: var(--cobalt);
    color: var(--cobalt);
  }

  /* ---------------- Social proof strip ---------------- */

  .proof {
    padding-block: 28px 48px;
    border-top: 1px solid var(--border);
  }

  @media (prefers-color-scheme: dark) {
    .proof { border-top-color: #232936; }
  }

  .proof__label {
    text-align: center;
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: var(--steel);
    margin: 0 0 18px;
  }

  .proof__track-viewport {
    overflow: hidden;
    mask-image: linear-gradient(to right, transparent, black 12%, black 88%, transparent);
    -webkit-mask-image: linear-gradient(to right, transparent, black 12%, black 88%, transparent);
  }

  .proof__track {
    display: flex;
    align-items: center;
    gap: 40px;
    width: max-content;
    animation: proof-scroll 22s linear infinite;
  }

  @media (prefers-reduced-motion: reduce) {
    .proof__track { animation: none; }
  }

  @keyframes proof-scroll {
    from { transform: translateX(0); }
    to { transform: translateX(-50%); }
  }

  .proof__item {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-weight: 700;
    font-size: 15px;
    color: var(--steel);
    white-space: nowrap;
  }

  .proof__item svg {
    width: 14px;
    height: 14px;
    flex-shrink: 0;
    color: var(--verified-green);
  }

  .proof__item strong {
    color: var(--ink);
    font-weight: 800;
  }

  @media (prefers-color-scheme: dark) {
    .proof__item strong { color: var(--paper-soft); }
  }
</style>
</head>
<body>
  <main class="wrap">
    <section class="hero">
      <span class="hero__eyebrow">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <path d="M20 6L9 17l-5-5" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        ${hero.eyebrow}
      </span>
      <h1 class="hero__title">
        <span class="hero__title-static">${hero.prefix}</span>
        <span class="hero__rotator" id="rotator" aria-live="polite">
          <span class="hero__rotator-text" id="rotator-text">${renderRotatorNoScript(hero.rotatingPhrases)}</span>
        </span>
      </h1>
      <p class="hero__subhead">${hero.subhead}</p>
      <div class="hero__actions">
        <a class="btn btn--primary" href="#pricing">${hero.ctaPrimary}</a>
        <a class="btn btn--secondary" href="#methodology">${hero.ctaSecondary}</a>
      </div>
    </section>

    <section class="proof" aria-label="Sources de données vérifiées">
      <p class="proof__label">${socialProof.label}</p>
      <div class="proof__track-viewport">
        <div class="proof__track" id="proof-track">
          ${renderProofItems(socialProof.sources)}
          ${renderProofItems(socialProof.sources, true)}
        </div>
      </div>
    </section>
  </main>

  <script>
    (function () {
      var phrases = ${JSON.stringify(hero.rotatingPhrases)};
      var el = document.getElementById("rotator-text");
      if (!el) return;

      var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (reduceMotion) return;

      var TYPE_SPEED = 45;
      var DELETE_SPEED = 30;
      var HOLD_MS = 1600;
      var index = 0;
      var timer = null;

      function typePhrase(phrase, cb) {
        var i = 0;
        el.classList.remove("no-caret");
        (function step() {
          el.textContent = phrase.slice(0, i);
          i++;
          if (i <= phrase.length) {
            timer = setTimeout(step, TYPE_SPEED);
          } else {
            cb();
          }
        })();
      }

      function deletePhrase(phrase, cb) {
        var i = phrase.length;
        (function step() {
          el.textContent = phrase.slice(0, i);
          i--;
          if (i >= 0) {
            timer = setTimeout(step, DELETE_SPEED);
          } else {
            cb();
          }
        })();
      }

      function loop() {
        var phrase = phrases[index % phrases.length];
        typePhrase(phrase, function () {
          timer = setTimeout(function () {
            deletePhrase(phrase, function () {
              index++;
              loop();
            });
          }, HOLD_MS);
        });
      }

      // Avoid double-typing the first phrase already rendered server-side.
      timer = setTimeout(function () {
        deletePhrase(phrases[0], function () {
          index = 1;
          loop();
        });
      }, HOLD_MS);
    })();
  </script>
</body>
</html>
`;
}

function renderProofItems(sources, ariaHidden) {
  return sources
    .map(
      (name) => `<span class="proof__item"${ariaHidden ? ' aria-hidden="true"' : ""}>
        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <path d="M20 6L9 17l-5-5" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <strong>${name}</strong>
      </span>`
    )
    .join("\n          ");
}

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(OUT_FILE, page({ brand, hero, socialProof }), "utf8");
console.log(`Built ${path.relative(process.cwd(), OUT_FILE)}`);
