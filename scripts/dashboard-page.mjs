// ---------------------------------------------------------------------------
// /compte — dashboard ColdTrend (remplace l'ancien « dossier »).
//
// Arborescence liée :
//   scripts/dashboard-page.mjs   cette page (HTML + CSS + JS client)
//   scripts/dashboard-plan.js    missions, série, jalons (déterministe, testé)
//   scripts/goal-math.js         objectif, rythme (déjà utilisé par le quiz)
//   supabase/migrations/0034     revenue_entries, mission_checks,
//                                feature_waitlist, lecture concept limitée
//
// Navigation : barre d'onglets en bas (mobile), barre latérale (desktop).
// Onglets : Accueil / Mon concept / Créations vidéo / Ressources /
// Progression / Abonnement, adressables par l'URL (#accueil, #concept...).
//
// Règles :
//   - aucune donnée fictive : l'objectif et les revenus sont ceux saisis par
//     la personne, la série compte ses vraies actions, les fonctionnalités
//     non construites affichent « Bientôt disponible » ;
//   - contenu payant du concept servi par generate-user-concept (paiement
//     vérifié côté serveur), jamais lu directement en base ;
//   - liquid glass (backdrop-filter, reflets, bordures lumineuses) avec repli
//     sans flou : navigateur sans support, appareil modeste, économie de
//     données ou « réduire la transparence » ;
//   - mouvement : transform/opacity, spring, count-up, squelettes, vibration
//     au tap ; prefers-reduced-motion respecté ;
//   - copy : tutoiement, ton de coach, phrases de 10 mots maximum.
// Pas de backtick ni d'antislash dans le JS client (template literal).
// ---------------------------------------------------------------------------

const ICONS = {
  accueil: '<path d="M3 11 12 4l9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>',
  concept: '<path d="M12 3a6 6 0 0 1 3.6 10.8c-.6.5-1 1.2-1 2V17h-5.2v-1.2c0-.8-.4-1.5-1-2A6 6 0 0 1 12 3z"/><path d="M9.5 20.5h5"/>',
  videos: '<rect x="3" y="6" width="13" height="12" rx="3"/><path d="m16 10 5-3v10l-5-3"/>',
  ressources: '<path d="M4 5a2 2 0 0 1 2-2h12v16H6a2 2 0 0 0-2 2z"/><path d="M4 21V5"/><path d="M8 7h6"/>',
  progression: '<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
  abonnement: '<rect x="2" y="5" width="20" height="14" rx="3"/><path d="M2 10h20M6 15h4"/>'
};

const TABS = [
  { id: "accueil", label: "Accueil" },
  { id: "concept", label: "Concept" },
  { id: "videos", label: "Vidéos" },
  { id: "ressources", label: "Ressources" },
  { id: "progression", label: "Progrès" },
  { id: "abonnement", label: "Abonnement" }
];

