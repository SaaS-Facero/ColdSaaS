// ---------------------------------------------------------------------------
// Footer ColdTrend — composant partagé (accueil, pages légales, contact,
// /resilier). Rendu au build, aucune dépendance.
//
// - Fond #0A0E1A, 4 colonnes en desktop (marque + Produit / Légal / Aide),
//   accordéon en mobile (< 720px). Sans JS, tout reste déplié : le repli
//   n'est activé qu'une fois le script chargé (classe ct-footer--js).
// - "Résilier mon abonnement" : lien direct et toujours visible (fonction de
//   résiliation exigée en France, art. L215-1-1 du Code de la consommation),
//   vers /resilier.
// - Année du copyright : calculée au build ET recalculée côté client, pour
//   ne jamais rester figée si le site n'est pas redéployé en janvier.
// - Réseaux sociaux : affichés uniquement si SOCIAL_LINKS contient des URL
//   réelles. Aucun compte n'est référencé à ce jour : la ligne est masquée
//   plutôt que de pointer vers un profil inventé.
//
// Attention (voir mémoire build.mjs) : ce fichier contient du HTML/CSS/JS
// dans des template literals. Pas de backtick ni d'antislash dans le JS
// client.
// ---------------------------------------------------------------------------

// Renseigner ici les comptes officiels, ex. { label: "TikTok", href: "https://www.tiktok.com/@..." }.
export const SOCIAL_LINKS = [];

const SOCIAL_ICONS = {
  TikTok:
    '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="currentColor"><path d="M16.5 3a4.5 4.5 0 0 0 4.5 4.5v3a7.4 7.4 0 0 1-4.5-1.5v6.5A6.5 6.5 0 1 1 10 8.6v3.1a3.5 3.5 0 1 0 3.5 3.5V3h3z"/></svg>',
  Instagram:
    '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor"/></svg>',
  YouTube:
    '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="currentColor"><path d="M22 8.2a3 3 0 0 0-2.1-2.1C18 5.6 12 5.6 12 5.6s-6 0-7.9.5A3 3 0 0 0 2 8.2 31 31 0 0 0 1.6 12 31 31 0 0 0 2 15.8a3 3 0 0 0 2.1 2.1c1.9.5 7.9.5 7.9.5s6 0 7.9-.5a3 3 0 0 0 2.1-2.1c.3-1.2.4-2.5.4-3.8s-.1-2.6-.4-3.8zM10 15V9l5.2 3L10 15z"/></svg>',
  X: '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="currentColor"><path d="M17.8 3h3.1l-6.8 7.8L22 21h-6.2l-4.9-6.4L5.3 21H2.2l7.3-8.3L2 3h6.3l4.4 5.8L17.8 3zm-1.1 16.2h1.7L7.4 4.7H5.6l11.1 14.5z"/></svg>',
  LinkedIn:
    '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="currentColor"><path d="M4.98 3.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5zM3 9.5h4V21H3V9.5zm7 0h3.8v1.6h.1c.5-1 1.8-2 3.7-2 4 0 4.7 2.6 4.7 6V21h-4v-5.1c0-1.2 0-2.8-1.7-2.8s-2 1.3-2 2.7V21h-4V9.5z"/></svg>'
};

