// ---------------------------------------------------------------------------
// Pages légales ColdTrend — template réutilisable + contenu des 6 pages
// (mentions légales, CGV, CGU, confidentialité, cookies, garantie) et de la
// page de résiliation /resilier.
//
// Règles de contenu (validées avec l'exploitant) :
// - Aucune donnée juridique inventée. Tout ce qui n'est pas connu est
//   marqué todo() -> [À COMPLÉTER], visible et surligné sur la page tant
//   qu'il n'est pas renseigné.
// - Les prix ne sont jamais recopiés à la main : ils viennent de
//   DURATION_PLANS (build.mjs), la même source que les cartes de paiement
//   et les Price ID Stripe. Les CGV ne peuvent donc pas annoncer un autre
//   prix que celui facturé.
// - Faits repris du site existant : éditeur, email de contact, hébergeur,
//   conditions de la garantie, résiliation sans prorata, sous-traitants
//   réellement appelés par le code (Supabase, Vercel, Stripe, Resend,
//   OpenRouter, Crisp, jsDelivr).
// - L'ensemble reste à faire valider par un juriste avant d'être considéré
//   comme définitif.
//
// Template : legalPage() rend hero (titre, date, temps de lecture),
// encadré "L'essentiel en 30 secondes", sommaire sticky à gauche avec
// surlignage de la section active (repliable en mobile), contenu à 70
// caractères par ligne et interligne 1,7, icône par section, ancres
// partageables (clic = lien copié), bouton imprimer / PDF.
//
// Attention : HTML/CSS/JS dans des template literals -- pas de backtick ni
// d'antislash dans le JS client.
// ---------------------------------------------------------------------------

import { siteFooterCss, siteFooterHtml } from "./site-footer.mjs";

export const LEGAL_UPDATED_AT = "2 octobre 2026";
const CONTACT_EMAIL = "contact.facero2026@gmail.com";

// [À COMPLÉTER] visible : volontairement voyant (surligné ambre) pour ne
// jamais être pris pour une information définitive.
function todo(detail) {
  return `<mark class="lg-todo">[À COMPLÉTER${detail ? " : " + detail : ""}]</mark>`;
}

const mail = `<a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a>`;

// ---- Icônes (traits 24px, currentColor) ----------------------------------
const ICON_PATHS = {
  building: '<path d="M4 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16"/><path d="M16 9h2a2 2 0 0 1 2 2v10"/><path d="M8 7h4M8 11h4M8 15h4M3 21h18"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
  server: '<rect x="3" y="4" width="18" height="7" rx="2"/><rect x="3" y="13" width="18" height="7" rx="2"/><path d="M7 7.5h.01M7 16.5h.01"/>',
  scale: '<path d="M12 3v18M5 21h14M7 7h10"/><path d="m7 7-3 7a3 3 0 0 0 6 0L7 7zM17 7l-3 7a3 3 0 0 0 6 0l-3-7z"/>',
  copyright: '<circle cx="12" cy="12" r="9"/><path d="M15 9.5a3.5 3.5 0 1 0 0 5"/>',
  doc: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>',
  euro: '<path d="M17 6.5A7 7 0 1 0 17 17.5"/><path d="M4 10h9M4 14h9"/>',
  card: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20M6 15h4"/>',
  refresh: '<path d="M20 11a8 8 0 0 0-14.9-4M4 4v4h4"/><path d="M4 13a8 8 0 0 0 14.9 4M20 20v-4h-4"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
  shield: '<path d="M12 3 4 6v6c0 5 3.4 8.3 8 9 4.6-.7 8-4 8-9V6z"/><path d="m9 12 2 2 4-4"/>',
  sparkles: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4"/><path d="m6 6 2 2M16 16l2 2M6 18l2-2M16 8l2-2"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  database: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5"/><path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6.5 6.5 0 0 1 3.5 6"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  cookie: '<path d="M21 12a9 9 0 1 1-9-9 3 3 0 0 0 3 3 3 3 0 0 0 3 3 3 3 0 0 0 3 3z"/><path d="M8.5 9.5h.01M15 15h.01M10 15.5h.01"/>',
  sliders: '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
  alert: '<path d="M12 3 2 20h20z"/><path d="M12 10v4M12 17h.01"/>',
  check: '<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
  x: '<circle cx="12" cy="12" r="9"/><path d="m9 9 6 6M15 9l-6 6"/>',
  handshake: '<path d="m11 17 2 2a1.4 1.4 0 0 0 2-2"/><path d="m14 14 2.5 2.5a1.4 1.4 0 0 0 2-2L15 11l-2 2-3-3 4-4h3l4 4-2 2"/><path d="M3 10l4-4h3l-4 4 3 3"/><path d="M3 10l6 6 2 1"/>',
  ban: '<circle cx="12" cy="12" r="9"/><path d="m5.7 5.7 12.6 12.6"/>',
  printer: '<path d="M7 9V3h10v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M7 14h10v7H7z"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  list: '<path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01"/>',
  arrowLeft: '<path d="M19 12H5M11 18l-6-6 6-6"/>',
  send: '<path d="m22 2-7 20-4-9-9-4z"/><path d="M22 2 11 13"/>',
  hourglass: '<path d="M6 3h12M6 21h12M7 3c0 5 10 5 10 9s-10 4-10 9M17 3c0 5-10 5-10 9"/>',
  video: '<rect x="2" y="6" width="14" height="12" rx="2"/><path d="m16 10 6-3v10l-6-3"/>',
  cart: '<circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M2 3h3l2.7 12.4a2 2 0 0 0 2 1.6h7.8a2 2 0 0 0 2-1.5L21 8H6"/>'
};

function icon(name, size = 20) {
  return `<svg class="lg-icon" viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICON_PATHS[name] || ICON_PATHS.doc}</svg>`;
}

// Temps de lecture : ~220 mots/minute sur le texte réel des sections.
function readingMinutes(sections, essentials) {
  const text = sections.map((s) => s.html).join(" ") + " " + essentials.join(" ");
  const words = text.replace(/<[^>]+>/g, " ").split(/[ \n\t]+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 220));
}