function svg(path, size = 22) {
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`;
}

const CHECK = '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>';

export function dashboardPage({ brand, siteUrl, durationPlans, crispScript, videoModeJs }) {
  const plans = durationPlans.map((p) => ({ months: p.months, label: p.label, price: p.totalPrice, cadence: p.cadenceShort }));
  const navItems = TABS.map(
    (t) => `<li><a class="db-tab" href="#${t.id}" data-tab="${t.id}">${svg(ICONS[t.id])}<span>${t.label}</span></a></li>`
  ).join("");

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<meta name="theme-color" content="#0A0E1A" />
<meta name="robots" content="noindex" />
<title>${brand.name} — Mon espace</title>
<meta name="description" content="Ton espace ColdTrend : objectif, missions, concept, progression." />
<style>
  :root {
    color-scheme: dark;
    --bg: #0A0E1A;
    --ink: #F5F6F8;
    --text: #E4E6EB;
    --muted: #8A8F98;
    --cobalt: #0047FF;
    --cobalt-soft: #3D6BFF;
    --success: #22C55E; /* accent secondaire : réservé aux succès */
    --line: rgba(255, 255, 255, 0.1);
    --glass: rgba(255, 255, 255, 0.06);
    --spring: cubic-bezier(0.34, 1.56, 0.64, 1);
    --ease: cubic-bezier(0.16, 1, 0.3, 1);
    --nav-h: 64px;
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; background: var(--bg); color: var(--text); }
  body {
    min-height: 100vh;
    font: 15px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Inter, Arial, sans-serif;
    -webkit-font-smoothing: antialiased;
  }
  /* Fond : lueurs cobalt fixes (aucune animation coûteuse). */
  body::before {
    content: "";
    position: fixed;
    inset: 0;
    z-index: -1;
    background:
      radial-gradient(60vmax 60vmax at 0% -10%, rgba(0, 71, 255, 0.22), transparent 60%),
      radial-gradient(50vmax 50vmax at 100% 30%, rgba(61, 107, 255, 0.12), transparent 60%),
      var(--bg);
  }
  a { color: var(--cobalt-soft); }
  button { font: inherit; }
  :focus-visible { outline: 2px solid var(--cobalt-soft); outline-offset: 3px; border-radius: 8px; }
  [hidden] { display: none !important; }

  /* ---- Liquid glass ------------------------------------------------------ */
  .glass {
    position: relative;
    background: linear-gradient(160deg, rgba(255, 255, 255, 0.1), rgba(255, 255, 255, 0.03));
    border: 1px solid rgba(255, 255, 255, 0.14);
    border-radius: 22px;
    -webkit-backdrop-filter: blur(22px) saturate(170%);
    backdrop-filter: blur(22px) saturate(170%);
    box-shadow: 0 20px 50px -30px rgba(0, 0, 0, 0.9), inset 0 1px 0 rgba(255, 255, 255, 0.18);
    overflow: hidden;
  }
  /* Reflet spéculaire : un éclat diagonal fixe en haut à gauche. */
  .glass::before {
    content: "";
    position: absolute;
    inset: 0;
    border-radius: inherit;
    background: linear-gradient(125deg, rgba(255, 255, 255, 0.16) 0%, rgba(255, 255, 255, 0) 28%);
    pointer-events: none;
  }
  /* Bordure lumineuse cobalt sur les cartes mises en avant. */
  .glass--glow { border-color: rgba(61, 107, 255, 0.55); box-shadow: 0 0 0 1px rgba(0, 71, 255, 0.25), 0 24px 60px -30px rgba(0, 71, 255, 0.8), inset 0 1px 0 rgba(255, 255, 255, 0.2); }
  /* Repli sans flou : pas de support, appareil modeste, économie de données. */
  .no-blur .glass { -webkit-backdrop-filter: none; backdrop-filter: none; background: #141a2b; }

  /* ---- Coquille : barre latérale (desktop) / barre d'onglets (mobile) ----- */
  .db-app { min-height: 100vh; }
  .db-nav { position: fixed; z-index: 20; }
  .db-nav ul { list-style: none; margin: 0; padding: 0; }
  .db-tab {
    position: relative;
    display: flex;
    align-items: center;
    gap: 12px;
    color: var(--muted);
    text-decoration: none;
    -webkit-tap-highlight-color: transparent;
    transition: color 200ms ease, transform 300ms var(--spring);
  }
  .db-tab:active { transform: scale(0.94); }
  .db-tab[aria-current="page"] { color: var(--ink); }
  .db-tab[aria-current="page"] svg { color: var(--cobalt-soft); filter: drop-shadow(0 0 8px rgba(0, 71, 255, 0.8)); }
  .db-brand { display: none; color: var(--ink); font-weight: 800; font-size: 18px; text-decoration: none; letter-spacing: -0.01em; }

  @media (max-width: 899px) {
    .db-nav {
      left: 10px;
      right: 10px;
      bottom: calc(10px + env(safe-area-inset-bottom));
      height: var(--nav-h);
      border-radius: 24px;
      padding: 0 4px;
    }
    .db-nav ul { display: grid; grid-template-columns: repeat(6, 1fr); height: 100%; }
    .db-tab { flex-direction: column; justify-content: center; gap: 3px; height: 100%; font-size: 10px; font-weight: 600; min-width: 44px; }
    .db-main { padding: 16px 16px calc(var(--nav-h) + 40px + env(safe-area-inset-bottom)); }
  }
  @media (min-width: 900px) {
    .db-nav { top: 16px; bottom: 16px; left: 16px; width: 220px; padding: 22px 14px; display: flex; flex-direction: column; gap: 22px; }
    .db-brand { display: block; padding: 0 10px; }
    .db-nav ul { display: grid; gap: 4px; }
    .db-tab { padding: 11px 12px; border-radius: 14px; font-weight: 600; }
    .db-tab[aria-current="page"] { background: rgba(0, 71, 255, 0.18); }
    .db-main { margin-left: 252px; padding: 28px 32px 48px; max-width: 980px; }
  }

  /* ---- En-tête et menu du compte ------------------------------------------ */
  .db-top { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 18px; }
  .db-top h1 { margin: 0; font-size: clamp(24px, 6vw, 32px); letter-spacing: -0.02em; color: var(--ink); }
  .db-menu { position: relative; }
  .db-avatar {
    width: 44px; height: 44px; border-radius: 50%; border: 1px solid var(--line);
    background: linear-gradient(140deg, var(--cobalt), #2a3d7a); color: #fff; font-weight: 800; cursor: pointer;
  }
  .db-dropdown { position: absolute; right: 0; top: 52px; z-index: 30; min-width: 230px; padding: 6px; display: grid; }
  .db-dropdown button, .db-dropdown a {
    display: block; width: 100%; min-height: 44px; padding: 10px 12px; border: 0; border-radius: 12px;
    background: none; color: var(--text); text-align: left; text-decoration: none; cursor: pointer; font-size: 14px;
  }
  .db-dropdown button:hover, .db-dropdown a:hover { background: rgba(255, 255, 255, 0.07); }
  .db-dropdown .is-danger { color: #F28B85; }

  /* ---- Vues ------------------------------------------------------------------- */
  .db-view { display: grid; gap: 14px; }
  .db-view.is-entering { animation: db-enter 420ms var(--ease) both; }
  @keyframes db-enter { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
  .card { padding: 18px; }
  .card h2 { margin: 0 0 6px; font-size: 13px; letter-spacing: 0.08em; text-transform: uppercase; color: #9DB4FF; }
  .card p { margin: 0; }
  .big { font-size: clamp(30px, 8vw, 40px); font-weight: 800; color: var(--ink); letter-spacing: -0.02em; font-variant-numeric: tabular-nums; }
  .sub { color: var(--muted); font-size: 14px; }
  .grid-2 { display: grid; gap: 14px; }
  @media (min-width: 700px) { .grid-2 { grid-template-columns: 1fr 1fr; } }

  .btn {
    display: inline-flex; align-items: center; justify-content: center; gap: 8px;
    min-height: 48px; padding: 12px 18px; border-radius: 14px; border: 0;
    background: var(--cobalt); color: #fff; font-weight: 700; text-decoration: none; cursor: pointer;
    box-shadow: 0 10px 30px -14px rgba(0, 71, 255, 0.9);
    transition: transform 300ms var(--spring), filter 150ms ease;
  }
  .btn:hover { filter: brightness(1.1); color: #fff; }
  .btn:active { transform: scale(0.96); }
  .btn[disabled] { opacity: 0.55; cursor: progress; }
  .btn--ghost { background: transparent; border: 1px solid var(--line); box-shadow: none; color: var(--ink); }
  .btn--success { background: var(--success); color: #06120A; box-shadow: 0 10px 30px -14px rgba(34, 197, 94, 0.9); }
  .row { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; margin-top: 14px; }

  /* Prochaine action */
  .next-action__title { font-size: 20px; font-weight: 800; color: var(--ink); margin: 2px 0 12px; }

  /* Missions */
  .missions { list-style: none; margin: 10px 0 0; padding: 0; display: grid; gap: 8px; }
  .mission {
    display: flex; align-items: center; gap: 12px; min-height: 52px; padding: 10px 12px;
    border-radius: 14px; border: 1px solid var(--line); background: rgba(255, 255, 255, 0.03); cursor: pointer;
    transition: border-color 200ms ease, background 200ms ease;
  }
  .mission input { position: absolute; opacity: 0; pointer-events: none; }
  .mission__box {
    flex: none; width: 26px; height: 26px; border-radius: 8px; border: 2px solid rgba(255, 255, 255, 0.25);
    display: grid; place-items: center; color: #06120A;
    transition: background 200ms ease, border-color 200ms ease, transform 380ms var(--spring);
  }
  .mission__box svg { opacity: 0; transform: scale(0.4); transition: opacity 160ms ease, transform 380ms var(--spring); }
  .mission.is-done { border-color: rgba(34, 197, 94, 0.45); background: rgba(34, 197, 94, 0.08); }
  .mission.is-done .mission__box { background: var(--success); border-color: var(--success); transform: scale(1.06); }
  .mission.is-done .mission__box svg { opacity: 1; transform: none; }
  .mission.is-done .mission__title { color: var(--muted); text-decoration: line-through; }
  .mission__title { color: var(--ink); font-weight: 600; }
  .streak { display: inline-flex; align-items: center; gap: 6px; padding: 5px 11px; border-radius: 999px; font-size: 13px; font-weight: 700; border: 1px solid var(--line); color: var(--muted); }
  .streak.is-on { color: var(--success); border-color: rgba(34, 197, 94, 0.5); background: rgba(34, 197, 94, 0.1); }
  .card-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; }

  /* Concept */
  .concept-name { font-size: clamp(26px, 7vw, 34px); font-weight: 800; color: var(--ink); letter-spacing: -0.02em; margin: 4px 0; }
  .concept-field { margin-top: 14px; }
  .concept-field h3 { margin: 0 0 4px; font-size: 13px; color: var(--muted); font-weight: 600; }
  .concept-field p { white-space: pre-line; }
  .locked-list { list-style: none; padding: 0; margin: 14px 0 0; display: grid; gap: 8px; color: var(--muted); }
  .share-preview { width: 120px; aspect-ratio: 9 / 16; border-radius: 14px; border: 1px solid var(--line); background: #0A0E1A center / cover no-repeat; flex: none; }
  .switch { display: inline-flex; align-items: center; gap: 8px; min-height: 44px; cursor: pointer; color: var(--text); font-size: 14px; }
  .switch input { width: 20px; height: 20px; accent-color: var(--cobalt); }

  /* Bientôt disponible */
  .soon { text-align: center; padding: 28px 20px; }
  .soon__icon { width: 64px; height: 64px; margin: 0 auto 12px; border-radius: 20px; display: grid; place-items: center; color: #C8D4FF; background: rgba(0, 71, 255, 0.2); border: 1px solid rgba(61, 107, 255, 0.45); }
  .soon__badge { display: inline-block; margin-bottom: 8px; padding: 3px 10px; border-radius: 999px; font-size: 12px; font-weight: 700; color: #C8D4FF; border: 1px solid rgba(61, 107, 255, 0.5); }
  .soon h2 { text-transform: none; letter-spacing: -0.01em; font-size: 22px; color: var(--ink); margin: 0 0 6px; }

  /* Jauge (transform uniquement : demi-disque tourné, cadran masqué en anneau) */
  .gauge { position: relative; width: 100%; max-width: 260px; margin: 8px auto 0; }
  .gauge__dial { position: relative; width: 100%; aspect-ratio: 2 / 1; overflow: hidden;
    -webkit-mask: radial-gradient(circle at 50% 100%, transparent 64%, #000 calc(64% + 1px));
    mask: radial-gradient(circle at 50% 100%, transparent 64%, #000 calc(64% + 1px)); }
  .gauge__track { position: absolute; inset: 0 0 -100% 0; border-radius: 50%; background: rgba(255, 255, 255, 0.1); }
  .gauge__sweep { position: absolute; left: 0; top: 100%; width: 100%; height: 100%; border-radius: 0 0 999px 999px;
    background: linear-gradient(90deg, var(--cobalt), var(--cobalt-soft)); transform-origin: 50% 0; transform: rotate(0deg);
    transition: transform 900ms var(--spring); }
  .gauge.is-goal .gauge__sweep { background: linear-gradient(90deg, #16a34a, var(--success)); }
  .gauge__value { position: absolute; left: 0; right: 0; bottom: 0; margin: 0; text-align: center; }
  .gauge__scale { display: flex; justify-content: space-between; max-width: 260px; margin: 4px auto 0; font-size: 12px; color: var(--muted); }
  .field { display: grid; gap: 6px; }
  .field input, .field select {
    min-height: 48px; padding: 10px 14px; border-radius: 14px; border: 1px solid var(--line);
    background: rgba(255, 255, 255, 0.05); color: var(--ink); font: inherit; font-size: 17px;
  }
  .milestones { list-style: none; margin: 10px 0 0; padding: 0; display: grid; gap: 8px; }
  .milestone { display: flex; align-items: center; gap: 10px; color: var(--muted); }
  .milestone__dot { width: 22px; height: 22px; border-radius: 50%; border: 2px solid rgba(255, 255, 255, 0.2); display: grid; place-items: center; color: #06120A; }
  .milestone__dot svg { opacity: 0; }
  .milestone.is-done { color: var(--ink); }
  .milestone.is-done .milestone__dot { background: var(--success); border-color: var(--success); }
  .milestone.is-done .milestone__dot svg { opacity: 1; }
  .history { list-style: none; margin: 10px 0 0; padding: 0; display: grid; gap: 6px; }
  .history li { display: flex; justify-content: space-between; font-variant-numeric: tabular-nums; }

  /* Abonnement */
  .plans { display: grid; gap: 10px; margin-top: 10px; }
  .plan { display: flex; justify-content: space-between; align-items: center; padding: 12px 14px; border-radius: 14px; border: 1px solid var(--line); }
  .plan.is-current { border-color: var(--cobalt-soft); background: rgba(0, 71, 255, 0.15); }
  .badge-ok { display: inline-block; padding: 3px 10px; border-radius: 999px; font-size: 12px; font-weight: 700; color: var(--success); border: 1px solid rgba(34, 197, 94, 0.5); }
  .optin { display: flex; gap: 12px; align-items: flex-start; min-height: 44px; cursor: pointer; }
  .optin input { width: 20px; height: 20px; margin-top: 2px; accent-color: var(--cobalt); flex: none; }

  /* Squelettes */
  .sk { border-radius: 18px; background: linear-gradient(90deg, rgba(255,255,255,0.05), rgba(255,255,255,0.1), rgba(255,255,255,0.05)); background-size: 200% 100%; animation: sk 1.4s ease-in-out infinite; }
  @keyframes sk { from { background-position: 200% 0; } to { background-position: -200% 0; } }
  .db-skeleton { display: grid; gap: 14px; padding: 24px 16px; max-width: 760px; margin: 0 auto; }

  .db-toast {
    position: fixed; left: 50%; bottom: calc(var(--nav-h) + 28px + env(safe-area-inset-bottom)); z-index: 40;
    transform: translate(-50%, 20px); opacity: 0; pointer-events: none;
    padding: 12px 18px; border-radius: 14px; background: var(--ink); color: var(--bg); font-weight: 700; font-size: 14px;
    transition: opacity 220ms ease, transform 380ms var(--spring); max-width: calc(100vw - 32px); text-align: center;
  }
  .db-toast.is-visible { opacity: 1; transform: translate(-50%, 0); }
  .db-toast.is-success { background: var(--success); color: #06120A; }
  @media (min-width: 900px) { .db-toast { bottom: 28px; } }

  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after { animation-duration: 1ms !important; animation-iteration-count: 1 !important; transition-duration: 1ms !important; }
  }
</style>
</head>
<body>
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
<script src="/js/supabase-client.js"></script>
<script src="/js/goal-math.js"></script>
<script src="/js/dashboard-plan.js"></script>

  <div class="db-skeleton" id="db-skeleton" aria-hidden="true">
    <div class="sk" style="height:40px;width:60%"></div>
    <div class="sk" style="height:140px"></div>
    <div class="sk" style="height:110px"></div>
    <div class="sk" style="height:200px"></div>
  </div>

  <div class="db-app" id="db-app" hidden>
    <nav class="db-nav glass" aria-label="Navigation principale">
      <a class="db-brand" href="/">${brand.name}</a>
      <ul>${navItems}</ul>
    </nav>

    <main class="db-main">
      <header class="db-top">
        <h1 id="db-title">Salut</h1>
        <div class="db-menu" id="db-menu">
          <button type="button" class="db-avatar" id="db-avatar" aria-haspopup="true" aria-expanded="false" aria-label="Menu du compte">·</button>
          <div class="db-dropdown glass" id="db-dropdown" hidden>
            <a href="/admin" id="m-admin" hidden>Accéder à l'admin</a>
            <button type="button" id="m-video-on" hidden>🎬 Mode Vidéo</button>
            <button type="button" id="m-video-off" hidden>Quitter le Mode Vidéo</button>
            <button type="button" id="m-help">Aide (chat)</button>
            <button type="button" id="m-resend" hidden>Renvoyer mon accès par email</button>
            <button type="button" id="m-signout">Se déconnecter</button>
            <button type="button" id="m-delete" class="is-danger">Supprimer mon compte</button>
          </div>
        </div>
      </header>

      <!-- ===== Accueil ===== -->
      <section class="db-view" data-view="accueil" aria-labelledby="db-title">
        <div class="card glass glass--glow" id="goal-card">
          <h2>Ton objectif</h2>
          <p class="big"><span id="goal-amount">—</span></p>
          <p class="sub" id="goal-sub">Fixe ton cap pour commencer.</p>
        </div>
        <div class="card glass">
          <h2>Ta prochaine action</h2>
          <p class="next-action__title" id="next-title">—</p>
          <div class="row" style="margin-top:0">
            <button type="button" class="btn" id="next-done">C'est fait</button>
          </div>
        </div>
        <div class="card glass">
          <div class="card-head">
            <h2 id="week-title">Tes missions de la semaine</h2>
            <span class="streak" id="streak">0 jour actif</span>
          </div>
          <p class="sub" id="week-theme"></p>
          <ul class="missions" id="missions"></ul>
        </div>
        <div class="card glass" id="unlock-card" hidden>
          <h2>Ton plan complet</h2>
          <p>Débloque ta fiche concept et ton accompagnement.</p>
          <div class="row"><a class="btn" href="/?resume=result">Voir les offres</a></div>
        </div>
      </section>

      <!-- ===== Mon concept ===== -->
      <section class="db-view" data-view="concept" hidden>
        <div class="card glass glass--glow" id="concept-card">
          <h2>Mon concept</h2>
          <p class="concept-name" id="concept-name">—</p>
          <p class="sub" id="concept-tagline"></p>
          <div id="concept-full" hidden></div>
          <div id="concept-locked" hidden>
            <ul class="locked-list">
              <li>🔒 Description complète</li>
              <li>🔒 Cible et canaux d'acquisition</li>
              <li>🔒 Direction artistique</li>
            </ul>
            <div class="row"><a class="btn" href="/?resume=result">Débloquer ma fiche</a></div>
          </div>
          <div id="concept-empty" hidden>
            <p>Ton concept n'existe pas encore.</p>
            <div class="row"><a class="btn" href="/?resume=quiz">Reprendre mon quiz</a></div>
          </div>
        </div>
        <div class="card glass" id="share-card" hidden>
          <h2>Partage ton concept</h2>
          <div class="row" style="align-items:flex-start;flex-wrap:nowrap">
            <div class="share-preview" id="share-preview" role="img" aria-label="Aperçu de la carte 9:16"></div>
            <div>
              <p>Une carte 9:16, prête pour TikTok.</p>
              <label class="switch"><input type="checkbox" id="share-goal" /> Afficher mon objectif</label>
              <div class="row"><button type="button" class="btn" id="share-btn">Exporter la carte</button></div>
            </div>
          </div>
        </div>
      </section>

      <!-- ===== Créations vidéo / Ressources : pas encore construites ===== -->
      <section class="db-view" data-view="videos" hidden>
        <div class="card glass soon">
          <div class="soon__icon">${svg(ICONS.videos, 30)}</div>
          <span class="soon__badge">Bientôt disponible</span>
          <h2>Créations vidéo</h2>
          <p class="sub">Pas encore prêt. On te prévient au lancement.</p>
          <div class="row" style="justify-content:center"><button type="button" class="btn" data-waitlist="video">Préviens-moi</button></div>
        </div>
      </section>
      <section class="db-view" data-view="ressources" hidden>
        <div class="card glass soon">
          <div class="soon__icon">${svg(ICONS.ressources, 30)}</div>
          <span class="soon__badge">Bientôt disponible</span>
          <h2>Ressources</h2>
          <p class="sub">Guides et modèles en préparation. On te prévient.</p>
          <div class="row" style="justify-content:center"><button type="button" class="btn" data-waitlist="ressources">Préviens-moi</button></div>
        </div>
      </section>

      <!-- ===== Progression ===== -->
      <section class="db-view" data-view="progression" hidden>
        <div class="card glass glass--glow">
          <h2>Ce mois-ci</h2>
          <div class="gauge" id="gauge">
            <div class="gauge__dial" aria-hidden="true"><span class="gauge__track"></span><span class="gauge__sweep" id="gauge-sweep"></span></div>
            <p class="gauge__value"><span class="big" id="month-amount">0 €</span></p>
          </div>
          <p class="gauge__scale"><span>0 €</span><span id="gauge-max">Objectif</span></p>
          <p class="sub" style="text-align:center;margin-top:8px" id="gauge-sub">Montants déclarés par toi. Rien n'est estimé.</p>
        </div>
        <div class="card glass">
          <h2>Déclare tes revenus</h2>
          <form id="revenue-form" class="row" style="align-items:flex-end">
            <label class="field" style="flex:1;min-width:160px">
              <span class="sub" id="revenue-label">Revenus de ce mois</span>
              <input type="text" inputmode="numeric" id="revenue-input" autocomplete="off" placeholder="0" />
            </label>
            <button type="submit" class="btn">Enregistrer</button>
          </form>
          <ul class="history" id="history"></ul>
        </div>
        <div class="card glass">
          <h2>Tes jalons</h2>
          <ul class="milestones" id="milestones"></ul>
        </div>
        <div class="card glass">
          <h2>Ton objectif</h2>
          <form id="goal-form" class="row" style="align-items:flex-end">
            <label class="field" style="flex:1;min-width:140px"><span class="sub">€ par mois</span><input type="text" inputmode="numeric" id="goal-input" autocomplete="off" /></label>
            <label class="field" style="min-width:120px"><span class="sub">Délai</span>
              <select id="delay-input"><option value="1">1 mois</option><option value="2">2 mois</option><option value="3">3 mois</option><option value="4">4 mois</option><option value="5">5 mois</option><option value="6">6 mois</option></select>
            </label>
            <button type="submit" class="btn btn--ghost">Mettre à jour</button>
          </form>
        </div>
      </section>

      <!-- ===== Abonnement ===== -->
      <section class="db-view" data-view="abonnement" hidden>
        <div class="card glass glass--glow">
          <h2>Ton abonnement</h2>
          <p class="big" id="sub-status">—</p>
          <p class="sub" id="sub-detail"></p>
          <div class="plans" id="plans"></div>
          <div class="row" id="sub-actions"></div>
        </div>
        <div class="card glass">
          <h2>Emails</h2>
          <label class="optin" for="optin">
            <input type="checkbox" id="optin" />
            <span>Recevoir les conseils et rappels de Max. Désinscription en 1 clic.</span>
          </label>
          <p class="sub" id="optin-status"></p>
        </div>
      </section>
    </main>
  </div>
  <div class="db-toast" id="db-toast" role="status" aria-live="polite"></div>

  <!-- Crisp AVANT le script du dashboard : il initialise window.$crisp = [],
       ce qui effacerait les commandes (masquage en mobile) poussées avant. -->
  ${crispScript}
  <script>
    (function () {
      ${videoModeJs}
      var PLANS = ${JSON.stringify(plans)};
      var G = window.ColdTrendGoal;
      var P = window.ColdTrendPlan;
      var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      var state = { user: null, profile: {}, concept: null, paid: false, weekStart: null, done: [], activity: [], revenue: [], waitlist: [] };
      var supabase = null;

      // ---- Repli sans flou -------------------------------------------------
      (function detectSlowDevice() {
        var noSupport = !(window.CSS && (CSS.supports("backdrop-filter", "blur(2px)") || CSS.supports("-webkit-backdrop-filter", "blur(2px)")));
        var conn = navigator.connection || {};
        var modest = (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4) || (navigator.deviceMemory && navigator.deviceMemory <= 4);
        var reduceTransparency = window.matchMedia("(prefers-reduced-transparency: reduce)").matches;
        if (noSupport || modest || conn.saveData || reduceTransparency) document.documentElement.classList.add("no-blur");
      })();

      // ---- Utilitaires ---------------------------------------------------------
      function $(id) { return document.getElementById(id); }
      function vibrate(ms) { try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) { /* iOS */ } }
      var toastTimer = null;
      function toast(message, success) {
        var el = $("db-toast");
        el.textContent = message;
        el.classList.toggle("is-success", !!success);
        el.classList.add("is-visible");
        window.clearTimeout(toastTimer);
        toastTimer = window.setTimeout(function () { el.classList.remove("is-visible"); }, 2600);
      }
      function euros(n) { return G ? G.formatEuro(n) : Math.round(n) + " €"; }
      // Count-up retargetable (rAF, contenu texte seulement).
      function countTo(el, target, format) {
        if (reduceMotion || typeof el._v !== "number") { el._v = target; el.textContent = format(target); return; }
        el._t = target;
        if (el._raf) return;
        (function tick() {
          var v = el._v + (el._t - el._v) * 0.18;
          if (Math.abs(el._t - v) < 0.5) v = el._t;
          el._v = v;
          el.textContent = format(v);
          el._raf = v === el._t ? null : window.requestAnimationFrame(tick);
        })();
      }
      function digits(raw) { return Number(String(raw || "").replace(/[^0-9]/g, "")) || 0; }
      var confettiLoading = null;
      function confetti() {
        if (reduceMotion) return;
        if (!confettiLoading) {
          confettiLoading = new Promise(function (resolve) {
            var s = document.createElement("script");
            s.src = "https://cdn.jsdelivr.net/npm/canvas-confetti@1.9.3/dist/confetti.browser.min.js";
            s.onload = resolve;
            s.onerror = resolve;
            document.head.appendChild(s);
          });
        }
        confettiLoading.then(function () {
          if (window.confetti) window.confetti({ particleCount: 120, spread: 75, origin: { y: 0.7 }, colors: ["#22C55E", "#0047FF", "#FFFFFF"] });
        });
      }
      async function callFn(name, body) {
        var sessionRes = await supabase.auth.getSession();
        var token = sessionRes.data.session ? sessionRes.data.session.access_token : null;
        if (!token) return { error: "Session expirée." };
        var res = await fetch(supabase.supabaseUrl + "/functions/v1/" + name, {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey: supabase.supabaseKey, Authorization: "Bearer " + token },
          body: JSON.stringify(body || {})
        });
        try { return await res.json(); } catch (e) { return { error: "Réponse invalide." }; }
      }

      // ---- Navigation ----------------------------------------------------------
      var TAB_IDS = ${JSON.stringify(TABS.map((t) => t.id))};
      // Titre de chaque onglet ; l'Accueil garde le « Salut » personnalisé.
      var TAB_TITLES = { concept: "Mon concept", videos: "Créations vidéo", ressources: "Ressources", progression: "Ta progression", abonnement: "Abonnement" };
      function greeting() { return state.profile.prenom ? "Salut " + state.profile.prenom : "Salut"; }
      function showTab(id, fromUser) {
        if (TAB_IDS.indexOf(id) === -1) id = "accueil";
        Array.prototype.forEach.call(document.querySelectorAll(".db-view"), function (v) {
          var on = v.getAttribute("data-view") === id;
          v.hidden = !on;
          if (on) { v.classList.remove("is-entering"); void v.offsetWidth; v.classList.add("is-entering"); }
        });
        Array.prototype.forEach.call(document.querySelectorAll(".db-tab"), function (t) {
          if (t.getAttribute("data-tab") === id) t.setAttribute("aria-current", "page");
          else t.removeAttribute("aria-current");
        });
        $("db-title").textContent = id === "accueil" ? greeting() : TAB_TITLES[id];
        if (fromUser) vibrate(8);
        if (id === "progression") renderProgress(false);
        if (id === "concept") renderShareCard();
        window.scrollTo(0, 0);
      }
      document.querySelector(".db-nav").addEventListener("click", function (e) {
        var tab = e.target.closest("[data-tab]");
        if (!tab) return;
        e.preventDefault();
        var id = tab.getAttribute("data-tab");
        if (window.location.hash !== "#" + id) window.history.pushState(null, "", "#" + id);
        showTab(id, true);
      });
      window.addEventListener("popstate", function () { showTab(window.location.hash.slice(1), false); });

      // ---- Accueil -------------------------------------------------------------
      function renderHome() {
        var p = state.profile;
        if (!window.location.hash || window.location.hash === "#accueil") $("db-title").textContent = greeting();
        if (p.objectif_mensuel > 0) {
          countTo($("goal-amount"), p.objectif_mensuel, function (v) { return euros(Math.round(v / 10) * 10) + "/mois"; });
          $("goal-sub").textContent = p.delai_mois ? "En " + p.delai_mois + " mois. On y va pas à pas." : "Fixe ton délai dans Progrès.";
        } else {
          $("goal-amount").textContent = "À définir";
          $("goal-sub").textContent = "Fixe ton objectif dans l'onglet Progrès.";
        }
        var plan = P.weekPlan(state.weekIndex, { temps: p.temps, objectif: p.objectif_mensuel, delai: p.delai_mois, secteur: p.secteur });
        state.plan = plan;
        $("week-title").textContent = "Semaine " + (state.weekIndex + 1) + " · tes missions";
        $("week-theme").textContent = plan.theme;
        var list = $("missions");
        list.textContent = "";
        plan.missions.forEach(function (m) {
          var li = document.createElement("li");
          var label = document.createElement("label");
          label.className = "mission" + (state.done.indexOf(m.key) !== -1 ? " is-done" : "");
          var input = document.createElement("input");
          input.type = "checkbox";
          input.checked = state.done.indexOf(m.key) !== -1;
          input.setAttribute("data-mission", m.key);
          var box = document.createElement("span");
          box.className = "mission__box";
          box.innerHTML = ${JSON.stringify(CHECK.replace(/"/g, "'"))};
          var title = document.createElement("span");
          title.className = "mission__title";
          title.textContent = m.title;
          label.appendChild(input);
          label.appendChild(box);
          label.appendChild(title);
          li.appendChild(label);
          list.appendChild(li);
        });
        var next = P.nextAction(plan.missions, state.done);
        $("next-title").textContent = next ? next.title : "Tout est fait. Respire, puis recommence lundi.";
        $("next-done").hidden = !next;
        $("next-done").setAttribute("data-mission", next ? next.key : "");
        var streak = P.activeStreak(state.activity, P.parisDate(Date.now()));
        var s = $("streak");
        s.textContent = (streak.days > 0 ? "🔥 " : "") + streak.days + (streak.days > 1 ? " jours actifs" : " jour actif");
        s.classList.toggle("is-on", streak.days > 0);
        $("unlock-card").hidden = state.paid;
      }

      async function setMission(key, done) {
        var today = P.parisDate(Date.now());
        if (done) {
          state.done.push(key);
          if (state.activity.indexOf(today) === -1) state.activity.push(today);
        } else {
          state.done = state.done.filter(function (k) { return k !== key; });
        }
        renderHome();
        var res = done
          ? await supabase.from("mission_checks").upsert({ user_id: state.user.id, week_start: state.weekStart, mission_key: key })
          : await supabase.from("mission_checks").delete().eq("user_id", state.user.id).eq("week_start", state.weekStart).eq("mission_key", key);
        if (res.error) { toast("Pas enregistré. Réessaie."); return; }
        if (done) {
          vibrate([10, 40, 14]);
          var allDone = !P.nextAction(state.plan.missions, state.done);
          if (allDone) { confetti(); toast("Semaine bouclée. Bravo.", true); }
          else toast("Bien joué. Une de moins.", true);
        }
      }

      $("missions").addEventListener("change", function (e) {
        var key = e.target.getAttribute("data-mission");
        if (key) setMission(key, e.target.checked);
      });
      $("next-done").addEventListener("click", function () {
        var key = this.getAttribute("data-mission");
        if (key) setMission(key, true);
      });

      // ---- Mon concept -----------------------------------------------------------
      var CONCEPT_FIELDS = [["description", "Le produit"], ["target_persona", "Ta cible"], ["channels", "Tes canaux"], ["palette", "Palette"], ["logo_style", "Logo"], ["confidence_note", "Limites à garder en tête"]];
      function renderConcept() {
        var c = state.concept;
        $("concept-full").hidden = true;
        $("concept-locked").hidden = true;
        $("concept-empty").hidden = true;
        $("share-card").hidden = !c;
        if (!c) {
          $("concept-name").textContent = "Pas encore généré";
          $("concept-tagline").textContent = "";
          $("concept-empty").hidden = false;
          return;
        }
        $("concept-name").textContent = c.concept_name;
        $("concept-tagline").textContent = c.tagline || "";
        if (!state.paid || c.locked) { $("concept-locked").hidden = false; return; }
        var box = $("concept-full");
        box.textContent = "";
        CONCEPT_FIELDS.forEach(function (f) {
          if (!c[f[0]]) return;
          var wrap = document.createElement("div");
          wrap.className = "concept-field";
          var h = document.createElement("h3");
          h.textContent = f[1];
          var p = document.createElement("p");
          p.textContent = c[f[0]];
          wrap.appendChild(h);
          wrap.appendChild(p);
          box.appendChild(wrap);
        });
        box.hidden = false;
      }

      // Carte 9:16 (1080 x 1920) dessinée sur canvas : nom, accroche,
      // objectif seulement si la personne le choisit. Aucune promesse.
      function wrapLines(ctx, text, maxWidth) {
        var words = String(text || "").split(" ");
        var lines = [];
        var line = "";
        words.forEach(function (w) {
          var test = line ? line + " " + w : w;
          if (ctx.measureText(test).width > maxWidth && line) { lines.push(line); line = w; } else { line = test; }
        });
        if (line) lines.push(line);
        return lines;
      }
      function drawShareCard() {
        var c = state.concept;
        if (!c) return null;
        var canvas = document.createElement("canvas");
        canvas.width = 1080;
        canvas.height = 1920;
        var ctx = canvas.getContext("2d");
        var bg = ctx.createLinearGradient(0, 0, 1080, 1920);
        bg.addColorStop(0, "#0A0E1A");
        bg.addColorStop(1, "#050710");
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, 1080, 1920);
        var glow = ctx.createRadialGradient(240, 360, 0, 240, 360, 900);
        glow.addColorStop(0, "rgba(0, 71, 255, 0.55)");
        glow.addColorStop(1, "rgba(0, 71, 255, 0)");
        ctx.fillStyle = glow;
        ctx.fillRect(0, 0, 1080, 1920);
        ctx.fillStyle = "rgba(255, 255, 255, 0.06)";
        ctx.strokeStyle = "rgba(255, 255, 255, 0.18)";
        ctx.lineWidth = 3;
        if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(90, 520, 900, 880, 60); ctx.fill(); ctx.stroke(); }
        var font = "-apple-system, Segoe UI, Roboto, Arial, sans-serif";
        ctx.fillStyle = "#9DB4FF";
        ctx.font = "700 40px " + font;
        ctx.fillText("MON CONCEPT SAAS", 160, 640);
        ctx.fillStyle = "#FFFFFF";
        ctx.font = "800 104px " + font;
        var y = 790;
        wrapLines(ctx, c.concept_name, 760).slice(0, 3).forEach(function (l) { ctx.fillText(l, 160, y); y += 118; });
        ctx.fillStyle = "#E4E6EB";
        ctx.font = "500 50px " + font;
        y += 20;
        wrapLines(ctx, c.tagline, 760).slice(0, 4).forEach(function (l) { ctx.fillText(l, 160, y); y += 66; });
        if ($("share-goal").checked && state.profile.objectif_mensuel > 0) {
          ctx.fillStyle = "#3D6BFF";
          ctx.font = "700 46px " + font;
          ctx.fillText("Mon objectif : " + G.formatGoal(state.profile.objectif_mensuel), 160, 1310);
        }
        ctx.fillStyle = "#FFFFFF";
        ctx.font = "800 54px " + font;
        ctx.fillText("${brand.name}", 160, 1700);
        ctx.fillStyle = "#8A8F98";
        ctx.font = "500 40px " + font;
        ctx.fillText("Trouve ton concept sur coldtrend.com", 160, 1770);
        return canvas;
      }
      function renderShareCard() {
        var canvas = drawShareCard();
        if (canvas) $("share-preview").style.backgroundImage = "url(" + canvas.toDataURL("image/png") + ")";
      }
      $("share-goal").addEventListener("change", renderShareCard);
      $("share-btn").addEventListener("click", function () {
        var canvas = drawShareCard();
        if (!canvas) return;
        vibrate(10);
        canvas.toBlob(async function (blob) {
          if (!blob) return;
          var file = new File([blob], "mon-concept-coldtrend.png", { type: "image/png" });
          // Partage natif (mobile) si possible, sinon téléchargement.
          if (navigator.canShare && navigator.canShare({ files: [file] })) {
            try { await navigator.share({ files: [file], title: state.concept.concept_name }); return; } catch (e) { if (e && e.name === "AbortError") return; }
          }
          var a = document.createElement("a");
          a.href = URL.createObjectURL(blob);
          a.download = file.name;
          document.body.appendChild(a);
          a.click();
          a.remove();
          toast("Carte téléchargée. À toi de jouer.");
        }, "image/png");
      });

      // ---- Bientôt disponible : liste d'attente en 1 tap ---------------------------
      function renderWaitlist() {
        Array.prototype.forEach.call(document.querySelectorAll("[data-waitlist]"), function (btn) {
          var on = state.waitlist.indexOf(btn.getAttribute("data-waitlist")) !== -1;
          btn.textContent = on ? "✓ Tu seras prévenu" : "Préviens-moi";
          btn.classList.toggle("btn--success", on);
        });
      }
      document.addEventListener("click", async function (e) {
        var btn = e.target.closest("[data-waitlist]");
        if (!btn) return;
        var feature = btn.getAttribute("data-waitlist");
        var on = state.waitlist.indexOf(feature) !== -1;
        vibrate(10);
        var res = on
          ? await supabase.from("feature_waitlist").delete().eq("user_id", state.user.id).eq("feature", feature)
          : await supabase.from("feature_waitlist").insert({ user_id: state.user.id, feature: feature });
        if (res.error) { toast("Pas enregistré. Réessaie."); return; }
        state.waitlist = on ? state.waitlist.filter(function (f) { return f !== feature; }) : state.waitlist.concat([feature]);
        renderWaitlist();
        toast(on ? "Désinscrit de la liste." : "C'est noté. On te prévient.", !on);
      });

      // ---- Progression --------------------------------------------------------------
      function currentMonth() { return P.monthStart(Date.now()); }
      function monthAmount(month) {
        var row = state.revenue.filter(function (r) { return r.month === month; })[0];
        return row ? row.amount_eur : 0;
      }
      function bestMonth() {
        return state.revenue.reduce(function (m, r) { return Math.max(m, r.amount_eur); }, 0);
      }
      function monthLabel(month) {
        var d = new Date(month + "T12:00:00Z");
        return d.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
      }
      function renderProgress(animate) {
        var goal = state.profile.objectif_mensuel || 0;
        var amount = monthAmount(currentMonth());
        var ratio = goal > 0 ? Math.min(1, amount / goal) : 0;
        var gauge = $("gauge");
        gauge.classList.toggle("is-goal", goal > 0 && amount >= goal);
        var sweep = $("gauge-sweep");
        if (animate === false && !reduceMotion) { sweep.style.transition = "none"; sweep.style.transform = "rotate(0deg)"; void sweep.offsetWidth; sweep.style.transition = ""; }
        window.requestAnimationFrame(function () { sweep.style.transform = "rotate(" + (ratio * 180).toFixed(1) + "deg)"; });
        var amountEl = $("month-amount");
        if (animate === false) amountEl._v = 0;
        countTo(amountEl, amount, function (v) { return euros(Math.round(v)); });
        $("gauge-max").textContent = goal > 0 ? euros(goal) : "Objectif à fixer";
        $("revenue-label").textContent = "Revenus de " + monthLabel(currentMonth());
        $("revenue-input").value = amount ? String(amount) : "";
        var best = bestMonth();
        var list = $("milestones");
        list.textContent = "";
        P.milestones(goal).forEach(function (m) {
          var li = document.createElement("li");
          li.className = "milestone" + (best >= m.amount ? " is-done" : "");
          li.innerHTML = '<span class="milestone__dot">' + ${JSON.stringify(CHECK.replace(/"/g, "'"))} + "</span>";
          var t = document.createElement("span");
          t.textContent = m.label + " · " + euros(m.amount);
          li.appendChild(t);
          list.appendChild(li);
        });
        var hist = $("history");
        hist.textContent = "";
        state.revenue.slice().sort(function (a, b) { return a.month < b.month ? 1 : -1; }).slice(0, 6).forEach(function (r) {
          var li = document.createElement("li");
          var a = document.createElement("span");
          a.textContent = monthLabel(r.month);
          var b = document.createElement("span");
          b.textContent = euros(r.amount_eur);
          li.appendChild(a);
          li.appendChild(b);
          hist.appendChild(li);
        });
        $("goal-input").value = goal ? String(goal) : "";
        $("delay-input").value = String(state.profile.delai_mois || 3);
      }

      $("revenue-form").addEventListener("submit", async function (e) {
        e.preventDefault();
        var amount = digits($("revenue-input").value);
        var month = currentMonth();
        var before = bestMonth();
        var res = await supabase.from("revenue_entries").upsert({ user_id: state.user.id, month: month, amount_eur: amount, updated_at: new Date().toISOString() });
        if (res.error) { toast("Pas enregistré. Réessaie."); return; }
        state.revenue = state.revenue.filter(function (r) { return r.month !== month; }).concat([{ month: month, amount_eur: amount }]);
        var today = P.parisDate(Date.now());
        if (state.activity.indexOf(today) === -1) state.activity.push(today);
        renderProgress(true);
        renderHome();
        var crossed = P.crossedMilestones(before, bestMonth(), state.profile.objectif_mensuel || 0);
        if (crossed.length) {
          vibrate([20, 50, 30]);
          confetti();
          toast("Jalon franchi : " + crossed[crossed.length - 1].label, true);
        } else {
          vibrate(10);
          toast("Enregistré. Continue comme ça.");
        }
      });

      $("goal-form").addEventListener("submit", async function (e) {
        e.preventDefault();
        var goal = Math.min(G ? G.MAX : 50000, digits($("goal-input").value));
        var delay = Number($("delay-input").value) || 3;
        if (!goal) { toast("Choisis un montant supérieur à 0."); return; }
        var res = await supabase.from("profiles").update({ objectif_mensuel: goal, delai_mois: delay }).eq("id", state.user.id);
        if (res.error) { toast("Pas enregistré. Réessaie."); return; }
        state.profile.objectif_mensuel = goal;
        state.profile.delai_mois = delay;
        renderProgress(true);
        renderHome();
        vibrate(10);
        toast("Nouveau cap enregistré.");
      });

      // ---- Abonnement ---------------------------------------------------------------
      function renderSubscription() {
        var p = state.profile;
        var current = PLANS.filter(function (pl) { return pl.months === p.subscription_duration_months; })[0];
        var status = p.subscription_status;
        var actions = $("sub-actions");
        actions.textContent = "";
        if (state.paid) {
          $("sub-status").textContent = current ? current.label : "Actif";
          var statusText = status === "active" || status === "trialing" ? "Actif" : status === "past_due" ? "Paiement en attente" : status === "canceled" ? "Résilié" : "Actif";
          $("sub-detail").textContent = statusText + (current ? " · " + current.price + " " + current.cadence : "");
          var manage = document.createElement("button");
          manage.type = "button";
          manage.className = "btn";
          manage.textContent = "Changer de formule";
          manage.addEventListener("click", openPortal);
          var cancel = document.createElement("a");
          cancel.className = "btn btn--ghost";
          cancel.href = "/resilier";
          cancel.textContent = "Résilier";
          actions.appendChild(manage);
          actions.appendChild(cancel);
        } else {
          $("sub-status").textContent = "Pas encore abonné";
          $("sub-detail").textContent = "Choisis ta formule pour tout débloquer.";
          var cta = document.createElement("a");
          cta.className = "btn";
          cta.href = "/?resume=result";
          cta.textContent = "Voir les offres";
          actions.appendChild(cta);
        }
        var plansEl = $("plans");
        plansEl.textContent = "";
        PLANS.forEach(function (pl) {
          var row = document.createElement("div");
          row.className = "plan" + (state.paid && current && current.months === pl.months ? " is-current" : "");
          var a = document.createElement("span");
          a.textContent = pl.label + (state.paid && current && current.months === pl.months ? " · ta formule" : "");
          var b = document.createElement("span");
          b.className = "sub";
          b.textContent = pl.price + " " + pl.cadence;
          row.appendChild(a);
          row.appendChild(b);
          plansEl.appendChild(row);
        });
      }
      async function openPortal() {
        vibrate(10);
        var res = await callFn("create-portal-session");
        if (res && res.url) { window.location.href = res.url; return; }
        toast((res && res.error) || "Impossible d'ouvrir la gestion.");
      }

      // Consentement emails (lifecycle) : non coché par défaut.
      function initOptIn() {
        var box = $("optin");
        box.checked = state.profile.marketing_opt_in === true;
        if (state.profile.email_suppressed_at) {
          box.checked = false;
          box.disabled = true;
          $("optin-status").textContent = "Nos emails ont échoué. Écris-nous via Contact.";
          return;
        }
        box.addEventListener("change", async function () {
          var wanted = box.checked;
          box.disabled = true;
          var res = await supabase.from("profiles").update({ marketing_opt_in: wanted }).eq("id", state.user.id);
          box.disabled = false;
          if (res.error) { box.checked = !wanted; toast("Pas enregistré. Réessaie."); return; }
          toast(wanted ? "C'est noté : les conseils arrivent." : "C'est noté : plus d'emails.");
        });
      }

      // ---- Menu du compte ---------------------------------------------------------
      var avatar = $("db-avatar");
      var dropdown = $("db-dropdown");
      avatar.addEventListener("click", function (e) {
        e.stopPropagation();
        dropdown.hidden = !dropdown.hidden;
        avatar.setAttribute("aria-expanded", dropdown.hidden ? "false" : "true");
      });
      document.addEventListener("click", function (e) {
        if (!dropdown.hidden && !e.target.closest("#db-menu")) { dropdown.hidden = true; avatar.setAttribute("aria-expanded", "false"); }
      });
      document.addEventListener("keydown", function (e) { if (e.key === "Escape") { dropdown.hidden = true; avatar.setAttribute("aria-expanded", "false"); } });
      // Crisp : la bulle masquerait la barre d'onglets en mobile. Elle y est
      // cachée ; « Aide (chat) » l'ouvre, et elle se recache à la fermeture.
      window.$crisp = window.$crisp || [];
      var mobileQuery = window.matchMedia("(max-width: 899px)");
      function syncCrisp() { window.$crisp.push(["do", mobileQuery.matches ? "chat:hide" : "chat:show"]); }
      syncCrisp();
      if (mobileQuery.addEventListener) mobileQuery.addEventListener("change", syncCrisp);
      window.$crisp.push(["on", "chat:closed", function () { if (mobileQuery.matches) window.$crisp.push(["do", "chat:hide"]); }]);
      $("m-help").addEventListener("click", function () {
        dropdown.hidden = true;
        window.$crisp.push(["do", "chat:show"]);
        window.$crisp.push(["do", "chat:open"]);
      });
      $("m-signout").addEventListener("click", async function () { await supabase.auth.signOut(); window.location.href = "/connexion"; });
      $("m-video-on").addEventListener("click", function () { setVideoMode(true); window.location.href = "/"; });
      $("m-video-off").addEventListener("click", function () { setVideoMode(false); this.hidden = true; toast("Mode Vidéo désactivé."); });
      $("m-resend").addEventListener("click", async function () {
        var res = await callFn("resend-access");
        toast(res && !res.error ? "Email renvoyé. Regarde ta boîte." : (res && res.error) || "Échec de l'envoi.");
      });
      $("m-delete").addEventListener("click", async function () {
        if (!window.confirm("Supprimer définitivement ton compte et tes données ?")) return;
        var res = await callFn("delete-account");
        if (res && !res.error) { await supabase.auth.signOut(); window.location.href = "/"; return; }
        toast((res && res.error) || "Suppression impossible.");
      });

      // ---- Chargement --------------------------------------------------------------
      async function loadConcept() {
        var basic = await supabase.from("user_concepts").select("concept_name, tagline").eq("user_id", state.user.id).maybeSingle();
        state.concept = basic.data || null;
        // Fiche complète : serveur uniquement, et seulement si payé.
        if (state.concept && state.paid) {
          var full = await callFn("generate-user-concept", {});
          if (full && full.concept && !full.concept.locked) state.concept = full.concept;
        }
        renderConcept();
      }

      async function boot() {
        supabase = window.ColdTrendSupabase;
        var userRes = await supabase.auth.getUser();
        var user = userRes.data ? userRes.data.user : null;
        if (!user || user.is_anonymous) {
          window.location.replace("/connexion?redirect=" + encodeURIComponent("/compte"));
          return;
        }
        state.user = user;
        var profileRes = await supabase
          .from("profiles")
          .select("prenom, paid_at, subscription_status, subscription_duration_months, stripe_customer_id, is_admin, objectif_mensuel, delai_mois, temps, secteur, match_count, created_at, marketing_opt_in, email_suppressed_at")
          .eq("id", user.id)
          .single();
        var p = profileRes.data || {};
        if (!p.prenom) {
          var meta = user.user_metadata || {};
          var first = meta.given_name || String(meta.full_name || meta.name || "").split(" ")[0];
          if (first) p.prenom = first;
        }
        state.profile = p;
        state.paid = !!p.paid_at || p.subscription_status === "active" || p.subscription_status === "trialing";
        var startMs = Date.parse(p.paid_at || p.created_at || user.created_at) || Date.now();
        state.weekIndex = P.weekIndex(startMs, Date.now());
        state.weekStart = P.weekStart(Date.now());

        var since = new Date(Date.now() - 90 * 86400000).toISOString();
        var results = await Promise.all([
          supabase.from("mission_checks").select("week_start, mission_key, done_at").eq("user_id", user.id).gte("done_at", since),
          supabase.from("revenue_entries").select("month, amount_eur, updated_at").eq("user_id", user.id).order("month", { ascending: false }).limit(24),
          supabase.from("feature_waitlist").select("feature").eq("user_id", user.id)
        ]);
        var checks = results[0].data || [];
        state.done = checks.filter(function (c) { return c.week_start === state.weekStart; }).map(function (c) { return c.mission_key; });
        state.revenue = results[1].data || [];
        state.waitlist = (results[2].data || []).map(function (w) { return w.feature; });
        // Jours actifs réels : mission cochée ou revenu saisi.
        var days = {};
        checks.forEach(function (c) { days[P.parisDate(Date.parse(c.done_at))] = true; });
        state.revenue.forEach(function (r) { if (r.updated_at) days[P.parisDate(Date.parse(r.updated_at))] = true; });
        state.activity = Object.keys(days);

        avatar.textContent = (p.prenom || user.email || "·").charAt(0).toUpperCase();
        if (p.is_admin) {
          $("m-admin").hidden = false;
          $("m-video-on").hidden = false;
          $("m-video-off").hidden = !videoModeArmed();
        }
        $("m-resend").hidden = !p.paid_at;

        renderHome();
        renderSubscription();
        renderWaitlist();
        initOptIn();
        $("db-skeleton").hidden = true;
        $("db-app").hidden = false;
        showTab(window.location.hash.slice(1) || "accueil", false);
        loadConcept();

        // Paiement confirmé pendant que la page est ouverte : on recharge.
        supabase
          .channel("dash-" + user.id)
          .on("postgres_changes", { event: "UPDATE", schema: "public", table: "profiles", filter: "id=eq." + user.id }, function (payload) {
            var paidNow = payload.new && (payload.new.paid_at || payload.new.subscription_status === "active");
            if (paidNow && !state.paid) {
              toast("Accès confirmé. Bienvenue.", true);
              confetti();
              window.setTimeout(function () { window.location.reload(); }, 1600);
            }
          })
          .subscribe();
      }

      if (window.ColdTrendSupabase) boot();
      else document.addEventListener("coldtrend:supabase-ready", boot, { once: true });
    })();
  </script>
</body>
</html>
`;
}
