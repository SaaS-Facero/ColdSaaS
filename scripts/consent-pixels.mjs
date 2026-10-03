// ---------------------------------------------------------------------------
// Retargeting TikTok / Meta — UNIQUEMENT avec consentement.
//
// Identifiants lus au build : TIKTOK_PIXEL_ID, META_PIXEL_ID (variables
// d'environnement Vercel). Aucun identifiant -> cette fonction ne rend RIEN :
// pas de bandeau, pas de script, aucun traceur (situation actuelle).
//
// Avec au moins un identifiant :
//   - bandeau de consentement : « Refuser » aussi visible qu'« Accepter »
//     (recommandations CNIL), aucun traceur publicitaire avant un clic sur
//     « Accepter » ;
//   - choix mémorisé 6 mois (localStorage "ct_ads_consent"), modifiable via
//     le lien « Gérer les cookies » du footer (#cookies-settings) ;
//   - après acceptation : chargement des pixels + PageView. Les audiences de
//     retargeting se construisent ensuite dans TikTok Ads Manager et Meta
//     Events Manager à partir de ces visites.
// Pas de backtick ni d'antislash dans le JS client (template literal).
// ---------------------------------------------------------------------------

export function consentPixelsConfig() {
  const clean = (v) => (typeof v === "string" && /^[A-Za-z0-9]+$/.test(v.trim()) ? v.trim() : "");
  return { tiktokId: clean(process.env.TIKTOK_PIXEL_ID), metaId: clean(process.env.META_PIXEL_ID) };
}

export function consentPixelsHtml({ tiktokId, metaId }) {
  if (!tiktokId && !metaId) return "";
  return `
  <div class="ads-consent" id="ads-consent" role="dialog" aria-live="polite" aria-label="Cookies publicitaires" hidden>
    <p class="ads-consent__text">On aimerait mesurer nos publicités TikTok et Meta avec des cookies, pour te montrer ColdTrend plus tard si tu pars. Tu peux refuser sans conséquence. <a href="/cookies">En savoir plus</a></p>
    <div class="ads-consent__actions">
      <button type="button" class="ads-consent__btn" data-ads-consent="refuse">Refuser</button>
      <button type="button" class="ads-consent__btn" data-ads-consent="accept">Accepter</button>
    </div>
  </div>
  <style>
    .ads-consent { position: fixed; left: 16px; right: 16px; bottom: 16px; z-index: 90; max-width: 560px; margin: 0 auto; padding: 16px; border-radius: 16px; background: #111727; color: #E4E6EB; border: 1px solid rgba(255, 255, 255, 0.12); box-shadow: 0 20px 50px -20px rgba(0, 0, 0, 0.8); font: 14px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; }
    .ads-consent[hidden] { display: none; }
    .ads-consent__text { margin: 0 0 12px; }
    .ads-consent__text a { color: #6E8FFF; }
    .ads-consent__actions { display: flex; gap: 10px; }
    /* Les deux choix ont exactement le même poids visuel. */
    .ads-consent__btn { flex: 1; min-height: 44px; border-radius: 12px; border: 1px solid rgba(255, 255, 255, 0.25); background: rgba(255, 255, 255, 0.06); color: #fff; font: inherit; font-weight: 700; cursor: pointer; }
    .ads-consent__btn:hover { border-color: #3D6BFF; }
  </style>
  <script>
    (function () {
      var TIKTOK_ID = ${JSON.stringify(tiktokId)};
      var META_ID = ${JSON.stringify(metaId)};
      var KEY = "ct_ads_consent";
      var SIX_MONTHS = 1000 * 60 * 60 * 24 * 182;
      var banner = document.getElementById("ads-consent");

      function readChoice() {
        try {
          var raw = JSON.parse(window.localStorage.getItem(KEY) || "null");
          if (raw && Date.now() - raw.at < SIX_MONTHS) return raw.choice;
        } catch (err) {
          return null;
        }
        return null;
      }

      function saveChoice(choice) {
        try {
          window.localStorage.setItem(KEY, JSON.stringify({ choice: choice, at: Date.now() }));
        } catch (err) {
          /* stockage indisponible : le bandeau reviendra, rien n'est chargé */
        }
      }

      function loadScript(src) {
        var s = document.createElement("script");
        s.async = true;
        s.src = src;
        document.head.appendChild(s);
      }

      // Chargés seulement après « Accepter ».
      function loadPixels() {
        if (META_ID && !window.fbq) {
          var fbq = function () {
            fbq.callMethod ? fbq.callMethod.apply(fbq, arguments) : fbq.queue.push(arguments);
          };
          fbq.queue = [];
          fbq.loaded = true;
          fbq.version = "2.0";
          window.fbq = window._fbq = fbq;
          loadScript("https://connect.facebook.net/en_US/fbevents.js");
          window.fbq("init", META_ID);
          window.fbq("track", "PageView");
        }
        if (TIKTOK_ID && !window.ttq) {
          var queue = [];
          var ttq = { _q: queue };
          ["page", "track", "identify"].forEach(function (m) {
            ttq[m] = function () {
              queue.push([m].concat(Array.prototype.slice.call(arguments)));
            };
          });
          window.TiktokAnalyticsObject = "ttq";
          window.ttq = ttq;
          loadScript("https://analytics.tiktok.com/i18n/pixel/events.js?sdkid=" + encodeURIComponent(TIKTOK_ID) + "&lib=ttq");
          ttq.page();
        }
      }

      banner.addEventListener("click", function (e) {
        var btn = e.target.closest("[data-ads-consent]");
        if (!btn) return;
        var choice = btn.getAttribute("data-ads-consent");
        saveChoice(choice);
        banner.hidden = true;
        if (choice === "accept") loadPixels();
      });

      // Lien « Gérer les cookies » : rouvre le bandeau.
      document.addEventListener("click", function (e) {
        var link = e.target.closest('a[href="#cookies-settings"]');
        if (!link) return;
        e.preventDefault();
        banner.hidden = false;
      });

      var choice = readChoice();
      if (choice === "accept") loadPixels();
      else if (choice !== "refuse") banner.hidden = false;
    })();
  </script>`;
}