// ---- Styles du template ----------------------------------------------------
function legalCss() {
  return `
  :root {
    color-scheme: dark;
    --lg-bg: #0A0E1A;
    --lg-bg-raised: #111727;
    --lg-line: rgba(255, 255, 255, 0.08);
    --lg-text: #E4E6EB;
    --lg-strong: #F5F6F8;
    --lg-muted: #8A8F98;
    --lg-accent: #3D6BFF;
    --lg-accent-strong: #0047FF;
    --lg-green: #22C55E;
    --lg-amber: #D9A23D;
    --lg-red: #D9605A;
  }
  * { box-sizing: border-box; }
  html { scroll-behavior: smooth; scroll-padding-top: 88px; }
  @media (prefers-reduced-motion: reduce) { html { scroll-behavior: auto; } }
  html, body { margin: 0; background: var(--lg-bg); color: var(--lg-text); }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Inter, Arial, sans-serif;
    font-size: 17px;
    line-height: 1.7;
    -webkit-font-smoothing: antialiased;
  }
  a { color: var(--lg-accent); text-underline-offset: 3px; }
  a:hover { color: #6E8FFF; }
  :focus-visible { outline: 2px solid var(--lg-accent); outline-offset: 3px; border-radius: 4px; }
  .lg-icon { flex: none; }

  /* Barre du haut */
  .lg-topbar {
    position: sticky; top: 0; z-index: 20;
    display: flex; align-items: center; justify-content: space-between; gap: 16px;
    padding: 14px 24px;
    background: rgba(10, 14, 26, 0.82);
    backdrop-filter: saturate(160%) blur(14px);
    -webkit-backdrop-filter: saturate(160%) blur(14px);
    border-bottom: 1px solid var(--lg-line);
  }
  .lg-brand { color: var(--lg-strong); font-weight: 800; font-size: 17px; text-decoration: none; letter-spacing: -0.01em; }
  .lg-back { display: inline-flex; align-items: center; gap: 6px; color: var(--lg-muted); font-size: 14px; text-decoration: none; }
  .lg-back:hover { color: var(--lg-strong); }

  /* Hero court */
  .lg-hero {
    position: relative;
    overflow: hidden;
    padding: 64px 24px 40px;
    border-bottom: 1px solid var(--lg-line);
  }
  .lg-hero::before {
    content: "";
    position: absolute; inset: -40% -10% auto -10%; height: 140%;
    background:
      radial-gradient(40% 50% at 20% 30%, rgba(0, 71, 255, 0.28), transparent 70%),
      radial-gradient(30% 40% at 85% 20%, rgba(61, 107, 255, 0.18), transparent 70%);
    pointer-events: none;
    animation: lg-glow 14s ease-in-out infinite alternate;
  }
  @keyframes lg-glow { to { transform: translate3d(3%, 4%, 0) scale(1.05); } }
  .lg-hero__inner { position: relative; max-width: 1120px; margin: 0 auto; }
  .lg-eyebrow {
    display: inline-flex; align-items: center; gap: 8px;
    margin: 0 0 14px; padding: 5px 12px;
    border: 1px solid rgba(61, 107, 255, 0.4); border-radius: 999px;
    background: rgba(0, 71, 255, 0.12);
    color: #C8D4FF; font-size: 12px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase;
  }
  .lg-hero h1 {
    margin: 0;
    font-size: clamp(30px, 5.4vw, 52px);
    line-height: 1.08;
    letter-spacing: -0.02em;
    color: var(--lg-strong);
    max-width: 20ch;
  }
  .lg-hero__lead { margin: 14px 0 0; max-width: 60ch; color: var(--lg-muted); font-size: 17px; }
  .lg-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 18px; margin-top: 24px; color: var(--lg-muted); font-size: 14px; }
  .lg-meta span { display: inline-flex; align-items: center; gap: 6px; }
  .lg-print {
    display: inline-flex; align-items: center; gap: 8px;
    padding: 8px 14px; border-radius: 10px;
    border: 1px solid var(--lg-line); background: var(--lg-bg-raised);
    color: var(--lg-strong); font: inherit; font-size: 14px; font-weight: 600; cursor: pointer;
    transition: border-color 150ms ease;
  }
  .lg-print:hover { border-color: var(--lg-accent); }

  /* Mise en page */
  .lg-shell { max-width: 1120px; margin: 0 auto; padding: 40px 24px 80px; }
  .lg-layout { display: grid; grid-template-columns: 240px minmax(0, 1fr); gap: 56px; align-items: start; }

  /* L'essentiel en 30 secondes */
  .lg-essentials {
    position: relative;
    max-width: calc(70ch + 56px);
    margin: 0 0 48px;
    padding: 24px 28px;
    border-radius: 18px;
    background: linear-gradient(160deg, rgba(0, 71, 255, 0.16), rgba(17, 23, 39, 0.9) 55%);
    border: 1px solid rgba(61, 107, 255, 0.35);
    box-shadow: 0 20px 60px -30px rgba(0, 71, 255, 0.6);
  }
  .lg-essentials h2 { display: flex; align-items: center; gap: 10px; margin: 0 0 14px; font-size: 18px; color: var(--lg-strong); }
  .lg-essentials ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 10px; }
  .lg-essentials li { display: grid; grid-template-columns: 22px 1fr; gap: 10px; color: var(--lg-strong); }
  .lg-essentials li .lg-icon { margin-top: 4px; color: var(--lg-green); }
  .lg-essentials__note { margin: 16px 0 0; font-size: 13px; color: var(--lg-muted); }

  /* Sommaire */
  .lg-toc { position: sticky; top: 88px; max-height: calc(100vh - 110px); overflow: auto; font-size: 14px; }
  .lg-toc summary {
    display: flex; align-items: center; gap: 8px;
    list-style: none; cursor: pointer;
    font-size: 12px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--lg-muted);
    margin-bottom: 12px;
  }
  .lg-toc summary::-webkit-details-marker { display: none; }
  .lg-toc ol { list-style: none; margin: 0; padding: 0; border-left: 1px solid var(--lg-line); }
  .lg-toc a {
    display: block; padding: 6px 0 6px 14px; margin-left: -1px;
    border-left: 2px solid transparent;
    color: var(--lg-muted); text-decoration: none; line-height: 1.4;
    transition: color 150ms ease, border-color 150ms ease;
  }
  .lg-toc a:hover { color: var(--lg-strong); }
  .lg-toc a.is-active { color: var(--lg-strong); border-left-color: var(--lg-accent); font-weight: 600; }

  /* Contenu : 70 caractères par ligne, interligne 1,7 */
  .lg-content { min-width: 0; }
  .lg-section { max-width: 70ch; padding-bottom: 12px; margin-bottom: 40px; }
  .lg-section h2 {
    position: relative;
    display: flex; align-items: center; gap: 12px;
    margin: 0 0 16px;
    font-size: 23px; line-height: 1.3; letter-spacing: -0.01em; color: var(--lg-strong);
  }
  .lg-section__icon {
    display: grid; place-items: center; flex: none;
    width: 38px; height: 38px; border-radius: 11px;
    background: rgba(0, 71, 255, 0.14); color: #9DB4FF;
    border: 1px solid rgba(61, 107, 255, 0.3);
  }
  .lg-anchor {
    display: inline-grid; place-items: center;
    width: 28px; height: 28px; border-radius: 8px;
    color: var(--lg-muted); opacity: 0; transition: opacity 150ms ease, color 150ms ease;
  }
  .lg-section h2:hover .lg-anchor, .lg-anchor:focus-visible { opacity: 1; }
  .lg-anchor:hover { color: var(--lg-strong); }
  @media (hover: none) { .lg-anchor { opacity: 0.6; } }
  .lg-section h3 { margin: 26px 0 8px; font-size: 18px; color: var(--lg-strong); }
  .lg-section p { margin: 0 0 16px; }
  .lg-section ul, .lg-section ol { margin: 0 0 16px; padding-left: 22px; }
  .lg-section li { margin-bottom: 8px; }
  .lg-section strong { color: var(--lg-strong); }
  .lg-todo {
    background: rgba(217, 162, 61, 0.16); color: #F3C66B;
    border: 1px dashed rgba(217, 162, 61, 0.6); border-radius: 6px;
    padding: 1px 6px; font-weight: 700; font-size: 0.92em;
  }
  .lg-callout {
    display: grid; grid-template-columns: 22px 1fr; gap: 12px;
    margin: 0 0 18px; padding: 16px 18px; border-radius: 14px;
    background: var(--lg-bg-raised); border: 1px solid var(--lg-line);
  }
  .lg-callout .lg-icon { margin-top: 4px; color: var(--lg-amber); }
  .lg-callout p:last-child { margin-bottom: 0; }
  .lg-callout--good .lg-icon { color: var(--lg-green); }
  .lg-callout--bad .lg-icon { color: var(--lg-red); }

  /* Tableaux (prix, sous-traitants, cookies) */
  .lg-table-wrap { overflow-x: auto; margin: 0 0 18px; border: 1px solid var(--lg-line); border-radius: 14px; }
  .lg-table { width: 100%; border-collapse: collapse; font-size: 15px; line-height: 1.5; }
  .lg-table th, .lg-table td { padding: 12px 14px; text-align: left; vertical-align: top; border-bottom: 1px solid var(--lg-line); }
  .lg-table th { color: var(--lg-muted); font-size: 12px; text-transform: uppercase; letter-spacing: 0.06em; background: var(--lg-bg-raised); }
  .lg-table tr:last-child td { border-bottom: 0; }

  /* Frise (page Garantie) */
  .lg-timeline { list-style: none; margin: 8px 0 24px; padding: 0; counter-reset: lg-step; }
  .lg-timeline li {
    position: relative; display: grid; grid-template-columns: 44px 1fr; gap: 16px;
    padding-bottom: 26px; margin: 0;
  }
  .lg-timeline li::before {
    content: ""; position: absolute; left: 21px; top: 44px; bottom: 0; width: 2px;
    background: linear-gradient(var(--lg-accent), rgba(61, 107, 255, 0.15));
  }
  .lg-timeline li:last-child::before { display: none; }
  .lg-timeline__dot {
    display: grid; place-items: center; width: 44px; height: 44px; border-radius: 50%;
    background: var(--lg-bg-raised); border: 2px solid var(--lg-accent); color: #C8D4FF;
  }
  .lg-timeline__when { display: inline-block; margin-bottom: 2px; font-size: 12px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: #9DB4FF; }
  .lg-timeline__title { display: block; color: var(--lg-strong); font-weight: 700; }
  .lg-timeline__text { display: block; color: var(--lg-text); }

  /* Carte d'action (CTA contact, résiliation) */
  .lg-cta {
    display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 16px;
    margin: 8px 0 24px; padding: 22px 24px; border-radius: 18px;
    background: linear-gradient(140deg, rgba(0, 71, 255, 0.22), rgba(17, 23, 39, 0.95));
    border: 1px solid rgba(61, 107, 255, 0.4);
  }
  .lg-cta p { margin: 0; color: var(--lg-strong); font-weight: 600; max-width: 42ch; }
  .lg-btn {
    display: inline-flex; align-items: center; justify-content: center; gap: 8px;
    min-height: 48px; padding: 12px 20px; border-radius: 12px; border: 0;
    background: var(--lg-accent-strong); color: #fff; font: inherit; font-size: 15px; font-weight: 700;
    text-decoration: none; cursor: pointer; transition: filter 150ms ease, transform 150ms ease;
  }
  .lg-btn:hover { color: #fff; filter: brightness(1.12); }
  .lg-btn:active { transform: scale(0.98); }
  .lg-btn[disabled] { opacity: 0.6; cursor: progress; }
  .lg-btn--ghost { background: transparent; border: 1px solid var(--lg-line); color: var(--lg-strong); }
  .lg-status { margin: 0 0 16px; font-size: 15px; color: var(--lg-muted); }
  .lg-status[hidden] { display: none; }

  /* Toast "Lien copié" */
  .lg-toast {
    position: fixed; left: 50%; bottom: 24px; z-index: 30;
    transform: translate(-50%, 20px); opacity: 0;
    padding: 10px 16px; border-radius: 10px;
    background: var(--lg-strong); color: var(--lg-bg); font-size: 14px; font-weight: 700;
    transition: opacity 200ms ease, transform 200ms ease; pointer-events: none;
  }
  .lg-toast.is-visible { opacity: 1; transform: translate(-50%, 0); }

  /* Apparition douce des sections */
  .lg-reveal { opacity: 0; transform: translateY(12px); transition: opacity 500ms cubic-bezier(0.16, 1, 0.3, 1), transform 500ms cubic-bezier(0.16, 1, 0.3, 1); }
  .lg-reveal.is-in { opacity: 1; transform: none; }
  @media (prefers-reduced-motion: reduce) {
    .lg-reveal { opacity: 1; transform: none; transition: none; }
    .lg-hero::before { animation: none; }
  }

  /* Mobile : sommaire repliable au-dessus du texte */
  @media (max-width: 900px) {
    .lg-layout { grid-template-columns: 1fr; gap: 24px; }
    .lg-toc {
      position: static; max-height: none;
      padding: 14px 16px; border-radius: 14px;
      background: var(--lg-bg-raised); border: 1px solid var(--lg-line);
    }
    .lg-toc summary { margin: 0; min-height: 28px; }
    .lg-toc[open] summary { margin-bottom: 10px; }
    .lg-toc summary::after { content: ""; margin-left: auto; width: 8px; height: 8px; border-right: 2px solid currentColor; border-bottom: 2px solid currentColor; transform: rotate(45deg); transition: transform 200ms ease; }
    .lg-toc[open] summary::after { transform: rotate(-135deg); }
  }
  @media (max-width: 640px) {
    body { font-size: 16px; }
    .lg-topbar { padding: 12px 16px; }
    .lg-hero { padding: 44px 16px 32px; }
    .lg-shell { padding: 28px 16px 64px; }
    .lg-essentials { padding: 20px; }
    .lg-section h2 { font-size: 20px; }
    .lg-cta { padding: 18px; }
    .lg-cta .lg-btn { width: 100%; }
  }

  /* Impression / PDF : texte noir sur blanc, sans navigation */
  @media print {
    :root { color-scheme: light; }
    html, body { background: #fff !important; color: #111 !important; font-size: 11pt; }
    .lg-topbar, .lg-toc, .lg-print, .lg-anchor, .lg-toast, .lg-cta .lg-btn { display: none !important; }
    .lg-hero { padding: 0 0 12pt; border: 0; }
    .lg-hero::before { display: none; }
    .lg-hero h1, .lg-section h2, .lg-section h3, .lg-essentials h2, .lg-section strong, .lg-essentials li, .lg-timeline__title { color: #111 !important; }
    .lg-hero__lead, .lg-meta, .lg-essentials__note { color: #444 !important; }
    .lg-shell { padding: 0; }
    .lg-layout { display: block; }
    .lg-essentials, .lg-callout, .lg-cta, .lg-table-wrap { background: #fff !important; border: 1px solid #bbb !important; box-shadow: none !important; }
    .lg-section__icon { background: #fff; border-color: #bbb; color: #111; }
    .lg-reveal { opacity: 1 !important; transform: none !important; }
    .lg-section { break-inside: avoid-page; }
    a { color: #111; }
    .lg-section a[href^="http"]::after { content: " (" attr(href) ")"; font-size: 9pt; color: #444; }
  }
  `;
}

