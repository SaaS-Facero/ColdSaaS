import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, "..", "public");
const OUT_FILE = path.join(OUT_DIR, "index.html");
const OUT_FILE_SUCCESS = path.join(OUT_DIR, "succes.html");

// Toute config sensible/par-environnement se lit depuis process.env — jamais
// en dur. Le second membre de chaque `??` n'est qu'un filet de sécurité pour
// que le build ne plante pas si une variable manque en dev local ; en
// production (Vercel), ces trois variables DOIVENT être définies dans
// Project Settings → Environment Variables, sans quoi le site déployé
// affichera silencieusement ces placeholders au lieu des vraies valeurs.
//
// Stripe Payment Link — variabilisé ici, jamais construit/géré côté client.
const STRIPE_PAYMENT_LINK = process.env.STRIPE_PAYMENT_LINK ?? "https://buy.stripe.com/REPLACE_WITH_REAL_LINK";

// Supabase — insertion du lead à l'écran 6, avant le prix. L'anon key est
// publique par conception (protégée par les policies RLS, pas par le secret)
// mais reste une variable d'environnement pour permettre la rotation et la
// séparation Production/Preview/Development sans toucher au code.
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://REPLACE_WITH_PROJECT.supabase.co";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "REPLACE_WITH_ANON_KEY";

// URL canonique du site déployé — utilisée pour l'Open Graph et pour
// construire l'URL de redirection post-paiement affichée à l'écran de succès
// (la redirection Stripe elle-même se configure côté dashboard Stripe, pas
// ici : ce n'est qu'un rappel visuel cohérent).
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://coldtrend.com";

// Analytics — un seul point d'entrée générique, branché plus tard sur
// PostHog/Plausible. Ne jamais envoyer de PII (email en clair, nom) dans les
// props d'un événement : voir lead_captured qui n'envoie que le domaine.
// TODO: brancher window.posthog.capture / window.plausible ici.

// ---------------------------------------------------------------------------
// Data (content only — never mixed with markup logic below)
// ---------------------------------------------------------------------------

