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
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.coldtrend.com";

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
    "Stripe vérifié",
    "MRR réel",
    "Zéro invention",
    "Audité, pas généré"
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
      // TODO(revue humaine) : "la quasi-totalité" à ajuster en "la
      // totalité" ou en pourcentage exact selon la réponse du fondateur —
      // ratio réel TrustMRR vs Acquire.com/Flippa dans les 340 SaaS actuels
      // pas encore confirmé au moment de l'écriture de ce texte.
      q: "Que veut dire exactement le badge « Vérifié » ?",
      a: "Que le revenu affiché est confirmé par une source indépendante — aujourd'hui, la quasi-totalité de la base vient de TrustMRR, qui vérifie le revenu par une connexion en lecture seule au processeur de paiement du vendeur (pas une capture d'écran, pas un chiffre auto-déclaré). Quand une fiche vient d'ailleurs (Acquire.com, dont l'équipe examine chaque dossier manuellement, ou un listing « Verified » de Flippa), elle porte un badge distinct « Revue par la plateforme » — jamais confondu avec le badge vert. « Vérifié » veut dire revenu confirmé, pas garantie de rentabilité future : on vérifie un chiffre passé, pas une promesse."
    },
    {
      q: "À quelle fréquence la base est mise à jour ?",
      a: "Chaque SaaS est vérifié au moment de son ajout — il n'y a pas de recalcul automatique en continu aujourd'hui, la base s'enrichit et se retire au fil de l'eau plutôt que par un système entièrement automatisé."
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
      a: "On ne génère rien : chaque ligne du sheet correspond à un SaaS réel, avec un revenu vérifié ou revu par une plateforme sérieuse — pas une suggestion plausible."
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
      // Première question du quiz, pas un gate avant — même barre de
      // progression, même carte, même style de bouton que les autres
      // questions. Voir resolve-identity (supabase/functions/) : un seul
      // appel serveur qui gère "nouveau compte ou existant" en une fois, et
      // la transition vers la question 2 démarre AVANT sa réponse
      // (transition optimiste, cf. handleAuthSubmit dans le script plus bas).
      id: "auth",
      stepName: "auth",
      type: "auth",
      title: "Pour garder ta sélection au chaud.",
      subtext: "Un compte pour retrouver tes résultats plus tard — pas de confirmation par email, pas d'attente."
    },
    {
      // Preuve visuelle redactée plutôt qu'une affirmation textuelle ou un
      // chiffre inventé façon concurrent : le montant et le nom du SaaS sont
      // partiellement masqués (comme une fiche Stripe qu'on aurait le droit
      // de montrer sans révéler l'identité du vendeur), mais RIEN n'est
      // fabriqué — c'est un exemple réel de ce que "vérifié" veut dire chez
      // ColdTrend, pas une preuve sociale gonflée.
      id: "proof",
      stepName: "preuve",
      type: "proof",
      title: "Chaque SaaS ici a un revenu vérifié — pas une estimation.",
      subtext: "Voici le type de preuve qu'on croise (Stripe × TrustMRR) avant qu'un SaaS apparaisse dans ta sélection."
    },
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
<link rel="stylesheet" href="/css/design-tokens.css" />
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
    /* Grid items default to min-width:auto, which lets their intrinsic
       (min-content) width push the track wider than its fr share. The
       typewriter text below is nowrap, so without this reset every
       keystroke would nudge the whole grid — badge, buttons, phone
       visual included. min-width:0 keeps the fr tracks fixed regardless
       of what the copy column currently contains. */
    min-width: 0;
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

  .brand-bar__auth {
    margin-top: 6px;
    font-size: 12px;
  }

  .brand-bar__auth a {
    color: var(--steel);
    text-decoration: underline;
  }

  .brand-bar__auth a:hover {
    color: var(--cobalt-soft);
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
    overflow: hidden;
    text-align: left;
    vertical-align: bottom;
    /* Fallback for no-JS / before the width-lock script runs: reserve
       space for the longest phrase in ch units so the box is never
       narrower than it needs to be. The script below replaces this with
       an exact pixel width measured from the actual rendered font, which
       is what keeps the box byte-for-byte stable across every phrase —
       ch is only an approximation (average glyph width), not exact. */
    min-width: 20ch;
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
    overflow-x: hidden;
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

  /* Écran "proof" : peu de contenu, le bouton collé au fond de l'écran via
     margin-top:auto crée un grand vide disproportionné en dessous de la
     carte — on le garde juste sous elle à la place. */
  .quiz-screen[data-id="proof"] {
    justify-content: center;
  }

  .quiz-screen[data-id="proof"] .quiz-footer {
    margin-top: 24px;
  }

  .quiz-next,
  .btn--full {
    width: 100%;
    max-width: none;
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

  /* ---- Écran "auth" (première question du quiz, pas un gate à part) ---- */

  .quiz-auth-mesh {
    position: absolute;
    inset: -20% -10% auto -10%;
    height: 260px;
    z-index: -1;
    background:
      radial-gradient(60% 80% at 15% 20%, rgba(0, 71, 255, 0.22), transparent 60%),
      radial-gradient(50% 70% at 85% 0%, rgba(0, 196, 140, 0.14), transparent 60%);
    filter: blur(30px);
    pointer-events: none;
  }

  .quiz-auth-field {
    opacity: 0;
    transform: translateY(10px);
    animation: quiz-auth-field-in 420ms cubic-bezier(0.22, 1.26, 0.36, 1) forwards;
  }

  .quiz-auth-field--1 { animation-delay: 80ms; }
  .quiz-auth-field--2 { animation-delay: 180ms; }

  .quiz-google-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    width: 100%;
    padding: 13px 16px;
    border-radius: 12px;
    border: 1px solid rgba(255, 255, 255, 0.14);
    background: #fff;
    color: #1F1F1F;
    font-size: 15px;
    font-weight: 600;
    font-family: inherit;
    cursor: pointer;
    margin-bottom: 16px;
    transition: transform 180ms cubic-bezier(0.22, 1.26, 0.36, 1), box-shadow 180ms ease;
  }

  .quiz-google-btn:hover {
    box-shadow: 0 6px 18px -6px rgba(255, 255, 255, 0.35);
  }

  .quiz-google-btn:active {
    transform: scale(0.98);
  }

  .quiz-auth-divider {
    display: flex;
    align-items: center;
    gap: 12px;
    margin: 0 0 18px;
    color: var(--steel);
    font-size: 12px;
  }

  .quiz-auth-divider::before,
  .quiz-auth-divider::after {
    content: "";
    flex: 1;
    height: 1px;
    background: rgba(255, 255, 255, 0.1);
  }

  @keyframes quiz-auth-field-in {
    to { opacity: 1; transform: translateY(0); }
  }

  @media (prefers-reduced-motion: reduce) {
    .quiz-auth-field {
      animation: none;
      opacity: 1;
      transform: none;
    }
  }

  .quiz-banner {
    display: none;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 12px 14px;
    border-radius: 12px;
    font-size: 13px;
    line-height: 1.4;
    margin: 12px 20px 0;
  }

  .quiz-banner.is-visible {
    display: flex;
  }

  .quiz-banner--alert {
    background: rgba(217, 96, 90, 0.14);
    border: 1px solid rgba(217, 96, 90, 0.35);
    color: var(--paper-soft);
  }

  .quiz-banner__action {
    flex-shrink: 0;
    background: none;
    border: none;
    color: #fff;
    font-weight: 700;
    text-decoration: underline;
    font-size: 13px;
    font-family: inherit;
    cursor: pointer;
    padding: 0;
  }

  /* ---- Accumulateur de tags — la pièce d'UX qui évite de recommencer à
     zéro pour corriger une réponse. Visible dès la première réponse
     donnée, sur tous les écrans de question suivants et sur le résultat. */

  .quiz-tags {
    display: none;
    flex-wrap: wrap;
    gap: 8px;
    margin: 12px 20px 0;
  }

  .quiz-tags.is-visible {
    display: flex;
  }

  .quiz-tag {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.14);
    background: rgba(255, 255, 255, 0.04);
    color: var(--paper-soft);
    font-size: 12px;
    font-family: inherit;
    cursor: pointer;
    transition: transform 180ms cubic-bezier(0.22, 1.26, 0.36, 1), opacity 220ms ease, border-color 180ms ease;
  }

  .quiz-tag:hover,
  .quiz-tag:focus-visible {
    border-color: var(--cobalt-soft);
  }

  .quiz-tag:active {
    transform: scale(0.96);
  }

  .quiz-tag__label {
    color: var(--steel);
  }

  .quiz-tag.is-editing {
    border-color: var(--cobalt);
    box-shadow: 0 0 0 3px rgba(0, 71, 255, 0.2);
  }

  .quiz-tag.is-removing {
    opacity: 0;
    transform: scale(0.85);
  }

  /* Badge "à revérifier" — infrastructure posée, dormante : aucune paire de
     questions du quiz actuel ne crée d'incohérence non résolue par un skip
     automatique (voir audit), donc rien ne déclenche cette classe pour
     l'instant. Prête pour une future question qui en aurait besoin. */
  .quiz-tag.needs-review {
    border-color: var(--amber, #d9a23d);
  }

  .quiz-tag__review-icon {
    color: var(--amber, #d9a23d);
  }

  @media (prefers-reduced-motion: reduce) {
    .quiz-tag {
      transition: opacity 150ms ease;
    }
  }

  .quiz-edit-bar {
    display: none;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin: 12px 20px 0;
    padding: 10px 14px;
    border-radius: 12px;
    background: rgba(0, 71, 255, 0.12);
    border: 1px solid rgba(0, 71, 255, 0.35);
    font-size: 13px;
    color: var(--paper-soft);
  }

  .quiz-edit-bar.is-visible {
    display: flex;
  }

  .quiz-toast {
    position: absolute;
    left: 50%;
    bottom: 24px;
    transform: translate(-50%, 12px);
    padding: 10px 18px;
    border-radius: 999px;
    background: var(--verified-green);
    color: #052e22;
    font-size: 13px;
    font-weight: 700;
    opacity: 0;
    pointer-events: none;
    transition: opacity 220ms ease, transform 220ms ease;
    z-index: 5;
  }

  .quiz-toast.is-visible {
    opacity: 1;
    transform: translate(-50%, 0);
  }

  /* ---- Badge "connecté" (brand-bar) ---- */

  .connected-badge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    font-weight: 600;
    color: var(--verified-green);
    background: rgba(0, 196, 140, 0.12);
    border: 1px solid rgba(0, 196, 140, 0.3);
    border-radius: 999px;
    padding: 4px 10px;
    margin-top: 6px;
    opacity: 0;
    transform: scale(0.85);
    transition: opacity 320ms cubic-bezier(0.34, 1.56, 0.64, 1), transform 320ms cubic-bezier(0.34, 1.56, 0.64, 1);
  }

  .connected-badge.is-visible {
    opacity: 1;
    transform: scale(1);
  }

  @media (prefers-reduced-motion: reduce) {
    .connected-badge { transition: opacity 200ms ease-out; transform: none; }
  }

  /* ---- Badges de niveau de source — deux niveaux de confiance distincts,
     jamais mélangés sous un même badge "Vérifié" (voir saas_listings,
     migration 0007). Même forme de pill que .connected-badge, jamais vert
     pour le niveau 2 : le vert reste exclusivement réservé à "Vérifié". ---- */

  .source-badge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    font-weight: 600;
    border-radius: 999px;
    padding: 4px 10px;
  }

  .source-badge--verified {
    color: var(--verified-green);
    background: rgba(0, 196, 140, 0.12);
    border: 1px solid rgba(0, 196, 140, 0.3);
  }

  .source-badge--platform {
    color: var(--steel);
    background: rgba(138, 143, 152, 0.12);
    border: 1px solid rgba(138, 143, 152, 0.3);
  }

  .source-badge__icon {
    width: 12px;
    height: 12px;
  }

  /* ---- Carte "preuve redactée" — relevé de vérification caviardé ---- */

  .proof-card {
    position: relative;
    z-index: 1;
    overflow: hidden;
    margin: 4px 0 24px;
    padding: 20px 22px;
    border-radius: 14px;
    background:
      repeating-linear-gradient(0deg, rgba(255,255,255,0.012) 0px, rgba(255,255,255,0.012) 1px, transparent 1px, transparent 3px),
      #12151f;
    border: 1px solid rgba(255, 255, 255, 0.1);
    box-shadow: 0 20px 40px -20px rgba(0, 0, 0, 0.5);
    transform: perspective(800px);
    transform-style: preserve-3d;
    transition: transform 160ms ease-out;
    opacity: 1;
  }

  .proof-card__watermark {
    position: absolute;
    top: 50%;
    left: 50%;
    width: 120px;
    height: 120px;
    transform: translate(-50%, -50%) rotate(-14deg);
    color: var(--cobalt);
    opacity: 0.06;
    pointer-events: none;
  }

  .proof-card__scanline {
    position: absolute;
    left: 0;
    right: 0;
    height: 40%;
    background: linear-gradient(180deg, transparent, rgba(0, 71, 255, 0.16), transparent);
    opacity: 0;
    pointer-events: none;
    transform: translateY(-100%);
  }

  .proof-card__sheen {
    position: absolute;
    inset: 0;
    border-radius: inherit;
    background: radial-gradient(circle at var(--mx, 50%) var(--my, 50%), rgba(255, 255, 255, 0.22), transparent 45%);
    mix-blend-mode: overlay;
    opacity: 0;
    transition: opacity 200ms ease;
    pointer-events: none;
  }

  .proof-card.is-hovering .proof-card__sheen {
    opacity: 1;
  }

  .proof-card__header {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 14px;
    padding-bottom: 14px;
    border-bottom: 1px dashed rgba(255, 255, 255, 0.14);
  }

  .proof-card__badge {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: 12px;
    font-weight: 700;
    color: var(--verified-green);
  }

  .proof-card__badge-check {
    width: 14px;
    height: 14px;
  }

  .proof-card__source {
    font-size: 11px;
    color: var(--steel);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .proof-card__row {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 7px 0;
  }

  .proof-card__label {
    font-size: 13px;
    color: var(--steel);
  }

  .proof-card__redaction {
    display: inline-block;
    height: 15px;
    border-radius: 2px;
    cursor: not-allowed;
  }

  .proof-card__redaction--1 { width: 130px; }
  .proof-card__redaction--2 { width: 92px; }
  .proof-card__redaction--3 { width: 150px; }

  .proof-card__redaction-fill {
    display: block;
    width: 100%;
    height: 100%;
    background: #0c0c0c;
    filter: url(#proof-roughen);
    clip-path: inset(0 0 0 0);
  }

  .proof-card__note {
    margin: 14px 0 0;
    font-size: 12px;
    line-height: 1.5;
    color: var(--steel);
  }

  /* ---- Carrousel de fond — 3 bandes de profondeur ----
     La profondeur optique raconte le temps : lointain = ancien, proche =
     récent. La carte principale (opaque) occulte naturellement tout ce qui
     passe "derrière" elle, donc pas de confusion de plan à gérer en plus. */

  /* Enfant direct de #quiz-stage (pas de .quiz-screen, limité à 520px de
     large) : occupe toute la largeur de l'écran pour peupler les côtés
     gauche/droit pendant que la carte reste au centre sur son étroite
     colonne. Toujours dans le DOM, visible uniquement pendant l'écran
     "proof" (voir transitionTo() : classe .is-visible togglée en JS). */
  .proof-bg {
    position: absolute;
    inset: 0;
    overflow: hidden;
    z-index: 0;
    pointer-events: none;
    opacity: 0;
    transition: opacity 300ms ease;
  }

  .proof-bg.is-visible {
    opacity: 1;
  }

  .proof-bg__band {
    position: absolute;
    left: 0;
    right: 0;
  }

  .proof-bg__track {
    display: flex;
    align-items: center;
    gap: 28px;
    width: max-content;
  }

  .proof-bg__band--far {
    top: 10%;
    filter: blur(6px);
    opacity: 0.14;
  }

  .proof-bg__band--mid {
    top: 46%;
    filter: blur(2.5px);
    opacity: 0.22;
  }

  .proof-bg__band--near {
    top: 80%;
    filter: blur(0.5px);
    opacity: 0.3;
  }

  .proof-mini {
    position: relative;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 8px 12px;
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.08);
    white-space: nowrap;
  }

  .proof-mini__bar {
    display: inline-block;
    width: 32px;
    height: 8px;
    border-radius: 2px;
    background: #0c0c0c;
  }

  .proof-mini__sector {
    font-size: 11px;
    color: var(--paper-soft);
  }

  .proof-mini__check {
    display: inline-flex;
    color: var(--verified-green);
  }

  .proof-mini__check svg {
    width: 11px;
    height: 11px;
  }

  .proof-mini__recent {
    position: absolute;
    left: 50%;
    bottom: 100%;
    margin-bottom: 6px;
    padding: 3px 8px;
    border-radius: 999px;
    background: var(--cobalt);
    color: #fff;
    font-size: 10px;
    font-weight: 700;
    white-space: nowrap;
    opacity: 0;
    transform: translateX(-50%) translateY(4px);
  }

  @media (max-width: 380px) {
    .proof-bg__band--far,
    .proof-bg__band--near {
      display: none;
    }
  }

  @media (prefers-reduced-motion: no-preference) {
    .proof-bg__band {
      will-change: transform;
    }

    .proof-bg__band--far {
      animation: proof-bg-scroll 46s linear infinite;
    }

    .proof-bg__band--mid {
      animation: proof-bg-scroll 30s linear infinite reverse;
    }

    .proof-bg__band--near {
      animation: proof-bg-scroll 18s linear infinite;
    }

    .proof-bg__band.is-paused {
      animation-play-state: paused;
    }

    /* Point de trajectoire fixe (pas aléatoire) : approximatif plutôt que
       pixel-parfait — la position exacte de croisement du centre dépend de
       la largeur de viewport (responsive), qu'on ne calcule jamais en JS
       par carte pour rester sur une seule timeline CSS par bande. */
    .proof-mini__recent {
      animation: proof-mini-recent 18s linear infinite;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .proof-bg__band--far,
    .proof-bg__band--mid,
    .proof-bg__band--near {
      animation: none;
    }
  }

  @keyframes proof-bg-scroll {
    from { transform: translateX(0); }
    to { transform: translateX(-50%); }
  }

  @keyframes proof-mini-recent {
    0%, 100% { opacity: 0; transform: translateX(-50%) translateY(4px); }
    38%, 46% { opacity: 1; transform: translateX(-50%) translateY(0); }
    54% { opacity: 0; transform: translateX(-50%) translateY(-4px); }
  }

  @media (prefers-reduced-motion: no-preference) {
    .proof-card.is-animating {
      animation: proof-card-land 550ms cubic-bezier(0.34, 1.56, 0.64, 1) both;
    }

    .proof-card.is-animating .proof-card__watermark {
      opacity: 0;
      animation: proof-watermark-in 1400ms ease-out 250ms forwards;
    }

    .proof-card.is-animating .proof-card__badge-check path {
      stroke-dasharray: 20;
      stroke-dashoffset: 20;
      animation: proof-check-draw 420ms ease-out 650ms forwards;
    }

    .proof-card.is-animating .proof-card__badge {
      animation: proof-badge-flash 320ms ease-out 1060ms both;
    }

    .proof-card.is-animating .proof-card__redaction--1 .proof-card__redaction-fill {
      clip-path: inset(0 100% 0 0);
      animation: proof-marker-fill 420ms linear 950ms forwards;
    }

    .proof-card.is-animating .proof-card__redaction--2 .proof-card__redaction-fill {
      clip-path: inset(0 100% 0 0);
      animation: proof-marker-fill 420ms linear 1250ms forwards;
    }

    .proof-card.is-animating .proof-card__redaction--3 .proof-card__redaction-fill {
      clip-path: inset(0 100% 0 0);
      animation: proof-marker-fill 420ms linear 1550ms forwards;
    }

    .proof-card.is-animating .proof-card__scanline {
      animation: proof-scanline 3200ms ease-in-out 2050ms infinite;
    }

    .proof-card__redaction:hover .proof-card__redaction-fill {
      animation: proof-redaction-jitter 260ms ease-in-out;
    }
  }

  @keyframes proof-card-land {
    0% { opacity: 0; transform: perspective(800px) translateY(18px) scale(0.97); }
    100% { opacity: 1; transform: perspective(800px) translateY(0) scale(1); }
  }

  @keyframes proof-watermark-in {
    to { opacity: 0.06; }
  }

  @keyframes proof-check-draw {
    to { stroke-dashoffset: 0; }
  }

  @keyframes proof-badge-flash {
    0% { text-shadow: none; }
    45% { text-shadow: 0 0 12px rgba(0, 196, 140, 0.85); }
    100% { text-shadow: none; }
  }

  @keyframes proof-marker-fill {
    0% { clip-path: inset(0 100% 0 0); }
    22% { clip-path: inset(0 68% 0 0); }
    38% { clip-path: inset(0 74% 0 0); }
    55% { clip-path: inset(0 42% 0 0); }
    70% { clip-path: inset(0 48% 0 0); }
    88% { clip-path: inset(0 8% 0 0); }
    100% { clip-path: inset(0 0 0 0); }
  }

  @keyframes proof-scanline {
    0%, 100% { transform: translateY(-100%); opacity: 0; }
    12% { opacity: 0.6; }
    50% { transform: translateY(150%); opacity: 0.6; }
    62% { opacity: 0; }
  }

  @keyframes proof-redaction-jitter {
    0%, 100% { transform: translateX(0) rotate(0); }
    20% { transform: translateX(-1.5px) rotate(-0.4deg); }
    40% { transform: translateX(1.5px) rotate(0.4deg); }
    60% { transform: translateX(-1px) rotate(0); }
    80% { transform: translateX(1px) rotate(0); }
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
    max-width: none;
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
            <span class="brand-bar__auth" data-auth-slot></span>
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

  <!-- Le quiz et /inscription résolvent tous les deux l'identité côté
       serveur via supabase/functions/resolve-identity — un seul mécanisme
       d'auth pour toute l'app, quel que soit le point d'entrée. -->
  <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
  <script src="/js/supabase-client.js"></script>
  <script src="/js/auth-state.js"></script>

  <script>
    (function () {
      var phrases = ${JSON.stringify(hero.rotatingPhrases)};
      var el = document.getElementById("rotator-text");
      var box = document.getElementById("rotator");
      if (!el) return;

      var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (reduceMotion) return;

      // Lock the box to the widest phrase's actual rendered width so the
      // typewriter never reflows the hero (badge/buttons/visual stay put)
      // as it types through phrases of very different lengths.
      if (box) {
        var probe = document.createElement("span");
        probe.style.visibility = "hidden";
        probe.style.position = "absolute";
        probe.style.whiteSpace = "nowrap";
        probe.style.font = window.getComputedStyle(el).font;
        document.body.appendChild(probe);
        var widest = 0;
        phrases.forEach(function (p) {
          probe.textContent = p;
          widest = Math.max(widest, probe.getBoundingClientRect().width);
        });
        document.body.removeChild(probe);
        box.style.minWidth = Math.ceil(widest) + "px";
      }

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
      // Écrit réellement dans la table Supabase funnel_events (voir
      // supabase/migrations/0003_funnel_events.sql) — ce n'était qu'un stub
      // console.debug jusqu'ici, aucune donnée n'existait nulle part.
      // Jamais de PII dans les props (voir lead_captured : domaine seulement).
      var currentUserId = null;
      if (window.ColdTrendSupabase) {
        window.ColdTrendSupabase.auth.getUser().then(function (res) {
          currentUserId = res.data && res.data.user ? res.data.user.id : null;
        });
        window.ColdTrendSupabase.auth.onAuthStateChange(function (_event, session) {
          currentUserId = session && session.user ? session.user.id : null;
        });
      }

      // Hash déterministe user -> variante A/B. Pas d'outil tiers : juste
      // assez pour transformer une conviction esthétique en hypothèse
      // vérifiable sous 1-2 semaines de trafic réel. Aucun écran n'est
      // encore gated dessus (aucune expérience active pour l'instant) — la
      // fonction existe pour que le prochain écran testable n'ait qu'à
      // l'appeler, pas à réinventer un mécanisme.
      function getVariant(userId, testName) {
        var seed = String(userId || "anon") + ":" + testName;
        var hash = 0;
        for (var i = 0; i < seed.length; i += 1) {
          hash = (hash * 31 + seed.charCodeAt(i)) | 0;
        }
        return Math.abs(hash) % 2 === 0 ? "A" : "B";
      }

      function trackEvent(name, props, variant) {
        if (window.console && console.debug) {
          console.debug("[trackEvent]", name, props || {});
        }
        var supabase = window.ColdTrendSupabase;
        if (!supabase) return;
        try {
          supabase
            .from("funnel_events")
            .insert({
              user_id: currentUserId,
              event_name: name,
              screen_index: props && typeof props.step_number === "number" ? props.step_number : null,
              variant: variant || null,
              metadata: props || {}
            })
            .then(function (res) {
              if (res.error) console.warn("[ColdTrend] trackEvent insert échoué :", res.error.message);
            });
        } catch (err) {
          console.warn("[ColdTrend] trackEvent a échoué :", err);
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

      // ---- Accumulateur de tags — libellés d'affichage ----------------
      var INTENTION_LABELS = { racheter: "Racheter", copier: "Copier" };
      var DEJA_CHERCHE_LABELS = { yes: "Déjà cherché", no: "Nouvelle recherche" };
      var QUESTION_LABELS = {
        intention: "Intention",
        budget: "Budget",
        temps: "Temps",
        secteur: "Secteur",
        dejaCherche: "Recherche"
      };
      // Ordre d'affichage fixe des tags, indépendant de l'ordre dans lequel
      // les questions ont été répondues.
      var TAG_ORDER = ["intention", "budget", "temps", "secteur", "dejaCherche"];

      function tagValueLabel(id) {
        var value = answers[id];
        if (value === undefined) return null;
        if (id === "intention") return INTENTION_LABELS[value] || value;
        if (id === "budget") return BUDGET_LABELS[value] || value;
        if (id === "temps") return TIME_LABELS[value] || value;
        if (id === "dejaCherche") return DEJA_CHERCHE_LABELS[value] || value;
        if (id === "secteur") {
          return (value || []).map(function (v) { return SECTOR_LABELS[v] || v; }).join(" + ") || null;
        }
        return String(value);
      }

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
      var transitionInProgress = false;
      // editContext non-null pendant une édition ponctuelle depuis un tag :
      // { questionId, returnIndex } où returnIndex est un index de
      // questionScreens, ou la chaîne "result" si l'édition a été lancée
      // depuis l'écran de résultat.
      var editContext = null;

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

        if (id === "auth") {
          var authEmailInput = document.getElementById("quiz-auth-email");
          var authPasswordInput = document.getElementById("quiz-auth-password");
          nextBtn.disabled = !(EMAIL_RE.test(authEmailInput.value.trim()) && authPasswordInput.value.length >= 6);
          return;
        }

        if (id === "proof") {
          // Écran purement informatif, rien à répondre — mais openQuiz()
          // désactive TOUS les boutons .quiz-next à l'ouverture (y compris
          // celui-ci), donc il faut le réactiver explicitement ici, pas
          // juste "ne pas y toucher".
          nextBtn.disabled = false;
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
        // Verrou anti-race-condition : un clic rapide sur plusieurs tags
        // (ou tag + bouton Retour) pendant qu'une transition est déjà en
        // cours est ignoré plutôt que d'empiler des animations concurrentes
        // qui laisseraient le state (currentQuestionIndex, editContext)
        // incohérent avec ce qui est réellement affiché.
        if (transitionInProgress) return;
        var prevEl = currentScreenEl;
        if (prevEl === nextEl) return;

        transitionInProgress = true;

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
          transitionInProgress = false;
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

        var isProofScreen = nextEl.getAttribute("data-id") === "proof";
        var proofBgEl = document.getElementById("proof-bg");
        if (proofBgEl) proofBgEl.classList.toggle("is-visible", isProofScreen);
        if (isProofScreen) {
          var proofCardEl = document.getElementById("proof-card");
          if (proofCardEl && !proofCardEl.classList.contains("is-animating")) {
            proofCardEl.classList.add("is-animating");
          }
        }

        var stepName = nextEl.getAttribute("data-step-name");
        if (stepName) {
          var stepIndexAttr = nextEl.getAttribute("data-index");
          var stepNumber = stepIndexAttr !== null ? Number(stepIndexAttr) + 1 : TOTAL_STEPS;
          trackEvent("funnel_step_view", { step_number: stepNumber, step_name: stepName });
        }
      }

      // Tilt 3D + reflet suivant le curseur — carte "preuve" uniquement,
      // amplitude plafonnée à 6°, transform only. N'active rien sur tactile
      // (pas de mousemove) ni en prefers-reduced-motion.
      (function initProofCardTilt() {
        var card = document.getElementById("proof-card");
        if (!card || reduceMotion) return;
        if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;

        var TILT_MAX_DEG = 6;
        var pendingFrame = null;

        card.addEventListener("mousemove", function (e) {
          if (pendingFrame) return;
          pendingFrame = window.requestAnimationFrame(function () {
            pendingFrame = null;
            var rect = card.getBoundingClientRect();
            var px = (e.clientX - rect.left) / rect.width;
            var py = (e.clientY - rect.top) / rect.height;
            var rotateY = Math.max(-TILT_MAX_DEG, Math.min(TILT_MAX_DEG, (px - 0.5) * TILT_MAX_DEG * 2));
            var rotateX = Math.max(-TILT_MAX_DEG, Math.min(TILT_MAX_DEG, (0.5 - py) * TILT_MAX_DEG * 2));
            card.style.transform = "perspective(800px) rotateX(" + rotateX.toFixed(2) + "deg) rotateY(" + rotateY.toFixed(2) + "deg)";
            card.style.setProperty("--mx", (px * 100).toFixed(1) + "%");
            card.style.setProperty("--my", (py * 100).toFixed(1) + "%");
          });
        });

        card.addEventListener("mouseenter", function () {
          card.classList.add("is-hovering");
          card.style.willChange = "transform";
        });

        card.addEventListener("mouseleave", function () {
          card.classList.remove("is-hovering");
          card.style.transform = "perspective(800px)";
          card.style.willChange = "";
        });
      })();

      // Pause le carrousel de fond (3 bandes) quand l'onglet est masqué —
      // pas de raison de faire tourner ces boucles CSS en arrière-plan.
      document.addEventListener("visibilitychange", function () {
        document.querySelectorAll(".proof-bg__band").forEach(function (band) {
          band.classList.toggle("is-paused", document.hidden);
        });
      });

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

        persistQuizAnswers();

        var titleEl = document.getElementById("quiz-result-title");
        titleEl.textContent = "Voici ce qu'on a trouvé.";

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

        // Attache l'identité au lien Stripe (client_reference_id) : sans ça,
        // supabase/functions/stripe-webhook ne peut pas savoir quel profil
        // vient de payer et ignore l'événement plutôt que de deviner.
        var supabase = window.ColdTrendSupabase;
        var payBtn = document.getElementById("quiz-pay-btn");
        if (supabase && payBtn) {
          supabase.auth.getUser().then(function (res) {
            var user = res.data ? res.data.user : null;
            if (!user) return;
            try {
              var url = new URL(payBtn.href);
              url.searchParams.set("client_reference_id", user.id);
              if (user.email) url.searchParams.set("prefilled_email", user.email);
              payBtn.href = url.toString();
            } catch (err) {
              console.warn("[ColdTrend] impossible d'attacher client_reference_id au lien Stripe :", err);
            }
          });
        }

        transitionTo(paymentScreen, "forward");
      }

      function goForwardFromQuestion() {
        if (editContext) {
          handleEditSave();
          return;
        }

        var currentEl = questionScreens[currentQuestionIndex];
        var currentId = currentEl.getAttribute("data-id");
        trackEvent("funnel_step_complete", {
          step_number: currentQuestionIndex + 1,
          answer: answers[currentId]
        });

        navHistory.push(currentQuestionIndex);
        var next = findNextQuestionIndex(currentQuestionIndex);
        currentQuestionIndex = next;
        updateBackVisibility();
        persistProgress(next);
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

      // ---- Écran "auth" (première question) : resolve-identity + transition
      // optimiste --------------------------------------------------------
      //
      // Un seul appel à l'Edge Function resolve-identity (voir
      // supabase/functions/resolve-identity/) gère "nouveau compte ou
      // existant" côté serveur, avec des privilèges admin jamais exposés
      // côté client.
      // La transition vers la question 2 démarre AVANT sa réponse : l'appel
      // réseau se termine en arrière-plan pendant que la personne lit déjà
      // la question suivante. Si ça échoue (mauvais mot de passe pour un
      // email existant, par exemple), une bannière discrète permet de
      // revenir corriger sans bloquer bêtement en avant.
      var authResolutionPromise = null;

      function handleAuthSubmit() {
        var emailInput = document.getElementById("quiz-auth-email");
        var passwordInput = document.getElementById("quiz-auth-password");
        var email = emailInput.value.trim();
        var password = passwordInput.value;
        if (!EMAIL_RE.test(email) || password.length < 6) return;

        hideAuthBanner();
        answers.email = email;
        trackEvent("funnel_step_complete", { step_number: currentQuestionIndex + 1, answer: "submitted" });

        // Transition optimiste — identique à goForwardFromQuestion, mais
        // déclenchée AVANT que resolveIdentityRequest() n'ait répondu.
        navHistory.push(currentQuestionIndex);
        var next = findNextQuestionIndex(currentQuestionIndex);
        currentQuestionIndex = next;
        updateBackVisibility();
        setProgress(next);
        var screenEl = questionScreens[next];
        updateNextEnabled(screenEl);
        transitionTo(screenEl, "forward");

        authResolutionPromise = resolveIdentityRequest(email, password);
        persistProgress(next);
      }

      function resolveIdentityRequest(email, password) {
        var supabase = window.ColdTrendSupabase;
        if (!supabase) {
          showAuthBanner("Service indisponible pour le moment.");
          return Promise.resolve(false);
        }

        return fetch(supabase.supabaseUrl + "/functions/v1/resolve-identity", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: supabase.supabaseKey,
            Authorization: "Bearer " + supabase.supabaseKey
          },
          body: JSON.stringify({ email: email, password: password })
        })
          .then(function (res) {
            return res.json().then(function (body) {
              return { ok: res.ok, body: body };
            });
          })
          .then(function (result) {
            if (!result.ok || !result.body.session) {
              showAuthBanner((result.body && result.body.error) || "Un souci avec ton compte.");
              return false;
            }
            return supabase.auth
              .setSession({
                access_token: result.body.session.access_token,
                refresh_token: result.body.session.refresh_token
              })
              .then(function () {
                showConnectedBadge();
                return true;
              });
          })
          .catch(function (err) {
            console.warn("[ColdTrend] resolve-identity a échoué :", err);
            showAuthBanner("Un souci avec ton compte.");
            return false;
          });
      }

      function showAuthBanner(message) {
        var banner = document.getElementById("quiz-auth-banner");
        var textEl = document.getElementById("quiz-auth-banner-text");
        if (!banner || !textEl) return;
        textEl.textContent = message;
        banner.classList.add("is-visible");
      }

      function hideAuthBanner() {
        var banner = document.getElementById("quiz-auth-banner");
        if (banner) banner.classList.remove("is-visible");
      }

      function showConnectedBadge() {
        var badge = document.getElementById("quiz-connected-badge");
        if (badge) badge.classList.add("is-visible");
      }

      function fixAuthAndGoBack() {
        hideAuthBanner();
        navHistory = [];
        currentQuestionIndex = 0;
        setProgress(0, true);
        updateBackVisibility();
        var authScreen = questionScreens[0];
        var emailInput = document.getElementById("quiz-auth-email");
        var passwordInput = document.getElementById("quiz-auth-password");
        emailInput.value = answers.email || "";
        passwordInput.value = "";
        updateNextEnabled(authScreen);
        transitionTo(authScreen, "back");
        passwordInput.focus();
      }

      // Sauvegarde les réponses du quiz dans profiles une fois le résultat
      // atteint — attend d'abord la résolution de resolve-identity (déjà
      // presque certainement terminée à ce stade, vu le temps passé sur les
      // questions suivantes) pour être sûr d'avoir une session valide.
      function persistQuizAnswers() {
        var supabase = window.ColdTrendSupabase;
        if (!supabase) return;
        var pending = authResolutionPromise || Promise.resolve(true);
        pending
          .then(function () {
            return supabase.auth.getUser();
          })
          .then(function (userRes) {
            var user = userRes.data ? userRes.data.user : null;
            if (!user) return;
            return supabase
              .from("profiles")
              .update({
                intention: answers.intention || null,
                budget: answers.budget || null,
                temps: answers.temps || null,
                secteur: answers.secteur || [],
                deja_cherche: answers.dejaCherche === "yes",
                match_count: answers.matchCount,
                funnel_last_step: 6,
                converted: true
              })
              .eq("id", user.id)
              .then(function (res) {
                if (res.error) {
                  console.warn("[ColdTrend] mise à jour profiles échouée :", res.error.message);
                }
              });
          })
          .catch(function (err) {
            console.warn("[ColdTrend] persistQuizAnswers a échoué :", err);
          });
      }

      // Persiste la progression après CHAQUE question répondue (pas
      // seulement au résultat) : c'est ce qui rend la reprise de session
      // possible — sans ça, funnel_last_step ne reflète jamais l'état réel
      // tant que le quiz n'est pas fini.
      function persistProgress(stepIndex) {
        var supabase = window.ColdTrendSupabase;
        if (!supabase) return;
        var pending = authResolutionPromise || Promise.resolve(true);
        pending
          .then(function () {
            return supabase.auth.getUser();
          })
          .then(function (userRes) {
            var user = userRes.data ? userRes.data.user : null;
            if (!user) return;
            return supabase
              .from("profiles")
              .update({
                intention: answers.intention || null,
                budget: answers.budget || null,
                temps: answers.temps || null,
                secteur: answers.secteur || [],
                deja_cherche: answers.dejaCherche === "yes" ? true : answers.dejaCherche === "no" ? false : null,
                funnel_last_step: stepIndex
              })
              .eq("id", user.id);
          })
          .catch(function (err) {
            console.warn("[ColdTrend] persistProgress a échoué :", err);
          });
      }

      // Réapplique l'état "sélectionné" des options déjà répondues (question
      // par question) après une restauration de session — sans ça, revenir
      // en arrière (bouton Retour) sur un écran déjà répondu l'afficherait
      // vide alors que answers[id] contient bien la réponse.
      function restoreAnswersUI() {
        questionScreens.forEach(function (screenEl) {
          var id = screenEl.getAttribute("data-id");
          if (id === "auth" || answers[id] === undefined) return;
          var optionsWrap = screenEl.querySelector("[data-quiz-options]");
          if (!optionsWrap) return;
          var type = optionsWrap.getAttribute("data-type");
          var selectedValues = type === "multi" ? answers[id] || [] : [answers[id]];
          Array.prototype.forEach.call(optionsWrap.querySelectorAll(".quiz-option"), function (btn) {
            btn.classList.toggle("is-selected", selectedValues.indexOf(btn.getAttribute("data-value")) !== -1);
          });
          if (id === "dejaCherche" && answers.dejaCherche) {
            var selectedBtn = optionsWrap.querySelector('.quiz-option[data-value="' + answers.dejaCherche + '"]');
            var followupEl3 = document.getElementById("quiz-followup");
            var followupText2 = selectedBtn ? selectedBtn.getAttribute("data-followup") : null;
            if (followupEl3 && followupText2) {
              followupEl3.textContent = followupText2;
              followupEl3.classList.add("is-visible");
            }
          }
          updateNextEnabled(screenEl);
        });
        renderTags();
      }

      // ---- Accumulateur de tags -----------------------------------------
      var quizTagsEl = document.getElementById("quiz-tags");
      var quizEditBarEl = document.getElementById("quiz-edit-bar");
      var quizToastEl = document.getElementById("quiz-toast");

      function showToast(message) {
        if (!quizToastEl) return;
        quizToastEl.textContent = message;
        quizToastEl.classList.add("is-visible");
        window.setTimeout(function () {
          quizToastEl.classList.remove("is-visible");
        }, 2200);
      }

      function renderTags() {
        if (!quizTagsEl) return;
        var html = "";
        TAG_ORDER.forEach(function (id) {
          var valueLabel = tagValueLabel(id);
          if (valueLabel === null) return;
          var isEditing = editContext && editContext.questionId === id;
          html +=
            '<button type="button" class="quiz-tag' +
            (isEditing ? " is-editing" : "") +
            '" data-tag-id="' +
            id +
            '" aria-label="Modifier la réponse : ' +
            QUESTION_LABELS[id] +
            " — " +
            valueLabel +
            '">' +
            '<span class="quiz-tag__label">' +
            QUESTION_LABELS[id] +
            "</span> " +
            valueLabel +
            "</button>";
        });
        quizTagsEl.innerHTML = html;
        quizTagsEl.classList.toggle("is-visible", html !== "");
      }

      // Retire un tag avec un fade-out visible avant de reconstruire la
      // liste — jamais une disparition brutale, et toujours suite à une
      // action que l'utilisateur vient de faire (ici : intention basculée
      // vers "copier", qui rend budget inapplicable).
      function fadeOutAndRemoveTag(id) {
        var tagEl = quizTagsEl ? quizTagsEl.querySelector('[data-tag-id="' + id + '"]') : null;
        if (!tagEl) {
          renderTags();
          return;
        }
        tagEl.classList.add("is-removing");
        window.setTimeout(renderTags, 220);
      }

      // Unique dépendance réelle entre questions dans ce quiz (voir audit) :
      // intention -> budget. Si intention passe à "copier" et que budget
      // avait déjà une réponse, budget devient skip conditionnel (moteur
      // existant, isSkipped()) : son tag doit disparaître proprement et sa
      // réponse être purgée, jamais laissée en state fantôme.
      function propagateAnswerDependencies(changedId) {
        if (changedId === "intention" && answers.intention === "copier" && answers.budget !== undefined) {
          delete answers.budget;
          fadeOutAndRemoveTag("budget");
        }
      }

      function hideEditBar() {
        if (quizEditBarEl) quizEditBarEl.classList.remove("is-visible");
      }

      function showEditBar(questionId) {
        if (!quizEditBarEl) return;
        var textEl = document.getElementById("quiz-edit-bar-text");
        if (textEl) textEl.textContent = "Tu modifies : " + QUESTION_LABELS[questionId];
        quizEditBarEl.classList.add("is-visible");
      }

      // Clic sur un tag : saute directement à l'écran concerné, avec la
      // réponse actuelle déjà visible (restoreAnswersUI), sans passer par
      // tous les écrans intermédiaires ni perdre les réponses suivantes.
      function enterEditMode(questionId) {
        if (transitionInProgress) return;
        var targetIndex = -1;
        for (var i = 0; i < questionScreens.length; i += 1) {
          if (questionScreens[i].getAttribute("data-id") === questionId) {
            targetIndex = i;
            break;
          }
        }
        if (targetIndex === -1) return;

        editContext = {
          questionId: questionId,
          returnIndex: currentScreenEl === resultScreen ? "result" : currentQuestionIndex
        };

        currentQuestionIndex = targetIndex;
        setProgress(targetIndex, true);
        var screenEl = questionScreens[targetIndex];
        transitionTo(screenEl, "back");
        restoreAnswersUI();
        updateNextEnabled(screenEl);
        showEditBar(questionId);
      }

      // Retour sans modification (l'utilisateur voulait juste vérifier) :
      // pas de toast, rien n'a changé.
      function exitEditModeViewOnly() {
        if (!editContext || transitionInProgress) return;
        var ctx = editContext;
        editContext = null;
        hideEditBar();
        returnFromEdit(ctx);
      }

      // Réponse modifiée + Continuer cliqué : propage les dépendances,
      // persiste, prévient explicitement ("Réponse mise à jour"), puis
      // revient au point de départ de l'édition.
      function handleEditSave() {
        var ctx = editContext;
        editContext = null;
        hideEditBar();
        propagateAnswerDependencies(ctx.questionId);
        persistProgress(currentQuestionIndex);
        showToast("Réponse mise à jour");
        returnFromEdit(ctx, true);
      }

      function returnFromEdit(ctx, answersChanged) {
        if (ctx.returnIndex === "result") {
          // Le compteur ne doit jamais rester affiché avec une valeur
          // devenue fausse après une correction : on force son recalcul
          // plutôt que de réutiliser answers.matchCount mis en cache.
          if (answersChanged) delete answers.matchCount;
          goToResult();
        } else {
          currentQuestionIndex = ctx.returnIndex;
          setProgress(ctx.returnIndex, true);
          updateBackVisibility();
          transitionTo(questionScreens[ctx.returnIndex], "back");
        }
        renderTags();
      }

      // Reconstruit navHistory jusqu'à startIndex (exclu) en respectant les
      // skip conditionnels, pour que le bouton Retour fonctionne normalement
      // juste après une reprise de session.
      function buildNavHistoryUpTo(startIndex) {
        var built = [];
        var idx = findNextQuestionIndex(-1);
        while (idx < startIndex) {
          built.push(idx);
          idx = findNextQuestionIndex(idx);
        }
        return built;
      }

      // Si une session non-anonyme existe déjà (retour sur un appareil déjà
      // connecté — la session est persistée nativement en localStorage par
      // le SDK), l'écran auth est sauté. Si en plus funnel_last_step indique
      // un quiz commencé mais pas fini, les réponses déjà données sont
      // restaurées depuis profiles — pas de redémarrage à zéro.
      function determineStartIndex() {
        var supabase = window.ColdTrendSupabase;
        if (!supabase) return Promise.resolve(0);
        return supabase.auth
          .getSession()
          .then(function (res) {
            var user = res.data.session ? res.data.session.user : null;
            if (!user || user.is_anonymous) return 0;
            showConnectedBadge();
            return supabase
              .from("profiles")
              .select("intention, budget, temps, secteur, deja_cherche, funnel_last_step")
              .eq("id", user.id)
              .single()
              .then(function (profileRes) {
                var profile = profileRes.data;
                var lastStep = profile ? profile.funnel_last_step || 0 : 0;
                if (!profile || lastStep <= 0 || lastStep >= questionScreens.length) {
                  return findNextQuestionIndex(0);
                }
                answers.intention = profile.intention || undefined;
                answers.budget = profile.budget || undefined;
                answers.temps = profile.temps || undefined;
                answers.secteur = profile.secteur || undefined;
                if (profile.deja_cherche === true) answers.dejaCherche = "yes";
                else if (profile.deja_cherche === false) answers.dejaCherche = "no";
                navHistory = buildNavHistoryUpTo(lastStep);
                restoreAnswersUI();
                updateBackVisibility();
                return lastStep;
              });
          })
          .catch(function (err) {
            console.warn("[ColdTrend] determineStartIndex a échoué :", err);
            return 0;
          });
      }

      function openQuiz() {
        answers = {};
        navHistory = [];
        currentQuestionIndex = 0;
        currentScreenEl = null;
        reachedResult = false;
        authResolutionPromise = null;
        editContext = null;
        hideEditBar();
        if (quizTagsEl) {
          quizTagsEl.innerHTML = "";
          quizTagsEl.classList.remove("is-visible");
        }

        stage.querySelectorAll(".quiz-option, .quiz-chip").forEach(function (btn) {
          btn.classList.remove("is-selected");
        });
        stage.querySelectorAll(".quiz-next").forEach(function (btn) {
          btn.disabled = true;
        });
        var authEmailInput = document.getElementById("quiz-auth-email");
        var authPasswordInput = document.getElementById("quiz-auth-password");
        if (authEmailInput) authEmailInput.value = "";
        if (authPasswordInput) authPasswordInput.value = "";
        hideAuthBanner();
        var badge = document.getElementById("quiz-connected-badge");
        if (badge) badge.classList.remove("is-visible");
        var followupEl = document.getElementById("quiz-followup");
        if (followupEl) followupEl.classList.remove("is-visible");

        overlay.classList.add("is-open");
        document.body.style.overflow = "hidden";
        resetScreensVisualState();
        setProgress(0, true);
        updateBackVisibility();

        determineStartIndex().then(function (startIndex) {
          currentQuestionIndex = startIndex;
          setProgress(startIndex, true);
          var screenEl = questionScreens[startIndex];
          updateNextEnabled(screenEl);
          transitionTo(screenEl, "forward");
        });
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
          propagateAnswerDependencies(id);
          renderTags();
          updateNextEnabled(screenEl);
          return;
        }

        if (e.target.closest("#quiz-auth-submit")) {
          handleAuthSubmit();
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
        if (e.target.id === "quiz-auth-email" || e.target.id === "quiz-auth-password") {
          updateNextEnabled(e.target.closest(".quiz-screen"));
        }
      });

      stage.addEventListener("keydown", function (e) {
        if (e.key !== "Enter") return;
        if (e.target.id === "quiz-auth-email" || e.target.id === "quiz-auth-password") {
          e.preventDefault();
          var submitBtn = document.getElementById("quiz-auth-submit");
          if (submitBtn && !submitBtn.disabled) submitBtn.click();
        }
      });

      backBtn.addEventListener("click", function () {
        if (navHistory.length === 0) return;
        // Le bouton Retour classique navigue dans l'historique normal du
        // quiz, pas dans le point de retour d'une édition ponctuelle — les
        // deux mécanismes ne doivent jamais se mélanger.
        if (editContext) {
          editContext = null;
          hideEditBar();
          renderTags();
        }
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
      var authBannerFixBtn = document.getElementById("quiz-auth-banner-fix");
      if (authBannerFixBtn) authBannerFixBtn.addEventListener("click", fixAuthAndGoBack);

      if (quizTagsEl) {
        quizTagsEl.addEventListener("click", function (e) {
          var tagBtn = e.target.closest(".quiz-tag");
          if (!tagBtn) return;
          enterEditMode(tagBtn.getAttribute("data-tag-id"));
        });
      }

      var editBarReturnBtn = document.getElementById("quiz-edit-bar-return");
      if (editBarReturnBtn) editBarReturnBtn.addEventListener("click", exitEditModeViewOnly);

      // ---- Google OAuth (position primaire sur l'écran auth) -----------
      // signInWithOAuth() redirige la page entière vers Google puis vers
      // redirectTo — l'overlay du quiz est donc détruit par ce
      // rechargement. On pose un flag sessionStorage AVANT de partir, pour
      // rouvrir automatiquement le quiz au retour (voir plus bas, à
      // l'initialisation de la page) : determineStartIndex() se charge de
      // reprendre au bon écran, exactement comme pour email/mot de passe.
      var QUIZ_RESUME_FLAG = "coldtrend_resume_quiz";
      var googleBtn = document.getElementById("quiz-google-btn");
      if (googleBtn) {
        googleBtn.addEventListener("click", function () {
          var supabase = window.ColdTrendSupabase;
          if (!supabase) return;
          try {
            sessionStorage.setItem(QUIZ_RESUME_FLAG, "1");
          } catch (err) {
            console.warn("[ColdTrend] sessionStorage indisponible :", err);
          }
          supabase.auth.signInWithOAuth({
            provider: "google",
            options: { redirectTo: window.location.origin + "/" }
          });
        });
      }

      // Retour de Google : la page vient de recharger avec une session
      // fraîche dans l'URL (fragment #access_token=...), auto-détectée par
      // le SDK. On rouvre le quiz dès que la session est confirmée.
      (function resumeQuizAfterOAuthRedirect() {
        var shouldResume;
        try {
          shouldResume = sessionStorage.getItem(QUIZ_RESUME_FLAG) === "1";
        } catch (err) {
          shouldResume = false;
        }
        if (!shouldResume) return;

        function tryResume() {
          var supabase = window.ColdTrendSupabase;
          if (!supabase) return;
          supabase.auth.getSession().then(function (res) {
            if (res.data.session) {
              try {
                sessionStorage.removeItem(QUIZ_RESUME_FLAG);
              } catch (err) {
                /* pas grave si on ne peut pas nettoyer le flag */
              }
              openQuiz();
            }
          });
        }

        if (window.ColdTrendSupabase) {
          tryResume();
        } else {
          document.addEventListener("coldtrend:supabase-ready", tryResume, { once: true });
        }
      })();

      // Retour depuis le lien de relance d'abandon (email envoyé par
      // supabase/functions/send-abandon-emails) : ?resume=quiz redirige ici
      // avec un magic link qui vient d'établir la session. On rouvre le
      // quiz — determineStartIndex() se charge de reprendre au bon écran,
      // exactement comme pour Google ou email/mot de passe.
      (function resumeQuizFromRecoveryLink() {
        var params = new URLSearchParams(window.location.search);
        if (params.get("resume") !== "quiz") return;

        params.delete("resume");
        var cleanUrl = window.location.pathname + (params.toString() ? "?" + params.toString() : "");
        window.history.replaceState({}, "", cleanUrl);

        function tryResume() {
          var supabase = window.ColdTrendSupabase;
          if (!supabase) return;
          supabase.auth.getSession().then(function (res) {
            if (res.data.session) openQuiz();
          });
        }

        if (window.ColdTrendSupabase) {
          tryResume();
        } else {
          document.addEventListener("coldtrend:supabase-ready", tryResume, { once: true });
        }
      })();

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
  ${crispWidgetScript()}
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

// Carrousel de fond de l'écran "proof" — 3 bandes de profondeur, chacune
// une seule timeline CSS (jamais une animation par mini-carte). Vocabulaire
// de secteur repris à l'identique de quiz.sectorLabels : aucune catégorie
// inventée qui divergerait du reste du produit (pas de "Productivité" ou
// autre vertical qui n'existe nulle part ailleurs dans ColdTrend).
function renderProofBackground() {
  const sectorCycle = [quiz.sectorLabels.b2b, quiz.sectorLabels.b2c, quiz.sectorLabels.both];

  function miniCard(i, withRecentLabel) {
    const sector = sectorCycle[i % sectorCycle.length];
    return `<span class="proof-mini">
              <span class="proof-mini__bar"></span>
              <span class="proof-mini__sector">SaaS · ${sector}</span>
              <span class="proof-mini__check">${ICON_CHECK_SMALL}</span>
              ${withRecentLabel ? '<span class="proof-mini__recent">Ajouté récemment</span>' : ""}
            </span>`;
  }

  // Dupliqué une fois pour une boucle transform:translateX(-50%) sans
  // coupure visible — une seule timeline anime tout le groupe.
  function track(count, recentIndex) {
    const cards = Array.from({ length: count }, (_, i) => miniCard(i, i === recentIndex)).join("\n              ");
    return cards + "\n              " + cards;
  }

  return `<div class="proof-bg" id="proof-bg" aria-hidden="true">
            <div class="proof-bg__band proof-bg__band--far"><div class="proof-bg__track">
              ${track(8, -1)}
            </div></div>
            <div class="proof-bg__band proof-bg__band--mid"><div class="proof-bg__track">
              ${track(8, -1)}
            </div></div>
            <div class="proof-bg__band proof-bg__band--near"><div class="proof-bg__track">
              ${track(8, 3)}
            </div></div>
          </div>`;
}

function renderQuizQuestionScreen(question, index) {
  const skipAttrs = question.skipIf
    ? ` data-skip-field="${question.skipIf.field}" data-skip-equals="${question.skipIf.equals}"`
    : "";

  if (question.type === "auth") {
    // Première question du parcours, pas un gate à part : même carte, même
    // bouton "Continuer" (classe .quiz-next partagée avec les autres
    // écrans). Le fond en mesh-gradient (.quiz-auth-mesh) et le stagger
    // d'apparition des deux champs (.quiz-auth-field--1/--2) sont les seuls
    // éléments visuels propres à cet écran.
    return `<div class="quiz-screen" data-screen="question" data-index="${index}" data-id="${question.id}" data-step-name="${question.stepName}"${skipAttrs}>
          <div class="quiz-auth-mesh" aria-hidden="true"></div>
          <h2 class="quiz-question-title">${question.title}</h2>
          <p class="quiz-subtext">${question.subtext}</p>
          <button type="button" class="quiz-google-btn" id="quiz-google-btn">
            ${ICON_GOOGLE}
            Continuer avec Google
          </button>
          <div class="quiz-auth-divider"><span>ou</span></div>
          <div class="quiz-field quiz-auth-field quiz-auth-field--1">
            <label class="quiz-label" for="quiz-auth-email">Email</label>
            <input class="quiz-input" id="quiz-auth-email" name="email" type="email" autocomplete="email" required />
          </div>
          <div class="quiz-field quiz-auth-field quiz-auth-field--2">
            <label class="quiz-label" for="quiz-auth-password">Mot de passe</label>
            <input class="quiz-input" id="quiz-auth-password" name="password" type="password" autocomplete="new-password" minlength="6" required />
            <span class="quiz-field__error" id="quiz-auth-error" aria-live="polite"></span>
          </div>
          <div class="quiz-footer">
            <button class="btn btn--primary quiz-next" id="quiz-auth-submit" type="button" disabled>Continuer</button>
          </div>
        </div>`;
  }

  if (question.type === "proof") {
    // Concept : un relevé de vérification caviardé, pas une carte marketing
    // polie. Le filigrane, le sceau qui se grave et les barres noircies à
    // bord irrégulier matérialisent littéralement "la donnée existe, elle
    // est vraie, elle est juste protégée" — rien n'est fabriqué, juste
    // partiellement masqué. Voir initProofCard() plus bas pour le tilt 3D,
    // la séquence d'entrée orchestrée et le tremblement au survol.
    return `<div class="quiz-screen" data-screen="question" data-index="${index}" data-id="${question.id}" data-step-name="${question.stepName}"${skipAttrs}>
          <h2 class="quiz-question-title">${question.title}</h2>
          <p class="quiz-subtext">${question.subtext}</p>
          <div class="proof-card" id="proof-card">
            <div class="proof-card__watermark" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6l7-3z" stroke="currentColor" stroke-width="1.5"/>
                <path d="M9 12l2 2 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </div>
            <div class="proof-card__scanline" aria-hidden="true"></div>
            <div class="proof-card__sheen" aria-hidden="true"></div>
            <div class="proof-card__header">
              <span class="proof-card__badge">
                <svg class="proof-card__badge-check" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                  <path d="M20 6L9 17l-5-5" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
                Vérifié
              </span>
              <span class="proof-card__source">Stripe × TrustMRR</span>
            </div>
            <div class="proof-card__row">
              <span class="proof-card__label">SaaS</span>
              <span class="proof-card__redaction proof-card__redaction--1" aria-hidden="true"><span class="proof-card__redaction-fill"></span></span>
            </div>
            <div class="proof-card__row">
              <span class="proof-card__label">MRR mensuel</span>
              <span class="proof-card__redaction proof-card__redaction--2" aria-hidden="true"><span class="proof-card__redaction-fill"></span></span>
            </div>
            <div class="proof-card__row">
              <span class="proof-card__label">Historique</span>
              <span class="proof-card__redaction proof-card__redaction--3" aria-hidden="true"><span class="proof-card__redaction-fill"></span></span>
            </div>
            <p class="proof-card__note">Nom et montant exact masqués ici — la fiche complète est débloquée avec ton accès, jamais un chiffre inventé.</p>
          </div>
          <svg width="0" height="0" style="position:absolute" aria-hidden="true">
            <filter id="proof-roughen" x="-20%" y="-100%" width="140%" height="300%">
              <feTurbulence type="fractalNoise" baseFrequency="0.9 0.6" numOctaves="2" seed="7" result="noise"></feTurbulence>
              <feDisplacementMap in="SourceGraphic" in2="noise" scale="3" xChannelSelector="R" yChannelSelector="G"></feDisplacementMap>
            </filter>
          </svg>
          <div class="quiz-footer">
            <button class="btn btn--primary quiz-next" type="button">Continuer</button>
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
      <span class="connected-badge" id="quiz-connected-badge" aria-live="polite">${ICON_CHECK_SMALL} Connecté</span>
      <button class="quiz-close" id="quiz-close-btn" type="button" aria-label="Fermer">${ICON_CLOSE}</button>
    </div>
    <div class="quiz-progress" id="quiz-progress">
      ${Array.from({ length: totalSteps })
        .map(() => `<span class="quiz-progress__seg"><span class="quiz-progress__seg-fill"></span></span>`)
        .join("\n      ")}
    </div>
    <div class="quiz-banner quiz-banner--alert" id="quiz-auth-banner" role="alert">
      <span id="quiz-auth-banner-text"></span>
      <button type="button" class="quiz-banner__action" id="quiz-auth-banner-fix">Corriger</button>
    </div>
    <div class="quiz-tags" id="quiz-tags" aria-label="Tes réponses"></div>
    <div class="quiz-edit-bar" id="quiz-edit-bar">
      <span id="quiz-edit-bar-text"></span>
      <button type="button" class="quiz-banner__action" id="quiz-edit-bar-return">Retour à mon résultat</button>
    </div>
    <div class="quiz-toast" id="quiz-toast" role="status" aria-live="polite"></div>
    <div class="quiz-stage" id="quiz-stage">
      ${renderProofBackground()}
      ${questionScreens}

      <div class="quiz-screen quiz-result" data-screen="result" data-step-name="resultat">
        <h2 class="quiz-question-title" id="quiz-result-title">Voici ce qu'on a trouvé.</h2>
        <div class="quiz-result__count" id="quiz-count-total">0</div>
        <p class="quiz-result__count-label">SaaS vérifiés dans la base</p>
        <div class="quiz-result__match" id="quiz-count-match">0</div>
        <p class="quiz-result__match-label" id="quiz-match-label">correspondent à ton profil</p>
        <p class="quiz-result-meta" id="quiz-result-meta"></p>
        <button class="btn btn--primary btn--full" id="quiz-see-offer-btn" type="button">Voir mon accès</button>
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
const ICON_GOOGLE =
  '<svg width="18" height="18" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M23.52 12.27c0-.85-.08-1.66-.22-2.44H12v4.62h6.47a5.53 5.53 0 01-2.4 3.63v3h3.88c2.27-2.09 3.57-5.17 3.57-8.81z" fill="#4285F4"/><path d="M12 24c3.24 0 5.96-1.07 7.95-2.92l-3.88-3c-1.08.72-2.45 1.15-4.07 1.15-3.13 0-5.78-2.11-6.73-4.96H1.27v3.1A12 12 0 0012 24z" fill="#34A853"/><path d="M5.27 14.27a7.2 7.2 0 010-4.54v-3.1H1.27a12 12 0 000 10.74l4-3.1z" fill="#FBBC05"/><path d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.44-3.44C17.95 1.19 15.24 0 12 0A12 12 0 001.27 6.63l4 3.1C6.22 6.86 8.87 4.75 12 4.75z" fill="#EA4335"/></svg>';

// ---------------------------------------------------------------------------
// Widget de chat Crisp — présent sur toutes les pages (landing, quiz, succès,
// pages d'auth). Le website ID est public par conception (identifiant
// d'intégration, pas un secret) — safe à committer, comme l'anon key
// Supabase. La couleur du lanceur ne se pilote PAS via JS côté Crisp
// (uniquement Settings → Chatbox Settings → Chatbox Appearance → Advanced
// Chatbox Customization dans leur dashboard) : renseigner #0047FF (cobalt,
// couleur de marque) là-bas manuellement.
function crispWidgetScript() {
  return `<script type="text/javascript">
window.$crisp = [];
window.CRISP_WEBSITE_ID = "70b4bb4e-b6d9-44be-b1c3-a6a941ff5150";
(function () {
  var d = document;
  var s = d.createElement("script");
  s.src = "https://client.crisp.chat/l.js";
  s.async = 1;
  d.getElementsByTagName("head")[0].appendChild(s);
})();
</script>`;
}

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
  ${crispWidgetScript()}
</body>
</html>
`;
}

// =============================================================================
// Système de compte — HTML/JS vanilla + supabase-js (CDN), sans framework
// =============================================================================
//
// Pas de serveur qui rend les pages ici (site statique servi par Vercel) :
// pas de middleware possible pour protéger /compte AVANT le rendu. La
// protection réelle est un skeleton affiché immédiatement pendant que
// `supabase.auth.getSession()` répond en JS, contenu affiché seulement après
// vérification, redirection sinon (voir comptePage() plus bas).
//
// Chaque page est un rechargement complet (pas de SPA) : la transition douce
// entre les 5 pages ne peut pas être une transition CSS classique (le DOM est
// détruit/recréé). On utilise la View Transitions API multi-documents
// (`@view-transition { navigation: auto; }` dans authCss()) : ignorée
// silencieusement par les navigateurs qui ne la supportent pas (règle CSS
// inconnue = no-op par spec), donc dégradation gracieuse par construction —
// pas de JS applicatif à maintenir pour ça, pas de risque de casser la
// navigation si l'API est absente.

const AUTH_ALERT = "#D9605A"; // dérivé du graphite, jamais un rouge Bootstrap générique
const AUTH_AMBER = "#D9A23D";

function designTokensCss() {
  return `:root {
  --color-cobalt: ${brand.colors.cobalt};
  --color-cobalt-soft: ${brand.colors.cobaltSoft};
  --color-cobalt-dark: ${brand.colors.cobaltDark};
  --color-verified-green: ${brand.colors.verifiedGreen};
  --color-verified-green-soft: ${brand.colors.verifiedGreenSoft};
  --color-graphite: ${brand.colors.graphite};
  --color-graphite-soft: ${brand.colors.graphiteSoft};
  --color-ink: ${brand.colors.ink};
  --color-ink-deep: ${brand.colors.inkDeep};
  --color-ink-soft: ${brand.colors.inkSoft};
  --color-paper: ${brand.colors.paper};
  --color-paper-soft: ${brand.colors.paperSoft};
  --color-steel: ${brand.colors.steel};
  --color-alert: ${AUTH_ALERT};
  --color-alert-soft: rgba(217, 96, 90, 0.14);
  --color-amber: ${AUTH_AMBER};
  --ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);
  --ease-standard: cubic-bezier(0.22, 1, 0.36, 1);
  --duration-fast: 150ms;
  --duration-base: 300ms;
  --radius-sm: 10px;
  --radius-md: 14px;
  --radius-lg: 20px;
  color-scheme: dark;
}

@media (prefers-reduced-motion: reduce) {
  :root { --duration-fast: 1ms; --duration-base: 1ms; }
}
`;
}

// Un seul fichier de composants d'auth, importé par les 5 pages — c'est ce
// qui empêche la divergence silencieuse (floating label légèrement différent
// sur une page, rouge pas exactement le même ailleurs) qu'un HTML/CSS dupliqué
// 5 fois produirait fatalement avec le temps.
function authCss() {
  return `@view-transition {
  navigation: auto;
}

* { box-sizing: border-box; }

html, body {
  margin: 0;
  min-height: 100dvh;
  background: var(--color-ink);
  color: var(--color-paper-soft);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Inter, Arial, sans-serif;
}

.auth-shell {
  min-height: 100dvh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}

.auth-card {
  width: 100%;
  max-width: 420px;
  background: var(--color-ink-soft);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: var(--radius-lg);
  padding: 32px 28px;
  view-transition-name: auth-card;
}

.auth-brand {
  display: block;
  font-size: 13px;
  font-weight: 800;
  color: var(--color-paper-soft);
  text-decoration: none;
  margin-bottom: 20px;
}

.auth-title {
  font-size: 22px;
  font-weight: 800;
  margin: 0 0 8px;
  letter-spacing: -0.01em;
}

.auth-subtitle {
  font-size: 14px;
  line-height: 1.5;
  color: var(--color-steel);
  margin: 0 0 24px;
}

.field {
  position: relative;
  margin-bottom: 20px;
}

.field input {
  width: 100%;
  padding: 19px 40px 7px 14px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: var(--radius-sm);
  color: var(--color-paper-soft);
  font-size: 15px;
  font-family: inherit;
  transition: box-shadow var(--duration-fast) ease, border-color var(--duration-fast) ease;
}

.field input:focus {
  outline: none;
  border-color: var(--color-cobalt);
  box-shadow: 0 0 0 3px rgba(0, 71, 255, 0.15);
}

.field label {
  position: absolute;
  left: 14px;
  top: 19px;
  font-size: 15px;
  line-height: 1;
  color: var(--color-steel);
  pointer-events: none;
  transform-origin: left top;
  transition: transform var(--duration-base) var(--ease-spring), color var(--duration-fast) ease;
}

.field.is-filled label,
.field input:focus + label {
  transform: translateY(-11px) scale(0.78);
  color: var(--color-cobalt-soft);
}

.field__check {
  position: absolute;
  right: 14px;
  top: 16px;
  width: 18px;
  height: 18px;
  color: var(--color-verified-green);
  transform: scale(0);
  transition: transform var(--duration-base) var(--ease-spring);
}

.field.is-valid .field__check {
  transform: scale(1);
}

.field__error {
  max-height: 0;
  opacity: 0;
  overflow: hidden;
  color: var(--color-alert);
  font-size: 13px;
  line-height: 1.4;
  margin-top: 0;
  transition: max-height var(--duration-base) ease, opacity var(--duration-base) ease, margin-top var(--duration-base) ease;
}

.field__error.is-visible {
  max-height: 40px;
  opacity: 1;
  margin-top: 6px;
}

.pw-strength {
  display: flex;
  gap: 6px;
  margin: -10px 0 16px;
}

.pw-strength__seg {
  flex: 1;
  height: 4px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.1);
  overflow: hidden;
}

.pw-strength__seg-fill {
  display: block;
  height: 100%;
  width: 0%;
  background: var(--color-alert);
  transition: width var(--duration-base) var(--ease-standard), background var(--duration-base) ease;
}

.pw-strength__label {
  font-size: 12px;
  color: var(--color-steel);
  margin: -10px 0 16px;
  min-height: 14px;
}

.field-hint {
  font-size: 12px;
  color: var(--color-steel);
  margin: -12px 0 16px;
}

.checkbox-row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin: 4px 0 20px;
}

.checkbox-row input {
  margin-top: 2px;
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  accent-color: var(--color-cobalt);
}

.checkbox-row label {
  font-size: 13px;
  color: var(--color-paper-soft);
  line-height: 1.5;
}

.btn-submit {
  position: relative;
  width: 100%;
  padding: 15px;
  border-radius: 999px;
  border: none;
  background: var(--color-cobalt);
  color: #fff;
  font-weight: 700;
  font-size: 15px;
  font-family: inherit;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  transition: background var(--duration-fast) ease, transform var(--duration-fast) ease;
}

.btn-submit:hover:not(:disabled) {
  background: var(--color-cobalt-dark);
}

.btn-submit:active:not(:disabled) {
  transform: scale(0.98);
}

.btn-submit:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.btn-submit__label {
  transition: opacity var(--duration-fast) ease;
}

.btn-submit__spinner {
  width: 15px;
  height: 15px;
  border-radius: 50%;
  border: 2px solid rgba(255, 255, 255, 0.35);
  border-top-color: #fff;
  display: none;
  animation: auth-spin 0.7s linear infinite;
}

.btn-submit.is-loading .btn-submit__spinner {
  display: inline-block;
}

.btn-submit__check {
  display: none;
  width: 16px;
  height: 16px;
}

.btn-submit.is-success .btn-submit__check {
  display: inline-block;
}

.btn-submit.is-success .btn-submit__spinner {
  display: none;
}

.btn-submit__check path {
  stroke-dasharray: 20;
  stroke-dashoffset: 20;
  transition: stroke-dashoffset 320ms var(--ease-standard);
}

.btn-submit.is-success .btn-submit__check path {
  stroke-dashoffset: 0;
}

@keyframes auth-spin {
  to { transform: rotate(360deg); }
}

@media (prefers-reduced-motion: reduce) {
  .btn-submit__spinner { animation-duration: 1.4s; }
}

.auth-footer {
  margin-top: 20px;
  font-size: 13px;
  color: var(--color-steel);
  text-align: center;
}

.auth-footer a {
  color: var(--color-cobalt-soft);
  text-decoration: underline;
}

.auth-banner {
  border-radius: var(--radius-sm);
  padding: 12px 14px;
  font-size: 13px;
  line-height: 1.5;
  margin-bottom: 20px;
}

.auth-banner--info {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: var(--color-paper-soft);
}

.auth-banner--success {
  background: rgba(0, 196, 140, 0.1);
  border: 1px solid rgba(0, 196, 140, 0.3);
  color: var(--color-paper-soft);
}

.auth-banner--alert {
  background: var(--color-alert-soft);
  border: 1px solid rgba(217, 96, 90, 0.35);
  color: var(--color-paper-soft);
}

/* ---- Skeleton (/compte pendant la vérification de session) ---- */

.skeleton-line {
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.06);
  animation: skeleton-pulse 1.5s ease-in-out infinite;
}

@keyframes skeleton-pulse {
  0%, 100% { opacity: 0.4; }
  50% { opacity: 0.6; }
}

@media (prefers-reduced-motion: reduce) {
  .skeleton-line { animation: none; opacity: 0.5; }
}

.account-shell {
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 20px;
  padding: 24px;
  text-align: center;
  max-width: 480px;
  margin: 0 auto;
}

.account-shell[hidden],
.account-skeleton[hidden] {
  display: none;
}

.account-skeleton {
  width: 100%;
  max-width: 480px;
  margin: 0 auto;
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  padding: 24px;
}

/* ---- /compte — le dossier personnel -------------------------------- */

.dossier-shell {
  min-height: 100dvh;
  padding: 48px 24px;
  display: flex;
  justify-content: center;
}

.dossier {
  position: relative;
  width: 100%;
  max-width: 560px;
  padding: 28px 26px;
  border-radius: 16px;
  /* Même grain papier que la carte de preuve du funnel — un seul document,
     pas deux univers visuels différents. Valeur reprise à l'identique. */
  background:
    repeating-linear-gradient(0deg, rgba(255,255,255,0.012) 0px, rgba(255,255,255,0.012) 1px, transparent 1px, transparent 3px),
    var(--color-ink-soft, #12151f);
  border: 1px solid rgba(255, 255, 255, 0.08);
  opacity: 0;
  transform: scale(0.98);
}

.dossier.is-revealed {
  opacity: 1;
  transform: scale(1);
}

@media (prefers-reduced-motion: no-preference) {
  .dossier {
    transition: opacity 420ms cubic-bezier(0.22, 1, 0.36, 1), transform 420ms cubic-bezier(0.22, 1, 0.36, 1);
  }
}

.dossier__top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
}

.dossier__logo {
  font-size: 13px;
  font-weight: 800;
  color: var(--color-paper-soft);
  text-decoration: none;
}

.dossier__user-menu {
  position: relative;
}

.dossier__user-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  background: none;
  border: none;
  color: var(--color-steel);
  font-size: 13px;
  font-family: inherit;
  cursor: pointer;
  padding: 6px 8px;
  border-radius: 8px;
}

.dossier__user-btn:hover {
  color: var(--color-paper-soft);
  background: rgba(255, 255, 255, 0.04);
}

.dossier__user-chevron {
  width: 14px;
  height: 14px;
  transition: transform 220ms cubic-bezier(0.34, 1.56, 0.64, 1);
}

.dossier__user-menu.is-open .dossier__user-chevron {
  transform: rotate(180deg);
}

.dossier__user-dropdown {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  min-width: 220px;
  padding: 6px;
  border-radius: 12px;
  background: #12151f;
  border: 1px solid rgba(255, 255, 255, 0.1);
  box-shadow: 0 16px 32px -12px rgba(0, 0, 0, 0.5);
  transform-origin: top right;
  transform: scale(0.92) translateY(-4px);
  opacity: 0;
  pointer-events: none;
  z-index: 5;
}

@media (prefers-reduced-motion: no-preference) {
  .dossier__user-dropdown {
    transition: transform 220ms cubic-bezier(0.34, 1.56, 0.64, 1), opacity 160ms ease;
  }
}

.dossier__user-menu.is-open .dossier__user-dropdown {
  transform: scale(1) translateY(0);
  opacity: 1;
  pointer-events: auto;
}

.dossier__user-dropdown-item {
  display: block;
  width: 100%;
  text-align: left;
  background: none;
  border: none;
  padding: 9px 10px;
  border-radius: 8px;
  font-size: 13px;
  font-family: inherit;
  color: var(--color-paper-soft);
  cursor: pointer;
}

.dossier__user-dropdown-item:hover {
  background: rgba(255, 255, 255, 0.06);
}

.dossier__user-dropdown-item.is-danger {
  color: var(--color-alert);
}

.dossier__header {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 8px;
}

.dossier__day {
  font-size: 12px;
  color: var(--color-steel);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.dossier__title {
  font-size: 22px;
  font-weight: 800;
  margin: 0 0 6px;
}

.dossier__narrative {
  font-size: 15px;
  line-height: 1.6;
  color: var(--color-paper-soft);
  margin: 0 0 8px;
  min-height: 1.6em;
}

.dossier__narrative .is-typing-cursor {
  display: inline-block;
  width: 2px;
  height: 1em;
  background: var(--color-cobalt-soft);
  margin-left: 1px;
  vertical-align: -0.15em;
  animation: dossier-caret-blink 0.85s steps(1) infinite;
}

@keyframes dossier-caret-blink {
  0%, 45% { opacity: 1; }
  50%, 100% { opacity: 0; }
}

.dossier__context {
  font-size: 13px;
  color: var(--color-steel);
  margin: 0 0 32px;
}

.timeline {
  list-style: none;
  margin: 0;
  padding: 0;
}

.timeline__item {
  position: relative;
  padding: 0 0 28px 28px;
  opacity: 0;
  transform: translateY(8px);
}

@media (prefers-reduced-motion: no-preference) {
  .dossier.is-revealed .timeline__item {
    animation: dossier-item-in 380ms cubic-bezier(0.22, 1.26, 0.36, 1) forwards;
  }
  .dossier:not(.is-revealed) .timeline__item {
    opacity: 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .timeline__item {
    opacity: 1;
    transform: none;
  }
}

@keyframes dossier-item-in {
  to { opacity: 1; transform: translateY(0); }
}

.timeline__item::before {
  content: "";
  position: absolute;
  left: 5px;
  top: 4px;
  bottom: -4px;
  width: 1px;
  background: rgba(255, 255, 255, 0.14);
}

.timeline__item:last-child::before {
  display: none;
}

.timeline__dot {
  position: absolute;
  left: 0;
  top: 2px;
  width: 11px;
  height: 11px;
  border-radius: 50%;
  border: 2px solid var(--color-steel);
  background: var(--color-ink);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: visible;
}

.timeline__item--done .timeline__dot,
.timeline__item--current .timeline__dot {
  border-color: var(--color-cobalt);
  background: var(--color-cobalt);
}

@media (prefers-reduced-motion: no-preference) {
  .timeline__item--current .timeline__dot {
    animation: dossier-pulse 2s ease-in-out infinite;
  }
}

@keyframes dossier-pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(0, 71, 255, 0.45); }
  50% { box-shadow: 0 0 0 6px rgba(0, 71, 255, 0); }
}

.timeline__item--upcoming .timeline__dot {
  border-style: dashed;
  background: transparent;
}

.timeline__dot-check {
  width: 7px;
  height: 7px;
  opacity: 0;
  transform: scale(0);
}

.timeline__item--done .timeline__dot-check {
  opacity: 1;
  transform: scale(1);
}

@media (prefers-reduced-motion: no-preference) {
  .timeline__dot-check {
    transition: transform 260ms cubic-bezier(0.34, 1.56, 0.64, 1), opacity 200ms ease;
  }

  /* Effet de "tampon" — reprend l'idée du sceau de la carte de preuve : le
     check s'écrase brièvement à 1.4x avant de se stabiliser à sa taille
     finale, comme un vrai tampon qui rebondit à l'impact. */
  .timeline__item.is-stamping .timeline__dot {
    animation: dossier-stamp 500ms cubic-bezier(0.34, 1.56, 0.64, 1);
  }
}

@keyframes dossier-stamp {
  0% { transform: scale(1.4); }
  60% { transform: scale(0.9); }
  100% { transform: scale(1); }
}

/* Mini-sceau en filigrane sur "Dossier ouvert" — écho direct du tampon de
   la carte de preuve du funnel, même silhouette shield-check. */
.timeline__dot-seal {
  position: absolute;
  left: 22px;
  top: -6px;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  border: 1px solid var(--color-cobalt-soft);
  opacity: 0.1;
  pointer-events: none;
}

.timeline__label {
  font-size: 14px;
  font-weight: 700;
  color: var(--color-paper-soft);
  margin: 0 0 2px;
}

.timeline__item--upcoming .timeline__label {
  color: var(--color-steel);
}

.timeline__meta {
  font-size: 13px;
  color: var(--color-steel);
  line-height: 1.5;
}

.timeline__meta a {
  color: var(--color-cobalt-soft);
}

/* Étapes verrouillées tant que l'accès n'est pas débloqué — se déverrouille
   par une transition d'opacité (JS retire la classe), pas une réapparition
   brute au reload. */
.timeline__item--locked {
  opacity: 0.45;
}

@media (prefers-reduced-motion: no-preference) {
  .timeline__item--locked,
  .timeline__item {
    transition: opacity 500ms ease;
  }
}

.dossier-toast {
  position: fixed;
  left: 50%;
  bottom: 24px;
  transform: translate(-50%, 12px);
  padding: 10px 18px;
  border-radius: 999px;
  background: var(--color-verified-green);
  color: #052e22;
  font-size: 13px;
  font-weight: 700;
  opacity: 0;
  pointer-events: none;
  transition: opacity 220ms ease, transform 220ms ease;
  z-index: 20;
}

.dossier-toast.is-visible {
  opacity: 1;
  transform: translate(-50%, 0);
}
`;
}

function supabaseClientJs() {
  return `// Généré par scripts/build.mjs à partir des variables d'env — l'anon key
// est publique par conception (protégée par RLS, pas par une clé secrète),
// voir supabase/schema.sql et migrations/. Cette clé anon est la SEULE
// autorisée dans ce fichier : voir assertNoSecretsInOutput() dans build.mjs.
(function () {
  function init() {
    if (!window.supabase || !window.supabase.createClient) {
      console.warn("[ColdTrend] supabase-js (CDN) non chargé.");
      return;
    }
    window.ColdTrendSupabase = window.supabase.createClient(
      ${JSON.stringify(SUPABASE_URL)},
      ${JSON.stringify(SUPABASE_ANON_KEY)}
    );
    document.dispatchEvent(new CustomEvent("coldtrend:supabase-ready"));
  }
  init();
})();
`;
}

function authStateJs() {
  return `// Chargé sur TOUTES les pages (pas seulement les 5 pages d'auth) : maintient
// le petit lien "Se connecter" / prénom du brand-bar cohérent partout, à
// partir du même état de session Supabase.
(function () {
  function apply(user) {
    var slots = document.querySelectorAll("[data-auth-slot]");
    if (!slots.length) return;
    var isRealUser = user && !user.is_anonymous;
    var html = isRealUser
      ? '<a href="/compte">' + (user.email ? user.email.split("@")[0] : "Mon compte") + "</a>"
      : '<a href="/connexion">Se connecter</a>';
    slots.forEach(function (el) {
      el.innerHTML = html;
    });
  }

  function boot() {
    if (!window.ColdTrendSupabase) {
      document.addEventListener("coldtrend:supabase-ready", boot, { once: true });
      return;
    }
    window.ColdTrendSupabase.auth.getSession().then(function (res) {
      apply(res.data.session ? res.data.session.user : null);
    });
    window.ColdTrendSupabase.auth.onAuthStateChange(function (_event, session) {
      apply(session ? session.user : null);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
`;
}

// Comportements de formulaire partagés par les 5 pages — un seul endroit,
// pour que le floating label / la force du mot de passe / le bouton de
// soumission / l'erreur inline soient identiques partout (pas de dérive
// visuelle page par page).
function authUiJs() {
  return `// ---- Force du mot de passe (port exact de web/lib/passwordStrength.ts) ----
var ColdTrendPasswordStrength = (function () {
  var KEYBOARD_RUNS = [
    "0123456789", "9876543210", "abcdefghijklmnopqrstuvwxyz",
    "qwertyuiop", "azertyuiop", "asdfghjkl"
  ];

  function hasSequentialRun(password, minRun) {
    minRun = minRun || 4;
    var lower = password.toLowerCase();
    return KEYBOARD_RUNS.some(function (run) {
      for (var i = 0; i <= run.length - minRun; i += 1) {
        if (lower.indexOf(run.slice(i, i + minRun)) !== -1) return true;
      }
      return false;
    });
  }

  function hasRepeatedRun(password, minRun) {
    minRun = minRun || 4;
    var pattern = new RegExp("(.)\\\\1{" + (minRun - 1) + ",}");
    return pattern.test(password);
  }

  function containsContext(password, value) {
    if (!value || value.trim().length < 3) return false;
    return password.toLowerCase().indexOf(value.trim().toLowerCase()) !== -1;
  }

  function evaluate(password, context) {
    context = context || {};
    if (password.length === 0) {
      return { score: 0, label: "", widthPercent: 0 };
    }
    if (password.length < 8) {
      return { score: 0, label: "Trop court (8 caractères minimum)", widthPercent: 15 };
    }

    var points = 0;
    if (password.length >= 8) points += 1;
    if (password.length >= 12) points += 1;

    var classCount = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^a-zA-Z0-9]/].filter(function (re) {
      return re.test(password);
    }).length;
    if (classCount >= 2) points += 1;
    if (classCount >= 3) points += 1;

    var emailLocalPart = context.email ? context.email.split("@")[0] : null;
    var isWeakPattern =
      hasSequentialRun(password) ||
      hasRepeatedRun(password) ||
      containsContext(password, context.prenom) ||
      containsContext(password, emailLocalPart);

    if (isWeakPattern) points = Math.min(points, 1);

    var score = Math.max(0, Math.min(4, points));
    var labels = ["Très faible", "Faible", "Moyen", "Bon", "Excellent"];
    var widths = [15, 30, 55, 80, 100];

    return {
      score: score,
      label: isWeakPattern ? "Trop prévisible — évite les suites et ton prénom" : labels[score],
      widthPercent: widths[score]
    };
  }

  return { evaluate: evaluate };
})();

// ---- Floating label ----
function initFloatingLabel(fieldEl) {
  var input = fieldEl.querySelector("input");
  if (!input) return;
  function sync() {
    fieldEl.classList.toggle("is-filled", input.value.length > 0);
  }
  input.addEventListener("input", sync);
  input.addEventListener("blur", sync);
  // Détection autofill (le navigateur remplit sans déclencher 'input' avant
  // un premier repaint) : on revérifie après un court délai.
  setTimeout(sync, 300);
  sync();
}

// ---- Erreur de champ (slide-down doux, jamais display:none sec) ----
function initFieldError(fieldEl) {
  var errorEl = fieldEl.querySelector(".field__error");
  return {
    show: function (message) {
      if (!errorEl) return;
      errorEl.textContent = message;
      errorEl.classList.add("is-visible");
    },
    clear: function () {
      if (!errorEl) return;
      errorEl.classList.remove("is-visible");
    }
  };
}

// ---- Barre de force du mot de passe (4 segments, cascade 60ms) ----
function initPasswordStrength(passwordInput, meterEl, getContext) {
  var fills = Array.prototype.slice.call(meterEl.querySelectorAll(".pw-strength__seg-fill"));
  var labelEl = meterEl.parentElement.querySelector(".pw-strength__label");
  var colors = ["var(--color-alert)", "var(--color-alert)", "var(--color-amber)", "var(--color-cobalt-soft)", "var(--color-verified-green)"];

  function render() {
    var context = typeof getContext === "function" ? getContext() : {};
    var strength = ColdTrendPasswordStrength.evaluate(passwordInput.value, context);
    fills.forEach(function (fill, i) {
      window.setTimeout(function () {
        fill.style.width = i < strength.score ? "100%" : "0%";
        fill.style.background = colors[strength.score];
      }, i * 60);
    });
    if (labelEl) labelEl.textContent = strength.label;
    return strength;
  }

  passwordInput.addEventListener("input", render);
  return { evaluate: render };
}

// ---- État de chargement du bouton de soumission ----
function initButtonLoadingState(button) {
  var labelEl = button.querySelector(".btn-submit__label");
  var idleText = labelEl ? labelEl.textContent : "";

  function setLabel(text) {
    if (!labelEl) return;
    labelEl.style.opacity = "0";
    window.setTimeout(function () {
      labelEl.textContent = text;
      labelEl.style.opacity = "1";
    }, 150);
  }

  return {
    start: function (loadingText) {
      button.disabled = true;
      button.classList.remove("is-success");
      button.classList.add("is-loading");
      setLabel(loadingText);
    },
    success: function (successText) {
      button.classList.remove("is-loading");
      button.classList.add("is-success");
      if (successText) setLabel(successText);
    },
    reset: function () {
      button.disabled = false;
      button.classList.remove("is-loading", "is-success");
      setLabel(idleText);
    }
  };
}
`;
}

const CHECK_ICON_SVG =
  '<svg class="field__check" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M20 6L9 17l-5-5" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';

const BTN_CHECK_SVG =
  '<svg class="btn-submit__check" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M20 6L9 17l-5-5" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>';

function authField({ id, label, type, autocomplete, withCheck }) {
  return `<div class="field" id="field-${id}">
          <input class="auth-input" id="${id}" name="${id}" type="${type}" autocomplete="${autocomplete}" placeholder=" " required />
          <label for="${id}">${label}</label>
          ${withCheck ? CHECK_ICON_SVG : ""}
          <span class="field__error" aria-live="polite"></span>
        </div>`;
}

function authPageShell({ title, description, bodyHtml, extraHead = "" }) {
  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${brand.name} — ${title}</title>
<meta name="description" content="${description}" />
<meta name="robots" content="noindex" />
<link rel="stylesheet" href="/css/design-tokens.css" />
<link rel="stylesheet" href="/css/auth.css" />
${extraHead}
</head>
<body>
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
<script src="/js/supabase-client.js"></script>
<script src="/js/auth-ui.js"></script>
<script src="/js/auth-state.js"></script>
${bodyHtml}
${crispWidgetScript()}
</body>
</html>
`;
}

function connexionPage() {
  const body = `  <div class="auth-shell">
    <div class="auth-card">
      <a class="auth-brand" href="/">${brand.name}</a>
      <h1 class="auth-title">Se connecter</h1>
      <p class="auth-subtitle">Retrouve ta sélection de SaaS vérifiés.</p>
      <div class="auth-banner auth-banner--alert" id="login-error" style="display:none;"></div>
      <form id="login-form" novalidate>
        ${authField({ id: "login-email", label: "Email", type: "email", autocomplete: "email" })}
        ${authField({ id: "login-password", label: "Mot de passe", type: "password", autocomplete: "current-password" })}
        <button class="btn-submit" type="submit" id="login-submit">
          <span class="btn-submit__label">Se connecter</span>
          <span class="btn-submit__spinner" aria-hidden="true"></span>
          ${BTN_CHECK_SVG}
        </button>
      </form>
      <p class="auth-footer">
        <a href="/mot-de-passe-oublie">Mot de passe oublié ?</a><br />
        Pas encore de compte ? <a href="/inscription">S'inscrire</a>
      </p>
    </div>
  </div>
  <script>
    (function () {
      var GENERIC_ERROR = "Email ou mot de passe incorrect.";
      var form = document.getElementById("login-form");
      var errorBanner = document.getElementById("login-error");
      var submitBtn = document.getElementById("login-submit");
      var loadingState = initButtonLoadingState(submitBtn);
      initFloatingLabel(document.getElementById("field-login-email"));
      initFloatingLabel(document.getElementById("field-login-password"));

      function showError(message) {
        errorBanner.textContent = message;
        errorBanner.style.display = "block";
      }

      async function redirectAfterLogin() {
        var params = new URLSearchParams(window.location.search);
        var redirect = params.get("redirect");
        if (redirect) {
          window.location.href = redirect;
          return;
        }
        try {
          var supabase = window.ColdTrendSupabase;
          var userRes = await supabase.auth.getUser();
          var userId = userRes.data.user ? userRes.data.user.id : null;
          if (userId) {
            var profileRes = await supabase.from("profiles").select("converted").eq("id", userId).single();
            if (profileRes.data && profileRes.data.converted) {
              window.location.href = "/compte";
              return;
            }
          }
        } catch (err) {
          console.warn("[ColdTrend] lecture du profil post-connexion échouée :", err);
        }
        window.location.href = "/";
      }

      form.addEventListener("submit", async function (e) {
        e.preventDefault();
        errorBanner.style.display = "none";
        var email = document.getElementById("login-email").value.trim();
        var password = document.getElementById("login-password").value;
        loadingState.start("Connexion…");

        if (!window.ColdTrendSupabase) {
          showError("Service indisponible pour le moment, réessaie dans un instant.");
          loadingState.reset();
          return;
        }

        var res = await window.ColdTrendSupabase.auth.signInWithPassword({ email: email, password: password });
        if (res.error || !res.data.user) {
          showError(GENERIC_ERROR);
          loadingState.reset();
          return;
        }
        loadingState.success("Connecté");
        window.setTimeout(redirectAfterLogin, 500);
      });
    })();
  </script>`;

  return authPageShell({
    title: "Connexion",
    description: "Connecte-toi à ton compte ColdTrend.",
    bodyHtml: body
  });
}

function inscriptionPage() {
  const body = `  <div class="auth-shell">
    <div class="auth-card">
      <a class="auth-brand" href="/">${brand.name}</a>
      <div id="signup-view">
        <h1 class="auth-title">Créer un compte</h1>
        <p class="auth-subtitle">Sécurise l'accès à ta sélection de SaaS vérifiés.</p>
        <div class="auth-banner auth-banner--alert" id="signup-error" style="display:none;"></div>
        <form id="signup-form" novalidate>
          ${authField({ id: "signup-email", label: "Email", type: "email", autocomplete: "email", withCheck: true })}
          ${authField({ id: "signup-password", label: "Mot de passe", type: "password", autocomplete: "new-password" })}
          <div class="pw-strength" id="signup-strength-meter">
            <span class="pw-strength__seg"><span class="pw-strength__seg-fill"></span></span>
            <span class="pw-strength__seg"><span class="pw-strength__seg-fill"></span></span>
            <span class="pw-strength__seg"><span class="pw-strength__seg-fill"></span></span>
            <span class="pw-strength__seg"><span class="pw-strength__seg-fill"></span></span>
          </div>
          <p class="pw-strength__label" id="signup-strength-label"></p>
          <div class="checkbox-row">
            <input type="checkbox" id="signup-rgpd" required />
            <label for="signup-rgpd">J'accepte que mes données soient utilisées pour me fournir l'accès à ColdTrend.</label>
          </div>
          <button class="btn-submit" type="submit" id="signup-submit" disabled>
            <span class="btn-submit__label">Créer mon compte</span>
            <span class="btn-submit__spinner" aria-hidden="true"></span>
            ${BTN_CHECK_SVG}
          </button>
        </form>
        <p class="auth-footer">Déjà un compte ? <a href="/connexion">Se connecter</a></p>
      </div>

      <div id="login-view" style="display:none;">
        <h1 class="auth-title">Ce compte existe déjà</h1>
        <p class="auth-subtitle">Connecte-toi avec ce mot de passe pour continuer.</p>
        <div class="auth-banner auth-banner--alert" id="inline-login-error" style="display:none;"></div>
        <form id="inline-login-form" novalidate>
          ${authField({ id: "inline-login-password", label: "Mot de passe", type: "password", autocomplete: "current-password" })}
          <button class="btn-submit" type="submit" id="inline-login-submit">
            <span class="btn-submit__label">Se connecter</span>
            <span class="btn-submit__spinner" aria-hidden="true"></span>
            ${BTN_CHECK_SVG}
          </button>
        </form>
      </div>
    </div>
  </div>
  <script>
    (function () {
      var EMAIL_RE = /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/;
      var signupView = document.getElementById("signup-view");
      var loginView = document.getElementById("login-view");
      var signupForm = document.getElementById("signup-form");
      var errorBanner = document.getElementById("signup-error");
      var emailInput = document.getElementById("signup-email");
      var passwordInput = document.getElementById("signup-password");
      var rgpdInput = document.getElementById("signup-rgpd");
      var submitBtn = document.getElementById("signup-submit");
      var loadingState = initButtonLoadingState(submitBtn);
      var capturedEmail = "";

      initFloatingLabel(document.getElementById("field-signup-email"));
      initFloatingLabel(document.getElementById("field-signup-password"));
      var strength = initPasswordStrength(
        passwordInput,
        document.getElementById("signup-strength-meter"),
        function () { return { email: emailInput.value }; }
      );

      function canSubmit() {
        var emailOk = EMAIL_RE.test(emailInput.value.trim());
        document.getElementById("field-signup-email").classList.toggle("is-valid", emailOk);
        return emailOk && passwordInput.value.length >= 8 && rgpdInput.checked;
      }

      function refreshSubmit() {
        submitBtn.disabled = !canSubmit();
      }

      emailInput.addEventListener("input", refreshSubmit);
      passwordInput.addEventListener("input", refreshSubmit);
      rgpdInput.addEventListener("change", refreshSubmit);

      function showError(message) {
        errorBanner.textContent = message;
        errorBanner.style.display = "block";
      }

      // Même Edge Function resolve-identity que l'écran auth du quiz (voir
      // supabase/functions/resolve-identity/) : un seul mécanisme d'auth
      // pour toute l'app, plus de dance updateUser(email) + updateUser(password)
      // côté client — ça évitait un point d'entrée direct sur /inscription
      // de diverger du parcours quiz et de créer un second compte pour la
      // même personne.
      signupForm.addEventListener("submit", async function (e) {
        e.preventDefault();
        if (!canSubmit()) return;
        errorBanner.style.display = "none";
        loadingState.start("Création…");

        var supabase = window.ColdTrendSupabase;
        if (!supabase) {
          showError("Service indisponible pour le moment, réessaie dans un instant.");
          loadingState.reset();
          return;
        }

        var email = emailInput.value.trim();
        var password = passwordInput.value;
        capturedEmail = email;

        var res, body;
        try {
          res = await fetch(supabase.supabaseUrl + "/functions/v1/resolve-identity", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              apikey: supabase.supabaseKey,
              Authorization: "Bearer " + supabase.supabaseKey
            },
            body: JSON.stringify({ email: email, password: password })
          });
          body = await res.json();
        } catch (err) {
          showError("Service indisponible pour le moment, réessaie dans un instant.");
          loadingState.reset();
          return;
        }

        if (!res.ok || !body.session) {
          // Email déjà pris ET mot de passe fourni incorrect (resolve-identity
          // ne distingue jamais les deux cas dans son message, cf.
          // anti-énumération) : on bascule vers la connexion inline plutôt
          // que d'afficher une erreur bloquante à quelqu'un qui a déjà un
          // compte.
          signupView.style.display = "none";
          loginView.style.display = "block";
          loadingState.reset();
          return;
        }

        await supabase.auth.setSession({
          access_token: body.session.access_token,
          refresh_token: body.session.refresh_token
        });
        await supabase.from("profiles").update({ converted: true }).eq("id", body.user.id);
        loadingState.success("Compte créé");
        window.setTimeout(function () { window.location.href = "/compte"; }, 500);
      });

      var inlineForm = document.getElementById("inline-login-form");
      var inlineError = document.getElementById("inline-login-error");
      var inlineSubmit = document.getElementById("inline-login-submit");
      var inlineLoadingState = initButtonLoadingState(inlineSubmit);

      inlineForm.addEventListener("submit", async function (e) {
        e.preventDefault();
        inlineError.style.display = "none";
        inlineLoadingState.start("Connexion…");
        var password = document.getElementById("inline-login-password").value;
        var res = await window.ColdTrendSupabase.auth.signInWithPassword({ email: capturedEmail, password: password });
        if (res.error || !res.data.user) {
          inlineError.textContent = "Email ou mot de passe incorrect.";
          inlineError.style.display = "block";
          inlineLoadingState.reset();
          return;
        }
        inlineLoadingState.success("Connecté");
        window.setTimeout(function () { window.location.href = "/compte"; }, 500);
      });
    })();
  </script>`;

  return authPageShell({
    title: "Créer un compte",
    description: "Crée ton compte ColdTrend pour accéder à ta sélection de SaaS vérifiés.",
    bodyHtml: body
  });
}

function motDePasseOublieePage() {
  const body = `  <div class="auth-shell">
    <div class="auth-card">
      <a class="auth-brand" href="/">${brand.name}</a>
      <div id="request-view">
        <h1 class="auth-title">Mot de passe oublié</h1>
        <p class="auth-subtitle">On t'envoie un lien pour en choisir un nouveau.</p>
        <form id="reset-form" novalidate>
          ${authField({ id: "reset-email", label: "Email", type: "email", autocomplete: "email" })}
          <button class="btn-submit" type="submit" id="reset-submit">
            <span class="btn-submit__label">Envoyer le lien</span>
            <span class="btn-submit__spinner" aria-hidden="true"></span>
            ${BTN_CHECK_SVG}
          </button>
        </form>
        <p class="auth-footer"><a href="/connexion">Retour à la connexion</a></p>
      </div>
      <div id="sent-view" style="display:none;">
        <h1 class="auth-title">Vérifie ta boîte mail</h1>
        <p class="auth-subtitle" id="sent-message"></p>
        <p class="auth-footer"><a href="/connexion">Retour à la connexion</a></p>
      </div>
    </div>
  </div>
  <script>
    (function () {
      var EMAIL_RE = /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/;
      var form = document.getElementById("reset-form");
      var emailInput = document.getElementById("reset-email");
      var submitBtn = document.getElementById("reset-submit");
      var loadingState = initButtonLoadingState(submitBtn);
      initFloatingLabel(document.getElementById("field-reset-email"));

      form.addEventListener("submit", async function (e) {
        e.preventDefault();
        var email = emailInput.value.trim();
        if (!EMAIL_RE.test(email)) return;
        loadingState.start("Envoi…");

        // Lien renvoie ici avec ?code=... (flow PKCE) — voir
        // /reinitialiser-mot-de-passe. Le résultat de l'appel n'est jamais
        // exposé : même message que l'email existe ou non (anti-énumération).
        if (window.ColdTrendSupabase) {
          try {
            await window.ColdTrendSupabase.auth.resetPasswordForEmail(email, {
              redirectTo: window.location.origin + "/reinitialiser-mot-de-passe"
            });
          } catch (err) {
            console.warn("[ColdTrend] resetPasswordForEmail a échoué :", err);
          }
        }

        document.getElementById("sent-message").textContent =
          "Si un compte existe pour " + email + ", un email avec un lien de réinitialisation vient d'être envoyé.";
        document.getElementById("request-view").style.display = "none";
        document.getElementById("sent-view").style.display = "block";
      });
    })();
  </script>`;

  return authPageShell({
    title: "Mot de passe oublié",
    description: "Réinitialise le mot de passe de ton compte ColdTrend.",
    bodyHtml: body
  });
}

function reinitialiserMotDePassePage() {
  const body = `  <div class="auth-shell">
    <div class="auth-card">
      <a class="auth-brand" href="/">${brand.name}</a>
      <div id="checking-view">
        <h1 class="auth-title">Vérification du lien…</h1>
      </div>
      <div id="invalid-view" style="display:none;">
        <h1 class="auth-title">Lien invalide ou expiré</h1>
        <p class="auth-subtitle">Redemande un nouveau lien de réinitialisation.</p>
        <p class="auth-footer"><a href="/mot-de-passe-oublie">Recommencer</a></p>
      </div>
      <div id="ready-view" style="display:none;">
        <h1 class="auth-title">Choisis un nouveau mot de passe</h1>
        <div class="auth-banner auth-banner--alert" id="reset-error" style="display:none;"></div>
        <form id="new-password-form" novalidate>
          ${authField({ id: "new-password", label: "Nouveau mot de passe", type: "password", autocomplete: "new-password" })}
          <div class="pw-strength" id="reset-strength-meter">
            <span class="pw-strength__seg"><span class="pw-strength__seg-fill"></span></span>
            <span class="pw-strength__seg"><span class="pw-strength__seg-fill"></span></span>
            <span class="pw-strength__seg"><span class="pw-strength__seg-fill"></span></span>
            <span class="pw-strength__seg"><span class="pw-strength__seg-fill"></span></span>
          </div>
          <p class="pw-strength__label" id="reset-strength-label"></p>
          <button class="btn-submit" type="submit" id="reset-password-submit" disabled>
            <span class="btn-submit__label">Mettre à jour le mot de passe</span>
            <span class="btn-submit__spinner" aria-hidden="true"></span>
            ${BTN_CHECK_SVG}
          </button>
        </form>
      </div>
      <div id="done-view" style="display:none;">
        <h1 class="auth-title">Mot de passe mis à jour</h1>
        <p class="auth-subtitle">Redirection vers ton compte…</p>
      </div>
    </div>
  </div>
  <script>
    (function () {
      function showView(id) {
        ["checking-view", "invalid-view", "ready-view", "done-view"].forEach(function (viewId) {
          document.getElementById(viewId).style.display = viewId === id ? "block" : "none";
        });
      }

      async function resolveSession() {
        var supabase = window.ColdTrendSupabase;
        if (!supabase) {
          showView("invalid-view");
          return;
        }
        var params = new URLSearchParams(window.location.search);
        var code = params.get("code");

        if (code) {
          var exchangeRes = await supabase.auth.exchangeCodeForSession(code);
          if (exchangeRes.error) {
            showView("invalid-view");
            return;
          }
          showView("ready-view");
          return;
        }

        // Pas de ?code= : soit le SDK a déjà auto-détecté un token dans le
        // fragment d'URL (flow implicite), soit le lien est invalide/expiré.
        var sessionRes = await supabase.auth.getSession();
        showView(sessionRes.data.session ? "ready-view" : "invalid-view");
      }

      document.addEventListener("coldtrend:supabase-ready", resolveSession, { once: true });
      if (window.ColdTrendSupabase) resolveSession();

      var passwordInput = document.getElementById("new-password");
      var submitBtn = document.getElementById("reset-password-submit");
      var loadingState = initButtonLoadingState(submitBtn);
      initFloatingLabel(document.getElementById("field-new-password"));
      initPasswordStrength(passwordInput, document.getElementById("reset-strength-meter"), function () {
        return {};
      });

      passwordInput.addEventListener("input", function () {
        submitBtn.disabled = passwordInput.value.length < 8;
      });

      document.getElementById("new-password-form").addEventListener("submit", async function (e) {
        e.preventDefault();
        if (passwordInput.value.length < 8) return;
        var errorBanner = document.getElementById("reset-error");
        errorBanner.style.display = "none";
        loadingState.start("Enregistrement…");

        var res = await window.ColdTrendSupabase.auth.updateUser({ password: passwordInput.value });
        if (res.error) {
          errorBanner.textContent = res.error.message;
          errorBanner.style.display = "block";
          loadingState.reset();
          return;
        }
        loadingState.success("Mis à jour");
        showView("done-view");
        window.setTimeout(function () { window.location.href = "/compte"; }, 1500);
      });
    })();
  </script>`;

  return authPageShell({
    title: "Réinitialiser le mot de passe",
    description: "Choisis un nouveau mot de passe pour ton compte ColdTrend.",
    bodyHtml: body
  });
}

function comptePage() {
  // /compte n'affiche pas des données, il raconte une progression : le
  // "dossier" de la personne, dans le même univers vérification/preuve que
  // le reste du produit. Pas de middleware possible sur du statique : la
  // protection réelle tient dans l'ordre d'affichage (skeleton fidèle à la
  // mise en page finale, contenu révélé seulement après vérification JS).
  const body = `  <div class="account-skeleton" id="account-skeleton" aria-hidden="true">
    <div class="skeleton-line" style="width:120px;height:14px;"></div>
    <div class="skeleton-line" style="width:220px;height:26px;"></div>
    <div class="skeleton-line" style="width:180px;height:16px;"></div>
    <div class="skeleton-line" style="width:100%;height:60px;"></div>
    <div class="skeleton-line" style="width:100%;height:60px;"></div>
    <div class="skeleton-line" style="width:100%;height:60px;"></div>
  </div>
  <div class="dossier-shell" id="account-content" hidden>
    <div class="dossier" id="dossier">
      <div class="dossier__top">
        <a class="dossier__logo" href="/">${brand.name}</a>
        <div class="dossier__user-menu" id="user-menu">
          <button type="button" class="dossier__user-btn" id="user-menu-btn" aria-haspopup="true" aria-expanded="false">
            <span id="user-menu-email"></span>
            <svg class="dossier__user-chevron" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
          <div class="dossier__user-dropdown" id="user-dropdown">
            <button type="button" class="dossier__user-dropdown-item" id="resend-access-btn" style="display:none;">Renvoyer mon accès par email</button>
            <button type="button" class="dossier__user-dropdown-item" id="signout-btn">Se déconnecter</button>
            <button type="button" class="dossier__user-dropdown-item is-danger" id="delete-account-btn">Supprimer mon compte</button>
          </div>
        </div>
      </div>
      <div class="dossier__header">
        <span class="dossier__day" id="dossier-day"></span>
        <h1 class="dossier__title">Ton dossier</h1>
      </div>
      <p class="dossier__narrative" id="dossier-narrative"></p>
      <p class="dossier__context" id="dossier-context"></p>

      <ol class="timeline" id="dossier-timeline"></ol>
    </div>
  </div>
  <div class="dossier-toast" id="dossier-toast" role="status" aria-live="polite"></div>
  <script>
    (function () {
      var SESSION_SEEN_KEY = "coldtrend_dossier_seen";
      var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

      var INTENTION_LABELS = { racheter: "racheter", copier: "copier" };
      var SECTOR_LABELS = ${JSON.stringify(quiz.sectorLabels)};
      var BUDGET_LABELS = ${JSON.stringify(quiz.budgetLabels)};
      var TIME_LABELS = ${JSON.stringify(quiz.timeLabels)};

      function formatDateFr(iso) {
        try {
          return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
        } catch (err) {
          return "";
        }
      }

      function daysSince(iso) {
        var then = new Date(iso).getTime();
        if (isNaN(then)) return 0;
        return Math.max(0, Math.floor((Date.now() - then) / 86400000));
      }

      function sectorText(profile) {
        var values = profile.secteur || [];
        if (!values.length) return "généraliste";
        return values.map(function (v) { return SECTOR_LABELS[v] || v; }).join(" et ");
      }

      // 4 gabarits de phrase distincts (pas un mad-libs identique pour
      // tout le monde) — sélection déterministe par profil, pas aléatoire
      // à chaque chargement. Toujours à la deuxième personne : aucun
      // prénom n'est collecté par le parcours actuel (écran auth =
      // email/mot de passe/Google uniquement).
      function buildNarrative(profile) {
        var intention = INTENTION_LABELS[profile.intention] || "trouver";
        var secteur = sectorText(profile);
        var temps = TIME_LABELS[profile.temps] || profile.temps || "un peu de temps";
        var budgetPart = profile.budget ? ", avec un budget de " + (BUDGET_LABELS[profile.budget] || profile.budget) : "";

        var seed = String(profile.intention) + String(profile.secteur) + String(profile.budget);
        var hash = 0;
        for (var i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) | 0;
        var variant = Math.abs(hash) % 4;

        var templates = [
          "Tu cherches à " + intention + " un SaaS " + secteur + ", avec " + temps + " par semaine à y consacrer" + budgetPart + ".",
          temps.charAt(0).toUpperCase() + temps.slice(1) + " par semaine, direction " + secteur + " — objectif " + intention + " un SaaS" + budgetPart + ".",
          "Profil qualifié : " + intention + " un SaaS " + secteur + budgetPart + ", dans la limite de " + temps + " par semaine.",
          profile.deja_cherche
            ? "Tu avais déjà cherché avant ColdTrend — cette fois avec des chiffres vérifiés : " + secteur + ", " + temps + " par semaine" + budgetPart + "."
            : "Première recherche, bien cadrée : SaaS " + secteur + ", " + temps + " par semaine" + budgetPart + "."
        ];

        return templates[variant];
      }

      function typeText(el, text, onDone) {
        if (reduceMotion) {
          el.textContent = text;
          if (onDone) onDone();
          return;
        }
        el.textContent = "";
        var cursor = document.createElement("span");
        cursor.className = "is-typing-cursor";
        el.appendChild(cursor);
        var i = 0;
        var speed = Math.max(6, Math.min(18, Math.floor(600 / text.length)));
        (function step() {
          if (i <= text.length) {
            el.textContent = text.slice(0, i);
            el.appendChild(cursor);
            i += 1;
            window.setTimeout(step, speed);
          } else {
            cursor.remove();
            if (onDone) onDone();
          }
        })();
      }

      var DOT_CHECK_SVG =
        '<svg class="timeline__dot-check" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M20 6L9 17l-5-5" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>';

      function buildTimeline(user, profile) {
        var items = [];
        var paid = !!(profile && profile.paid_at);

        items.push({
          key: "opened",
          status: "done",
          label: "Dossier ouvert",
          meta: "Le " + formatDateFr(user.created_at),
          watermark: true
        });

        var hasAnswers = profile && (profile.intention || profile.temps);
        items.push({
          key: "qualified",
          status: hasAnswers ? "done" : "current",
          label: "Profil qualifié",
          meta: hasAnswers
            ? (profile.match_count ? profile.match_count + " SaaS correspondent à ce profil." : "Réponses enregistrées.")
            : "Termine le quiz pour qualifier ton profil."
        });

        items.push({
          key: "access",
          status: paid ? "done" : "current",
          label: paid ? "Accès débloqué" : "Accès en attente",
          meta: paid
            ? "Le " + formatDateFr(profile.paid_at)
            : "Le paiement débloque l'accès à la base complète."
        });

        items.push({
          key: "resources",
          status: "upcoming",
          locked: !paid,
          label: "Ressources consultées",
          // Infrastructure dormante : aucun PDF n'existe encore dans le
          // produit. Le traçage "Consulté le {date}" s'activera dès qu'une
          // vraie pièce jointe existera — pas de contenu à inventer ici.
          meta: "Aucune pièce jointe pour l'instant."
        });

        items.push({
          key: "next",
          status: "upcoming",
          locked: !paid,
          label: "À venir",
          meta: "La suite de ton dossier s'écrit ici."
        });

        return items;
      }

      function renderTimeline(items) {
        var listEl = document.getElementById("dossier-timeline");
        listEl.innerHTML = items
          .map(function (item, index) {
            return (
              '<li class="timeline__item timeline__item--' +
              item.status +
              (item.locked ? " timeline__item--locked" : "") +
              '" data-item="' +
              item.key +
              '" style="animation-delay:' +
              index * 90 +
              'ms">' +
              '<span class="timeline__dot" aria-hidden="true">' +
              (item.watermark ? '<span class="timeline__dot-seal"></span>' : "") +
              DOT_CHECK_SVG +
              "</span>" +
              '<p class="timeline__label">' +
              item.label +
              "</p>" +
              '<p class="timeline__meta">' +
              item.meta +
              "</p>" +
              "</li>"
            );
          })
          .join("");
      }

      // Séquence de transformation live : déclenchée par l'événement
      // Realtime quand paid_at passe de null à une valeur PENDANT que
      // l'onglet /compte est ouvert (typiquement juste après un paiement
      // dans un autre onglet). Pas un simple swap de texte au reload.
      function playAccessConfirmedSequence(profile) {
        var accessItem = document.querySelector('.timeline__item[data-item="access"]');
        if (!accessItem) return;

        accessItem.classList.remove("timeline__item--current");
        accessItem.classList.add("timeline__item--done", "is-stamping");
        window.setTimeout(function () {
          accessItem.classList.remove("is-stamping");
        }, 500);

        var labelEl = accessItem.querySelector(".timeline__label");
        var metaEl = accessItem.querySelector(".timeline__meta");
        labelEl.textContent = "Accès débloqué";
        typeText(metaEl, "Le " + formatDateFr(profile.paid_at));

        showToast("Paiement confirmé — accès débloqué");

        ["resources", "next"].forEach(function (key) {
          var el = document.querySelector('.timeline__item[data-item="' + key + '"]');
          if (el) el.classList.remove("timeline__item--locked");
        });

        var resendBtn = document.getElementById("resend-access-btn");
        if (resendBtn) resendBtn.style.display = "block";
      }

      function showToast(message) {
        var toastEl = document.getElementById("dossier-toast");
        if (!toastEl) return;
        toastEl.textContent = message;
        toastEl.classList.add("is-visible");
        window.setTimeout(function () {
          toastEl.classList.remove("is-visible");
        }, 3200);
      }

      // Souscription Realtime sur la propre ligne profiles de la personne
      // (RLS s'applique aussi aux messages Realtime, jamais les changements
      // d'un autre profil). Le dossier se met à jour sous les yeux de
      // l'utilisateur au moment exact où stripe-webhook confirme le
      // paiement, sans reload manuel.
      function subscribeToProfileChanges(supabase, userId, previousPaidAt) {
        supabase
          .channel("profile-changes-" + userId)
          .on(
            "postgres_changes",
            { event: "UPDATE", schema: "public", table: "profiles", filter: "id=eq." + userId },
            function (payload) {
              var updated = payload.new || {};
              if (!previousPaidAt && updated.paid_at) {
                playAccessConfirmedSequence(updated);
              }
              previousPaidAt = updated.paid_at;
            }
          )
          .subscribe();
      }

      function contextLine(profile) {
        var paid = profile && profile.paid_at;
        if (!paid) {
          var age = profile ? daysSince(profile.created_at || Date.now()) : 0;
          return age < 1
            ? "Ton dossier vient de s'ouvrir."
            : (profile && profile.match_count ? profile.match_count + " SaaS trouvés pour toi, toujours disponibles." : "Ton profil est enregistré, à toi de le débloquer.");
        }
        var sincePaid = daysSince(profile.paid_at);
        return sincePaid < 2 ? "Accès confirmé — bienvenue dans la base." : "Ton accès est actif depuis " + sincePaid + " jours.";
      }

      async function check() {
        var supabase = window.ColdTrendSupabase;
        if (!supabase) {
          document.addEventListener("coldtrend:supabase-ready", check, { once: true });
          return;
        }
        var userRes = await supabase.auth.getUser();
        var user = userRes.data ? userRes.data.user : null;

        if (!user || user.is_anonymous) {
          var redirect = encodeURIComponent(window.location.pathname);
          window.location.replace("/connexion?redirect=" + redirect);
          return;
        }

        var profileRes = await supabase
          .from("profiles")
          .select("intention, budget, temps, secteur, deja_cherche, match_count, paid_at, created_at")
          .eq("id", user.id)
          .single();
        var profile = profileRes.data || {};
        if (!profile.created_at) profile.created_at = user.created_at;

        document.getElementById("dossier-day").textContent = "Jour " + (daysSince(profile.created_at) + 1);
        document.getElementById("dossier-context").textContent = contextLine(profile);
        document.getElementById("user-menu-email").textContent = (user.email || "").split("@")[0];
        renderTimeline(buildTimeline(user, profile));
        subscribeToProfileChanges(supabase, user.id, profile.paid_at);

        document.getElementById("account-skeleton").hidden = true;
        document.getElementById("account-content").hidden = false;

        var narrativeEl = document.getElementById("dossier-narrative");
        var narrative = profile.intention ? buildNarrative(profile) : "Termine le quiz pour que ton dossier se qualifie.";

        var alreadySeen;
        try {
          alreadySeen = sessionStorage.getItem(SESSION_SEEN_KEY) === "1";
        } catch (err) {
          alreadySeen = false;
        }

        var dossierEl = document.getElementById("dossier");
        window.requestAnimationFrame(function () {
          dossierEl.classList.add("is-revealed");
        });

        if (alreadySeen || reduceMotion) {
          narrativeEl.textContent = narrative;
        } else {
          typeText(narrativeEl, narrative);
          try {
            sessionStorage.setItem(SESSION_SEEN_KEY, "1");
          } catch (err) {
            /* pas grave si sessionStorage est indisponible */
          }
        }

        if (profile.paid_at) {
          document.getElementById("resend-access-btn").style.display = "block";
        }
      }

      check();

      var userMenuBtn = document.getElementById("user-menu-btn");
      var userMenuEl = document.getElementById("user-menu");
      userMenuBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        var willOpen = !userMenuEl.classList.contains("is-open");
        userMenuEl.classList.toggle("is-open", willOpen);
        userMenuBtn.setAttribute("aria-expanded", String(willOpen));
      });
      document.addEventListener("click", function () {
        userMenuEl.classList.remove("is-open");
        userMenuBtn.setAttribute("aria-expanded", "false");
      });
      document.addEventListener("keydown", function (e) {
        if (e.key === "Escape") {
          userMenuEl.classList.remove("is-open");
          userMenuBtn.setAttribute("aria-expanded", "false");
        }
      });

      document.getElementById("signout-btn").addEventListener("click", async function () {
        await window.ColdTrendSupabase.auth.signOut();
        window.location.href = "/connexion";
      });

      async function callEdgeFunction(name) {
        var supabase = window.ColdTrendSupabase;
        var sessionRes = await supabase.auth.getSession();
        var token = sessionRes.data.session ? sessionRes.data.session.access_token : null;
        if (!token) return { error: "Session invalide." };
        var res = await fetch(supabase.supabaseUrl + "/functions/v1/" + name, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: supabase.supabaseKey,
            Authorization: "Bearer " + token
          }
        });
        return res.json();
      }

      document.getElementById("resend-access-btn").addEventListener("click", async function () {
        var btn = this;
        btn.disabled = true;
        var result = await callEdgeFunction("resend-access");
        btn.disabled = false;
        btn.textContent = result && result.success ? "Email envoyé." : "Échec de l'envoi, réessaie plus tard.";
      });

      document.getElementById("delete-account-btn").addEventListener("click", async function () {
        var confirmed = window.confirm(
          "Supprimer définitivement ton compte et toutes tes données ColdTrend ? Cette action est irréversible."
        );
        if (!confirmed) return;
        var btn = this;
        btn.disabled = true;
        var result = await callEdgeFunction("delete-account");
        if (result && result.success) {
          await window.ColdTrendSupabase.auth.signOut();
          window.location.href = "/";
        } else {
          btn.disabled = false;
          btn.textContent = "Échec de la suppression, réessaie plus tard.";
        }
      });
    })();
  </script>`;

  return authPageShell({
    title: "Mon compte",
    description: "Ton dossier ColdTrend.",
    bodyHtml: body
  });
}

// ---------------------------------------------------------------------------
// Sécurité — grep de la sortie buildée pour toute variable sensible qui
// n'aurait rien à faire dans du code servi au navigateur. Ne vérifie pas
// seulement le code source (qui ne contient déjà aucun secret) mais la
// sortie réellement écrite sur disque, après interpolation.
// ---------------------------------------------------------------------------
const FORBIDDEN_OUTPUT_PATTERNS = [/service_role/i, /sb_secret_/i, /SUPABASE_SERVICE/i];

function assertNoSecretsInOutput(filePath, contents) {
  FORBIDDEN_OUTPUT_PATTERNS.forEach((pattern) => {
    if (pattern.test(contents)) {
      throw new Error(
        `[SECURITY] Motif interdit ${pattern} trouvé dans ${filePath} — build bloqué avant déploiement.`
      );
    }
  });
}

function writeBuiltFile(filePath, contents) {
  assertNoSecretsInOutput(filePath, contents);
  writeFileSync(filePath, contents, "utf8");
  console.log(`Built ${path.relative(process.cwd(), filePath)}`);
}

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

mkdirSync(OUT_DIR, { recursive: true });
mkdirSync(path.join(OUT_DIR, "css"), { recursive: true });
mkdirSync(path.join(OUT_DIR, "js"), { recursive: true });

writeBuiltFile(OUT_FILE, page({ brand, hero, socialProof, notificationStack, pricing, comparison, faq, quiz }));
writeBuiltFile(OUT_FILE_SUCCESS, successPage({ brand, siteUrl: SITE_URL }));

writeBuiltFile(path.join(OUT_DIR, "css", "design-tokens.css"), designTokensCss());
writeBuiltFile(path.join(OUT_DIR, "css", "auth.css"), authCss());
writeBuiltFile(path.join(OUT_DIR, "js", "supabase-client.js"), supabaseClientJs());
writeBuiltFile(path.join(OUT_DIR, "js", "auth-state.js"), authStateJs());
writeBuiltFile(path.join(OUT_DIR, "js", "auth-ui.js"), authUiJs());

writeBuiltFile(path.join(OUT_DIR, "connexion.html"), connexionPage());
writeBuiltFile(path.join(OUT_DIR, "inscription.html"), inscriptionPage());
writeBuiltFile(path.join(OUT_DIR, "mot-de-passe-oublie.html"), motDePasseOublieePage());
writeBuiltFile(path.join(OUT_DIR, "reinitialiser-mot-de-passe.html"), reinitialiserMotDePassePage());
writeBuiltFile(path.join(OUT_DIR, "compte.html"), comptePage());

console.log("Aucun motif interdit (service_role / sb_secret_ / SUPABASE_SERVICE) trouvé dans la sortie buildée.");