// ---- Script client du template ---------------------------------------------
// Scrollspy (IntersectionObserver), sommaire ouvert en desktop / replié en
// mobile, ancres copiées au clic, impression, apparition des sections.
function legalClientJs() {
  return `
  (function () {
    var toc = document.getElementById("lg-toc");
    var mq = window.matchMedia("(max-width: 900px)");
    function syncToc() { if (toc) toc.open = !mq.matches; }
    syncToc();
    if (mq.addEventListener) mq.addEventListener("change", syncToc);

    var links = toc ? Array.prototype.slice.call(toc.querySelectorAll("a[data-toc]")) : [];
    var sections = Array.prototype.slice.call(document.querySelectorAll(".lg-section"));

    function setActive(id) {
      links.forEach(function (a) {
        var on = a.getAttribute("data-toc") === id;
        a.classList.toggle("is-active", on);
        if (on) a.setAttribute("aria-current", "location");
        else a.removeAttribute("aria-current");
      });
    }

    if ("IntersectionObserver" in window && sections.length) {
      var visible = {};
      var spy = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) { visible[e.target.id] = e.isIntersecting; });
        for (var i = 0; i < sections.length; i += 1) {
          if (visible[sections[i].id]) { setActive(sections[i].id); return; }
        }
      }, { rootMargin: "-90px 0px -60% 0px", threshold: 0 });
      sections.forEach(function (s) { spy.observe(s); });

      // Apparition douce : la classe est posée ici, jamais dans le HTML,
      // pour que le texte reste visible sans JS (lecteurs, mode lecture).
      // Seules les sections encore sous la ligne de flottaison sont
      // concernées : rien ne disparaît sous les yeux au chargement.
      var reveal = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (e.isIntersecting) { e.target.classList.add("is-in"); reveal.unobserve(e.target); }
        });
      }, { rootMargin: "0px 0px -8% 0px" });
      sections.forEach(function (s) {
        if (s.getBoundingClientRect().top < window.innerHeight) return;
        s.classList.add("lg-reveal");
        reveal.observe(s);
      });
    }

    // En mobile, choisir une entrée du sommaire le referme.
    links.forEach(function (a) {
      a.addEventListener("click", function () { if (mq.matches && toc) toc.open = false; });
    });

    var toast = document.getElementById("lg-toast");
    var toastTimer = null;
    function showToast(text) {
      if (!toast) return;
      toast.textContent = text;
      toast.classList.add("is-visible");
      window.clearTimeout(toastTimer);
      toastTimer = window.setTimeout(function () { toast.classList.remove("is-visible"); }, 1800);
    }

    // Ancres partageables : le clic met l'ancre dans l'URL et copie le lien.
    document.querySelectorAll(".lg-anchor").forEach(function (a) {
      a.addEventListener("click", function (e) {
        e.preventDefault();
        var hash = a.getAttribute("href");
        var url = window.location.origin + window.location.pathname + hash;
        window.history.replaceState(null, "", hash);
        var target = document.querySelector(hash);
        if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(url).then(function () { showToast("Lien copié"); }, function () { showToast("Lien prêt dans la barre d'adresse"); });
        } else {
          showToast("Lien prêt dans la barre d'adresse");
        }
      });
    });

    var printBtn = document.getElementById("lg-print");
    if (printBtn) printBtn.addEventListener("click", function () { window.print(); });
  })();
  `;
}