// Colonnes du footer. Les ancres de l'accueil existent dans page() :
// #quiz ouvre le quiz (voir openQuizFromHash), #pricing = bloc d'appel à
// l'action final, #faq = section FAQ.
const FOOTER_COLUMNS = [
  {
    id: "produit",
    title: "Produit",
    links: [
      { label: "Accueil", href: "/" },
      { label: "Quiz", href: "/#quiz" },
      { label: "Offres", href: "/#pricing" },
      { label: "FAQ", href: "/#faq" }
    ]
  },
  {
    id: "legal",
    title: "Légal",
    links: [
      { label: "Mentions légales", href: "/mentions-legales" },
      { label: "CGV", href: "/cgv" },
      { label: "CGU", href: "/cgu" },
      { label: "Confidentialité", href: "/confidentialite" },
      { label: "Cookies", href: "/cookies" },
      { label: "Garantie & remboursement", href: "/conditions-remboursement" }
    ]
  },
  {
    id: "aide",
    title: "Aide",
    // Ouverte par défaut en mobile : le lien de résiliation ne doit jamais
    // être caché derrière un accordéon replié.
    openByDefault: true,
    links: [
      { label: "Contact", href: "/contact" },
      { label: "Résilier mon abonnement", href: "/resilier", strong: true },
      { label: "Médiateur de la consommation", href: "/cgv#mediation" }
    ]
  }
];

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function siteFooterCss() {
  return `
  /* ---- Footer ColdTrend (scripts/site-footer.mjs) ---- */
  .ct-footer {
    --ctf-bg: #0A0E1A;
    --ctf-line: rgba(255, 255, 255, 0.08);
    --ctf-text: #E4E6EB;
    --ctf-muted: #8A8F98;
    --ctf-accent: #3D6BFF;
    background: var(--ctf-bg);
    color: var(--ctf-text);
    border-top: 1px solid var(--ctf-line);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Inter, Arial, sans-serif;
    font-size: 14px;
    line-height: 1.5;
  }
  .ct-footer *, .ct-footer *::before, .ct-footer *::after { box-sizing: border-box; }
  .ct-footer__inner {
    max-width: 1120px;
    margin: 0 auto;
    padding: 56px 24px 28px;
  }
  .ct-footer__grid {
    display: grid;
    grid-template-columns: 1.3fr 1fr 1fr 1fr;
    gap: 40px;
  }
  .ct-footer__brand-name {
    display: inline-block;
    font-size: 18px;
    font-weight: 800;
    color: #F5F6F8;
    text-decoration: none;
    letter-spacing: -0.01em;
  }
  .ct-footer__tagline { margin: 10px 0 0; color: var(--ctf-muted); max-width: 30ch; }
  .ct-footer__col-title {
    margin: 0 0 14px;
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--ctf-muted);
  }
  /* Bouton d'accordéon : présent dans le DOM partout, inactif en desktop. */
  .ct-footer__toggle {
    all: unset;
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    cursor: default;
  }
  .ct-footer__chevron { display: none; transition: transform 200ms ease; }
  .ct-footer__list { list-style: none; margin: 0; padding: 0; display: grid; gap: 10px; }
  .ct-footer__list a {
    color: var(--ctf-text);
    text-decoration: none;
    transition: color 150ms ease;
  }
  .ct-footer__list a:hover, .ct-footer__list a:focus-visible { color: #FFFFFF; text-decoration: underline; text-underline-offset: 3px; }
  .ct-footer__list a.is-strong { font-weight: 700; color: #FFFFFF; }
  .ct-footer__bottom {
    margin-top: 48px;
    padding-top: 22px;
    border-top: 1px solid var(--ctf-line);
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 12px 24px;
    color: var(--ctf-muted);
    font-size: 13px;
  }
  .ct-footer__legal-line { display: flex; flex-wrap: wrap; gap: 6px 16px; }
  .ct-footer__age {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: var(--ctf-text);
  }
  .ct-footer__age-badge {
    display: inline-grid;
    place-items: center;
    min-width: 30px;
    height: 20px;
    padding: 0 6px;
    border-radius: 6px;
    border: 1px solid rgba(255, 255, 255, 0.25);
    font-size: 11px;
    font-weight: 800;
  }
  .ct-footer__social { display: flex; gap: 8px; list-style: none; margin: 0; padding: 0; }
  .ct-footer__social a {
    display: grid;
    place-items: center;
    width: 36px;
    height: 36px;
    border-radius: 10px;
    color: var(--ctf-text);
    border: 1px solid var(--ctf-line);
    transition: border-color 150ms ease, color 150ms ease;
  }
  .ct-footer__social a:hover, .ct-footer__social a:focus-visible { color: #FFFFFF; border-color: var(--ctf-accent); }
  .ct-footer a:focus-visible, .ct-footer__toggle:focus-visible { outline: 2px solid var(--ctf-accent); outline-offset: 3px; border-radius: 4px; }

  @media (max-width: 860px) {
    .ct-footer__grid { grid-template-columns: 1fr 1fr; }
    .ct-footer__brand { grid-column: 1 / -1; }
  }
  /* Mobile : accordéon. Le repli n'existe qu'avec JS (ct-footer--js). */
  @media (max-width: 720px) {
    .ct-footer__inner { padding: 40px 16px 24px; }
    .ct-footer__grid { grid-template-columns: 1fr; gap: 0; }
    .ct-footer__brand { margin-bottom: 20px; }
    .ct-footer__col { border-top: 1px solid var(--ctf-line); }
    .ct-footer__col:last-child { border-bottom: 1px solid var(--ctf-line); }
    .ct-footer__col-title { margin: 0; }
    .ct-footer__toggle { padding: 16px 0; min-height: 48px; cursor: pointer; }
    .ct-footer__list { padding-bottom: 16px; }
    .ct-footer--js .ct-footer__chevron { display: block; }
    .ct-footer--js .ct-footer__col:not(.is-open) .ct-footer__list { display: none; }
    .ct-footer--js .ct-footer__col.is-open .ct-footer__chevron { transform: rotate(180deg); }
    .ct-footer__bottom { flex-direction: column; align-items: flex-start; margin-top: 28px; }
  }
  @media (prefers-reduced-motion: reduce) {
    .ct-footer__chevron, .ct-footer__list a, .ct-footer__social a { transition: none; }
  }
  @media print { .ct-footer { display: none; } }
  `;
}