const brand = {
  name: "ColdTrend",
  // Tagline anti-ambiguïté validée avant le rebrand global (cf. audit) :
  // désamorce la lecture "distant/hostile" de "Cold" en définissant le mot
  // au lieu de le défendre. Affichée juste sous le wordmark, partout où le
  // nom apparaît seul pour la première fois au lecteur.
  tagline: "Ici, « cold » veut dire vérifié, pas distant.",
  colors: {
    cobalt: "#0047FF",
    cobaltSoft: "#3D6BFF",
    cobaltDark: "#0033B8",
    steel: "#8A8F98",
    verifiedGreen: "#00C48C",
    verifiedGreenSoft: "#00E39F",
    graphite: "#3A414E",
    graphiteSoft: "#545D6E",
    ink: "#0A0E1A",
    inkDeep: "#050710",
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
    "ColdTrend indexe des SaaS à vendre ou à copier sur la base de revenus vérifiés — pas d'idées générées par IA, pas de promesses en l'air.",
  ctaPrimary: "Voir les SaaS vérifiés",
  ctaSecondary: "Comment on vérifie"
};

const socialProof = {
  label: "Données croisées et vérifiées via",
  sources: ["Stripe", "TrustMRR", "Stripe Connect", "TrustMRR Verified", "Stripe", "TrustMRR"]
};

// Notification stack — MRR climbs gently across the pool (1 850€ -> 21 400€),
// never a 200€-to-90 000€ jump. Kept in one place so the vanilla-JS engine
// below can stay pure logic/DOM, no content mixed in.
const notificationStack = {
  templates: [
    { source: "stripe", saasName: "Loopnotes", mrr: 1_850, kind: "sale" },
    { source: "trustmrr", saasName: "Loopnotes", mrr: 1_850, kind: "verify" },
    { source: "stripe", saasName: "Fleetbase", mrr: 3_200, kind: "sale" },
    { source: "coldtrend", saasName: "Fleetbase", mrr: 3_200, kind: "listed" },
    { source: "stripe", saasName: "Numio", mrr: 6_100, kind: "sale" },
    { source: "trustmrr", saasName: "Numio", mrr: 6_100, kind: "verify" },
    { source: "stripe", saasName: "Ledgerly", mrr: 11_200, kind: "sale" },
    { source: "coldtrend", saasName: "Ledgerly", mrr: 11_200, kind: "listed" },
    { source: "stripe", saasName: "Craftpanel", mrr: 21_400, kind: "sale" },
    { source: "trustmrr", saasName: "Craftpanel", mrr: 21_400, kind: "verify" }
  ]
};

const pricing = {
  dailyPrice: "0,50 €",
  totalPrice: "14,90 €",
  totalNote: "paiement unique, accès à vie"
};

const comparison = {
  eyebrow: "Comparatif",
  title: "ColdTrend vs génération d'idées par IA",
  columns: { criterion: "Critère", ai: "Génération IA", rich: "ColdTrend" },
  rows: [
    { criterion: "Source de données", ai: "Suggestion générée, aucune preuve derrière", rich: "Stripe croisé avec TrustMRR" },
    { criterion: "Vérifiabilité", ai: "Invérifiable — c'est un texte plausible", rich: "Chaque fiche a un MRR audité" },
    { criterion: "Fraîcheur", ai: "Statique, ne change jamais", rich: "Base revérifiée en continu" },
    { criterion: "Prix", ai: "Souvent gratuit — et ça s'en ressent", rich: "14,90 €, accès à vie" }
  ]
};

const faq = {
  eyebrow: "Questions fréquentes",
  title: "Ce qu'on nous demande le plus",
  items: [
    {
      q: "À quelle fréquence les données sont mises à jour ?",
      a: "Le croisement Stripe / TrustMRR tourne en continu, et chaque fiche SaaS est revérifiée chaque semaine."
    },
    {
      q: "Un remboursement est possible ?",
      a: "Oui, sous 14 jours si l'accès ne correspond pas à ce qui est décrit ici. Un message suffit, aucun justificatif à fournir."
    },
    {
      q: "Sous quel format je reçois l'accès ?",
      a: "Un email automatique avec un lien vers un Google Sheet en lecture seule, envoyé juste après le paiement."
    },
    {
      q: "En quoi c'est différent d'un site qui génère des idées avec l'IA ?",
      a: "On ne génère rien : chaque ligne du sheet correspond à un SaaS réel, avec un revenu vérifié — pas une suggestion plausible."
    },
    {
      q: "Et si je ne trouve rien qui me convient ?",
      a: "Tu es remboursé. La base couvre déjà des dizaines de secteurs et continue de s'étoffer, donc ça vaut aussi le coup d'y revenir plus tard."
    }
  ]
};

// =============================================================================
// PHASE 0 — Plan du funnel-quiz (écrit avant le code, cf. brief)
// =============================================================================
//
// 1) CARTE DU FUNNEL (écran → émotion visée → donnée exploitée → raison donnée)
// -----------------------------------------------------------------------------
// 1. Intention (racheter/copier)
//    Émotion   : se projeter tout de suite dans un des deux chemins existants.
//    Donnée    : answers.intention -> conditionne l'écran 2 (skip) et le
//                filtrage réel des SaaS proposés (racheter = fiches avec MRR
//                et repreneur, copier = fiches "concept" sans transaction).
//    Raison    : aucune — c'est la première question, elle n'a pas besoin
//                d'être justifiée, mais les deux cartes expliquent déjà ce que
//                l'utilisateur "récupère" pour ne pas répondre à l'aveugle.
// 2. Budget (skip si "copier")
//    Émotion   : être pris au sérieux financièrement, pas juste vendu du rêve.
//    Donnée    : answers.budget -> filtre le prix des fiches montrées.
//    Raison    : donnée explicitement ("Pour ne te montrer que ce que tu peux
//                vraiment acheter") pour que la question ne semble pas
//                indiscrète ou hors sujet.
// 3. Temps disponible
//    Émotion   : rassurer un profil "à côté d'un job" plutôt que l'exclure.
//    Donnée    : answers.temps -> filtre par charge de maintenance du SaaS.
//    Raison    : sous-texte explicite qui désamorce le syndrome de l'imposteur
//                ("pas besoin de tout plaquer").
// 4. Secteur (B2B / B2C / les deux)
//    Émotion   : se sentir compris sur le type de client visé, sans jargon.
//    Donnée    : answers.secteur -> filtre le type de clientèle du SaaS.
//    Raison    : définition inline systématique (B2B/B2C) + phrase qui évite
//                de perdre les indécis ("les deux, peu importe").
// 5. Reconnaissance (frustration passée)
//    Émotion   : validation ("on te comprend") ou accueil neutre pour un
//                nouvel arrivant — d'où les DEUX messages de suite différents.
//    Donnée    : answers.dejaCherche -> n'influence pas le filtrage produit,
//                sert uniquement à personnaliser le ton du message suivant et
//                à qualifier le lead (utilisateur déjà "chaud" ou froid).
//    Raison    : question assumée comme un moment de connexion, pas de filtre.
// 6. Capture (prénom + email + consentement RGPD)
//    Émotion   : dernière étape avant la récompense — doit rassurer sur ce qui
//                va être fait de l'email (pas de newsletter forcée).
//    Donnée    : lead complet inséré dans Supabase avant même d'afficher le
//                prix, pour ne perdre aucun lead même si l'utilisateur
//                abandonne ensuite sur l'écran de paiement.
//    Raison    : sous-texte qui dit explicitement à quoi sert l'email.
// 7. Résultat (compteur + CTA)
//    Émotion   : la récompense — un chiffre concret et personnalisé.
//    Donnée    : matchCount = fonction déterministe des réponses (jamais
//                Math.random() par rendu) ; TOTAL_SAAS = constante de config.
//    Raison    : le résumé "{secteur} · budget {budget} · {temps}" prouve que
//                le chiffre vient bien des réponses données, pas d'un chiffre
//                sorti du chapeau.
//
// 2) AUTO-CRITIQUE — réflexes de "quiz marketing creux" et leur correction
// -----------------------------------------------------------------------------
// - Réflexe : options vagues ("Peu importe", "Je ne sais pas") qui ne servent
//   à rien pour le filtrage. Correction : chaque option a un usage réel en
//   aval (filtre budget/secteur/temps) ; la seule option "floue" autorisée
//   (budget "je regarde") est un état légitime, pas un remplissage.
// - Réflexe : faux compteurs qui remontent au hasard à chaque affichage.
//   Correction : TOTAL_SAAS vient de `quiz.totalSaas` (config), et le nombre
//   de correspondances est un hash déterministe des réponses (`seededMatchCount`),
//   pas un `Math.random()` — deux personnes avec les mêmes réponses obtiennent
//   toujours le même chiffre. Marqué TODO tant que le vrai matching sur la
//   base de données n'est pas branché.
// - Réflexe : urgence fabriquée ("plus que 3 places", compte à rebours bidon).
//   Correction : aucun compte à rebours, aucune mention de stock limité —
//   le seul levier utilisé est la personnalisation du résultat.
// - Réflexe : bouton "Continuer" sans contexte ni raison donnée à l'écran 2.
//   Correction : chaque écran a un titre qui dit pourquoi la question est
//   posée (cf. carte du funnel ci-dessus), et l'écran 5 change de discours
//   selon la réponse au lieu de recycler le même texte.
// - Réflexe : grand vide décoratif entre la question et le bouton d'action.
//   Correction : `.quiz-screen` n'est plus centré verticalement — le titre est
//   ancré en haut, les options suivent leur hauteur naturelle, et le bouton
//   est poussé en bas via `margin-top: auto` ; l'espace intermédiaire est
//   rempli par du texte utile (sous-texte, définitions, message de suite) et
//   non par du vide.
//
// 3) INSTRUMENTATION ANALYTICS (voir trackEvent() dans le script client)
// -----------------------------------------------------------------------------
// - funnel_step_view      { step_number, step_name }      → à l'entrée de
//   chaque écran (transitionTo), y compris quand un écran est sauté.
// - funnel_step_complete  { step_number, answer }         → au clic sur
//   Continuer/submit, juste avant de passer à l'écran suivant.
// - funnel_abandoned      { last_step }                   → à la fermeture du
//   quiz (croix ou Escape) ou à la fermeture de l'onglet, tant que l'écran 7
//   n'a pas été atteint.
// - lead_captured         { email_domain }                → à la soumission de
//   l'écran 6, jamais l'email en clair.
// - result_cta_clicked    {}                               → au clic sur
//   "Débloquer les Y résultats" (écran 7 → paiement).
//
const quiz = {
  totalSaas: 340, // TODO: remplacer par le vrai décompte (vue Supabase `leads`/`saas` en prod).
  sectorLabels: {
    b2b: "B2B",
    b2c: "B2C",
    both: "B2B et B2C"
  },
  budgetLabels: {
    low: "moins de 5 000 €",
    mid: "5 000 € – 20 000 €",
    high: "20 000 € – 50 000 €",
    undecided: "pas encore fixé"
  },
  timeLabels: {
    low: "moins de 5h/sem.",
    midlow: "5–10h/sem.",
    midhigh: "10–20h/sem.",
    full: "temps plein"
  },
  // Écrans de type "question" — navigués par index, avec skip conditionnel.
  // Le dernier ("capture") est rendu différemment (formulaire, pas d'options)
  // mais suit la même mécanique d'avancement dans le moteur JS ci-dessous.
  questions: [
    {
      id: "intention",
      stepName: "intention",
      title: "Tu veux racheter un SaaS qui tourne déjà, ou t'inspirer d'un concept pour repartir de zéro ?",
      type: "single",
      options: [
        {
          value: "racheter",
          label: "Racheter",
          hint: "Tu reprends les clients, le revenu, l'historique. Tu démarres avec du chiffre d'affaires."
        },
        {
          value: "copier",
          label: "Copier / m'inspirer",
          hint: "Tu gardes l'idée validée, tu codes ta propre version."
        }
      ]
    },
    {
      id: "budget",
      stepName: "budget",
      title: "Pour ne te montrer que ce que tu peux vraiment acheter.",
      type: "single",
      skipIf: { field: "intention", equals: "copier" },
      options: [
        { value: "low", label: "Moins de 5 000 €" },
        { value: "mid", label: "5 000 – 20 000 €" },
        { value: "high", label: "20 000 – 50 000 €" },
        { value: "undecided", label: "Je regarde, pas encore de budget fixé" }
      ]
    },
    {
      id: "temps",
      stepName: "temps",
      title: "Combien d'heures par semaine tu peux vraiment y consacrer ?",
      subtext: "Pas besoin de tout plaquer. La plupart de nos utilisateurs démarrent à côté d'un job.",
      type: "single",
      options: [
        { value: "low", label: "Moins de 5h" },
        { value: "midlow", label: "5–10h" },
        { value: "midhigh", label: "10–20h" },
        { value: "full", label: "Temps plein" }
      ]
    },
    {
      id: "secteur",
      stepName: "secteur",
      title: "Tu vises plutôt les entreprises ou les particuliers ?",
      subtext: "Certains SaaS vérifiés touchent les deux, on te les montre dans tous les cas.",
      type: "multi",
      optionStyle: "card",
      options: [
        { value: "b2b", label: "B2B", hint: "tu vends à des entreprises" },
        { value: "b2c", label: "B2C", hint: "tu vends à des particuliers" },
        { value: "both", label: "Les deux", hint: "peu importe le client tant que ça marche" }
      ]
    },
    {
      id: "dejaCherche",
      stepName: "frustration",
      title: "Tu as déjà passé des heures sur des listes d'idées génériques, sans rien trouver de crédible ?",
      type: "single",
      options: [
        {
          value: "yes",
          label: "Oui, exactement ça",
          followup: "On sait. C'est littéralement pour ça que ColdTrend existe : plus une seule fiche sans preuve derrière."
        },
        {
          value: "no",
          label: "Pas encore, c'est ma première recherche",
          followup: "Alors autant commencer avec des chiffres vérifiés plutôt que des idées générées — tu gagnes le détour."
        }
      ]
    },
    {
      id: "capture",
      stepName: "capture",
      type: "capture",
      title: "Dernière étape avant ta sélection.",
      subtext: "On t'envoie ton résultat par email, avec le détail des SaaS qui correspondent à ton profil. Rien d'autre, pas de newsletter forcée."
    }
  ]
};

// ---------------------------------------------------------------------------
// Template
// ---------------------------------------------------------------------------

function renderRotatorNoScript(phrases) {
  // First phrase rendered server-side so the hero is meaningful with JS disabled.
  return phrases[0];
}

function page({ brand, hero, socialProof, notificationStack, pricing, comparison, faq, quiz }) {
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
    --cobalt-soft: ${colors.cobaltSoft};
    --cobalt-dark: ${colors.cobaltDark};
    --steel: ${colors.steel};
    --verified-green: ${colors.verifiedGreen};
    --verified-green-soft: ${colors.verifiedGreenSoft};
    --graphite: ${colors.graphite};
    --graphite-soft: ${colors.graphiteSoft};
    --ink: ${colors.ink};
    --ink-deep: ${colors.inkDeep};
    --ink-soft: ${colors.inkSoft};
    --paper: ${colors.paper};
    --paper-soft: ${colors.paperSoft};
    --border: ${colors.border};
    color-scheme: dark;
  }

  * { box-sizing: border-box; }

  html, body {
    margin: 0;
    padding: 0;
    background: var(--ink);
    color: var(--paper-soft);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Inter, Arial, sans-serif;
  }

  body {
    background: var(--ink);
    color: var(--paper-soft);
  }

  .wrap {
    max-width: 1120px;
    margin: 0 auto;
    padding-inline: 20px;
  }

  /* ---------------- Hero ---------------- */

  .hero {
    padding-block: 56px 40px;
  }

  .hero__grid {
    display: grid;
    grid-template-columns: 1fr;
    align-items: center;
    gap: 40px;
  }

  @media (min-width: 960px) {
    .hero__grid {
      grid-template-columns: 1.1fr 0.9fr;
      gap: 32px;
    }
  }

  .hero__copy {
    text-align: center;
  }

  @media (min-width: 960px) {
    .hero__copy { text-align: left; }
  }

  .brand-bar {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    margin-bottom: 18px;
  }

  @media (min-width: 960px) {
    .brand-bar { align-items: flex-start; }
  }

  .brand-bar__name {
    font-size: 14px;
    font-weight: 800;
    letter-spacing: 0.01em;
    color: var(--paper-soft);
  }

  .brand-bar__tagline {
    font-size: 12px;
    color: var(--steel);
    font-style: italic;
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
    background: rgba(0, 71, 255, 0.16);
    border: 1px solid rgba(0, 71, 255, 0.32);
    border-radius: 999px;
    padding: 6px 14px;
    margin-bottom: 20px;
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

  @media (min-width: 960px) {
    .hero__subhead { margin-inline: 0 0 32px; }
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

  @media (min-width: 960px) {
    .hero__actions { justify-content: flex-start; }
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
    color: var(--paper-soft);
    border-color: #2A3140;
  }

  .btn--secondary:hover,
  .btn--secondary:focus-visible {
    border-color: var(--cobalt);
    color: var(--cobalt);
  }

  /* ---------------- Hero visual: notification stack phone mockup ---------------- */

  .hero__visual {
    display: flex;
    justify-content: center;
  }

  .ns-root {
    width: 300px;
    max-width: 100%;
  }

  @media (min-width: 960px) {
    .ns-root { width: 340px; }
  }

  .ns-phone {
    position: relative;
    width: 100%;
    aspect-ratio: 320 / 640;
    border-radius: 44px;
    padding: 14px 14px 0;
    background:
      radial-gradient(120% 90% at 18% 0%, rgba(0, 71, 255, 0.16), transparent 55%),
      linear-gradient(180deg, var(--ink) 0%, var(--ink-deep) 100%);
    border: 1px solid rgba(255, 255, 255, 0.08);
    box-shadow:
      0 30px 60px -20px rgba(0, 0, 0, 0.55),
      0 10px 20px -8px rgba(0, 0, 0, 0.5),
      inset 0 0 0 1px rgba(255, 255, 255, 0.03);
    overflow: hidden;
  }

  .ns-phone__reflection {
    position: absolute;
    inset: 0;
    z-index: 1;
    background: linear-gradient(115deg, rgba(255, 255, 255, 0.08) 0%, transparent 22%, transparent 78%, rgba(255, 255, 255, 0.04) 100%);
    pointer-events: none;
  }

  .ns-phone__grain {
    position: absolute;
    inset: 0;
    z-index: 1;
    opacity: 0.05;
    mix-blend-mode: overlay;
    pointer-events: none;
    background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%25' height='100%25' filter='url(%23n)'/></svg>");
    background-size: 120px 120px;
  }

  .ns-status-bar {
    position: relative;
    z-index: 2;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 6px 10px 0;
    color: var(--paper-soft);
    font-variant-numeric: tabular-nums;
  }

  .ns-status-bar__time {
    font-size: 13px;
    font-weight: 600;
    letter-spacing: 0.02em;
    min-width: 40px;
  }

  .ns-dynamic-island {
    position: absolute;
    top: 7px;
    left: 50%;
    transform: translateX(-50%);
    width: 126px;
    height: 37px;
    background: #000;
    border-radius: 18px;
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.05);
  }

  .ns-status-bar__icons {
    display: flex;
    align-items: center;
    gap: 4px;
    color: var(--paper-soft);
  }

  .ns-stack {
    position: relative;
    z-index: 2;
    margin-top: 58px;
    height: 338px;
  }

  .ns-card {
    position: absolute;
    top: 0;
    left: 8px;
    right: 8px;
    min-height: 104px;
    display: grid;
    grid-template-columns: 36px minmax(0, 1fr);
    align-items: start;
    column-gap: 10px;
    padding: 12px 14px;
    border-radius: 20px;
    background: rgba(30, 35, 46, 0.88);
    backdrop-filter: blur(20px) saturate(180%);
    -webkit-backdrop-filter: blur(20px) saturate(180%);
    border: 1px solid rgba(255, 255, 255, 0.08);
    box-shadow:
      0 16px 32px -12px rgba(0, 0, 0, 0.45),
      0 2px 6px -1px rgba(0, 0, 0, 0.35);
    transform-origin: top center;
    will-change: transform, opacity, filter;
    transition:
      transform 0.42s cubic-bezier(0.22, 1, 0.36, 1),
      opacity 0.42s cubic-bezier(0.22, 1, 0.36, 1),
      filter 0.42s cubic-bezier(0.22, 1, 0.36, 1);
  }

  .ns-card--enter {
    transition:
      transform 0.42s cubic-bezier(0.34, 1.56, 0.64, 1),
      opacity 0.32s ease-out,
      filter 0.32s ease-out;
  }

  .ns-card--exit {
    transition:
      transform 0.42s cubic-bezier(0.4, 0, 1, 1),
      opacity 0.42s cubic-bezier(0.4, 0, 1, 1);
  }

  @media (prefers-reduced-motion: reduce) {
    .ns-card,
    .ns-card--enter,
    .ns-card--exit {
      transition: opacity 0.28s ease-out;
    }
  }

  .ns-card__icon {
    width: 36px;
    height: 36px;
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .ns-card__icon svg {
    width: 17px;
    height: 17px;
  }

  .ns-card__body {
    min-width: 0;
    max-width: 100%;
  }

  .ns-card__row {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px;
  }

  .ns-card__title {
    font-size: 14px;
    font-weight: 600;
    color: var(--paper-soft);
    letter-spacing: -0.01em;
  }

  .ns-card__time {
    flex-shrink: 0;
    font-size: 12px;
    color: var(--steel);
    font-variant-numeric: tabular-nums;
  }

  .ns-card__text {
    margin: 2px 0 4px;
    width: 100%;
    max-width: 100%;
    font-size: 13px;
    line-height: 1.35;
    color: rgba(245, 246, 248, 0.86);
    overflow: hidden;
    text-overflow: ellipsis;
    word-break: break-word;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
  }

  .ns-card__amount {
    display: block;
    max-width: 100%;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    font-size: clamp(11px, 3.6vw, 13px);
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    letter-spacing: -0.01em;
  }

  @media (max-width: 340px) {
    .ns-stack { margin-top: 52px; }
  }

  /* ---------------- Social proof strip ---------------- */

  .proof {
    padding-block: 28px 48px;
    border-top: 1px solid #232936;
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
    color: var(--cobalt);
  }

  .proof__item strong {
    color: var(--paper-soft);
    font-weight: 800;
  }

  /* ---------------- Shared section chrome (comparison / FAQ / transition) ---------------- */

  .section-eyebrow {
    font-size: 12px;
    font-weight: 600;
    color: var(--cobalt);
    margin: 0 0 10px;
  }

  .section-title {
    font-size: clamp(24px, 5vw, 36px);
    font-weight: 800;
    letter-spacing: -0.01em;
    margin: 0 0 32px;
  }

  /* ---------------- Comparison ---------------- */

  .compare {
    padding-block: 48px;
    border-top: 1px solid #232936;
  }

  .compare__header {
    display: none;
    padding: 0 16px 10px;
    font-size: 12px;
    font-weight: 600;
    color: var(--steel);
  }

  .compare__body {
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 16px;
    overflow: hidden;
  }

  .compare__row {
    display: grid;
    grid-template-columns: 1fr;
    gap: 6px;
    padding: 16px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  }

  .compare__row:last-child {
    border-bottom: none;
  }

  .compare__criterion {
    font-size: 13px;
    font-weight: 700;
    color: var(--paper-soft);
  }

  .compare__cell {
    font-size: 14px;
    line-height: 1.4;
    color: var(--steel);
  }

  .compare__label {
    display: inline-block;
    min-width: 92px;
    font-size: 12px;
    color: var(--steel);
    opacity: 0.7;
  }

  .compare__cell--rich {
    color: var(--paper-soft);
    font-weight: 600;
  }

  @media (min-width: 640px) {
    .compare__header,
    .compare__row {
      grid-template-columns: 1fr 1.3fr 1.3fr;
      align-items: center;
      gap: 20px;
    }

    .compare__header {
      display: grid;
    }

    .compare__header-col--rich {
      color: var(--cobalt);
    }

    .compare__row {
      padding: 18px 20px;
    }

    .compare__row:first-child {
      border-top: 2px solid transparent;
    }

    .compare__label {
      display: none;
    }
  }

  /* ---------------- FAQ ---------------- */

  .faq {
    padding-block: 48px;
    border-top: 1px solid #232936;
  }

  .faq__list {
    max-width: 720px;
  }

  .faq__item {
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  }

  .faq__question {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 18px 4px;
    background: none;
    border: none;
    color: var(--paper-soft);
    font-size: 15px;
    font-weight: 600;
    text-align: left;
    cursor: pointer;
    font-family: inherit;
  }

  .faq__chevron {
    flex-shrink: 0;
    color: var(--steel);
    transition: transform 260ms cubic-bezier(0.22, 1.26, 0.36, 1);
  }

  .faq__item.is-open .faq__chevron {
    transform: rotate(180deg);
  }

  .faq__answer-wrap {
    display: grid;
    grid-template-rows: 0fr;
    transition: grid-template-rows 260ms cubic-bezier(0.22, 1.26, 0.36, 1);
  }

  .faq__item.is-open .faq__answer-wrap {
    grid-template-rows: 1fr;
  }

  .faq__answer-inner {
    overflow: hidden;
  }

  .faq__answer {
    margin: 0 0 18px;
    padding-right: 28px;
    font-size: 14px;
    line-height: 1.55;
    color: var(--steel);
  }

  /* ---------------- Transition CTA ---------------- */

  .transition-cta {
    padding-block: 56px 72px;
    text-align: center;
    border-top: 1px solid #232936;
  }

  .transition-cta__title {
    font-size: clamp(22px, 5vw, 30px);
    font-weight: 800;
    margin: 0 0 12px;
  }

  .transition-cta__lead {
    max-width: 480px;
    margin: 0 auto 24px;
    color: var(--steel);
    font-size: 15px;
    line-height: 1.55;
  }

  /* ---------------- Quiz overlay ---------------- */

  .quiz-overlay {
    position: fixed;
    inset: 0;
    z-index: 50;
    background: var(--ink);
    display: none;
    flex-direction: column;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Inter, Arial, sans-serif;
  }

  .quiz-overlay.is-open {
    display: flex;
  }

  .quiz-header {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 18px 20px 0;
  }

  .quiz-back {
    display: flex;
    align-items: center;
    gap: 6px;
    background: none;
    border: none;
    color: var(--steel);
    font-size: 14px;
    font-family: inherit;
    cursor: pointer;
    padding: 6px 4px;
    visibility: hidden;
  }

  .quiz-back.is-visible {
    visibility: visible;
  }

  .quiz-close {
    margin-left: auto;
    background: none;
    border: none;
    color: var(--steel);
    cursor: pointer;
    padding: 6px;
    display: flex;
  }

  .quiz-progress {
    display: flex;
    gap: 6px;
    padding: 16px 20px 0;
  }

  .quiz-progress__seg {
    flex: 1;
    height: 4px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.1);
    overflow: hidden;
  }

  .quiz-progress__seg-fill {
    display: block;
    height: 100%;
    width: 0%;
    background: var(--cobalt);
    transition: width 300ms cubic-bezier(0.22, 1, 0.36, 1);
  }

  .quiz-stage {
    position: relative;
    flex: 1;
    overflow: hidden;
    padding: 0 20px;
  }

  .quiz-screen {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    justify-content: flex-start;
    overflow-y: auto;
    padding: 32px 4px 24px;
    max-width: 520px;
    margin: 0 auto;
    width: 100%;
    left: 0;
    right: 0;
    opacity: 0;
    transform: translateX(24px);
    transition: transform 420ms cubic-bezier(0.22, 1.26, 0.36, 1), opacity 420ms cubic-bezier(0.22, 1.26, 0.36, 1);
    pointer-events: none;
  }

  .quiz-screen.is-active {
    opacity: 1;
    transform: translateX(0);
    pointer-events: auto;
  }

  @media (prefers-reduced-motion: reduce) {
    .quiz-screen {
      transition: opacity 220ms ease-out;
      transform: none !important;
    }
  }

  .quiz-question-title {
    font-size: clamp(20px, 5vw, 28px);
    font-weight: 700;
    line-height: 1.25;
    margin: 0 0 12px;
  }

  .quiz-subtext {
    font-size: 14px;
    color: var(--steel);
    font-style: italic;
    line-height: 1.5;
    margin: 0 0 20px;
  }

  .quiz-options {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .quiz-option {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 15px 16px;
    border-radius: 14px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    background: rgba(255, 255, 255, 0.03);
    color: var(--paper-soft);
    font-size: 15px;
    text-align: left;
    cursor: pointer;
    font-family: inherit;
    transition: border-color 180ms ease, background 180ms ease, transform 180ms cubic-bezier(0.22, 1.26, 0.36, 1);
  }

  .quiz-option__body {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .quiz-option__label {
    font-weight: 600;
  }

  .quiz-option__hint {
    font-size: 13px;
    color: var(--steel);
    line-height: 1.4;
    font-weight: 400;
  }

  .quiz-option__check {
    margin-left: auto;
    flex-shrink: 0;
    width: 20px;
    height: 20px;
    border-radius: 6px;
    border: 1.5px solid rgba(255, 255, 255, 0.2);
    display: flex;
    align-items: center;
    justify-content: center;
    color: transparent;
    transition: border-color 180ms ease, background 180ms ease, color 180ms ease;
  }

  .quiz-option.is-selected .quiz-option__check {
    border-color: var(--cobalt);
    background: var(--cobalt);
    color: #fff;
  }

  .quiz-options[data-type="single"] .quiz-option__check {
    display: none;
  }

  .quiz-option.is-selected {
    border-color: var(--cobalt);
    background: rgba(0, 71, 255, 0.14);
  }

  .quiz-followup {
    margin: 16px 0 0;
    padding: 14px 16px;
    border-radius: 14px;
    background: rgba(0, 196, 140, 0.08);
    border: 1px solid rgba(0, 196, 140, 0.25);
    color: var(--paper-soft);
    font-size: 14px;
    line-height: 1.5;
    opacity: 0;
    transform: translateY(6px);
    transition: opacity 320ms cubic-bezier(0.22, 1.26, 0.36, 1), transform 320ms cubic-bezier(0.22, 1.26, 0.36, 1);
    pointer-events: none;
  }

  .quiz-followup.is-visible {
    opacity: 1;
    transform: translateY(0);
  }

  @media (prefers-reduced-motion: reduce) {
    .quiz-followup {
      transition: opacity 220ms ease-out;
      transform: none;
    }
  }

  .quiz-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
  }

  .quiz-chip {
    display: inline-flex;
    align-items: center;
    padding: 10px 18px;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    background: rgba(255, 255, 255, 0.03);
    color: var(--paper-soft);
    font-size: 14px;
    cursor: pointer;
    font-family: inherit;
    transition: border-color 180ms ease, background 180ms ease, transform 180ms cubic-bezier(0.22, 1.26, 0.36, 1);
  }

  .quiz-chip.is-selected {
    border-color: var(--cobalt);
    background: var(--cobalt);
    color: #fff;
    font-weight: 600;
  }

  .quiz-chip:active,
  .quiz-option:active {
    transform: scale(0.97);
  }

  .quiz-footer {
    padding-top: 24px;
    margin-top: auto;
  }

  .quiz-next {
    width: 100%;
  }

  .quiz-next[disabled] {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .quiz-option:focus-visible,
  .quiz-chip:focus-visible,
  .quiz-next:focus-visible,
  .quiz-back:focus-visible,
  .quiz-close:focus-visible,
  .quiz-input:focus-visible,
  .quiz-checkbox-row:focus-within,
  .quiz-privacy-toggle:focus-visible {
    outline: 2px solid var(--cobalt-soft);
    outline-offset: 2px;
  }

  .quiz-field {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-bottom: 14px;
  }

  .quiz-label {
    font-size: 13px;
    color: var(--steel);
  }

  .quiz-input {
    width: 100%;
    padding: 14px 16px;
    border-radius: 12px;
    border: 1px solid rgba(255, 255, 255, 0.14);
    background: rgba(255, 255, 255, 0.04);
    color: var(--paper-soft);
    font-size: 15px;
    font-family: inherit;
    transition: border-color 180ms ease;
  }

  .quiz-input:focus {
    outline: none;
    border-color: var(--cobalt);
  }

  .quiz-input.is-invalid {
    border-color: #ff5470;
  }

  .quiz-field__error {
    font-size: 12px;
    color: #ff5470;
    min-height: 14px;
  }

  .quiz-checkbox-row {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    margin: 10px 0 4px;
    border-radius: 10px;
  }

  .quiz-checkbox {
    margin-top: 2px;
    width: 18px;
    height: 18px;
    flex-shrink: 0;
    accent-color: var(--cobalt);
  }

  .quiz-checkbox-row label {
    font-size: 13px;
    color: var(--paper-soft);
    line-height: 1.5;
  }

  .quiz-privacy-toggle {
    background: none;
    border: none;
    padding: 0;
    color: var(--cobalt-soft);
    text-decoration: underline;
    font-size: 13px;
    font-family: inherit;
    cursor: pointer;
  }

  .quiz-privacy-detail {
    display: none;
    margin-top: 10px;
    padding: 12px 14px;
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.08);
    font-size: 12px;
    line-height: 1.6;
    color: var(--steel);
  }

  .quiz-privacy-detail.is-open {
    display: block;
  }

  .quiz-result-meta {
    font-size: 13px;
    color: var(--steel);
    margin: 2px 0 28px;
  }

  .quiz-screen.quiz-result {
    justify-content: center;
    text-align: center;
  }

  .quiz-result__count {
    font-size: clamp(40px, 10vw, 56px);
    font-weight: 800;
    color: var(--cobalt);
    font-variant-numeric: tabular-nums;
  }

  .quiz-result__count-label {
    font-size: 13px;
    color: var(--steel);
    margin: 4px 0 28px;
  }

  .quiz-result__match {
    font-size: clamp(28px, 7vw, 40px);
    font-weight: 800;
    color: var(--verified-green);
    font-variant-numeric: tabular-nums;
    min-height: 1.2em;
  }

  .quiz-result__match-label {
    font-size: 14px;
    color: var(--paper-soft);
    margin: 4px 0 32px;
  }

  .quiz-payment__teaser {
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 14px;
    padding: 14px 16px;
    font-size: 14px;
    line-height: 1.5;
    color: var(--paper-soft);
    margin-bottom: 24px;
  }

  .price-block {
    text-align: center;
    margin-bottom: 24px;
  }

  .price-block__daily {
    font-size: clamp(36px, 9vw, 52px);
    font-weight: 800;
    color: var(--paper-soft);
    line-height: 1.1;
  }

  .price-block__daily strong {
    color: var(--cobalt);
  }

  .price-block__total {
    font-size: 14px;
    color: var(--steel);
    margin-top: 6px;
  }

  .included-list {
    list-style: none;
    margin: 0 0 24px;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .included-list li {
    display: flex;
    gap: 10px;
    align-items: flex-start;
    font-size: 14px;
    color: var(--paper-soft);
  }

  .included-list svg {
    flex-shrink: 0;
    margin-top: 2px;
    color: var(--verified-green);
  }

  .stripe-reassurance {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    font-size: 13px;
    color: var(--steel);
    margin-bottom: 20px;
  }

  .btn--cta-final {
    width: 100%;
    font-size: 17px;
    padding: 17px;
    transition: transform 420ms cubic-bezier(0.22, 1.26, 0.36, 1), box-shadow 0.28s ease, background 0.18s ease;
  }

  .btn--cta-final:hover,
  .btn--cta-final:active {
    transform: scale(1.02);
  }

  @media (max-width: 380px) {
    .quiz-header,
    .quiz-progress,
    .quiz-stage,
    .quiz-footer {
      padding-left: 16px;
      padding-right: 16px;
    }
  }
</style>
</head>
<body>
  <main class="wrap">
    <section class="hero">
      <div class="hero__grid">
        <div class="hero__copy">
          <div class="brand-bar">
            <span class="brand-bar__name">${brand.name}</span>
            <span class="brand-bar__tagline">${brand.tagline}</span>
          </div>
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
        </div>

        <div class="hero__visual" aria-hidden="true">
          <div class="ns-root">
            <div class="ns-phone">
              <div class="ns-phone__reflection"></div>
              <div class="ns-phone__grain"></div>
              <div class="ns-status-bar">
                <span class="ns-status-bar__time" id="ns-time">--:--</span>
                <div class="ns-dynamic-island"></div>
                <div class="ns-status-bar__icons">
                  ${ICON_SIGNAL}
                  ${ICON_WIFI}
                  ${ICON_BATTERY}
                </div>
              </div>
              <div class="ns-stack" id="ns-stack"></div>
            </div>
          </div>
        </div>
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

    <section class="compare" aria-labelledby="compare-title">
      <p class="section-eyebrow">${comparison.eyebrow}</p>
      <h2 class="section-title" id="compare-title">${comparison.title}</h2>
      <div class="compare__header">
        <span>${comparison.columns.criterion}</span>
        <span>${comparison.columns.ai}</span>
        <span class="compare__header-col--rich">${comparison.columns.rich}</span>
      </div>
      <div class="compare__body">
        ${renderComparisonRows(comparison)}
      </div>
    </section>

    <section class="faq" aria-labelledby="faq-title">
      <p class="section-eyebrow">${faq.eyebrow}</p>
      <h2 class="section-title" id="faq-title">${faq.title}</h2>
      <div class="faq__list">
        ${renderFaqItems(faq.items)}
      </div>
    </section>

    <section class="transition-cta" id="pricing">
      <h2 class="transition-cta__title">Trouve ton SaaS en 60 secondes</h2>
      <p class="transition-cta__lead">Cinq questions rapides pour ne te montrer que les SaaS vérifiés qui correspondent à ton budget, ton temps et ton secteur.</p>
      <button class="btn btn--primary" id="quiz-open-btn" type="button">Trouve ton SaaS en 60 secondes</button>
    </section>
  </main>

  ${renderQuizOverlay({ quiz, pricing, stripeLink: STRIPE_PAYMENT_LINK })}

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

  <script>
    (function () {
      var stackEl = document.getElementById("ns-stack");
      var timeEl = document.getElementById("ns-time");
      if (!stackEl) return;

      var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

      var MAX_VISIBLE = 4;
      var CARD_STEP_Y = 78;
      var TICK_MS = 5000;
      var CLOCK_MS = 30000;
      var MIN_DELAY_MS = 2400;
      var MAX_DELAY_MS = 3200;

      var DEPTH_STEPS = [
        { y: 0, scale: 1, opacity: 1, blur: 0 },
        { y: CARD_STEP_Y, scale: 0.96, opacity: 0.88, blur: 0.5 },
        { y: CARD_STEP_Y * 2, scale: 0.92, opacity: 0.62, blur: 1.5 },
        { y: CARD_STEP_Y * 3, scale: 0.88, opacity: 0.38, blur: 3 }
      ];

      var TEMPLATES = ${JSON.stringify(notificationStack.templates)};

      var SOURCE_META = {
        stripe: { label: "Stripe", icon: ${JSON.stringify(ICON_CREDIT_CARD)}, gradient: "linear-gradient(135deg, var(--cobalt) 0%, var(--cobalt-soft) 100%)", shadow: "rgba(0, 71, 255, 0.45)" },
        trustmrr: { label: "TrustMRR", icon: ${JSON.stringify(ICON_SHIELD)}, gradient: "linear-gradient(135deg, var(--verified-green) 0%, var(--verified-green-soft) 100%)", shadow: "rgba(0, 196, 140, 0.45)" },
        coldtrend: { label: "ColdTrend", icon: ${JSON.stringify(ICON_TREND)}, gradient: "linear-gradient(135deg, var(--graphite) 0%, var(--graphite-soft) 100%)", shadow: "rgba(10, 14, 26, 0.55)" }
      };

      var currencyFormatter = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

      function seededJitter(seedKey) {
        var hash = 0;
        for (var i = 0; i < seedKey.length; i += 1) {
          hash = (hash * 31 + seedKey.charCodeAt(i)) | 0;
        }
        var normalized = (hash % 1000) / 1000;
        return 1 + normalized * 0.025;
      }

      function buildNotification(template, pass) {
        var seedKey = template.saasName + "-" + template.kind + "-" + pass;
        var rawAmount = template.mrr * seededJitter(seedKey);
        var amount = Math.round(rawAmount / 10) * 10;
        var amountText = currencyFormatter.format(amount);
        var meta = SOURCE_META[template.source];

        var body, amountLabel;
        if (template.kind === "sale") {
          body = "Paiement récurrent confirmé — " + template.saasName;
          amountLabel = "+" + amountText + " MRR";
        } else if (template.kind === "verify") {
          body = template.saasName + " : MRR recoupé avec Stripe, écart 0%";
          amountLabel = amountText + " MRR confirmé";
        } else {
          body = template.saasName + " passe \\"Revenus vérifiés\\" sur la marketplace";
          amountLabel = amountText + " MRR";
        }

        return {
          id: seedKey + "-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7),
          source: template.source,
          title: meta.label,
          body: body,
          amountLabel: amountLabel,
          amountColor: template.source === "trustmrr" ? "var(--verified-green)" : "var(--cobalt-soft)",
          createdAt: Date.now()
        };
      }

      function formatAge(ageMs) {
        var seconds = Math.floor(ageMs / 1000);
        if (seconds < 60) return "à l'instant";
        return Math.floor(seconds / 60) + " min";
      }

      function applyDepth(cardEl, index) {
        var depth = DEPTH_STEPS[index] || DEPTH_STEPS[DEPTH_STEPS.length - 1];
        cardEl.style.zIndex = String(MAX_VISIBLE - index);
        if (reduceMotion) {
          cardEl.style.opacity = String(depth.opacity);
          return;
        }
        cardEl.style.transform = "translateY(" + depth.y + "px) scale(" + depth.scale + ")";
        cardEl.style.opacity = String(depth.opacity);
        cardEl.style.filter = "blur(" + depth.blur + "px)";
      }

      function createCardEl(notification) {
        var meta = SOURCE_META[notification.source];
        var card = document.createElement("div");
        card.className = "ns-card ns-card--enter";
        card.dataset.createdAt = String(notification.createdAt);
        card.innerHTML =
          '<div class="ns-card__icon" style="background:' + meta.gradient + ';box-shadow:0 6px 10px -4px ' + meta.shadow + ', 0 1px 2px rgba(0,0,0,0.35)">' + meta.icon + "</div>" +
          '<div class="ns-card__body">' +
            '<div class="ns-card__row">' +
              '<span class="ns-card__title">' + notification.title + "</span>" +
              '<span class="ns-card__time">à l\\'instant</span>' +
            "</div>" +
            '<p class="ns-card__text">' + notification.body + "</p>" +
            '<span class="ns-card__amount" style="color:' + notification.amountColor + '">' + notification.amountLabel + "</span>" +
          "</div>";

        if (reduceMotion) {
          card.style.opacity = "0";
        } else {
          card.style.transform = "translateY(-20px) scale(0.94)";
          card.style.opacity = "0";
          card.style.filter = "blur(0px)";
        }
        return card;
      }

      var visible = []; // [{ id, el }] index 0 = frontmost/newest
      var poolIndex = 0;
      var pass = 0;
      var timeoutId = null;

      function addNotification() {
        var template = TEMPLATES[poolIndex % TEMPLATES.length];
        var notification = buildNotification(template, pass);
        poolIndex += 1;
        if (poolIndex % TEMPLATES.length === 0) pass += 1;

        // Evict the oldest before the stack would exceed MAX_VISIBLE.
        if (visible.length >= MAX_VISIBLE) {
          var oldest = visible[visible.length - 1];
          visible = visible.slice(0, visible.length - 1);
          oldest.el.classList.remove("ns-card--enter");
          oldest.el.classList.add("ns-card--exit");
          if (reduceMotion) {
            oldest.el.style.opacity = "0";
          } else {
            oldest.el.style.transform = "translateX(90px) scale(0.98)";
            oldest.el.style.opacity = "0";
          }
          window.setTimeout(function () {
            if (oldest.el.parentNode) oldest.el.parentNode.removeChild(oldest.el);
          }, 460);
        }

        var cardEl = createCardEl(notification);
        stackEl.appendChild(cardEl);
        visible.unshift({ id: notification.id, el: cardEl });

        // Force layout so the entering card's initial style is committed
        // before animating to its resting depth (slot 0).
        // eslint-disable-next-line no-unused-expressions
        cardEl.offsetHeight;
        visible.forEach(function (item, idx) {
          applyDepth(item.el, idx);
        });
        window.setTimeout(function () { cardEl.classList.remove("ns-card--enter"); }, 460);

        scheduleNext();
      }

      function scheduleNext() {
        var delay = MIN_DELAY_MS + Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS);
        timeoutId = window.setTimeout(addNotification, delay);
      }

      function refreshAges() {
        visible.forEach(function (item) {
          var createdAt = Number(item.el.dataset.createdAt);
          var timeEl = item.el.querySelector(".ns-card__time");
          if (timeEl) timeEl.textContent = formatAge(Date.now() - createdAt);
        });
      }

      function refreshClock() {
        if (!timeEl) return;
        var now = new Date();
        var hh = String(now.getHours()).padStart(2, "0");
        var mm = String(now.getMinutes()).padStart(2, "0");
        timeEl.textContent = hh + ":" + mm;
      }

      refreshClock();
      scheduleNext();
      window.setInterval(refreshAges, TICK_MS);
      window.setInterval(refreshClock, CLOCK_MS);
    })();
  </script>

  <script>
    (function () {
      // ---- FAQ accordion ------------------------------------------------
      document.querySelectorAll("[data-faq-item]").forEach(function (item) {
        var btn = item.querySelector(".faq__question");
        btn.addEventListener("click", function () {
          var willOpen = !item.classList.contains("is-open");
          document.querySelectorAll("[data-faq-item].is-open").forEach(function (openItem) {
            if (openItem !== item) {
              openItem.classList.remove("is-open");
              openItem.querySelector(".faq__question").setAttribute("aria-expanded", "false");
            }
          });
          item.classList.toggle("is-open", willOpen);
          btn.setAttribute("aria-expanded", String(willOpen));
        });
      });

      // ---- Analytics --------------------------------------------------------
      // Point d'entrée unique, à brancher plus tard sur PostHog/Plausible.
      // Jamais de PII dans les props (voir lead_captured : domaine seulement).
      function trackEvent(name, props) {
        // TODO: remplacer par window.posthog.capture(name, props) / window.plausible(name, {props}).
        if (window.console && console.debug) {
          console.debug("[trackEvent]", name, props || {});
        }
      }

      // ---- Quiz funnel ----------------------------------------------------
      var overlay = document.getElementById("quiz-overlay");
      var openBtn = document.getElementById("quiz-open-btn");
      if (!overlay || !openBtn) return;

      var stage = document.getElementById("quiz-stage");
      var progressSegs = Array.prototype.slice.call(
        document.querySelectorAll("#quiz-progress .quiz-progress__seg")
      );
      var backBtn = document.getElementById("quiz-back-btn");
      var closeBtn = document.getElementById("quiz-close-btn");

      var questionScreens = Array.prototype.slice.call(stage.querySelectorAll('[data-screen="question"]'));
      var resultScreen = stage.querySelector('[data-screen="result"]');
      var paymentScreen = stage.querySelector('[data-screen="payment"]');
      var allScreens = questionScreens.concat([resultScreen, paymentScreen]);
      var TOTAL_STEPS = progressSegs.length; // 7 : 6 questions (dont capture) + résultat

      // TODO: remplacer par le vrai décompte (config ci-dessus, jamais un Math.random()).
      var TOTAL_SAAS = ${quiz.totalSaas};
      var SECTOR_LABELS = ${JSON.stringify(quiz.sectorLabels)};
      var BUDGET_LABELS = ${JSON.stringify(quiz.budgetLabels)};
      var TIME_LABELS = ${JSON.stringify(quiz.timeLabels)};
      var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      var SUPABASE_URL = ${JSON.stringify(SUPABASE_URL)};
      var SUPABASE_ANON_KEY = ${JSON.stringify(SUPABASE_ANON_KEY)};

      var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      var ENTER_TRANSITION = reduceMotion
        ? "opacity 220ms ease-out"
        : "transform 420ms cubic-bezier(0.22, 1.26, 0.36, 1), opacity 420ms cubic-bezier(0.22, 1.26, 0.36, 1)";
      var EXIT_TRANSITION = reduceMotion
        ? "opacity 220ms ease-out"
        : "transform 280ms cubic-bezier(0.4, 0, 1, 1), opacity 280ms cubic-bezier(0.4, 0, 1, 1)";
      var EXIT_MS = reduceMotion ? 220 : 280;
      var ENTER_MS = reduceMotion ? 220 : 420;

      var answers = {};
      var navHistory = [];
      var currentScreenEl = null;
      var currentQuestionIndex = 0;
      var reachedResult = false;

      function isSkipped(index) {
        var el = questionScreens[index];
        if (!el) return false;
        var field = el.getAttribute("data-skip-field");
        if (!field) return false;
        return answers[field] === el.getAttribute("data-skip-equals");
      }

      function findNextQuestionIndex(fromIndex) {
        var i = fromIndex + 1;
        while (i < questionScreens.length && isSkipped(i)) i += 1;
        return i;
      }

      function setProgress(filledCount, instant) {
        progressSegs.forEach(function (seg, i) {
          var fill = seg.querySelector(".quiz-progress__seg-fill");
          if (instant) fill.style.transition = "none";
          fill.style.width = i < filledCount ? "100%" : "0%";
          if (instant) {
            void fill.offsetWidth;
            fill.style.transition = "";
          }
        });
      }

      function updateBackVisibility() {
        backBtn.classList.toggle("is-visible", navHistory.length > 0);
      }

      function updateNextEnabled(screenEl) {
        var nextBtn = screenEl.querySelector(".quiz-next");
        if (!nextBtn) return;
        var id = screenEl.getAttribute("data-id");

        if (id === "capture") {
          var emailInput = document.getElementById("quiz-input-email");
          var consentInput = document.getElementById("quiz-rgpd-consent");
          nextBtn.disabled = !(EMAIL_RE.test(emailInput.value.trim()) && consentInput.checked);
          return;
        }

        var optionsWrap = screenEl.querySelector("[data-quiz-options]");
        var type = optionsWrap.getAttribute("data-type");
        if (type === "multi") {
          nextBtn.disabled = !(answers[id] && answers[id].length > 0);
        } else {
          nextBtn.disabled = answers[id] === undefined;
        }
      }

      function resetScreensVisualState() {
        allScreens.forEach(function (el) {
          el.classList.remove("is-active");
          el.style.transition = "none";
          el.style.opacity = "0";
          el.style.transform = reduceMotion ? "none" : "translateX(24px)";
          el.style.pointerEvents = "none";
        });
        void stage.offsetWidth;
        allScreens.forEach(function (el) {
          el.style.transition = "";
        });
      }

      function transitionTo(nextEl, direction) {
        var prevEl = currentScreenEl;
        if (prevEl === nextEl) return;

        var enterFrom = direction === "back" ? -24 : 24;
        var exitTo = direction === "back" ? 24 : -24;

        nextEl.style.transition = "none";
        nextEl.style.opacity = "0";
        nextEl.style.transform = reduceMotion ? "none" : "translateX(" + enterFrom + "px)";
        nextEl.style.pointerEvents = "none";
        nextEl.classList.add("is-active");
        void nextEl.offsetWidth;

        nextEl.style.transition = ENTER_TRANSITION;
        nextEl.style.opacity = "1";
        nextEl.style.transform = "translateX(0)";
        window.setTimeout(function () {
          nextEl.style.pointerEvents = "auto";
        }, ENTER_MS);

        if (prevEl) {
          prevEl.style.transition = EXIT_TRANSITION;
          prevEl.style.opacity = "0";
          prevEl.style.transform = reduceMotion ? "none" : "translateX(" + exitTo + "px)";
          prevEl.style.pointerEvents = "none";
          window.setTimeout(function () {
            prevEl.classList.remove("is-active");
          }, EXIT_MS);
        }

        currentScreenEl = nextEl;

        var stepName = nextEl.getAttribute("data-step-name");
        if (stepName) {
          var stepIndexAttr = nextEl.getAttribute("data-index");
          var stepNumber = stepIndexAttr !== null ? Number(stepIndexAttr) + 1 : TOTAL_STEPS;
          trackEvent("funnel_step_view", { step_number: stepNumber, step_name: stepName });
        }
      }

      function easeOutExpo(t) {
        return t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
      }

      function animateCounter(el, from, to, duration, onDone) {
        if (reduceMotion) {
          el.textContent = String(to);
          if (onDone) onDone();
          return;
        }
        var start = null;
        function step(ts) {
          if (!start) start = ts;
          var progress = Math.min((ts - start) / duration, 1);
          var value = Math.round(from + (to - from) * easeOutExpo(progress));
          el.textContent = String(value);
          if (progress < 1) {
            window.requestAnimationFrame(step);
          } else if (onDone) {
            onDone();
          }
        }
        window.requestAnimationFrame(step);
      }

      function seededMatchCount(ans) {
        var seed = JSON.stringify(ans);
        var hash = 0;
        for (var i = 0; i < seed.length; i += 1) {
          hash = (hash * 31 + seed.charCodeAt(i)) | 0;
        }
        return 2 + (Math.abs(hash) % 4); // 2..5
      }

      function sectorSummary() {
        var sectorIds = answers.secteur || [];
        var names = sectorIds.map(function (id) {
          return SECTOR_LABELS[id] || id;
        });
        return names.length ? names.join(", ") : "";
      }

      function goToResult() {
        reachedResult = true;
        transitionTo(resultScreen, "forward");

        var matchCount = answers.matchCount !== undefined ? answers.matchCount : seededMatchCount(answers);
        answers.matchCount = matchCount;
        resultScreen.setAttribute("data-match-count", String(matchCount));

        var titleEl = document.getElementById("quiz-result-title");
        titleEl.textContent = answers.prenom
          ? "Ok " + answers.prenom + ", voici ce qu'on a trouvé."
          : "Voici ce qu'on a trouvé.";

        var metaParts = [];
        var sectorText = sectorSummary();
        if (sectorText) metaParts.push(sectorText);
        if (answers.budget) metaParts.push("budget " + (BUDGET_LABELS[answers.budget] || answers.budget));
        if (answers.temps) metaParts.push((TIME_LABELS[answers.temps] || answers.temps) + " par semaine");
        document.getElementById("quiz-result-meta").textContent = metaParts.join(" · ");

        var ctaBtn = document.getElementById("quiz-see-offer-btn");
        ctaBtn.textContent = "Débloquer les " + matchCount + " résultats";

        var totalEl = document.getElementById("quiz-count-total");
        var matchEl = document.getElementById("quiz-count-match");
        totalEl.textContent = "0";
        matchEl.textContent = String(TOTAL_SAAS);

        animateCounter(totalEl, 0, TOTAL_SAAS, 900, function () {
          window.setTimeout(function () {
            animateCounter(matchEl, TOTAL_SAAS, matchCount, 700);
          }, 400);
        });
      }

      function goToPayment() {
        trackEvent("result_cta_clicked", {});
        var matchCount = Number(resultScreen.getAttribute("data-match-count")) || 3;
        var teaserEl = document.getElementById("quiz-teaser");
        var sectorText = sectorSummary() || "plusieurs secteurs";
        var budgetText = answers.budget ? ", budget " + (BUDGET_LABELS[answers.budget] || answers.budget) : "";
        teaserEl.textContent = matchCount + " SaaS correspondent à ton profil : " + sectorText + budgetText + ".";
        transitionTo(paymentScreen, "forward");
      }

      function goForwardFromQuestion() {
        var currentEl = questionScreens[currentQuestionIndex];
        var currentId = currentEl.getAttribute("data-id");
        trackEvent("funnel_step_complete", {
          step_number: currentQuestionIndex + 1,
          answer: currentId === "capture" ? "submitted" : answers[currentId]
        });

        navHistory.push(currentQuestionIndex);
        var next = findNextQuestionIndex(currentQuestionIndex);
        currentQuestionIndex = next;
        updateBackVisibility();
        if (next >= questionScreens.length) {
          setProgress(TOTAL_STEPS);
          goToResult();
        } else {
          setProgress(next);
          var screenEl = questionScreens[next];
          updateNextEnabled(screenEl);
          transitionTo(screenEl, "forward");
        }
      }

      function submitCapture() {
        var prenomInput = document.getElementById("quiz-input-prenom");
        var emailInput = document.getElementById("quiz-input-email");
        var errorEl = document.getElementById("quiz-email-error");
        var email = emailInput.value.trim();

        if (!EMAIL_RE.test(email)) {
          emailInput.classList.add("is-invalid");
          errorEl.textContent = "Format d'email invalide.";
          emailInput.focus();
          return;
        }
        emailInput.classList.remove("is-invalid");
        errorEl.textContent = "";

        answers.prenom = prenomInput.value.trim();
        answers.email = email;
        answers.matchCount = seededMatchCount(answers);

        trackEvent("lead_captured", { email_domain: email.split("@")[1] || "" });

        // L'appel réseau ne doit jamais bloquer ni faire échouer la progression
        // du funnel côté utilisateur : erreurs avalées silencieusement.
        insertLead({
          prenom: answers.prenom,
          email: answers.email,
          rgpd_consent: true,
          intention: answers.intention || null,
          budget: answers.budget || null,
          temps: answers.temps || null,
          secteur: answers.secteur || [],
          deja_cherche: answers.dejaCherche === "yes",
          match_count: answers.matchCount
        });

        goForwardFromQuestion();
      }

      function insertLead(payload) {
        try {
          fetch(SUPABASE_URL + "/rest/v1/leads", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              apikey: SUPABASE_ANON_KEY,
              Authorization: "Bearer " + SUPABASE_ANON_KEY,
              Prefer: "return=minimal"
            },
            body: JSON.stringify(payload)
          }).catch(function (err) {
            console.warn("[ColdTrend] insertion Supabase silencieusement échouée :", err);
          });
        } catch (err) {
          console.warn("[ColdTrend] insertion Supabase silencieusement échouée :", err);
        }
      }

      function openQuiz() {
        answers = {};
        navHistory = [];
        currentQuestionIndex = 0;
        currentScreenEl = null;
        reachedResult = false;

        stage.querySelectorAll(".quiz-option, .quiz-chip").forEach(function (btn) {
          btn.classList.remove("is-selected");
        });
        stage.querySelectorAll(".quiz-next").forEach(function (btn) {
          btn.disabled = true;
        });
        var emailInput = document.getElementById("quiz-input-email");
        var prenomInput = document.getElementById("quiz-input-prenom");
        var consentInput = document.getElementById("quiz-rgpd-consent");
        var privacyDetail = document.getElementById("quiz-privacy-detail");
        var privacyToggle = document.getElementById("quiz-privacy-toggle");
        if (emailInput) {
          emailInput.value = "";
          emailInput.classList.remove("is-invalid");
        }
        if (prenomInput) prenomInput.value = "";
        if (consentInput) consentInput.checked = false;
        if (privacyDetail) privacyDetail.classList.remove("is-open");
        if (privacyToggle) privacyToggle.setAttribute("aria-expanded", "false");
        var followupEl = document.getElementById("quiz-followup");
        if (followupEl) followupEl.classList.remove("is-visible");

        overlay.classList.add("is-open");
        document.body.style.overflow = "hidden";
        resetScreensVisualState();
        setProgress(0, true);
        updateBackVisibility();
        transitionTo(questionScreens[0], "forward");
      }

      function closeQuiz() {
        if (overlay.classList.contains("is-open") && !reachedResult && currentScreenEl) {
          var stepName = currentScreenEl.getAttribute("data-step-name") || "inconnu";
          trackEvent("funnel_abandoned", { last_step: stepName });
        }
        overlay.classList.remove("is-open");
        document.body.style.overflow = "";
      }

      stage.addEventListener("click", function (e) {
        if (e.target.closest("#quiz-privacy-toggle")) {
          var detail = document.getElementById("quiz-privacy-detail");
          var toggle = e.target.closest("#quiz-privacy-toggle");
          var willOpen = !detail.classList.contains("is-open");
          detail.classList.toggle("is-open", willOpen);
          toggle.setAttribute("aria-expanded", String(willOpen));
          return;
        }

        var optBtn = e.target.closest(".quiz-option, .quiz-chip");
        if (optBtn) {
          var screenEl = optBtn.closest(".quiz-screen");
          var id = screenEl.getAttribute("data-id");
          var optionsWrap = screenEl.querySelector("[data-quiz-options]");
          var type = optionsWrap.getAttribute("data-type");
          var value = optBtn.getAttribute("data-value");

          if (type === "multi") {
            var selected = answers[id] ? answers[id].slice() : [];
            var pos = selected.indexOf(value);
            if (pos === -1) {
              selected.push(value);
              optBtn.classList.add("is-selected");
            } else {
              selected.splice(pos, 1);
              optBtn.classList.remove("is-selected");
            }
            answers[id] = selected;
          } else {
            answers[id] = value;
            Array.prototype.forEach.call(optionsWrap.querySelectorAll(".quiz-option"), function (b) {
              b.classList.toggle("is-selected", b === optBtn);
            });

            if (id === "dejaCherche") {
              var followupEl2 = document.getElementById("quiz-followup");
              var followupText = optBtn.getAttribute("data-followup");
              if (followupEl2 && followupText) {
                followupEl2.textContent = followupText;
                followupEl2.classList.add("is-visible");
              }
            }
          }
          updateNextEnabled(screenEl);
          return;
        }

        if (e.target.closest("#quiz-capture-submit")) {
          submitCapture();
          return;
        }

        if (e.target.closest(".quiz-next")) {
          goForwardFromQuestion();
          return;
        }

        if (e.target.closest("#quiz-see-offer-btn")) {
          goToPayment();
          return;
        }
      });

      stage.addEventListener("input", function (e) {
        if (e.target.id === "quiz-input-email" || e.target.id === "quiz-input-prenom") {
          var captureScreen = e.target.closest(".quiz-screen");
          if (e.target.id === "quiz-input-email") e.target.classList.remove("is-invalid");
          updateNextEnabled(captureScreen);
        }
      });

      stage.addEventListener("change", function (e) {
        if (e.target.id === "quiz-rgpd-consent") {
          updateNextEnabled(e.target.closest(".quiz-screen"));
        }
      });

      stage.addEventListener("keydown", function (e) {
        if (e.key !== "Enter") return;
        if (e.target.id === "quiz-input-prenom" || e.target.id === "quiz-input-email") {
          e.preventDefault();
          var submitBtn = document.getElementById("quiz-capture-submit");
          if (submitBtn && !submitBtn.disabled) submitBtn.click();
        }
      });

      backBtn.addEventListener("click", function () {
        if (navHistory.length === 0) return;
        var prevIndex = navHistory.pop();
        currentQuestionIndex = prevIndex;
        setProgress(prevIndex, true);
        updateBackVisibility();
        var screenEl = questionScreens[prevIndex];
        updateNextEnabled(screenEl);
        transitionTo(screenEl, "back");
      });

      closeBtn.addEventListener("click", closeQuiz);
      openBtn.addEventListener("click", openQuiz);
      document.addEventListener("keydown", function (e) {
        if (e.key === "Escape" && overlay.classList.contains("is-open")) closeQuiz();
      });
      window.addEventListener("beforeunload", function () {
        if (overlay.classList.contains("is-open") && !reachedResult && currentScreenEl) {
          var stepName = currentScreenEl.getAttribute("data-step-name") || "inconnu";
          trackEvent("funnel_abandoned", { last_step: stepName });
        }
      });
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

function renderComparisonRows(comparison) {
  return comparison.rows
    .map(
      (row) => `<div class="compare__row">
          <span class="compare__criterion">${row.criterion}</span>
          <span class="compare__cell"><span class="compare__label">${comparison.columns.ai} — </span>${row.ai}</span>
          <span class="compare__cell compare__cell--rich"><span class="compare__label">${comparison.columns.rich} — </span>${row.rich}</span>
        </div>`
    )
    .join("\n        ");
}

function renderFaqItems(items) {
  return items
    .map(
      (item, index) => `<div class="faq__item" data-faq-item>
          <button class="faq__question" type="button" aria-expanded="false" id="faq-q-${index}">
            <span>${item.q}</span>
            <span class="faq__chevron">${ICON_CHEVRON_DOWN}</span>
          </button>
          <div class="faq__answer-wrap">
            <div class="faq__answer-inner">
              <p class="faq__answer">${item.a}</p>
            </div>
          </div>
        </div>`
    )
    .join("\n        ");
}

function renderQuizOption(opt) {
  return `<button class="quiz-option" type="button" data-value="${opt.value}"${
    opt.followup ? ` data-followup="${opt.followup.replace(/"/g, "&quot;")}"` : ""
  }>
                <span class="quiz-option__body">
                  <span class="quiz-option__label">${opt.label}</span>
                  ${opt.hint ? `<span class="quiz-option__hint">${opt.hint}</span>` : ""}
                </span>
                <span class="quiz-option__check" aria-hidden="true">${ICON_CHECK_SMALL}</span>
              </button>`;
}

function renderQuizOptions(question) {
  const type = question.type === "multi" ? "multi" : "single";
  return `<div class="quiz-options" data-quiz-options data-type="${type}">
              ${question.options.map(renderQuizOption).join("\n              ")}
            </div>`;
}

function renderQuizQuestionScreen(question, index) {
  const skipAttrs = question.skipIf
    ? ` data-skip-field="${question.skipIf.field}" data-skip-equals="${question.skipIf.equals}"`
    : "";

  if (question.type === "capture") {
    return `<div class="quiz-screen" data-screen="question" data-index="${index}" data-id="${question.id}" data-step-name="${question.stepName}"${skipAttrs}>
          <h2 class="quiz-question-title">${question.title}</h2>
          <p class="quiz-subtext">${question.subtext}</p>
          <div class="quiz-field">
            <label class="quiz-label" for="quiz-input-prenom">Prénom</label>
            <input class="quiz-input" id="quiz-input-prenom" name="prenom" type="text" autocomplete="given-name" />
          </div>
          <div class="quiz-field">
            <label class="quiz-label" for="quiz-input-email">Email</label>
            <input class="quiz-input" id="quiz-input-email" name="email" type="email" autocomplete="email" required />
            <span class="quiz-field__error" id="quiz-email-error" aria-live="polite"></span>
          </div>
          <div class="quiz-checkbox-row">
            <input class="quiz-checkbox" id="quiz-rgpd-consent" type="checkbox" required />
            <label for="quiz-rgpd-consent">J'accepte de recevoir mon résultat par email. <button type="button" class="quiz-privacy-toggle" id="quiz-privacy-toggle" aria-expanded="false">Politique de confidentialité</button></label>
          </div>
          <div class="quiz-privacy-detail" id="quiz-privacy-detail">
            Ton email sert uniquement à t'envoyer ton résultat et l'accès après paiement — aucune newsletter, aucun partage à des tiers. Tu peux demander la suppression de tes données à tout moment en répondant à l'email reçu.
          </div>
          <div class="quiz-footer">
            <button class="btn btn--primary quiz-next" id="quiz-capture-submit" type="button" disabled>Voir mon résultat</button>
          </div>
        </div>`;
  }

  const followupBlock =
    question.id === "dejaCherche"
      ? `<p class="quiz-followup" id="quiz-followup" aria-live="polite"></p>`
      : "";

  return `<div class="quiz-screen" data-screen="question" data-index="${index}" data-id="${question.id}" data-step-name="${question.stepName}"${skipAttrs}>
          <h2 class="quiz-question-title">${question.title}</h2>
          ${question.subtext ? `<p class="quiz-subtext">${question.subtext}</p>` : ""}
          ${renderQuizOptions(question)}
          ${followupBlock}
          <div class="quiz-footer">
            <button class="btn btn--primary quiz-next" type="button" disabled>Continuer</button>
          </div>
        </div>`;
}

function renderQuizOverlay({ quiz, pricing, stripeLink }) {
  const questionScreens = quiz.questions.map(renderQuizQuestionScreen).join("\n        ");
  const totalSteps = quiz.questions.length + 1; // + écran résultat = 7 au total

  return `<div class="quiz-overlay" id="quiz-overlay" role="dialog" aria-modal="true" aria-label="Trouver ton SaaS">
    <div class="quiz-header">
      <button class="quiz-back" id="quiz-back-btn" type="button">${ICON_ARROW_LEFT} Retour</button>
      <button class="quiz-close" id="quiz-close-btn" type="button" aria-label="Fermer">${ICON_CLOSE}</button>
    </div>
    <div class="quiz-progress" id="quiz-progress">
      ${Array.from({ length: totalSteps })
        .map(() => `<span class="quiz-progress__seg"><span class="quiz-progress__seg-fill"></span></span>`)
        .join("\n      ")}
    </div>
    <div class="quiz-stage" id="quiz-stage">
      ${questionScreens}

      <div class="quiz-screen quiz-result" data-screen="result" data-step-name="resultat">
        <h2 class="quiz-question-title" id="quiz-result-title">Voici ce qu'on a trouvé.</h2>
        <div class="quiz-result__count" id="quiz-count-total">0</div>
        <p class="quiz-result__count-label">SaaS vérifiés dans la base</p>
        <div class="quiz-result__match" id="quiz-count-match">0</div>
        <p class="quiz-result__match-label" id="quiz-match-label">correspondent à ton profil</p>
        <p class="quiz-result-meta" id="quiz-result-meta"></p>
        <button class="btn btn--primary" id="quiz-see-offer-btn" type="button">Voir mon accès</button>
      </div>

      <div class="quiz-screen" data-screen="payment" data-step-name="paiement">
        <p class="quiz-payment__teaser" id="quiz-teaser"></p>
        <div class="price-block">
          <div class="price-block__daily">Moins de <strong>${pricing.dailyPrice}</strong> par jour</div>
          <div class="price-block__total">${pricing.totalPrice} — ${pricing.totalNote}</div>
        </div>
        <ul class="included-list">
          <li>${ICON_CHECK_SMALL} Accès à toute la base de SaaS vérifiés (Stripe × TrustMRR)</li>
          <li>${ICON_CHECK_SMALL} Livré sous forme de Google Sheet en lecture seule</li>
          <li>${ICON_CHECK_SMALL} Mises à jour continues, sans frais supplémentaire</li>
        </ul>
        <p class="stripe-reassurance">${ICON_LOCK} Paiement sécurisé via <strong>&nbsp;Stripe</strong></p>
        <a class="btn btn--primary btn--cta-final" id="quiz-pay-btn" href="${stripeLink}">Obtenir mon accès — ${pricing.totalPrice}</a>
      </div>
    </div>
  </div>`;
}

// Compact inline icon markup, injected as strings into the client-side
// notification engine above (status bar + per-source app-icon glyphs).
const ICON_SIGNAL =
  '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M2 20h2v-4H2v4zM7 20h2v-9H7v9zM12 20h2V9h-2v11zM17 20h2V4h-2v16z" fill="currentColor"/></svg>';
const ICON_WIFI =
  '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M2 8.5c5.5-5 14.5-5 20 0M5.5 12.5c3.7-3.3 9.3-3.3 13 0M9 16.5c1.9-1.6 4.1-1.6 6 0" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="20" r="1.3" fill="currentColor"/></svg>';
const ICON_BATTERY =
  '<svg width="16" height="16" viewBox="0 0 26 14" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="1" y="1" width="21" height="12" rx="3" stroke="currentColor" stroke-width="1.4"/><rect x="3" y="3" width="17" height="8" rx="1.5" fill="currentColor"/><path d="M24 5v4a2 2 0 000-4z" fill="currentColor"/></svg>';

const ICON_CREDIT_CARD =
  '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="2" y="5" width="20" height="14" rx="2.5" stroke="#fff" stroke-width="2"/><path d="M2 10h20" stroke="#fff" stroke-width="2"/></svg>';
const ICON_SHIELD =
  '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6l7-3z" stroke="#fff" stroke-width="2" stroke-linejoin="round"/><path d="M9 12l2 2 4-4" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const ICON_TREND =
  '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M3 17l6-6 4 4 8-8" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M15 7h6v6" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

const ICON_CHEVRON_DOWN =
  '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const ICON_ARROW_LEFT =
  '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M19 12H5M5 12l6-6M5 12l6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const ICON_CLOSE =
  '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
const ICON_CHECK_SMALL =
  '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M20 6L9 17l-5-5" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const ICON_LOCK =
  '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="5" y="11" width="14" height="9" rx="2" stroke="currentColor" stroke-width="2"/><path d="M8 11V7a4 4 0 018 0v4" stroke="currentColor" stroke-width="2"/></svg>';

// ---------------------------------------------------------------------------
// Page succès — cible de la redirection post-paiement Stripe
// ---------------------------------------------------------------------------
// Le Payment Link Stripe redirige ici APRÈS paiement confirmé. Cette URL
// (coldtrend.com/succes) doit être saisie manuellement dans le dashboard
// Stripe (Payment Link → Edit → After payment → redirect customers to a
// specific URL) — ce n'est pas pilotable depuis ce fichier, seule la page
// de destination l'est.
function successPage({ brand, siteUrl }) {
  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${brand.name} — Accès confirmé</title>
<meta name="description" content="Ton paiement est confirmé, ton accès arrive par email." />
<meta name="robots" content="noindex" />
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  html, body {
    margin: 0;
    min-height: 100dvh;
    background: #0A0E1A;
    color: #F5F6F8;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Inter, Arial, sans-serif;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
  }
  .card {
    max-width: 440px;
    text-align: center;
  }
  .check {
    width: 56px;
    height: 56px;
    margin: 0 auto 20px;
    border-radius: 999px;
    background: rgba(0, 196, 140, 0.14);
    border: 1px solid rgba(0, 196, 140, 0.35);
    display: flex;
    align-items: center;
    justify-content: center;
    color: #00C48C;
  }
  h1 { font-size: 24px; font-weight: 800; margin: 0 0 12px; }
  p { font-size: 15px; line-height: 1.6; color: #8A8F98; margin: 0 0 8px; }
  a.btn {
    display: inline-block;
    margin-top: 20px;
    padding: 12px 24px;
    border-radius: 10px;
    background: #0047FF;
    color: #fff;
    font-weight: 700;
    text-decoration: none;
  }
</style>
</head>
<body>
  <div class="card">
    <div class="check" aria-hidden="true">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M20 6L9 17l-5-5" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </div>
    <h1>Paiement confirmé.</h1>
    <p>Ton accès arrive par email dans les prochaines minutes — un lien vers le Google Sheet en lecture seule, envoyé à l'adresse utilisée pendant le quiz.</p>
    <p>Rien reçu sous 10 minutes ? Vérifie tes spams avant de nous écrire.</p>
    <a class="btn" href="${siteUrl}">Retour à l'accueil</a>
  </div>
</body>
</html>
`;
}

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(OUT_FILE, page({ brand, hero, socialProof, notificationStack, pricing, comparison, faq, quiz }), "utf8");
writeFileSync(OUT_FILE_SUCCESS, successPage({ brand, siteUrl: SITE_URL }), "utf8");
console.log(`Built ${path.relative(process.cwd(), OUT_FILE)}`);
console.log(`Built ${path.relative(process.cwd(), OUT_FILE_SUCCESS)}`);