// ---- Template réutilisable -------------------------------------------------
// sections : [{ id, icon, title, html }] ; essentials : 3-5 phrases claires.
// extraHead / extraScripts : pour une page qui a besoin de Supabase (/resilier).
export function legalPage({ brand, siteUrl, slug, title, lead, metaDescription, essentials, sections, extraHead = "", extraScripts = "", noindex = false }) {
  const minutes = readingMinutes(sections, essentials);
  const tocItems = sections
    .map((s) => `<li><a href="#${s.id}" data-toc="${s.id}">${s.title}</a></li>`)
    .join("\n          ");
  const sectionHtml = sections
    .map(
      (s) => `
        <section class="lg-section" id="${s.id}" aria-labelledby="${s.id}-title">
          <h2 id="${s.id}-title"><span class="lg-section__icon">${icon(s.icon)}</span><span>${s.title}</span><a class="lg-anchor" href="#${s.id}" aria-label="Copier le lien vers « ${s.title.replace(/<[^>]+>/g, "")} »">${icon("link", 16)}</a></h2>
          ${s.html}
        </section>`
    )
    .join("\n");

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
${noindex ? '<meta name="robots" content="noindex" />' : ""}
<title>${brand.name} — ${title}</title>
<meta name="description" content="${metaDescription}" />
<link rel="canonical" href="${siteUrl}/${slug}" />
<style>${legalCss()}${siteFooterCss()}</style>
${extraHead}
</head>
<body>
  <header class="lg-topbar">
    <a class="lg-brand" href="/">${brand.name}</a>
    <a class="lg-back" href="/">${icon("arrowLeft", 16)} Retour à l'accueil</a>
  </header>

  <main>
    <section class="lg-hero">
      <div class="lg-hero__inner">
        <p class="lg-eyebrow">${icon("scale", 14)} Informations légales</p>
        <h1>${title}</h1>
        ${lead ? `<p class="lg-hero__lead">${lead}</p>` : ""}
        <div class="lg-meta">
          <span>${icon("clock", 16)} Mis à jour le <time>${LEGAL_UPDATED_AT}</time></span>
          <span>${icon("doc", 16)} Lecture : ${minutes} min</span>
          <button type="button" class="lg-print" id="lg-print">${icon("printer", 16)} Imprimer / PDF</button>
        </div>
      </div>
    </section>

    <div class="lg-shell">
      <aside class="lg-essentials" aria-labelledby="lg-essentials-title">
        <h2 id="lg-essentials-title">${icon("sparkles", 20)} L'essentiel en 30 secondes</h2>
        <ul>
          ${essentials.map((e) => `<li>${icon("check", 18)}<span>${e}</span></li>`).join("\n          ")}
        </ul>
        <p class="lg-essentials__note">Ce résumé aide à la lecture mais ne remplace pas le texte : le texte complet fait foi.</p>
      </aside>

      <div class="lg-layout">
        <details class="lg-toc" id="lg-toc" open>
          <summary>${icon("list", 16)} Sommaire</summary>
          <nav aria-label="Sommaire">
            <ol>
          ${tocItems}
            </ol>
          </nav>
        </details>
        <article class="lg-content">
${sectionHtml}
        </article>
      </div>
    </div>
  </main>

  <div class="lg-toast" id="lg-toast" role="status" aria-live="polite"></div>
  ${siteFooterHtml({ brandName: brand.name })}
  <script>${legalClientJs()}</script>
  ${extraScripts}
</body>
</html>
`;
}

// ---- Blocs réutilisés --------------------------------------------------------
function plansTable(plans) {
  const rows = plans
    .map(
      (p) => `<tr><td><strong>${p.label}</strong></td><td>${p.totalPrice}</td><td>${p.cadenceShort}</td><td>soit ~${p.monthlyEquivalentPrice} par mois</td></tr>`
    )
    .join("");
  return `<div class="lg-table-wrap"><table class="lg-table">
    <thead><tr><th scope="col">Formule</th><th scope="col">Prix</th><th scope="col">Facturation</th><th scope="col">Équivalent</th></tr></thead>
    <tbody>${rows}</tbody>
  </table></div>`;
}

function callout(kind, iconName, html) {
  return `<div class="lg-callout${kind ? " lg-callout--" + kind : ""}">${icon(iconName, 18)}<div>${html}</div></div>`;
}

const EDITOR_BLOCK = `
  <ul>
    <li><strong>Éditeur :</strong> Maxence Lefebvre, entrepreneur individuel (micro-entreprise)</li>
    <li><strong>Raison sociale / nom commercial :</strong> ${todo("dénomination exacte figurant au registre")}</li>
    <li><strong>SIRET :</strong> ${todo("numéro SIRET")}</li>
    <li><strong>Adresse :</strong> ${todo("adresse postale de l'entreprise")}</li>
    <li><strong>Email :</strong> ${mail}</li>
  </ul>`;

// ---- 1. Mentions légales -----------------------------------------------------
export function mentionsLegalesPage({ brand, siteUrl }) {
  return legalPage({
    brand,
    siteUrl,
    slug: "mentions-legales",
    title: "Mentions légales",
    lead: "Qui édite ColdTrend, qui l'héberge et comment nous joindre.",
    metaDescription: "Mentions légales de ColdTrend : éditeur, hébergeur, contact, médiation.",
    essentials: [
      "ColdTrend est édité par Maxence Lefebvre, entrepreneur individuel.",
      `Pour toute question, un seul contact : ${CONTACT_EMAIL}.`,
      "Le site est hébergé par Vercel Inc.",
      "Les textes et visuels du site ne peuvent pas être repris sans autorisation."
    ],
    sections: [
      { id: "editeur", icon: "building", title: "Éditeur du site", html: `<p>Le site ${siteUrl} est édité par :</p>${EDITOR_BLOCK}` },
      { id: "publication", icon: "user", title: "Directeur de la publication", html: `<p>Maxence Lefebvre.</p>` },
      {
        id: "hebergement",
        icon: "server",
        title: "Hébergement",
        html: `<p>Vercel Inc., 340 S Lemon Ave #4133, Walnut, CA 91789, États-Unis.</p>
          <p>Les données des comptes sont stockées par Supabase (base de données et authentification) : voir la <a href="/confidentialite#sous-traitants">politique de confidentialité</a>.</p>`
      },
      {
        id: "contact",
        icon: "mail",
        title: "Contact",
        html: `<p>Email : ${mail}. Tu peux aussi utiliser le <a href="/contact">formulaire de contact</a>.</p>`
      },
      {
        id: "mediation",
        icon: "handshake",
        title: "Médiation de la consommation",
        html: `<p>En cas de litige non résolu avec nous, tu peux recourir gratuitement à un médiateur de la consommation. Les coordonnées et la procédure figurent dans les <a href="/cgv#mediation">CGV</a>.</p>`
      },
      {
        id: "propriete",
        icon: "copyright",
        title: "Propriété intellectuelle",
        html: `<p>L'ensemble des contenus du site (textes, visuels, structure, marque ${brand.name}) est la propriété de l'éditeur, sauf mention contraire. Toute reproduction ou réutilisation sans autorisation écrite est interdite.</p>
          <p>Les droits sur les concepts générés pour toi sont traités dans les <a href="/cgu#contenus">CGU</a>.</p>`
      }
    ]
  });
}

// ---- 2. CGV -------------------------------------------------------------------
export function cgvPage({ brand, siteUrl, durationPlans }) {
  const monthly = durationPlans.find((p) => p.months === 1) || durationPlans[0];
  return legalPage({
    brand,
    siteUrl,
    slug: "cgv",
    title: "Conditions générales de vente",
    lead: "Ce que tu achètes, combien ça coûte, comment résilier, et tes droits.",
    metaDescription: "CGV ColdTrend : abonnement, prix, paiement, résiliation, droit de rétractation, garantie, médiation.",
    essentials: [
      `Abonnement sans engagement au-delà de la période choisie : à partir de ${monthly.totalPrice} par mois, renouvelé automatiquement.`,
      "Tu résilies en 3 clics, à tout moment, via « Résilier mon abonnement » en bas de chaque page. La résiliation prend effet à la fin de la période payée.",
      "Tu disposes de 14 jours pour te rétracter, sauf si tu as expressément demandé un accès immédiat et renoncé à ce droit au moment de la commande.",
      "Le concept est généré par une IA : il t'aide à démarrer, il ne garantit aucun résultat ni aucun revenu.",
      "Service réservé aux personnes majeures (18 ans et plus)."
    ],
    sections: [
      {
        id: "objet",
        icon: "doc",
        title: "Objet et champ d'application",
        html: `<p>Les présentes conditions générales de vente (CGV) s'appliquent à toute souscription d'un abonnement ${brand.name} sur ${siteUrl} par un consommateur. Elles complètent les <a href="/cgu">conditions générales d'utilisation</a> (CGU).</p>
          <p>Le vendeur est :</p>${EDITOR_BLOCK}
          <p>La version applicable est celle en vigueur à la date de ta commande. Elle t'est rappelée avant le paiement.</p>`
      },
      {
        id: "service",
        icon: "sparkles",
        title: "Le service",
        html: `<p>${brand.name} génère, à partir de tes réponses au quiz, un concept de SaaS personnalisé (nom, description, cible, canaux d'acquisition) et te donne accès à ton espace en ligne pendant la durée de ton abonnement, avec les fonctionnalités décrites sur le site au moment de la souscription.</p>
          <p>Le service est entièrement en ligne : aucun bien physique n'est livré.</p>`
      },
      {
        id: "majorite",
        icon: "user",
        title: "Accès réservé aux 18 ans et plus",
        html: `<p>Le service est réservé aux personnes majeures. En passant commande, tu confirmes avoir 18 ans ou plus. Si le quiz indique un âge inférieur à 18 ans, le parcours s'arrête et aucune réponse n'est enregistrée.</p>`
      },
      {
        id: "prix",
        icon: "euro",
        title: "Prix et formules",
        html: `<p>Trois durées d'abonnement sont proposées. Plus la durée est longue, plus le prix par jour baisse :</p>
          ${plansTable(durationPlans)}
          <p>Les prix sont indiqués en euros. ${todo("mention TVA, par ex. « TVA non applicable, art. 293 B du CGI » en cas de franchise en base, ou prix TTC")}</p>
          <p>Une réduction de bienvenue ou de retour peut être affichée avant le paiement. Le montant réellement débité est toujours celui affiché sur la page de paiement sécurisée au moment de la validation.</p>`
      },
      {
        id: "commande",
        icon: "cart",
        title: "Commande et paiement",
        html: `<p>La commande se passe en ligne, à la fin du quiz : choix de la durée, récapitulatif, puis paiement sur la page sécurisée de notre prestataire Stripe. La commande est ferme une fois le paiement accepté.</p>
          <p>Le paiement se fait par carte bancaire ou par les moyens proposés par Stripe. ${brand.name} n'a jamais accès à tes numéros de carte.</p>`
      },
      {
        id: "renouvellement",
        icon: "refresh",
        title: "Durée et renouvellement automatique",
        html: `<p>L'abonnement est conclu pour la durée choisie (1, 3 ou 6 mois) et se renouvelle automatiquement pour une durée identique, au même prix, jusqu'à résiliation. Le paiement de chaque nouvelle période est prélevé à la date anniversaire.</p>
          <p>Tu peux consulter la date du prochain renouvellement à tout moment depuis ton compte (« Gérer mon abonnement »).</p>`
      },
      {
        id: "resiliation",
        icon: "ban",
        title: "Résiliation en 3 clics",
        html: `<p>Tu peux résilier à tout moment, sans justification ni frais :</p>
          <ol>
            <li>clique sur <strong>« Résilier mon abonnement »</strong>, présent en bas de chaque page du site ;</li>
            <li>clique sur <strong>« Résilier maintenant »</strong> (connecte-toi d'abord si besoin) ;</li>
            <li>confirme la résiliation sur la page sécurisée qui s'ouvre.</li>
          </ol>
          <p>La résiliation prend effet à la fin de la période déjà payée : tu gardes l'accès jusqu'à cette date et aucun nouveau paiement n'est prélevé. La période en cours n'est pas remboursée au prorata, sauf exercice du droit de rétractation ou de la garantie ci-dessous.</p>
          <p>Tu peux aussi demander la résiliation par email à ${mail}.</p>`
      },
      {
        id: "retractation",
        icon: "undo",
        title: "Droit de rétractation (14 jours)",
        html: `<p>En tant que consommateur, tu disposes d'un délai de <strong>14 jours</strong> à compter de la souscription pour te rétracter, sans avoir à te justifier (art. L221-18 du Code de la consommation).</p>
          ${callout(
            "",
            "alert",
            `<p><strong>Exception contenu numérique.</strong> Ce droit ne s'applique pas si, au moment de la commande, tu as <strong>expressément demandé</strong> l'accès immédiat au contenu numérique avant la fin du délai de 14 jours <strong>et reconnu</strong> perdre ainsi ton droit de rétractation (art. L221-28, 13° du Code de la consommation). Ce consentement doit être recueilli et confirmé lors de la commande ; à défaut, le délai de 14 jours s'applique.</p>`
          )}
          <p>Pour te rétracter, envoie une déclaration claire (par exemple : « Je me rétracte de mon abonnement ${brand.name} souscrit le [date] ») à ${mail}, depuis l'adresse de ton compte. Tu peux aussi utiliser le modèle de formulaire ci-dessous.</p>
          <p>Nous te remboursons la totalité des sommes versées au plus tard 14 jours après réception de ta demande, par le même moyen de paiement.</p>
          <h3>Modèle de formulaire de rétractation</h3>
          <p>À l'attention de ${todo("raison sociale")}, ${todo("adresse")}, ${CONTACT_EMAIL} :<br />
          Je notifie par la présente ma rétractation du contrat portant sur l'abonnement ${brand.name} ci-dessous :<br />
          Souscrit le : … / Nom : … / Adresse email du compte : … / Date : … / Signature (en cas d'envoi papier).</p>`
      },
      {
        id: "garantie",
        icon: "shield",
        title: `Garantie de remboursement ${brand.name}`,
        html: `<p>En plus de tes droits légaux, ${brand.name} s'engage à rembourser ton premier paiement si tu as publié comme prévu pendant 7 jours sans aucune vente. Les conditions exactes, cumulatives, sont détaillées sur la page <a href="/conditions-remboursement">Garantie &amp; remboursement</a>.</p>`
      },
      {
        id: "ia",
        icon: "sparkles",
        title: "Contenu généré par IA : aucune garantie de résultat",
        html: `<p>Le concept et les recommandations sont produits par un modèle d'intelligence artificielle à partir de tes réponses. Ils peuvent être incomplets ou inexacts et ne constituent ni un conseil juridique, financier ou fiscal, ni une étude de marché.</p>
          <p>${brand.name} ne garantit <strong>aucun résultat</strong> : ni chiffre d'affaires, ni nombre de clients, ni succès commercial. Les projections affichées sont des estimations basses, calculées par une formule fixe dont les hypothèses sont affichées, et ne constituent jamais une promesse.</p>
          <p>Avant de lancer ton projet, il t'appartient de vérifier notamment la disponibilité du nom (marques, noms de domaine) et la réglementation applicable à ton activité.</p>`
      },
      {
        id: "responsabilite",
        icon: "scale",
        title: "Responsabilité",
        html: `<p>${brand.name} met en œuvre les moyens raisonnables pour assurer l'accès au service, sans pouvoir garantir une disponibilité ininterrompue (maintenance, incidents chez nos prestataires). Notre responsabilité ne peut être engagée pour l'usage que tu fais du concept généré ni pour les décisions que tu prends sur cette base. Rien dans les présentes ne limite les droits que la loi te reconnaît en tant que consommateur, notamment la garantie légale de conformité des contenus et services numériques (art. L224-25-12 et suivants du Code de la consommation).</p>`
      },
      {
        id: "donnees",
        icon: "lock",
        title: "Données personnelles",
        html: `<p>Le traitement de tes données est décrit dans la <a href="/confidentialite">politique de confidentialité</a> et la <a href="/cookies">page cookies</a>.</p>`
      },
      {
        id: "mediation",
        icon: "handshake",
        title: "Réclamations et médiation",
        html: `<p>Pour toute réclamation, écris d'abord à ${mail} : nous répondons dans les meilleurs délais.</p>
          <p>Si le désaccord persiste, tu peux saisir gratuitement le médiateur de la consommation dont nous relevons, au plus tard un an après ta réclamation écrite (art. L612-1 du Code de la consommation) :</p>
          <ul>
            <li><strong>Médiateur :</strong> ${todo("nom du médiateur")}</li>
            <li><strong>Adresse :</strong> ${todo("adresse postale du médiateur")}</li>
            <li><strong>Site internet :</strong> ${todo("URL de saisie en ligne")}</li>
          </ul>`
      },
      {
        id: "droit",
        icon: "globe",
        title: "Droit applicable",
        html: `<p>Les présentes CGV sont soumises au droit français. En cas de litige, et à défaut de solution amiable ou de médiation, les tribunaux compétents sont ceux désignés par les règles de droit commun ; en tant que consommateur, tu peux saisir la juridiction de ton lieu de domicile.</p>`
      }
    ]
  });
}