export function siteFooterHtml({ brandName }) {
  const year = new Date().getFullYear();
  const columns = FOOTER_COLUMNS.map(
    (col) => `
      <nav class="ct-footer__col${col.openByDefault ? " is-open" : ""}" aria-labelledby="ct-footer-title-${col.id}">
        <h2 class="ct-footer__col-title" id="ct-footer-title-${col.id}">
          <button type="button" class="ct-footer__toggle" aria-expanded="true" aria-controls="ct-footer-list-${col.id}">
            ${col.title}
            <svg class="ct-footer__chevron" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2"><path d="m6 9 6 6 6-6"/></svg>
          </button>
        </h2>
        <ul class="ct-footer__list" id="ct-footer-list-${col.id}">
          ${col.links
            .map((link) => `<li><a href="${link.href}"${link.strong ? ' class="is-strong"' : ""}>${escapeHtml(link.label)}</a></li>`)
            .join("\n          ")}
        </ul>
      </nav>`
  ).join("");

  const socials = SOCIAL_LINKS.filter((s) => s && /^https:[/][/]/.test(s.href));
  const socialHtml = socials.length
    ? `<ul class="ct-footer__social" aria-label="Réseaux sociaux">
          ${socials
            .map(
              (s) =>
                `<li><a href="${escapeHtml(s.href)}" target="_blank" rel="noopener noreferrer" aria-label="${escapeHtml(brandName)} sur ${escapeHtml(s.label)}">${SOCIAL_ICONS[s.label] || escapeHtml(s.label.slice(0, 2))}</a></li>`
            )
            .join("\n          ")}
        </ul>`
    : "";

  return `
  <footer class="ct-footer" id="ct-footer">
    <div class="ct-footer__inner">
      <div class="ct-footer__grid">
        <div class="ct-footer__brand">
          <a class="ct-footer__brand-name" href="/">${escapeHtml(brandName)}</a>
          <p class="ct-footer__tagline">Un concept de SaaS généré pour ton profil, et le plan pour le lancer.</p>
        </div>
        ${columns}
      </div>
      <div class="ct-footer__bottom">
        <div class="ct-footer__legal-line">
          <span>© <span data-ct-year>${year}</span> ${escapeHtml(brandName)}</span>
          <span class="ct-footer__age"><span class="ct-footer__age-badge" aria-hidden="true">18+</span> Service réservé aux 18 ans et plus</span>
        </div>
        ${socialHtml}
      </div>
    </div>
  </footer>
  <script>
    (function () {
      var footer = document.getElementById("ct-footer");
      if (!footer) return;
      // Année dynamique (le build peut dater de l'an dernier).
      var yearEl = footer.querySelector("[data-ct-year]");
      if (yearEl) yearEl.textContent = String(new Date().getFullYear());

      // Accordéon mobile : replié par défaut une fois le JS chargé ; en
      // desktop le CSS ignore l'état et tout reste visible.
      var mq = window.matchMedia("(max-width: 720px)");
      footer.classList.add("ct-footer--js");
      var cols = footer.querySelectorAll(".ct-footer__col");
      function sync() {
        Array.prototype.forEach.call(cols, function (col) {
          var btn = col.querySelector(".ct-footer__toggle");
          var open = !mq.matches || col.classList.contains("is-open");
          btn.setAttribute("aria-expanded", open ? "true" : "false");
          if (mq.matches) btn.removeAttribute("tabindex");
          else btn.setAttribute("tabindex", "-1");
        });
      }
      Array.prototype.forEach.call(cols, function (col) {
        col.querySelector(".ct-footer__toggle").addEventListener("click", function () {
          if (!mq.matches) return;
          col.classList.toggle("is-open");
          sync();
        });
      });
      if (mq.addEventListener) mq.addEventListener("change", sync);
      sync();
    })();
  </script>`;
}