// ---- 3. CGU -------------------------------------------------------------------
export function cguPage({ brand, siteUrl }) {
  return legalPage({
    brand,
    siteUrl,
    slug: "cgu",
    title: "Conditions générales d'utilisation",
    lead: "Les règles d'usage du site et de ton compte.",
    metaDescription: "CGU ColdTrend : accès au site, compte, usage autorisé, contenus générés par IA, responsabilité.",
    essentials: [
      "Le site est réservé aux personnes de 18 ans et plus.",
      "Ton compte est personnel : tu es responsable de ton mot de passe.",
      "Le concept généré pour toi est à toi d'utiliser ; il n'est garanti ni original ni rentable.",
      "Tu peux supprimer ton compte à tout moment depuis ton espace."
    ],
    sections: [
      {
        id: "objet",
        icon: "doc",
        title: "Objet",
        html: `<p>Les présentes conditions générales d'utilisation (CGU) encadrent l'accès et l'utilisation du site ${siteUrl} et du service ${brand.name}, édités par Maxence Lefebvre (voir les <a href="/mentions-legales">mentions légales</a>). L'achat d'un abonnement est régi en plus par les <a href="/cgv">CGV</a>.</p>
          <p>Utiliser le site vaut acceptation des CGU en vigueur.</p>`
      },
      {
        id: "acces",
        icon: "user",
        title: "Accès : 18 ans et plus",
        html: `<p>Le service est réservé aux personnes majeures. Une question sur l'âge est posée au début du quiz : si la réponse indique moins de 18 ans, le parcours s'arrête et rien n'est enregistré. Nous pouvons suspendre un compte s'il apparaît que son titulaire est mineur.</p>`
      },
      {
        id: "compte",
        icon: "lock",
        title: "Ton compte",
        html: `<p>Un compte (email et mot de passe, ou connexion Google) est nécessaire pour voir ton concept. Tu t'engages à fournir une adresse email valide et à garder ton mot de passe confidentiel. Toute action réalisée depuis ton compte est réputée faite par toi.</p>
          <p>Tu peux <strong>supprimer ton compte</strong> à tout moment depuis ton espace (« Supprimer mon compte »). Pense à résilier ton abonnement au préalable si tu en as un.</p>`
      },
      {
        id: "usage",
        icon: "check",
        title: "Usage autorisé",
        html: `<p>Tu t'engages à utiliser le service de façon loyale et légale. Sont notamment interdits :</p>
          <ul>
            <li>l'extraction automatisée ou massive du contenu du site ;</li>
            <li>toute tentative d'accès non autorisé, de contournement des protections ou de perturbation du service ;</li>
            <li>la revente ou la mise à disposition de ton accès à des tiers ;</li>
            <li>l'utilisation du service pour un projet illicite.</li>
          </ul>
          <p>En cas de manquement, nous pouvons suspendre ou fermer le compte concerné, après t'en avoir informé sauf urgence.</p>`
      },
      {
        id: "contenus",
        icon: "sparkles",
        title: "Contenus générés par IA",
        html: `<p>Le concept est généré automatiquement par un modèle d'IA à partir de tes réponses. ${brand.name} ne revendique pas de droits sur le concept généré pour toi : tu peux l'utiliser pour ton projet.</p>
          ${callout("", "alert", `<p>Un contenu généré par IA peut être inexact, ressembler à des projets existants ou utiliser un nom déjà déposé. ${brand.name} ne garantit ni son originalité, ni sa disponibilité juridique, ni sa rentabilité. Vérifie toujours avant de lancer.</p>`)}
          <p>Les projections de revenus affichées sont des estimations basses, issues d'une formule déterministe dont les hypothèses sont visibles, et ne constituent pas une promesse.</p>`
      },
      {
        id: "propriete",
        icon: "copyright",
        title: "Propriété intellectuelle du site",
        html: `<p>Le site, sa marque, ses textes, visuels et son code restent la propriété de l'éditeur. Toute reproduction sans autorisation est interdite.</p>`
      },
      {
        id: "disponibilite",
        icon: "server",
        title: "Disponibilité et évolution",
        html: `<p>Nous faisons notre possible pour que le site soit accessible en continu, sans pouvoir le garantir. Le service peut évoluer ; une modification substantielle d'un abonnement en cours te sera notifiée à l'avance.</p>`
      },
      {
        id: "modification",
        icon: "refresh",
        title: "Modification des CGU",
        html: `<p>Les CGU peuvent être mises à jour. La date de mise à jour figure en haut de cette page. En cas de changement important, nous t'en informons par email ou sur le site.</p>`
      },
      {
        id: "droit",
        icon: "globe",
        title: "Droit applicable et contact",
        html: `<p>Les CGU sont soumises au droit français. Pour toute question : ${mail}. Les modalités de médiation figurent dans les <a href="/cgv#mediation">CGV</a>.</p>`
      }
    ]
  });
}

// ---- 4. Confidentialité (RGPD) ------------------------------------------------
export function confidentialitePage({ brand, siteUrl }) {
  const processors = [
    ["Supabase", "Base de données et authentification (comptes, réponses au quiz, statut d'abonnement)", todo("région d'hébergement du projet Supabase")],
    ["Vercel", "Hébergement du site", "États-Unis / réseau mondial"],
    ["Stripe", "Paiement et gestion de l'abonnement", "Irlande (UE) / États-Unis"],
    ["Resend", "Envoi des emails (confirmation, accès, relances)", "États-Unis"],
    ["OpenRouter", "Transmission de tes réponses au modèle d'IA qui génère le concept (sans ton email)", "États-Unis"],
    ["Crisp", "Messagerie de support (bulle de chat)", "France (UE)"],
    ["jsDelivr", "Diffusion de bibliothèques techniques (adresse IP)", "Réseau mondial"]
  ];
  const processorRows = processors.map((p) => `<tr><td><strong>${p[0]}</strong></td><td>${p[1]}</td><td>${p[2]}</td></tr>`).join("");
  return legalPage({
    brand,
    siteUrl,
    slug: "confidentialite",
    title: "Politique de confidentialité",
    lead: "Quelles données nous utilisons, pourquoi, avec qui, et comment exercer tes droits.",
    metaDescription: "Politique de confidentialité ColdTrend (RGPD) : données collectées, finalités, sous-traitants, durées, droits.",
    essentials: [
      "Nous collectons le strict nécessaire : ton email, tes réponses au quiz et le statut de ton abonnement.",
      "Tes données ne sont jamais vendues. Aucune publicité ciblée, aucun outil de mesure tiers.",
      "Tes réponses sont transmises à un modèle d'IA pour générer ton concept, sans ton email.",
      "Tu peux supprimer ton compte toi-même et exercer tes droits par email à tout moment."
    ],
    sections: [
      {
        id: "responsable",
        icon: "building",
        title: "Responsable du traitement",
        html: `<p>Le responsable du traitement est l'éditeur de ${brand.name} :</p>${EDITOR_BLOCK}
          <p>Nous n'avons pas désigné de délégué à la protection des données ${todo("à confirmer")} : écris directement à ${mail}.</p>`
      },
      {
        id: "donnees",
        icon: "database",
        title: "Données collectées",
        html: `<ul>
            <li><strong>Compte :</strong> adresse email, mot de passe (stocké chiffré par notre prestataire d'authentification, jamais lisible par nous), prénom si tu le renseignes.</li>
            <li><strong>Quiz :</strong> tes réponses (objectifs, temps disponible, secteur, préférences…), ta tranche d'âge (utilisée pendant le quiz, non enregistrée dans ton compte ; rien n'est conservé en cas de réponse « moins de 18 ans »), l'adresse d'un site si tu demandes l'audit gratuit.</li>
            <li><strong>Abonnement :</strong> identifiant client et statut d'abonnement transmis par Stripe. Nous ne voyons jamais tes données de carte.</li>
            <li><strong>Usage du site :</strong> pages vues et étapes du parcours, mesurées par notre propre outil, sans cookie ni service tiers.</li>
            <li><strong>Support :</strong> les messages que tu nous envoies (formulaire, email, chat).</li>
          </ul>`
      },
      {
        id: "finalites",
        icon: "sliders",
        title: "Finalités et bases légales",
        html: `<div class="lg-table-wrap"><table class="lg-table">
            <thead><tr><th scope="col">Pourquoi</th><th scope="col">Base légale</th></tr></thead>
            <tbody>
              <tr><td>Créer ton compte, générer ton concept, fournir le service</td><td>Exécution du contrat</td></tr>
              <tr><td>Gérer le paiement, l'abonnement et la facturation</td><td>Exécution du contrat, obligations légales comptables</td></tr>
              <tr><td>Mesurer l'usage du site pour l'améliorer (sans cookie)</td><td>Intérêt légitime</td></tr>
              <tr><td>T'envoyer un rappel si tu n'as pas terminé ton parcours</td><td>${todo("base légale à valider : intérêt légitime ou consentement")} — désinscription en un clic dans chaque email</td></tr>
              <tr><td>Répondre à tes demandes de support</td><td>Intérêt légitime</td></tr>
              <tr><td>Sécuriser le service et prévenir la fraude</td><td>Intérêt légitime</td></tr>
            </tbody>
          </table></div>`
      },
      {
        id: "ia",
        icon: "sparkles",
        title: "Génération par IA",
        html: `<p>Pour générer ton concept, tes réponses au quiz sont envoyées, <strong>sans ton email ni ton nom</strong>, à un modèle d'intelligence artificielle via le service OpenRouter. Aucune décision produisant des effets juridiques à ton égard n'est prise sur cette base : le concept est une proposition que tu restes libre d'utiliser ou non.</p>`
      },
      {
        id: "sous-traitants",
        icon: "users",
        title: "Destinataires et sous-traitants",
        html: `<p>Tes données ne sont <strong>jamais vendues</strong>. Elles ne sont accessibles qu'à l'éditeur et aux prestataires techniques suivants, dans la limite de leur mission :</p>
          <div class="lg-table-wrap"><table class="lg-table">
            <thead><tr><th scope="col">Prestataire</th><th scope="col">Rôle</th><th scope="col">Établissement</th></tr></thead>
            <tbody>${processorRows}</tbody>
          </table></div>`
      },
      {
        id: "transferts",
        icon: "globe",
        title: "Transferts hors de l'Union européenne",
        html: `<p>Certains prestataires sont établis aux États-Unis. Ces transferts sont encadrés par des garanties appropriées : ${todo("à vérifier pour chaque prestataire : adhésion au Data Privacy Framework UE–États-Unis et/ou clauses contractuelles types de la Commission européenne")}.</p>`
      },
      {
        id: "durees",
        icon: "hourglass",
        title: "Durées de conservation",
        html: `<ul>
            <li><strong>Compte et réponses au quiz :</strong> tant que ton compte existe ; supprimés lorsque tu supprimes ton compte. ${todo("durée de conservation d'un compte inactif")}</li>
            <li><strong>Données de facturation :</strong> ${todo("durée, en principe 10 ans pour les pièces comptables (art. L123-22 du Code de commerce)")}</li>
            <li><strong>Mesure d'usage :</strong> ${todo("durée de conservation des évènements de navigation")}</li>
            <li><strong>Messages de support :</strong> ${todo("durée")}</li>
          </ul>`
      },
      {
        id: "droits",
        icon: "shield",
        title: "Tes droits",
        html: `<p>Tu disposes d'un droit d'accès, de rectification, d'effacement, de limitation, d'opposition et de portabilité de tes données, ainsi que du droit de définir des directives sur leur sort après ton décès.</p>
          <ul>
            <li><strong>Effacement immédiat :</strong> « Supprimer mon compte » dans ton espace.</li>
            <li><strong>Emails de relance :</strong> lien de désinscription dans chaque email.</li>
            <li><strong>Toute autre demande :</strong> ${mail}. Nous répondons sous un mois au plus.</li>
          </ul>
          <p>Si tu estimes que tes droits ne sont pas respectés, tu peux introduire une réclamation auprès de la CNIL (<a href="https://www.cnil.fr" target="_blank" rel="noopener">cnil.fr</a>).</p>`
      },
      {
        id: "securite",
        icon: "lock",
        title: "Sécurité",
        html: `<p>Connexions chiffrées (HTTPS), mots de passe jamais stockés en clair, accès aux données limité par des règles de sécurité au niveau de la base, paiements traités exclusivement par Stripe.</p>`
      },
      {
        id: "mineurs",
        icon: "user",
        title: "Mineurs",
        html: `<p>Le service est réservé aux 18 ans et plus. Si le quiz indique un âge inférieur, le parcours s'arrête et les réponses déjà données sont effacées sans avoir été envoyées.</p>`
      },
      {
        id: "cookies",
        icon: "cookie",
        title: "Cookies",
        html: `<p>Voir la <a href="/cookies">page dédiée aux cookies et traceurs</a>.</p>`
      }
    ]
  });
}

// ---- 5. Cookies ------------------------------------------------------------------
export function cookiesPage({ brand, siteUrl }) {
  const rows = [
    ["Session de connexion (Supabase)", "Stockage local du navigateur", "Te garder connecté", "Strictement nécessaire", "Jusqu'à la déconnexion"],
    ["Brouillon du quiz", "Stockage local", "Reprendre le quiz là où tu t'es arrêté", "Strictement nécessaire (service demandé)", "Jusqu'à la fin du quiz"],
    ["Durée d'abonnement choisie", "Stockage local", "Se souvenir de la formule sélectionnée", "Strictement nécessaire (service demandé)", "Jusqu'à effacement par le navigateur"],
    ["Reprise après connexion Google", "Stockage de session", "Rouvrir le quiz au retour de Google", "Strictement nécessaire", "Fermeture de l'onglet"],
    ["Messagerie Crisp", "Cookies et stockage local", "Faire fonctionner la bulle de support et garder l'historique de ta conversation", todo("qualification à valider"), todo("durée")],
    ["Préférence d'administration (ct_vm)", "Cookie", "Réservé aux comptes administrateurs, jamais déposé pour un visiteur", "Strictement nécessaire", "30 jours"]
  ];
  const tableRows = rows.map((r) => `<tr><td><strong>${r[0]}</strong></td><td>${r[1]}</td><td>${r[2]}</td><td>${r[3]}</td><td>${r[4]}</td></tr>`).join("");
  return legalPage({
    brand,
    siteUrl,
    slug: "cookies",
    title: "Cookies et traceurs",
    lead: "Ce que le site dépose dans ton navigateur, et pourquoi.",
    metaDescription: "Cookies ColdTrend : aucun cookie publicitaire, aucune mesure d'audience tierce, liste des traceurs utilisés.",
    essentials: [
      "Aucun cookie publicitaire, aucun traceur de réseau social.",
      "Notre mesure d'audience est faite maison, sans cookie.",
      "Les seuls traceurs servent à te garder connecté, à reprendre ton quiz et au chat de support.",
      "Tu peux les effacer à tout moment dans les réglages de ton navigateur."
    ],
    sections: [
      {
        id: "principe",
        icon: "cookie",
        title: "Notre principe",
        html: `<p>Un « traceur » désigne tout ce qui est lu ou écrit dans ton navigateur : cookies, mais aussi stockage local. ${brand.name} n'utilise que des traceurs nécessaires au fonctionnement du service que tu demandes. Ces traceurs sont exemptés de consentement (art. 82 de la loi Informatique et Libertés).</p>
          ${callout("good", "check", `<p>Pas de Google Analytics, pas de pixel publicitaire. Les pages vues sont comptées par notre propre outil, sans cookie et sans service tiers.</p>`)}`
      },
      {
        id: "liste",
        icon: "list",
        title: "Liste des traceurs",
        html: `<div class="lg-table-wrap"><table class="lg-table">
            <thead><tr><th scope="col">Traceur</th><th scope="col">Type</th><th scope="col">Finalité</th><th scope="col">Statut</th><th scope="col">Durée</th></tr></thead>
            <tbody>${tableRows}</tbody>
          </table></div>
          ${callout("", "alert", `<p>La messagerie Crisp se charge sur chaque page. ${todo("valider avec le juriste si ses traceurs relèvent de l'exemption ou nécessitent un recueil de consentement avant chargement")}</p>`)}`
      },
      {
        id: "gerer",
        icon: "sliders",
        title: "Gérer ou supprimer les traceurs",
        html: `<p>Tu peux effacer cookies et stockage local depuis les réglages de ton navigateur (rubrique « Confidentialité » ou « Données de site »). Les supprimer te déconnecte et efface un éventuel brouillon de quiz.</p>`
      },
      {
        id: "contact",
        icon: "mail",
        title: "Questions",
        html: `<p>Écris à ${mail}. Voir aussi la <a href="/confidentialite">politique de confidentialité</a>.</p>`
      }
    ]
  });
}

// ---- 6. Garantie & remboursement ------------------------------------------------
// Conditions reprises telles quelles de l'ancienne page /conditions-remboursement
// (décidées par l'exploitant) ; seule la présentation change, plus la
// correction de la rétractation (consentement exprès obligatoire).
export function garantiePage({ brand, siteUrl }) {
  const steps = [
    { when: "Jour 0", iconName: "card", title: "Tu t'abonnes", text: "Ton premier paiement ouvre la garantie." },
    { when: "Jours 1 à 7", iconName: "video", title: "Tu publies", text: "Au moins 2 vidéos par jour sur TikTok, chacun des 7 jours, pour promouvoir le produit issu de ton concept." },
    { when: "Au plus tard jour 14", iconName: "send", title: "Tu fais ta demande", text: "Si aucune vente : email depuis l'adresse de ton compte, avec les liens de tes vidéos. Ton abonnement doit encore être actif." },
    { when: "Sous 72 h", iconName: "clock", title: "On te répond", text: "Nous vérifions les vidéos et te confirmons la décision par email." },
    { when: todo("délai"), iconName: "euro", title: "Tu es remboursé", text: "Remboursement intégral du premier paiement, sur le moyen de paiement utilisé." }
  ];
  const timeline = `<ol class="lg-timeline">
    ${steps
      .map(
        (s) => `<li><span class="lg-timeline__dot">${icon(s.iconName, 20)}</span><div><span class="lg-timeline__when">${s.when}</span><span class="lg-timeline__title">${s.title}</span><span class="lg-timeline__text">${s.text}</span></div></li>`
      )
      .join("\n    ")}
  </ol>`;
  const contactCta = `<div class="lg-cta"><p>Prêt à faire ta demande, ou une question sur la garantie ?</p><a class="lg-btn" href="mailto:${CONTACT_EMAIL}?subject=Demande%20de%20remboursement%20ColdTrend">${icon("mail", 18)} Contacter ${brand.name}</a></div>`;

  return legalPage({
    brand,
    siteUrl,
    slug: "conditions-remboursement",
    title: "Garantie & remboursement",
    lead: "Tu publies pendant 7 jours, sans aucune vente ? On te rembourse ton premier paiement.",
    metaDescription: "Garantie ColdTrend : remboursement du premier paiement sous conditions, étapes, délais, droit de rétractation.",
    essentials: [
      "Premier paiement remboursé en intégralité si tu n'as fait aucune vente après 7 jours de publication.",
      "Condition : au moins 2 vidéos TikTok par jour, pendant les 7 jours suivant l'achat.",
      "Demande à faire par email dans les 14 jours suivant l'achat, abonnement toujours actif.",
      "Réponse sous 72 h. La garantie ne couvre que le premier paiement, pas les renouvellements.",
      "Ton droit légal de rétractation de 14 jours s'applique en plus, sauf renonciation expresse lors de la commande."
    ],
    sections: [
      {
        id: "etapes",
        icon: "list",
        title: "Les étapes du remboursement",
        html: `${timeline}${contactCta}`
      },
      {
        id: "conditions",
        icon: "check",
        title: "Conditions (toutes obligatoires)",
        html: `<ul>
            <li><strong>Publication :</strong> au moins 2 vidéos par jour sur TikTok, chacun des 7 jours consécutifs suivant l'achat, faisant la promotion du produit issu du concept généré.</li>
            <li><strong>Résultat :</strong> aucune vente du produit issu de ton concept sur cette période.</li>
            <li><strong>Délai de demande :</strong> au plus tard 14 jours après l'achat.</li>
            <li><strong>Abonnement actif :</strong> une résiliation faite avant la demande vaut renoncement à la garantie.</li>
          </ul>`
      },
      {
        id: "demande",
        icon: "send",
        title: "Comment faire la demande",
        html: `<p>Envoie un email à ${mail} <strong>depuis l'adresse associée à ton compte</strong>, avec les liens de toutes les vidéos publiées. Nous répondons sous 72 heures.</p>
          <p>Le remboursement est effectué sur le moyen de paiement utilisé lors de l'achat, ${todo("délai d'exécution du remboursement après acceptation")}.</p>`
      },
      {
        id: "exclusions",
        icon: "x",
        title: "Ce qui n'ouvre pas droit au remboursement",
        html: callout(
          "bad",
          "x",
          `<ul>
            <li>Demande faite plus de 14 jours après l'achat.</li>
            <li>Abonnement résilié avant la demande.</li>
            <li>Publication incomplète (moins de 2 vidéos un des 7 jours).</li>
            <li>Échéances de renouvellement : la garantie ne porte que sur le premier paiement.</li>
          </ul>`
        )
      },
      {
        id: "retractation",
        icon: "undo",
        title: "Droit de rétractation légal",
        html: `<p>La garantie ci-dessus est un engagement commercial de ${brand.name}. Elle <strong>s'ajoute</strong> à ton droit légal de rétractation, qui ne la remplace pas : tu disposes de 14 jours après la souscription pour te rétracter sans motif, sauf si tu as expressément demandé l'accès immédiat et renoncé à ce droit lors de la commande. Détails dans les <a href="/cgv#retractation">CGV</a>.</p>`
      },
      {
        id: "resiliation",
        icon: "refresh",
        title: "Résiliation et renouvellements",
        html: `<p>Tu peux résilier à tout moment, en 3 clics, via <a href="/resilier">Résilier mon abonnement</a>. La résiliation prend effet à la fin de la période en cours, sans remboursement au prorata d'une période entamée.</p>`
      }
    ]
  });
}

// ---- Page de résiliation : /resilier -------------------------------------------
// Fonction de résiliation exigée par l'art. L215-1-1 du Code de la
// consommation : lien direct depuis chaque page (footer), puis un bouton.
// Clic 1 : footer "Résilier mon abonnement". Clic 2 : "Résilier maintenant"
// -> create-portal-session { flow: "cancel" } ouvre directement l'écran de
// résiliation du portail Stripe. Clic 3 : confirmation chez Stripe.
// Sans session : connexion puis retour ici (?redirect=/resilier).
export function resilierPage({ brand, siteUrl }) {
  const actionHtml = `
    <div class="lg-cta" id="resilier-card">
      <p id="resilier-text">Ta résiliation prend effet à la fin de la période déjà payée. Aucun frais, aucune justification.</p>
      <button type="button" class="lg-btn" id="resilier-btn">${icon("ban", 18)} Résilier maintenant</button>
    </div>
    <p class="lg-status" id="resilier-status" role="status" aria-live="polite" hidden></p>
    <p>Un souci ? Écris-nous à ${mail} avec l'adresse de ton compte : la résiliation par email est aussi acceptée.</p>`;

  const scripts = `
  <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
  <script src="/js/supabase-client.js"></script>
  <script>
    (function () {
      var btn = document.getElementById("resilier-btn");
      var statusEl = document.getElementById("resilier-status");
      if (!btn) return;

      function status(text) {
        statusEl.textContent = text;
        statusEl.hidden = !text;
      }

      btn.addEventListener("click", async function () {
        var supabase = window.ColdTrendSupabase;
        if (!supabase) {
          status("Service momentanément indisponible. Écris-nous par email, nous résilions pour toi.");
          return;
        }
        var sessionRes = await supabase.auth.getSession();
        var token = sessionRes.data.session ? sessionRes.data.session.access_token : null;
        if (!token) {
          // Pas connecté : connexion puis retour direct sur cette page.
          window.location.href = "/connexion?redirect=" + encodeURIComponent("/resilier");
          return;
        }
        btn.disabled = true;
        status("Ouverture de la page de résiliation sécurisée…");
        try {
          var res = await fetch(supabase.supabaseUrl + "/functions/v1/create-portal-session", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              apikey: supabase.supabaseKey,
              Authorization: "Bearer " + token
            },
            body: JSON.stringify({ flow: "cancel" })
          });
          var body = await res.json();
          if (body && typeof body.url === "string") {
            window.location.href = body.url;
            return;
          }
          btn.disabled = false;
          status(res.status === 404 ? "Aucun abonnement actif n'est associé à ce compte." : (body && body.error) || "Impossible d'ouvrir la résiliation. Réessaie, ou écris-nous par email.");
        } catch (err) {
          btn.disabled = false;
          status("Impossible d'ouvrir la résiliation. Réessaie, ou écris-nous par email.");
        }
      });
    })();
  </script>`;

  return legalPage({
    brand,
    siteUrl,
    slug: "resilier",
    title: "Résilier mon abonnement",
    lead: "En 3 clics, sans frais et sans justification.",
    metaDescription: "Résilier son abonnement ColdTrend en 3 clics, à tout moment.",
    essentials: [
      "Clique sur « Résilier maintenant », puis confirme sur la page sécurisée.",
      "Tu gardes l'accès jusqu'à la fin de la période déjà payée.",
      "Aucun nouveau prélèvement après la résiliation."
    ],
    sections: [
      { id: "resilier", icon: "ban", title: "Résilier maintenant", html: actionHtml },
      {
        id: "apres",
        icon: "clock",
        title: "Ce qui se passe ensuite",
        html: `<ul>
            <li>La page sécurisée confirme la résiliation et sa date d'effet.</li>
            <li>Ton accès reste actif jusqu'à la fin de la période en cours, sans remboursement au prorata (voir les <a href="/cgv#resiliation">CGV</a>).</li>
            <li>Tu es encore dans les 14 jours après ta souscription ? Tu peux aussi exercer ton <a href="/cgv#retractation">droit de rétractation</a> ou la <a href="/conditions-remboursement">garantie</a>.</li>
          </ul>`
      }
    ],
    extraScripts: scripts
  });
}
