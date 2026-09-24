import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, "..", "public");
const OUT_FILE = path.join(OUT_DIR, "index.html");
const OUT_FILE_SUCCESS = path.join(OUT_DIR, "succes.html");
const OUT_FILE_CONCEPT = path.join(OUT_DIR, "concept.html");
const OUT_FILE_ENTREPRENEUR_PROFILE = path.join(OUT_DIR, "profil-entrepreneur.html");

// Toute config sensible/par-environnement se lit depuis process.env — jamais
// en dur. Le second membre de chaque `??` n'est qu'un filet de sécurité pour
// que le build ne plante pas si une variable manque en dev local ; en
// production (Vercel), ces trois variables DOIVENT être définies dans
// Project Settings → Environment Variables, sans quoi le site déployé
// affichera silencieusement ces placeholders au lieu des vraies valeurs.
//
// Stripe Payment Link — variabilisé ici, jamais construit/géré côté client.
const STRIPE_PAYMENT_LINK = process.env.STRIPE_PAYMENT_LINK ?? "https://buy.stripe.com/REPLACE_WITH_REAL_LINK";

// Payment Link séparé pour l'upsell "plan de communication" (3,90€, par
// listing) -- produit/prix distinct du Payment Link principal, nécessaire
// pour que stripe-webhook puisse différencier les deux paiements (voir
// migration 0014 et supabase/functions/stripe-webhook). À définir dans les
// variables d'environnement Vercel une fois le produit créé dans Stripe.
const COMM_PLAN_PAYMENT_LINK = process.env.COMM_PLAN_PAYMENT_LINK ?? "https://buy.stripe.com/REPLACE_WITH_COMM_PLAN_LINK";

// Supabase — insertion du lead à l'écran 6, avant le prix. L'anon key est
// publique par conception (protégée par les policies RLS, pas par le secret)
// mais reste une variable d'environnement pour permettre la rotation et la
// séparation Production/Preview/Development sans toucher au code.
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://REPLACE_WITH_PROJECT.supabase.co";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "REPLACE_WITH_ANON_KEY";

// Chiffres réels de saas_listings_public, récupérés à chaque build (Vercel
// rebuild à chaque déploiement -> reste à jour sans job séparé). La table est
// protégée par RLS : la vue publique n'expose que secteur/mrr_bucket, jamais
// nom ni site -- même en cas de fuite de cette requête, aucune identité de
// SaaS n'est exposée avant paiement. En échec (pas de réseau en dev local,
// projet non configuré), on retombe sur des valeurs de secours pour ne
// jamais faire planter le build.
let REAL_SAAS_TOTAL = null;
let REAL_SAAS_SAMPLE = [];
try {
  const restHeaders = { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` };
  const [countRes, sampleRes] = await Promise.all([
    fetch(`${SUPABASE_URL}/rest/v1/saas_listings_public?select=id&limit=1`, {
      headers: { ...restHeaders, Prefer: "count=exact" },
    }),
    fetch(`${SUPABASE_URL}/rest/v1/saas_listings_public?select=secteur,mrr_bucket&limit=24`, {
      headers: restHeaders,
    }),
  ]);
  if (countRes.ok) {
    const contentRange = countRes.headers.get("content-range"); // format "0-0/145"
    const total = contentRange ? Number(contentRange.split("/")[1]) : NaN;
    if (Number.isFinite(total)) REAL_SAAS_TOTAL = total;
  }
  if (sampleRes.ok) {
    const rows = await sampleRes.json();
    if (Array.isArray(rows)) REAL_SAAS_SAMPLE = rows;
  }
} catch (err) {
  console.warn("[build] Impossible de récupérer les stats réelles saas_listings_public :", err.message);
}

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
  tagline: "Ici, « cold » veut dire réfléchi, pas distant.",
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

// Pivot : abandon du positionnement "base de SaaS vérifiés" au profit d'un
// concept de SaaS généré par IA à partir du profil (voir
// generate-user-concept). Plus de référence TrustMRR/Stripe/"vérifié" dans
// le hero -- ce registre n'a plus de sens sans donnée réelle affichée.
const hero = {
  eyebrow: "Un concept de SaaS, généré pour toi",
  titleLine1a: "Ton prochain business commence par une idée,",
  titleLine1b: "on trouve celle qui te correspond.",
  prefix: "Transforme-la en business qui tourne et génère",
  rotatingPhrases: [
    "tes premiers revenus.",
    "tes premiers clients.",
    "tes premières ventes.",
    "tes premiers paiements.",
    "un revenu récurrent.",
    "ton premier chiffre d'affaires."
  ],
  subhead:
    "ColdTrend génère un concept de SaaS personnalisé à partir de ta situation, ton secteur et ton budget — un vrai concept réfléchi pour toi, jamais un template générique.",
  ctaPrimary: "Lancer mon business",
  ctaSecondary: "Comment ça marche"
};

const socialProof = {
  titleLine1: "Les outils qui vont transformer",
  titleLine2: "ton idée en réalité",
  // TrustMRR retiré (pivot : plus de données affichées comme "vérifiées"
  // publiquement) -- Stripe (paiement) et Claude (LLM de génération)
  // restent pertinents, Whop conservé tel quel.
  logos: [
    { src: "/logos/stripe.png", alt: "Stripe" },
    { src: "/logos/whop.png", alt: "Whop" },
    { src: "/logos/claude.png", alt: "Claude" }
  ]
};

// Notification stack — MRR climbs gently across the pool (1 850€ -> 21 400€),
// never a 200€-to-90 000€ jump. Kept in one place so the vanilla-JS engine
// below can stay pure logic/DOM, no content mixed in.
// Pivot : plus de MRR/badge "vérifié" affiché ici -- la source trustmrr est
// retirée (voir SOURCE_META). Les notifications montrent maintenant une
// activité réaliste mais générique (secteur, pas de nom de SaaS ni de
// chiffre précis), cohérente avec un produit qui génère des concepts.
const notificationStack = {
  templates: [
    { source: "coldtrend", sector: "SaaS B2B", kind: "generated" },
    { source: "stripe", sector: "e-commerce", kind: "sale" },
    { source: "coldtrend", sector: "SaaS RH", kind: "generated" },
    { source: "stripe", sector: "SaaS B2C", kind: "sale" },
    { source: "coldtrend", sector: "marketing", kind: "generated" },
    { source: "stripe", sector: "productivité", kind: "sale" }
  ]
};

const pricing = {
  dailyPrice: "0,50 €",
  totalPrice: "14,90 €",
  totalNote: "paiement unique, accès à vie"
};

// L'objet `comparison` ("ColdTrend vs génération d'idées par IA") a été
// retiré ici -- son rendu était déjà désactivé (markup supprimé lors d'une
// session précédente) et son contenu ("Stripe croisé avec TrustMRR")
// contredisait de toute façon le pivot. renderComparisonRows() retiré avec.

// Pivot : plus de base de SaaS vérifiés affichée publiquement -- le produit
// génère un concept de SaaS personnalisé par IA (voir generate-user-concept).
// FAQ réécrite en conséquence : les questions sur TrustMRR/badge Vérifié/la
// base n'ont plus de sens et sont retirées, remplacées par des questions
// sur la génération et la personnalisation. saas_listings reste en base
// (dormante, sert encore l'upsell "plan de communication" sur /concept),
// mais n'est plus ce dont la FAQ doit parler.
//
// Points "Et si aucune idée ne me correspond ?" et remboursement toujours
// volontairement absents (politique non confirmée, voir commit précédent).
const faq = {
  eyebrow: "Questions fréquentes",
  title: "Ce qu'on nous demande le plus",
  items: [
    {
      q: "C'est pas juste un générateur d'idées IA de plus ?",
      a: "Le concept est généré à partir d'un prompt qui varie selon ton profil complet (situation, secteur, budget, temps, expérience) — pas un template générique renvoyé à tout le monde. On ne prétend pas que c'est une donnée vérifiée : c'est un concept réfléchi pour toi, présenté comme tel."
    },
    {
      q: "Comment le concept est-il généré ?",
      a: "Un modèle de langage (Claude, via OpenRouter) reçoit tes réponses au quiz et produit un nom, une description, une cible et des canaux d'acquisition cohérents entre eux. Aucun chiffre de revenu n'est jamais généré ni affiché — le prompt l'interdit explicitement et une vérification automatique rejette toute sortie qui l'enfreindrait."
    },
    {
      q: "En quoi c'est vraiment personnalisé ?",
      a: "Le prompt change à chaque profil : ta situation actuelle, ton expérience business, ton secteur, ton budget et ton temps disponible influencent directement le concept, la cible et les canaux suggérés — pas juste le prénom inséré dans un texte fixe."
    },
    {
      q: "Et si le concept généré ne me convainc pas ?",
      a: "Tu peux relancer le quiz avec des réponses différentes pour obtenir un autre concept — rien n'est figé après un seul essai."
    },
    {
      q: "Je paie, et après ? J'attends un email ?",
      a: "Non, ton concept complet s'affiche directement à l'écran juste après le paiement."
    },
    {
      q: "Pourquoi payer une fois et pas un abonnement comme tout le monde ?",
      a: "Parce que l'accès est à vie — tu payes une fois pour débloquer ton concept complet, sans reconduction ni frais récurrents."
    },
    {
      q: "Vous allez aussi générer les vidéos publicitaires ?",
      a: "Oui, en plus du concept et de son argumentaire, tu pourras bientôt générer une vidéo publicitaire directement depuis ton espace, adaptée à ton SaaS."
    }
  ]
};

// Sous-ensemble de faq.items réutilisé tel quel sur l'écran de paiement du
// quiz -- mêmes questions/réponses que la homepage (jamais reformulées en
// double), juste les 5 qui adressent une hésitation au moment de payer
// (légitimité, méthode, réversibilité, après-paiement, modèle de prix).
// Sélection par texte plutôt que par index -- résiste à un réordonnancement
// futur de faq.items.
const PAYMENT_FAQ_QUESTIONS = [
  "C'est pas juste un générateur d'idées IA de plus ?",
  "Comment le concept est-il généré ?",
  "Et si le concept généré ne me convainc pas ?",
  "Je paie, et après ? J'attends un email ?",
  "Pourquoi payer une fois et pas un abonnement comme tout le monde ?"
];
const paymentFaqItems = PAYMENT_FAQ_QUESTIONS.map((q) => faq.items.find((item) => item.q === q)).filter(Boolean);

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
  // Vrai décompte de saas_listings_public, recalculé à chaque build (voir
  // REAL_SAAS_TOTAL en haut du fichier). 340 n'est plus qu'un filet de
  // sécurité si la requête de build échoue -- le nombre affiché grandit avec
  // sync-trustmrr, il ne représente plus un catalogue fixe et figé.
  totalSaas: REAL_SAAS_TOTAL ?? 340,
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
  // Refonte funnel (auth déplacée juste avant le résultat, jamais avant) --
  // voir persistDraftLocally()/determineStartIndex() dans le script client :
  // tant qu'aucun compte n'existe, la progression vit en localStorage, pas
  // en base (aucune session à qui écrire avant l'écran "auth").
  // Le champ chapter marque les 5 questions "réelles" qui comptent pour la
  // barre de progression segmentée -- intro/mirror/auth n'ont pas leur propre
  // segment (framing, pas avancement).
  questions: [
    {
      // Écran de contexte narratif, remplace l'ancienne ouverture directe
      // sur "auth" -- pose le cadre avant toute question plutôt que de
      // commencer par demander un compte.
      id: "intro",
      stepName: "intro",
      type: "intro",
      title: "Pas un quiz de plus.",
      subtext: "7 questions, aucune pour te trier dans une case — chacune sert à générer un concept de SaaS qui correspond vraiment à ta situation, pas à deviner qui tu es.",
      cta: "Commencer"
    },
    {
      // Écran "intention" (Racheter/Copier) retiré du parcours visible --
      // intention prend désormais "creation" par défaut, en interne, sans
      // écran dédié. Bascule possible vers "rachat" uniquement via le lien
      // discret sur l'écran résultat (voir #result-intention-toggle), qui
      // retague profiles.intention et régénère le concept en conséquence.
      // "autre" n'ouvre pas de champ libre (le moteur d'avance auto du quiz
      // ne gère pas de sous-flux texte sans casser le pattern clic ->
      // avance immédiate) : elle reste sélectionnable telle quelle.
      id: "situation",
      stepName: "situation",
      chapter: 1,
      chapterLabel: "Ta situation",
      chapterIcon: "situation",
      title: "Aujourd'hui, tu gagnes ta vie comment ?",
      type: "single",
      options: [
        { value: "salarie", label: "Salarié", hint: "Tu as un revenu stable, tu explores en parallèle." },
        { value: "independant", label: "Indépendant", hint: "Tu es déjà seul aux commandes de ton activité." },
        { value: "etudiant", label: "Étudiant", hint: "Tu as du temps mais pas encore de revenu fixe." },
        {
          value: "activite_en_ligne",
          label: "J'ai déjà une activité en ligne",
          hint: "Tu connais déjà les bases, tu cherches ta prochaine idée."
        },
        { value: "autre", label: "Autre", hint: "Ta situation ne rentre pas dans une case toute faite." }
      ]
    },
    {
      id: "passif",
      stepName: "passif",
      chapter: 1,
      chapterLabel: "Ton parcours",
      chapterIcon: "passif",
      title: "Tu en es où avec le business en ligne ?",
      type: "single",
      options: [
        { value: "jamais_lance", label: "Je n'ai jamais rien lancé", hint: "Premier projet, aucune expérience à corriger." },
        {
          value: "lance_abandonne",
          label: "J'ai lancé, puis abandonné",
          hint: "Tu sais déjà à quoi ressemble le moment où on décroche."
        },
        { value: "deja_vendu", label: "J'ai déjà vendu quelque chose", hint: "Tu as déjà validé que tu peux convertir." },
        {
          value: "ca_tourne",
          label: "J'ai déjà un truc qui tourne",
          hint: "Tu cherches à diversifier, pas à repartir de zéro."
        }
      ]
    },
    {
      id: "secteur",
      stepName: "secteur",
      chapter: 1,
      chapterLabel: "Ton secteur",
      chapterIcon: "secteur",
      title: "Tu vises plutôt les entreprises ou les particuliers ?",
      subtext: "Certains concepts touchent les deux, le canal d'acquisition s'adapte selon ton choix.",
      type: "multi",
      optionStyle: "card",
      options: [
        { value: "b2b", label: "B2B", hint: "tu vends à des entreprises" },
        { value: "b2c", label: "B2C", hint: "tu vends à des particuliers" },
        { value: "both", label: "Les deux", hint: "peu importe le client tant que ça marche" }
      ]
    },
    {
      id: "budget",
      stepName: "budget",
      chapter: 1,
      chapterLabel: "Ton budget",
      chapterIcon: "budget",
      // skipIf retiré : sans écran "intention", plus aucun cas ne le
      // déclenchait (l'ancienne condition dépendait de la réponse "copier"
      // à cet écran) -- budget reste pertinent quel que soit intention.
      title: "Pour orienter le concept vers un budget de démarrage réaliste.",
      type: "single",
      options: [
        {
          value: "low",
          label: "Moins de 5 000 €",
          followup: "La plupart démarrent avec moins que prévu — ça affine le tri, ça n'exclut de rien."
        },
        { value: "mid", label: "5 000 – 20 000 €" },
        { value: "high", label: "20 000 – 50 000 €" },
        {
          value: "undecided",
          label: "Je regarde, pas encore de budget fixé",
          followup: "La plupart démarrent avec moins que prévu — ça affine le tri, ça n'exclut de rien."
        }
      ]
    },
    {
      // Objectif transitoire, comme situation/passif : jamais persisté dans
      // profiles (pas de migration), transmis à generate-user-concept dans
      // le corps de la requête. Reste en fin de chapitre 1, juste avant
      // l'écran de pause.
      id: "objectifRevenu",
      stepName: "objectif-revenu",
      chapter: 1,
      chapterLabel: "Ton objectif",
      chapterIcon: "objectif",
      title: "Combien de revenu tu vises, à terme ?",
      type: "slider",
      min: 0,
      max: 20000,
      step: 500
    },
    {
      // Charnière de fin de chapitre 1 -- climax émotionnel du quiz, pas
      // une question. Écran de pause statistique (remplace l'ancien texte
      // miroir personnalisé) : compte-rendu social générique, pas de
      // fragment construit à partir des réponses. 2 300 reprend le chiffre
      // déjà affiché dans le hero ("+2 300 entrepreneurs nous font
      // confiance") -- cohérence avec une donnée déjà publiée sur le site,
      // pas un nouveau chiffre inventé pour cet écran.
      id: "mirror",
      stepName: "miroir",
      type: "mirror",
      eyebrow: "Tu n'es pas le premier, ni le dernier",
      subtext: "personnes ont déjà généré leur concept de SaaS avec ColdTrend.",
      pauseValue: 2300
    },
    {
      id: "temps",
      stepName: "temps",
      chapter: 2,
      chapterLabel: "Ton temps",
      chapterIcon: "temps",
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
      id: "dejaCherche",
      stepName: "frustration",
      chapter: 2,
      chapterLabel: "Ta recherche",
      chapterIcon: "recherche",
      title: "Tu as déjà passé des heures sur des listes d'idées génériques, sans rien trouver de crédible ?",
      type: "single",
      options: [
        {
          value: "yes",
          label: "Oui, exactement ça",
          followup: "On sait. C'est littéralement pour ça que ColdTrend existe : un concept pensé pour ton profil, pas une liste générique de plus."
        },
        {
          value: "no",
          label: "Pas encore, c'est ma première recherche",
          followup: "Alors autant commencer avec un concept construit sur ton profil plutôt qu'avec des idées sorties d'un prompt générique — tu gagnes le détour."
        }
      ]
    },
    {
      // Dernière étape avant le résultat (déplacée depuis le tout début du
      // funnel) -- voir resolve-identity (supabase/functions/) : un seul
      // appel serveur qui gère "nouveau compte ou existant" en une fois.
      // Le bouton Google reste en première position visuelle, avant le
      // séparateur "ou" et les champs email/mot de passe -- même hiérarchie
      // qu'avant le déplacement, pas relégué en option secondaire.
      id: "auth",
      stepName: "auth",
      type: "auth",
      title: "On garde ce qu'on vient de construire.",
      subtext: "Tes réponses sont déjà là, on ne te les redemande pas. Juste un compte pour les retrouver — la suite continue juste après."
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

function page({ brand, hero, socialProof, notificationStack, pricing, faq, quiz }) {
  const { colors } = brand;

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${brand.name} — Ton concept de SaaS, généré pour toi</title>
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

  /* ---------------- Nav sticky ---------------- */

  .site-nav {
    position: sticky;
    top: 0;
    z-index: 40;
    background: transparent;
    border-bottom: 1px solid transparent;
    /* Meme famille de transition que le reste de la page (ease, pas de
       cubic-bezier custom -- cette page n'utilise pas ce systeme, contrairement
       a /concept ou /profil-entrepreneur). */
    transition: background 0.25s ease, border-color 0.25s ease, backdrop-filter 0.25s ease;
  }

  .site-nav.is-scrolled {
    background: rgba(10, 14, 26, 0.82);
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
    border-bottom-color: #232936;
  }

  .site-nav__inner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding-block: 14px;
  }

  .site-nav__brand {
    display: flex;
    align-items: center;
    gap: 10px;
    text-decoration: none;
    color: inherit;
    min-width: 0;
  }

  .site-nav__logo {
    width: 30px;
    height: 30px;
    flex-shrink: 0;
  }

  .site-nav__wordmark {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .site-nav__name {
    font-size: 15px;
    font-weight: 800;
    color: var(--paper-soft);
  }

  .site-nav__tagline {
    font-size: 11px;
    font-style: italic;
    color: var(--steel);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  @media (max-width: 639px) {
    .site-nav__tagline { display: none; }
  }

  .site-nav__links {
    display: none;
    align-items: center;
    gap: 20px;
  }

  @media (min-width: 860px) {
    .site-nav__links { display: flex; }
  }

  .site-nav__faq-link {
    font-size: 14px;
    color: var(--paper-soft);
    text-decoration: none;
  }

  .site-nav__faq-link:hover {
    color: #fff;
  }

  .site-nav__auth-btn a {
    display: inline-block;
    padding: 8px 16px;
    border-radius: 8px;
    border: 1px solid #2A3140;
    color: var(--paper-soft);
    font-size: 14px;
    font-weight: 600;
    text-decoration: none;
    transition: border-color 0.18s ease, color 0.18s ease;
  }

  .site-nav__auth-btn a:hover {
    border-color: var(--cobalt);
    color: var(--cobalt);
  }

  .btn--sm {
    width: auto;
    max-width: none;
    padding: 9px 18px;
    font-size: 14px;
  }

  /* Renfort visuel du CTA principal du header : deja en Cobalt Blue plein,
     mais doit capter l'oeil immediatement meme dans une nav chargee -- glow
     au repos (pas seulement au hover) + leger surdimensionnement vs FAQ/auth. */
  #nav-cta-btn {
    padding: 11px 22px;
    font-size: 15px;
    box-shadow: 0 0 0 1px rgba(0, 71, 255, 0.35), 0 4px 18px rgba(0, 71, 255, 0.45);
    transition: box-shadow 0.2s ease, transform 0.2s ease;
  }

  #nav-cta-btn:hover {
    box-shadow: 0 0 0 1px rgba(0, 71, 255, 0.5), 0 6px 24px rgba(0, 71, 255, 0.6);
    transform: translateY(-1px);
  }

  .site-nav__burger {
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    gap: 5px;
    width: 40px;
    height: 40px;
    background: transparent;
    border: 1px solid #2A3140;
    border-radius: 8px;
    cursor: pointer;
    flex-shrink: 0;
  }

  @media (min-width: 860px) {
    .site-nav__burger { display: none; }
  }

  .site-nav__burger span {
    display: block;
    width: 16px;
    height: 2px;
    background: var(--paper-soft);
    transition: transform 0.2s ease, opacity 0.2s ease;
  }

  .site-nav__burger[aria-expanded="true"] span:nth-child(1) {
    transform: translateY(7px) rotate(45deg);
  }

  .site-nav__burger[aria-expanded="true"] span:nth-child(2) {
    opacity: 0;
  }

  .site-nav__burger[aria-expanded="true"] span:nth-child(3) {
    transform: translateY(-7px) rotate(-45deg);
  }

  .site-nav__mobile-panel {
    display: none;
    flex-direction: column;
    align-items: stretch;
    gap: 14px;
    padding: 16px 20px 20px;
    border-top: 1px solid #232936;
    background: rgba(10, 14, 26, 0.98);
  }

  .site-nav__mobile-panel.is-open {
    display: flex;
  }

  @media (min-width: 860px) {
    .site-nav__mobile-panel { display: none !important; }
  }

  .site-nav__mobile-panel a#nav-mobile-faq-link {
    font-size: 15px;
    color: var(--paper-soft);
    text-decoration: none;
    padding: 6px 0;
  }

  .site-nav__mobile-panel .site-nav__auth-btn a {
    display: block;
    text-align: center;
  }

  /* ---------------- Hero ---------------- */

  .hero {
    position: relative;
    padding-block: 76px 56px;
  }

  .hero__pattern {
    position: absolute;
    inset: 0;
    z-index: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
  }

  @media (max-width: 639px) {
    .hero__pattern-line--desktop-only { display: none; }
  }

  .hero__grid {
    position: relative;
    z-index: 1;
    display: grid;
    grid-template-columns: 1fr;
    align-items: center;
    gap: 40px;
  }

  @media (min-width: 960px) {
    .hero__grid {
      grid-template-columns: 1.25fr 0.75fr;
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
    /* Decale vers le centre (loin du bord gauche du conteneur) pour plus
       de presence visuelle, maintenant que le telephone est colle a droite. */
    .hero__copy { text-align: left; padding-left: 40px; }
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
    /* Deux phrases completes maintenant (pas juste un prefixe court) --
       taille reduite par rapport a l'ancien titre court pour rester lisible
       sur plusieurs lignes sans deborder. */
    font-size: clamp(26px, 5.5vw, 42px);
    line-height: 1.2;
    font-weight: 800;
    letter-spacing: -0.02em;
    margin: 0 0 18px;
  }

  .hero__title-line1 {
    display: block;
    margin-bottom: 14px;
  }

  /* Deuxieme partie de la 1ere phrase, en gris degrade -- distincte du
     debut de phrase qui reste en blanc plein. */
  .hero__title-line1-muted {
    background: linear-gradient(180deg, #C5CAD6 0%, #7A8092 100%);
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
  }

  /* Texte fixe + rotator cote a cote sur la meme ligne (inline-flex,
     jamais en display:block separe qui les empilait avant) -- passe a la
     ligne suivante EN BLOC (flex-wrap) si la largeur disponible ne suffit
     pas, plutot qu'un rotator qui deborde et se coupe. */
  .hero__title-line2 {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    column-gap: 0.3em;
    row-gap: 4px;
  }

  .hero__title-static {
    /* Plus petit que la 1ere phrase (hero__title-line1, qui garde la
       taille pleine de .hero__title) -- hierarchise les deux phrases au
       lieu de les traiter au meme poids visuel. */
    font-size: 0.55em;
    font-weight: 700;
    color: var(--paper-soft);
  }

  .hero__rotator {
    font-size: 0.55em;
    display: inline-block;
    min-height: 1.2em;
    color: var(--cobalt);
    /* Plus léger que le texte fixe (800 sur .hero__title) -- effet "accent
       qui respire" : pas juste une couleur différente, un poids différent. */
    font-weight: 600;
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
    min-width: 32ch;
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

  /* Preuve sociale : chiffre indicatif, volontairement distinct visuellement
     du badge Cobalt Blue/Vérifié TrustMRR -- pas de bordure, pas de couleur
     de marque, pour ne jamais le confondre avec les preuves auditées. */
  .hero__social-proof {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    margin-top: 16px;
  }

  @media (min-width: 960px) {
    .hero__social-proof { justify-content: flex-start; }
  }

  .hero__social-proof-avatars {
    display: flex;
  }

  .hero__avatar {
    width: 28px;
    height: 28px;
    border-radius: 999px;
    border: 2px solid var(--ink, #0A0E1A);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 11px;
    font-weight: 700;
    color: rgba(255, 255, 255, 0.85);
    margin-left: -8px;
  }

  .hero__avatar:first-child {
    margin-left: 0;
  }

  .hero__social-proof-text {
    font-size: 13px;
    color: var(--steel);
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

  @media (min-width: 960px) {
    .hero__visual { justify-content: flex-end; }
  }

  .ns-root {
    /* Revenu a une taille proche de l'original (300px), legerement en
       dessous -- la version agrandie (355px) dominait trop le bloc de
       texte a gauche. */
    width: 280px;
    max-width: 100%;
    /* Leger debordement, beaucoup plus discret qu'avant (-24px) pour que
       le telephone reste centre par rapport au bloc de texte une fois
       reduit, au lieu de sembler decale vers le haut. */
    transform: translateY(-8px);
  }

  @keyframes phone-float {
    0%, 100% { transform: translateY(-8px) translateX(16px); }
    50% { transform: translateY(-18px) translateX(16px); }
  }

  @media (min-width: 960px) {
    /* Decalage vers la droite beaucoup plus leger qu'avant (48px -> 16px)
       -- le telephone plus petit n'a plus besoin d'un grand decalage pour
       eviter de se coller au texte. */
    .ns-root { transform: translateY(-8px) translateX(16px); }
  }

  @media (min-width: 960px) and (prefers-reduced-motion: no-preference) {
    .ns-root { animation: phone-float 5s ease-in-out infinite; }
  }

  @media (min-width: 960px) {
    .ns-root { width: 300px; }
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
    position: relative;
    padding-block: 56px 60px;
    border-top: 1px solid #232936;
    overflow: hidden;
  }

  /* Glow radial discret derrière le titre -- pas une décoration isolée,
     juste assez pour renforcer le titre sans distraire du marquee. */
  .proof__glow {
    position: absolute;
    top: -100px;
    left: 50%;
    width: 560px;
    height: 340px;
    transform: translateX(-50%);
    background: radial-gradient(closest-side, rgba(0, 71, 255, 0.22), transparent);
    pointer-events: none;
    z-index: 0;
  }

  .proof__title {
    position: relative;
    z-index: 1;
    text-align: center;
    font-size: clamp(20px, 3.6vw, 30px);
    font-weight: 800;
    line-height: 1.3;
    margin: 0 0 36px;
    color: var(--paper-soft);
  }

  .proof__title-accent {
    background: linear-gradient(180deg, #FFFFFF 0%, #B8BCC4 55%, #8A8F98 100%);
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
  }

  .proof__track-viewport {
    position: relative;
    z-index: 1;
    overflow: hidden;
    mask-image: linear-gradient(to right, transparent, black 12%, black 88%, transparent);
    -webkit-mask-image: linear-gradient(to right, transparent, black 12%, black 88%, transparent);
  }

  .proof__track {
    display: flex;
    align-items: center;
    gap: 20px;
    width: max-content;
    animation: proof-scroll 30s linear infinite;
  }

  /* Pause au hover global du marquee -- indépendante du hover par carte
     individuelle ci-dessous (lift + glow), les deux coexistent. */
  .proof__track-viewport:hover .proof__track {
    animation-play-state: paused;
  }

  @media (prefers-reduced-motion: reduce) {
    .proof__track { animation: none; }
  }

  @keyframes proof-scroll {
    from { transform: translateX(0); }
    to { transform: translateX(-50%); }
  }

  .proof__card {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    width: 148px;
    height: 84px;
    border-radius: 16px;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.06);
    backdrop-filter: blur(6px);
    -webkit-backdrop-filter: blur(6px);
    transition: transform 0.28s cubic-bezier(0.22, 1, 0.36, 1), box-shadow 0.28s ease, border-color 0.28s ease;
  }

  .proof__card:hover {
    transform: translateY(-4px);
    box-shadow: 0 12px 28px -8px rgba(0, 71, 255, 0.35);
    border-color: rgba(0, 71, 255, 0.35);
  }

  .proof__logo {
    max-width: 68%;
    max-height: 42%;
    /* Grayscale + luminosité relevée : un logo sombre (Stripe) comme un
       logo clair (Whop, TrustMRR) doivent rester lisibles au repos sur une
       card quasi-noire -- un simple grayscale(1) sans correction de
       luminosité rendrait Stripe presque invisible. */
    filter: grayscale(1) brightness(2.4) opacity(0.55);
    transition: filter 0.28s ease;
  }

  .proof__card:hover .proof__logo {
    filter: none;
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
    text-align: center;
  }

  .faq__list {
    max-width: 720px;
    margin: 0 auto;
    text-align: left;
  }

  /* Apparition au scroll -- même pattern que [data-reveal] sur
     concept.html/profil-entrepreneur.html (opacity + translateY, toggle
     .is-visible via IntersectionObserver), réimplémenté ici car cette page
     ne charge pas les tokens --ease-out-expo des autres pages. */
  .faq__item {
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 10px;
    opacity: 0;
    transform: translateY(16px);
    transition: opacity 500ms cubic-bezier(0.16, 1, 0.3, 1), transform 500ms cubic-bezier(0.16, 1, 0.3, 1), background 280ms cubic-bezier(0.16, 1, 0.3, 1);
  }

  .faq__item.is-visible {
    opacity: 1;
    transform: translateY(0);
  }

  .faq__item.is-open {
    background: rgba(0, 71, 255, 0.06);
    padding-inline: 4px;
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
    transition: transform 280ms cubic-bezier(0.16, 1, 0.3, 1);
  }

  .faq__item.is-open .faq__chevron {
    transform: rotate(180deg);
  }

  .faq__answer-wrap {
    display: grid;
    grid-template-rows: 0fr;
    transition: grid-template-rows 280ms cubic-bezier(0.16, 1, 0.3, 1);
  }

  .faq__item.is-open .faq__answer-wrap {
    grid-template-rows: 1fr;
  }

  .faq__answer-inner {
    overflow: hidden;
    opacity: 0;
    transition: opacity 280ms cubic-bezier(0.16, 1, 0.3, 1);
  }

  .faq__item.is-open .faq__answer-inner {
    opacity: 1;
  }

  @media (prefers-reduced-motion: reduce) {
    .faq__item {
      opacity: 1;
      transform: none;
      transition: none !important;
    }
    .faq__chevron,
    .faq__answer-wrap,
    .faq__answer-inner {
      transition: none !important;
    }
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
    align-items: center;
    gap: 6px;
    padding: 16px 20px 0;
  }

  /* Segmentée par chapitre plutôt qu'une seule barre continue -- deux
     groupes de segments avec un espaceur visuel entre eux, pas juste
     l'avancement brut. */
  .quiz-progress__group {
    display: flex;
    flex: 1;
    gap: 6px;
  }

  .quiz-progress__group-gap {
    width: 10px;
    flex-shrink: 0;
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
    transition: border-color 180ms ease, background 180ms ease,
      transform 200ms cubic-bezier(0.4, 0, 0.2, 1), box-shadow 200ms cubic-bezier(0.4, 0, 0.2, 1);
  }

  /* Spécificité (.quiz-screen.is-active .quiz-option) volontairement égalée
     ici -- sinon la règle d'apparition de l'écran (même sélecteur, 3
     classes) l'emporterait sur le hover et le translateY ne s'appliquerait
     jamais une fois l'écran actif. */
  .quiz-screen.is-active .quiz-option:hover {
    transform: translateY(-2px);
    box-shadow: 0 10px 24px -12px rgba(0, 0, 0, 0.5);
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
    color: #fff;
    transition: border-color 180ms ease, background 180ms ease;
  }

  /* La coche elle-même reste toujours dans le DOM (color: #fff dès le
     départ) -- c'est sa mise à l'échelle qui la rend visible ou non, pas
     une bascule de couleur : une apparition en scale depuis 0, pas un
     simple fondu. */
  .quiz-option__check svg {
    transform: scale(0);
    transition: transform 220ms cubic-bezier(0.34, 1.56, 0.64, 1);
  }

  .quiz-option.is-selected .quiz-option__check {
    border-color: var(--cobalt);
    background: var(--cobalt);
  }

  .quiz-option.is-selected .quiz-option__check svg {
    transform: scale(1);
  }

  @media (prefers-reduced-motion: reduce) {
    .quiz-option__check svg { transition: none; }
    .quiz-screen.is-active .quiz-option:hover { transform: none; }
  }

  .quiz-chapter-icon {
    color: var(--steel);
    margin: 0 0 10px;
    line-height: 0;
  }

  .quiz-chapter-label {
    font-size: 12px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--steel);
    margin: 0 0 14px;
  }

  /* Rythme d'apparition par écran -- label/icône, puis titre, puis chaque
     carte de réponse en cascade, puis le CTA en dernier. Purement en CSS,
     rejoué à chaque fois qu'un écran regagne .is-active (voir transitionTo()
     qui bascule cette classe) -- aucun nouvel observateur JS nécessaire. */
  .quiz-screen .quiz-chapter-icon,
  .quiz-screen .quiz-chapter-label,
  .quiz-screen .quiz-question-title,
  .quiz-screen .quiz-subtext,
  .quiz-screen .quiz-option,
  .quiz-screen .revenue-slider,
  .quiz-screen .revenue-slider__note,
  .quiz-screen .quiz-payment__teaser,
  .quiz-screen .payment-card,
  .quiz-screen .included-list__title,
  .quiz-screen .included-list li,
  .quiz-screen .payment-faq__title,
  .quiz-screen .quiz-footer {
    opacity: 0;
    transform: translateY(10px);
  }

  .quiz-screen.is-active .quiz-chapter-icon,
  .quiz-screen.is-active .quiz-chapter-label,
  .quiz-screen.is-active .quiz-question-title,
  .quiz-screen.is-active .quiz-subtext,
  .quiz-screen.is-active .quiz-option,
  .quiz-screen.is-active .revenue-slider,
  .quiz-screen.is-active .revenue-slider__note,
  .quiz-screen.is-active .quiz-payment__teaser,
  .quiz-screen.is-active .payment-card,
  .quiz-screen.is-active .included-list__title,
  .quiz-screen.is-active .included-list li,
  .quiz-screen.is-active .payment-faq__title,
  .quiz-screen.is-active .quiz-footer {
    opacity: 1;
    transform: none;
    transition: opacity 380ms cubic-bezier(0.16, 1, 0.3, 1), transform 380ms cubic-bezier(0.16, 1, 0.3, 1);
  }

  /* .faq__item gère déjà sa propre opacity/transform par défaut (voir plus
     haut, réutilisé tel quel) -- ici on override juste l'état "actif" de
     cet écran, le stagger inter-questions vient du transition-delay déjà
     posé en inline par renderFaqItems(), pas d'un nouveau calcul ici. */
  .quiz-screen.is-active .faq__item {
    opacity: 1;
    transform: translateY(0);
  }

  .quiz-screen.is-active .quiz-chapter-icon { transition-delay: 0ms; }
  .quiz-screen.is-active .quiz-chapter-label { transition-delay: 60ms; }
  .quiz-screen.is-active .quiz-question-title { transition-delay: 140ms; }
  .quiz-screen.is-active .quiz-subtext { transition-delay: 200ms; }
  .quiz-screen.is-active .revenue-slider { transition-delay: 220ms; }
  .quiz-screen.is-active .revenue-slider__note { transition-delay: 280ms; }
  .quiz-screen.is-active .quiz-payment__teaser { transition-delay: 0ms; }
  .quiz-screen.is-active .payment-card { transition-delay: 120ms; }
  .quiz-screen.is-active .included-list__title { transition-delay: 260ms; }
  .quiz-screen.is-active .included-list li:nth-child(1) { transition-delay: 320ms; }
  .quiz-screen.is-active .included-list li:nth-child(2) { transition-delay: 380ms; }
  .quiz-screen.is-active .included-list li:nth-child(3) { transition-delay: 440ms; }
  .quiz-screen.is-active .included-list li:nth-child(4) { transition-delay: 500ms; }
  .quiz-screen.is-active .included-list li:nth-child(5) { transition-delay: 560ms; }
  .quiz-screen.is-active .payment-faq__title { transition-delay: 620ms; }
  .quiz-screen.is-active .quiz-option:nth-child(1) { transition-delay: 220ms; }
  .quiz-screen.is-active .quiz-option:nth-child(2) { transition-delay: 290ms; }
  .quiz-screen.is-active .quiz-option:nth-child(3) { transition-delay: 360ms; }
  .quiz-screen.is-active .quiz-option:nth-child(4) { transition-delay: 430ms; }
  .quiz-screen.is-active .quiz-option:nth-child(5) { transition-delay: 500ms; }
  .quiz-screen.is-active .quiz-footer { transition-delay: 620ms; }

  /* .quiz-options est le conteneur flex des cartes, jamais lui-même animé
     (seuls ses enfants .quiz-option le sont) -- évite un double décalage. */
  .quiz-screen .quiz-options,
  .quiz-screen.is-active .quiz-options {
    opacity: 1;
    transform: none;
  }

  @media (prefers-reduced-motion: reduce) {
    .quiz-screen .quiz-chapter-icon,
    .quiz-screen .quiz-chapter-label,
    .quiz-screen .quiz-question-title,
    .quiz-screen .quiz-subtext,
    .quiz-screen .quiz-option,
    .quiz-screen .revenue-slider,
    .quiz-screen .revenue-slider__note,
    .quiz-screen .quiz-payment__teaser,
    .quiz-screen .payment-card,
    .quiz-screen .included-list__title,
    .quiz-screen .included-list li,
    .quiz-screen .payment-faq__title,
    .quiz-screen .quiz-footer {
      opacity: 1;
      transform: none;
      transition: none !important;
    }
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

  /* Slider objectif de revenu -- track/fill custom (pas juste accent-color
     comme sur /profil-entrepreneur) : le natif input[type=range] est rendu
     transparent (piste + pouce natifs invisibles), seul son pouce personnalisé
     reste visible pour l'affordance de drag ; la barre de remplissage est un
     calque séparé animé en transform pour un mouvement fluide (voir
     updateRevenueSlider() côté client), jamais en saut brutal. */
  .revenue-slider { text-align: center; }
  .revenue-slider__badge {
    display: inline-block;
    font-size: 12px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--cobalt-soft);
    background: rgba(0, 71, 255, 0.12);
    border-radius: 999px;
    padding: 4px 12px;
    margin: 0 0 14px;
    transition: opacity 300ms var(--ease-standard, ease), background 300ms var(--ease-standard, ease);
  }
  .revenue-slider__badge.is-changing { opacity: 0; }
  /* Chiffre central -- grand format, drop-shadow Cobalt Blue qui s'intensifie
     avec la position (voir updateRevenueSlider(), pas une valeur fixe) ;
     .is-pulsing marque le pas franchi (changement de valeur affichée) et
     .is-released la confirmation au relâchement -- deux pulses distincts,
     jamais à chaque pixel de drag. */
  .revenue-slider__value {
    /* "3rem-5rem" du brief wrappait sur deux lignes avec le suffixe
       "/ mois" inclus dans le même texte -- réduit pour rester sur une
       ligne au format le plus long ("20 000 € et plus / mois") tout en
       restant très largement le plus grand texte de l'écran. */
    font-size: clamp(1.9rem, 6vw, 3rem);
    font-weight: 800;
    letter-spacing: -0.02em;
    color: var(--paper-soft);
    margin: 0 0 24px;
    font-variant-numeric: tabular-nums;
    filter: drop-shadow(0 0 0 rgba(0, 71, 255, 0));
    transition: filter 200ms var(--ease-standard, ease);
    white-space: nowrap;
  }
  .revenue-slider__value.is-pulsing,
  .revenue-slider__value.is-released {
    animation: revenue-value-pulse 340ms var(--ease-standard, ease);
  }
  .revenue-slider__control {
    position: relative;
    height: 32px;
    display: flex;
    align-items: center;
  }
  .revenue-slider__track {
    position: absolute;
    left: 0;
    right: 0;
    height: 9px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.1);
    overflow: hidden;
  }
  .revenue-slider__fill {
    position: absolute;
    top: 0;
    left: 0;
    height: 100%;
    width: 100%;
    transform-origin: left center;
    transform: scaleX(0);
    background: linear-gradient(90deg, var(--steel), var(--cobalt));
    transition: transform 150ms ease-out;
  }
  .revenue-slider__input {
    position: relative;
    z-index: 1;
    width: 100%;
    height: 32px;
    margin: 0;
    background: transparent;
    appearance: none;
    -webkit-appearance: none;
    cursor: pointer;
  }
  .revenue-slider__input::-webkit-slider-runnable-track { background: transparent; height: 32px; }
  .revenue-slider__input::-moz-range-track { background: transparent; height: 32px; border: none; }
  .revenue-slider__input::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 22px;
    height: 22px;
    border-radius: 999px;
    background: #fff;
    border: 3px solid var(--cobalt);
    margin-top: 5px;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.35);
    transition: transform 150ms var(--ease-standard, ease), box-shadow 150ms var(--ease-standard, ease);
  }
  .revenue-slider__input::-moz-range-thumb {
    width: 22px;
    height: 22px;
    border-radius: 999px;
    background: #fff;
    border: 3px solid var(--cobalt);
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.35);
    transition: transform 150ms var(--ease-standard, ease), box-shadow 150ms var(--ease-standard, ease);
  }
  .revenue-slider__input:active::-webkit-slider-thumb {
    transform: scale(1.15);
    box-shadow: 0 4px 14px rgba(0, 71, 255, 0.55);
  }
  .revenue-slider__input:active::-moz-range-thumb {
    transform: scale(1.15);
    box-shadow: 0 4px 14px rgba(0, 71, 255, 0.55);
  }
  .revenue-slider__ticks {
    display: flex;
    justify-content: space-between;
    margin-top: 10px;
  }
  .revenue-slider__tick {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    font-size: 11px;
    color: var(--steel);
  }
  .revenue-slider__tick::before {
    content: "";
    width: 1px;
    height: 5px;
    background: rgba(255, 255, 255, 0.18);
  }
  .revenue-slider__math {
    font-size: 13px;
    color: var(--steel);
    margin: 20px 0 0;
  }
  .revenue-slider__note {
    font-size: 12px;
    color: var(--steel);
    margin: 16px 0 0;
  }
  @keyframes revenue-value-pulse {
    0% { transform: scale(1); }
    50% { transform: scale(1.02); }
    100% { transform: scale(1); }
  }
  @media (prefers-reduced-motion: reduce) {
    .revenue-slider__fill { transition: none; }
    .revenue-slider__value { transition: none; }
    .revenue-slider__value.is-pulsing,
    .revenue-slider__value.is-released { animation: none; }
    .revenue-slider__input::-webkit-slider-thumb,
    .revenue-slider__input::-moz-range-thumb { transition: none; }
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

  .quiz-screen.quiz-intro {
    justify-content: center;
    text-align: center;
  }

  /* Écran miroir -- climax du quiz, doit visuellement se distinguer du
     reste : fond Cobalt Blue à faible opacité en pleine bordure d'écran
     (pas juste un fond de carte), apparition plus lente gérée dans
     transitionTo() (MIRROR_ENTER_TRANSITION), pas ici. Le dégradé est passé
     en ::before pour pouvoir le faire apparaître en fondu (600-700ms,
     "moment différent") plutôt qu'un fond statique déjà là au premier
     rendu. */
  .quiz-screen.quiz-mirror {
    justify-content: center;
    text-align: center;
    border-radius: 20px;
    /* Pas de position: relative ici -- .quiz-screen est déjà position:
       absolute (voir la règle de base), contexte de positionnement
       suffisant pour ::before/::after. Le surcharger casserait
       l'empilement absolu de tous les écrans du quiz (voir le bug déjà
       rencontré sur situation/budget/objectifRevenu/result). */
  }

  .quiz-screen.quiz-mirror::before {
    content: "";
    position: absolute;
    inset: 0;
    z-index: -1;
    border-radius: 20px;
    background: radial-gradient(ellipse at 50% 40%, rgba(0, 71, 255, 0.14), transparent 70%);
    opacity: 0;
    transition: opacity 700ms cubic-bezier(0.16, 1, 0.3, 1);
  }

  .quiz-screen.quiz-mirror.is-active::before {
    opacity: 1;
  }

  /* Halo respirant -- pulsation très douce, jamais un effet qui distrait ;
     désactivé sous prefers-reduced-motion avec le reste. */
  .quiz-screen.quiz-mirror::after {
    content: "";
    position: absolute;
    inset: 10% 20%;
    z-index: -1;
    border-radius: 999px;
    background: radial-gradient(circle, rgba(0, 71, 255, 0.18), transparent 72%);
    animation: mirror-breathe 5s ease-in-out infinite;
  }

  @keyframes mirror-breathe {
    0%, 100% { opacity: 0.5; }
    50% { opacity: 1; }
  }

  /* Chapitre 1 (situation) -- lignes horizontales fines évoquant une
     structure/organigramme, calque discret derrière le contenu. Pas de
     position: relative -- .quiz-screen est déjà position: absolute. */
  .quiz-screen[data-id="situation"]::before {
    content: "";
    position: absolute;
    inset: 0;
    z-index: -1;
    background-image: repeating-linear-gradient(
      0deg,
      rgba(255, 255, 255, 0.06),
      rgba(255, 255, 255, 0.06) 1px,
      transparent 1px,
      transparent 34px
    );
    opacity: 0.6;
  }

  /* Budget / objectif de revenu -- dégradé radial doux centré sur le
     contenu, Cobalt Blue très dilué. Pas de position: relative -- idem. */
  .quiz-screen[data-id="budget"]::before,
  .quiz-screen[data-id="objectifRevenu"]::before {
    content: "";
    position: absolute;
    inset: 0;
    z-index: -1;
    background: radial-gradient(circle at 50% 35%, rgba(0, 71, 255, 0.07), transparent 65%);
  }

  /* Résultat/concept -- fond le plus riche du parcours : dégradé radial
     plus marqué + grille de points très fine, cohérent avec /concept/{slug}.
     Pas de position: relative -- idem. */
  .quiz-screen.quiz-result::before {
    content: "";
    position: absolute;
    inset: 0;
    z-index: -1;
    background: radial-gradient(circle at 50% 20%, rgba(0, 71, 255, 0.16), transparent 62%);
  }
  .quiz-screen.quiz-result::after {
    content: "";
    position: absolute;
    inset: 0;
    z-index: -1;
    background-image: radial-gradient(rgba(255, 255, 255, 0.08) 1px, transparent 1px);
    background-size: 22px 22px;
    opacity: 0.5;
  }

  /* Paiement -- deuxième climax du parcours (avec le résultat) : fond
     double dégradé asymétrique (pas juste un cercle centré) + grille de
     points très fine, cohérent avec l'écran résultat sans être identique.
     Pas de position: relative -- idem que les autres écrans texturés. */
  .quiz-screen.quiz-payment::before {
    content: "";
    position: absolute;
    inset: 0;
    z-index: -1;
    background:
      radial-gradient(1100px 560px at 18% -8%, rgba(0, 71, 255, 0.14), transparent 60%),
      radial-gradient(900px 520px at 88% 8%, rgba(138, 143, 152, 0.06), transparent 55%);
  }
  .quiz-screen.quiz-payment::after {
    content: "";
    position: absolute;
    inset: 0;
    z-index: -1;
    background-image: radial-gradient(rgba(255, 255, 255, 0.06) 1px, transparent 1px);
    background-size: 24px 24px;
    opacity: 0.4;
  }

  @media (prefers-reduced-motion: reduce) {
    .quiz-screen.quiz-mirror::before { transition: opacity 220ms ease-out; }
    .quiz-screen.quiz-mirror::after { animation: none; opacity: 0.7; }
  }

  /* Écran de pause statistique -- dégradé grisaille (Steel Gray décliné en
     opacité, jamais une teinte tierce) plutôt que le cobalt-soft utilisé
     ailleurs pour les eyebrows -- cet écran doit se sentir "en creux",
     pas comme une nouvelle question. */
  .quiz-mirror__eyebrow {
    font-size: 13px;
    font-weight: 700;
    letter-spacing: 0.02em;
    margin: 0 0 8px;
    background: linear-gradient(90deg, var(--paper-soft), var(--steel));
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
  }

  .pause-content {
    position: relative;
    z-index: 1;
  }

  /* Le CTA est en flux normal (pas de position ici), mais
     .pause-avatars-bg est en position:absolute z-index:0 -- sans ceci il
     peindrait par-dessus le bouton selon l'ordre d'empilement CSS standard
     (positionné z-index:0 après un bloc statique). */
  .quiz-mirror .quiz-footer {
    position: relative;
    z-index: 2;
  }

  .pause-number-wrap {
    position: relative;
    margin: 12px 0 16px;
  }

  .pause-glow {
    position: absolute;
    left: 50%;
    top: 50%;
    width: 220px;
    height: 140px;
    transform: translate(-50%, -50%);
    background: radial-gradient(circle, rgba(0, 71, 255, 0.35), transparent 70%);
    filter: blur(6px);
    animation: pause-glow-pulse 4.5s ease-in-out infinite;
  }

  .pause-number {
    position: relative;
    font-size: clamp(48px, 13vw, 84px);
    font-weight: 800;
    letter-spacing: -0.02em;
    color: var(--paper-soft);
    font-variant-numeric: tabular-nums;
  }

  .pause-subtext {
    font-size: 15px;
    color: var(--steel);
    line-height: 1.5;
    max-width: 380px;
    margin: 0 auto;
  }

  @keyframes pause-glow-pulse {
    0%, 100% { opacity: 0.6; }
    50% { opacity: 1; }
  }

  /* Avatars flottants en arrière-plan -- décoratifs, jamais de vraies
     photos/identités : de simples disques en dégradé Cobalt/Steel. */
  .pause-avatars-bg {
    position: absolute;
    inset: 0;
    z-index: 0;
    pointer-events: none;
    overflow: hidden;
  }

  .pause-avatar-float {
    position: absolute;
    width: 26px;
    height: 26px;
    border-radius: 999px;
    opacity: 0.2;
    animation-name: pause-avatar-drift;
    animation-timing-function: ease-in-out;
    animation-iteration-count: infinite;
    will-change: transform;
  }

  .pause-avatar-float--1 { background: linear-gradient(135deg, var(--cobalt), var(--cobalt-soft)); }
  .pause-avatar-float--2 { background: linear-gradient(135deg, var(--steel), var(--cobalt)); }
  .pause-avatar-float--3 { background: linear-gradient(135deg, var(--cobalt-dark), var(--cobalt-soft)); }
  .pause-avatar-float--4 { background: var(--steel); opacity: 0.15; }
  .pause-avatar-float--5 { background: linear-gradient(135deg, var(--cobalt-soft), var(--steel)); }

  @keyframes pause-avatar-drift {
    0% { transform: translate(0, 0); }
    25% { transform: translate(14px, -10px); }
    50% { transform: translate(-6px, 12px); }
    75% { transform: translate(-14px, -6px); }
    100% { transform: translate(0, 0); }
  }

  /* Orbite autour du chiffre -- même dégradés que les avatars flottants,
     juste plus visibles (opacity 60-80%) et une trajectoire elliptique
     avec une légère variation d'échelle (parallaxe : plus grand "devant",
     plus petit "derrière"). */
  .pause-orbit {
    position: absolute;
    left: 50%;
    top: 38%;
    width: 1px;
    height: 1px;
  }

  .pause-avatar-orbit {
    position: absolute;
    left: 0;
    top: 0;
    width: 22px;
    height: 22px;
    margin: -11px 0 0 -11px;
    border-radius: 999px;
    animation-timing-function: linear;
    animation-iteration-count: infinite;
    will-change: transform;
  }

  .pause-avatar-orbit--1 { background: linear-gradient(135deg, var(--cobalt), var(--cobalt-soft)); animation: pause-orbit-1 22s linear infinite; }
  .pause-avatar-orbit--2 { background: linear-gradient(135deg, var(--steel), var(--cobalt)); animation: pause-orbit-2 26s linear infinite; }
  .pause-avatar-orbit--3 { background: var(--cobalt-soft); animation: pause-orbit-3 30s linear infinite; }
  .pause-avatar-orbit--4 { background: linear-gradient(135deg, var(--cobalt-dark), var(--cobalt)); animation: pause-orbit-4 24s linear infinite; }
  .pause-avatar-orbit--5 { background: linear-gradient(135deg, var(--steel), var(--cobalt-soft)); animation: pause-orbit-5 28s linear infinite; }

  @keyframes pause-orbit-1 {
    0% { transform: translate(-150px, 0) scale(0.75); opacity: 0.5; }
    25% { transform: translate(0, -60px) scale(1); opacity: 0.85; }
    50% { transform: translate(150px, 0) scale(0.75); opacity: 0.5; }
    75% { transform: translate(0, 60px) scale(1); opacity: 0.85; }
    100% { transform: translate(-150px, 0) scale(0.75); opacity: 0.5; }
  }
  @keyframes pause-orbit-2 {
    0% { transform: translate(120px, 30px) scale(0.8); opacity: 0.55; }
    25% { transform: translate(20px, -70px) scale(1); opacity: 0.8; }
    50% { transform: translate(-120px, 30px) scale(0.8); opacity: 0.55; }
    75% { transform: translate(-20px, 80px) scale(1); opacity: 0.8; }
    100% { transform: translate(120px, 30px) scale(0.8); opacity: 0.55; }
  }
  @keyframes pause-orbit-3 {
    0% { transform: translate(-100px, -50px) scale(0.7); opacity: 0.5; }
    50% { transform: translate(100px, 50px) scale(1); opacity: 0.85; }
    100% { transform: translate(-100px, -50px) scale(0.7); opacity: 0.5; }
  }
  @keyframes pause-orbit-4 {
    0% { transform: translate(90px, -70px) scale(0.85); opacity: 0.6; }
    50% { transform: translate(-90px, 70px) scale(1); opacity: 0.8; }
    100% { transform: translate(90px, -70px) scale(0.85); opacity: 0.6; }
  }
  @keyframes pause-orbit-5 {
    0% { transform: translate(-60px, 90px) scale(0.75); opacity: 0.5; }
    50% { transform: translate(60px, -90px) scale(1); opacity: 0.85; }
    100% { transform: translate(-60px, 90px) scale(0.75); opacity: 0.5; }
  }

  @media (prefers-reduced-motion: reduce) {
    .pause-avatar-float,
    .pause-avatar-orbit,
    .pause-glow {
      animation: none;
    }
    .pause-avatar-orbit--1 { opacity: 0.7; }
    .pause-avatar-orbit--2 { opacity: 0.7; }
    .pause-avatar-orbit--3 { opacity: 0.7; }
    .pause-avatar-orbit--4 { opacity: 0.7; }
    .pause-avatar-orbit--5 { opacity: 0.7; }
    .pause-glow { opacity: 0.7; }
  }

  .quiz-result__concept-name {
    font-size: clamp(28px, 7vw, 38px);
    font-weight: 800;
    color: var(--cobalt);
    line-height: 1.2;
    clip-path: inset(0 100% 0 0);
    opacity: 0;
    transform: translateY(6px);
    transition: clip-path 700ms cubic-bezier(0.16, 1, 0.3, 1), opacity 500ms cubic-bezier(0.16, 1, 0.3, 1),
      transform 500ms cubic-bezier(0.16, 1, 0.3, 1);
  }

  .quiz-result__concept-name.is-revealed {
    clip-path: inset(0 0 0 0);
    opacity: 1;
    transform: none;
  }

  @media (prefers-reduced-motion: reduce) {
    .quiz-result__concept-name {
      clip-path: none;
      transition: opacity 220ms ease-out;
    }
  }

  .quiz-result__concept-eyebrow {
    font-size: 12px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--steel);
    margin: 0 0 10px;
  }

  .quiz-result__concept-tagline {
    font-size: 15px;
    color: var(--paper-soft);
    margin: 8px 0 28px;
    line-height: 1.5;
  }

  /* Volets encore verrouillés -- description complète, cible et canaux,
     direction artistique : révélés à l'écran /succes une fois l'accès
     débloqué, jamais avant. Même logique de mise en scène "la donnée existe,
     elle est juste protégée" que l'ancien aperçu caviardé, appliquée
     maintenant au concept généré plutôt qu'à une fiche réelle. */
  .result-preview {
    width: 100%;
    max-width: 380px;
    margin: 24px auto;
    text-align: left;
  }

  .result-preview__label {
    font-size: 12px;
    text-align: center;
    color: var(--steel);
    margin: 0 0 10px;
  }

  .result-preview__list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .result-preview__card {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 10px 14px;
    border-radius: 10px;
    border: 1px solid rgba(255, 255, 255, 0.08);
    background: rgba(255, 255, 255, 0.02);
    animation: result-teaser-pulse 3.2s ease-in-out infinite;
  }

  .result-preview__card:nth-child(2) { animation-delay: 0.4s; }
  .result-preview__card:nth-child(3) { animation-delay: 0.8s; }

  /* Suggère qu'il y a du contenu à débloquer derrière -- une respiration
     très subtile, jamais un clignotement qui distrairait du CTA. */
  @keyframes result-teaser-pulse {
    0%, 100% { border-color: rgba(255, 255, 255, 0.08); background: rgba(255, 255, 255, 0.02); }
    50% { border-color: rgba(0, 71, 255, 0.22); background: rgba(0, 71, 255, 0.05); }
  }

  @media (prefers-reduced-motion: reduce) {
    .result-preview__card { animation: none; }
  }

  .result-preview__meta-label {
    font-size: 13px;
    color: var(--paper-soft);
  }

  .result-preview__lock {
    color: var(--steel);
    display: inline-flex;
  }

  /* Lien discret -- volontairement en retrait (Steel Gray, pas de fond,
     petit), jamais présenté comme un second CTA concurrent du bouton
     principal. Bascule intention -> "rachat" et régénère le concept, voir
     handleIntentionToggle() côté client. */
  .result-intention-toggle {
    display: block;
    width: 100%;
    margin-top: 24px;
    background: none;
    border: none;
    padding: 0;
    font-family: inherit;
    font-size: 13px;
    color: var(--steel);
    text-align: center;
    cursor: pointer;
    transition: color 180ms ease;
  }

  .result-intention-toggle:hover {
    color: var(--paper-soft);
  }

  .result-intention-toggle:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .result-intention-toggle__status {
    font-size: 12px;
    color: var(--cobalt-soft);
    text-align: center;
    margin: 6px 0 0;
    min-height: 1em;
  }

  /* Chapitre bonus -- bloc distinct, pas un lien perdu en bas d'écran.
     Pointe vers /compte : le module reste gratuit en soi, mais n'est
     accessible qu'une fois l'accès débloqué (voir comptePage()). */
  .result-bonus-chapter {
    display: block;
    margin-top: 24px;
    padding: 16px;
    border-radius: 14px;
    border: 1px solid rgba(0, 71, 255, 0.25);
    background: rgba(0, 71, 255, 0.06);
    text-decoration: none;
    text-align: center;
    transition: border-color 0.2s ease, background 0.2s ease;
  }

  .result-bonus-chapter:hover {
    border-color: rgba(0, 71, 255, 0.45);
    background: rgba(0, 71, 255, 0.1);
  }

  .result-bonus-chapter__eyebrow {
    display: block;
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--cobalt-soft);
    margin-bottom: 6px;
  }

  .result-bonus-chapter__title {
    display: block;
    font-size: 15px;
    font-weight: 700;
    color: var(--paper-soft);
    margin-bottom: 4px;
  }

  .result-bonus-chapter__text {
    display: block;
    font-size: 12px;
    color: var(--steel);
    line-height: 1.5;
  }

  /* Écran de transition "Mon dossier" -- checklist façon reçu (preuve de ce
     qui est déjà vérifié) + barre de progression réelle, pas un message
     d'accueil générique. */
  .quiz-resume__progress-track {
    width: 100%;
    height: 6px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.08);
    overflow: hidden;
    margin: 4px 0 10px;
  }

  .quiz-resume__progress-fill {
    height: 100%;
    width: 0%;
    background: var(--verified-green);
    transition: width 500ms cubic-bezier(0.22, 1, 0.36, 1);
  }

  .quiz-resume__progress-label {
    font-size: 13px;
    color: var(--steel);
    margin: 0 0 28px;
  }

  .quiz-resume__checklist {
    list-style: none;
    margin: 0 0 32px;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .quiz-resume__item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 16px;
    border-radius: 12px;
    border: 1px solid rgba(255, 255, 255, 0.08);
    background: rgba(255, 255, 255, 0.02);
    font-size: 14px;
    color: var(--steel);
  }

  .quiz-resume__item-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    flex-shrink: 0;
    border-radius: 50%;
    border: 1.5px solid rgba(255, 255, 255, 0.16);
  }

  .quiz-resume__item.is-checked {
    color: var(--paper-soft);
    border-color: rgba(0, 196, 140, 0.3);
    background: rgba(0, 196, 140, 0.06);
  }

  .quiz-resume__item.is-checked .quiz-resume__item-icon {
    border-color: var(--verified-green);
    color: var(--verified-green);
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

  /* Carte de paiement mise en avant -- glow Cobalt Blue (ombre + fond
     teinté + bordure), jamais une bordure plate. Un seul palier de prix à
     la fois (price-block par défaut OU welcome-offer, jamais les deux --
     logique déjà en place, voir applyWelcomeOffer(), non touchée ici). */
  .payment-card {
    padding: 28px 20px 24px;
    border-radius: 20px;
    background: rgba(0, 71, 255, 0.06);
    border: 1px solid rgba(0, 71, 255, 0.5);
    box-shadow: 0 16px 44px -18px rgba(0, 71, 255, 0.45);
    margin-bottom: 28px;
    transition: transform 200ms cubic-bezier(0.4, 0, 0.2, 1), background 200ms cubic-bezier(0.4, 0, 0.2, 1);
  }

  .payment-card:hover {
    transform: translateY(-3px);
    background: rgba(0, 71, 255, 0.09);
  }

  @media (prefers-reduced-motion: reduce) {
    .payment-card { transition: none; }
    .payment-card:hover { transform: none; }
  }

  .price-block {
    text-align: center;
    margin-bottom: 20px;
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

  .quiz-return-banner {
    text-align: center;
    font-size: 13px;
    font-weight: 600;
    color: var(--verified-green);
    background: rgba(0, 196, 140, 0.08);
    border: 1px solid rgba(0, 196, 140, 0.25);
    border-radius: 10px;
    padding: 10px 14px;
    margin: 0 0 16px;
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

  .included-list__title {
    font-size: 13px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--steel);
    margin: 0 0 14px;
  }

  /* FAQ de l'écran de paiement -- même accordéon que la homepage
     (.faq__item/.faq__question/.faq__chevron, styles déjà définis plus
     haut, gestionnaire de clic déjà délégué sur document au chargement de
     la page -- rien de neuf à câbler ici), juste un sous-ensemble de
     questions et un titre de section propre à ce contexte. */
  .payment-faq {
    margin-top: 28px;
    padding-top: 20px;
    border-top: 1px solid rgba(255, 255, 255, 0.08);
    text-align: left;
  }

  .payment-faq__title {
    font-size: 13px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--steel);
    margin: 0 0 4px;
  }

  /* Icône check en cercle -- même SVG (ICON_CHECK_SMALL) que le reste du
     site, juste posé sur un disque teinté au lieu d'être nu. */
  .included-list svg {
    flex-shrink: 0;
    width: 22px;
    height: 22px;
    padding: 5px;
    border-radius: 999px;
    background: rgba(0, 71, 255, 0.14);
    color: var(--cobalt-soft);
    box-sizing: border-box;
  }

  .stripe-reassurance {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    font-size: 13px;
    color: var(--steel);
    margin: 16px 0 0;
  }

  .btn--cta-final {
    width: 100%;
    max-width: none;
    font-size: 17px;
    padding: 17px;
    transition: transform 180ms cubic-bezier(0.4, 0, 0.2, 1), box-shadow 180ms cubic-bezier(0.4, 0, 0.2, 1), background 0.18s ease;
    animation: cta-final-breathe 3.6s ease-in-out infinite;
  }

  /* Respiration très légère au repos -- attire l'œil sans clignoter,
     s'arrête net au survol (le hover a sa propre ombre, plus marquée). */
  @keyframes cta-final-breathe {
    0%, 100% { box-shadow: 0 6px 18px -8px rgba(0, 71, 255, 0.4); }
    50% { box-shadow: 0 6px 24px -6px rgba(0, 71, 255, 0.65); }
  }

  .btn--cta-final:hover {
    animation-play-state: paused;
    transform: translateY(-2px);
    box-shadow: 0 12px 28px -8px rgba(0, 71, 255, 0.65);
  }

  .btn--cta-final:active {
    transform: translateY(0);
  }

  @media (prefers-reduced-motion: reduce) {
    .btn--cta-final { transition: none; animation: none; box-shadow: 0 6px 18px -8px rgba(0, 71, 255, 0.4); }
    .btn--cta-final:hover { transform: none; }
  }

  /* Même respiration que le CTA de paiement -- même bouton "climax",
     un écran plus tôt dans le parcours (le résultat, avant même d'arriver
     à l'écran de paiement). */
  #quiz-see-offer-btn {
    margin-top: 24px;
    animation: cta-final-breathe 3.6s ease-in-out infinite;
    transition: transform 180ms cubic-bezier(0.4, 0, 0.2, 1), box-shadow 180ms cubic-bezier(0.4, 0, 0.2, 1);
  }

  #quiz-see-offer-btn:hover {
    animation-play-state: paused;
    transform: translateY(-2px);
    box-shadow: 0 12px 28px -8px rgba(0, 71, 255, 0.65);
  }

  @media (prefers-reduced-motion: reduce) {
    #quiz-see-offer-btn { animation: none; transition: none; box-shadow: 0 6px 18px -8px rgba(0, 71, 255, 0.4); }
    #quiz-see-offer-btn:hover { transform: none; }
  }

  /* Offre de bienvenue -- remplace le price-block par défaut une fois le
     palier réel connu (voir get-welcome-offer). Prix barré toujours
     calculé depuis promo_codes.discount_percent (jamais un chiffre affiché
     à la volée sans source), compteur affiché seulement si le nombre
     réel de places restantes passe sous le seuil de visibilité. */
  .welcome-offer {
    margin-bottom: 12px;
    text-align: center;
  }

  /* Pastille pleine Cobalt Blue -- jamais un simple contour. */
  .welcome-offer__eyebrow {
    display: inline-block;
    margin: 0 0 12px;
    padding: 5px 14px;
    font-size: 12px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: #fff;
    background: var(--cobalt);
    border-radius: 999px;
  }

  .welcome-offer__price {
    display: flex;
    align-items: baseline;
    justify-content: center;
    gap: 10px;
  }

  .welcome-offer__price-old {
    font-size: 18px;
    color: var(--steel);
    text-decoration: line-through;
  }

  .welcome-offer__price-new {
    font-size: 32px;
    font-weight: 800;
    color: var(--paper-soft);
  }

  .welcome-offer__counter {
    margin: 8px 0 0;
    font-size: 12px;
    color: var(--steel);
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
  <header class="site-nav" id="site-nav">
    <div class="site-nav__inner wrap">
      <a class="site-nav__brand" href="/">
        <svg class="site-nav__logo" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <path d="M16 2l11 4v8c0 7.2-4.7 12.6-11 16-6.3-3.4-11-8.8-11-16V6l11-4z" stroke="#0047FF" stroke-width="1.6" stroke-linejoin="round"/>
          <circle cx="11" cy="13" r="1.3" fill="#0047FF"/>
          <circle cx="16" cy="9" r="1.3" fill="#0047FF"/>
          <circle cx="21" cy="13" r="1.3" fill="#0047FF"/>
          <path d="M11 13l5-4 5 4" stroke="#0047FF" stroke-width="1.3" stroke-linecap="round"/>
          <rect x="10.5" y="18" width="2.4" height="5" rx="0.6" fill="#0047FF"/>
          <rect x="14.8" y="15.5" width="2.4" height="7.5" rx="0.6" fill="#0047FF"/>
          <rect x="19.1" y="17" width="2.4" height="6" rx="0.6" fill="#0047FF"/>
        </svg>
        <span class="site-nav__wordmark">
          <span class="site-nav__name">${brand.name}</span>
          <span class="site-nav__tagline">${brand.tagline}</span>
        </span>
      </a>
      <nav class="site-nav__links">
        <a class="site-nav__faq-link" href="#faq-title">FAQ</a>
        <span class="site-nav__auth-btn" data-auth-slot></span>
        <button type="button" class="btn btn--primary btn--sm" id="nav-cta-btn">${hero.ctaPrimary}</button>
      </nav>
      <button type="button" class="site-nav__burger" id="nav-burger-btn" aria-label="Menu" aria-expanded="false" aria-controls="nav-mobile-panel">
        <span></span><span></span><span></span>
      </button>
    </div>
    <div class="site-nav__mobile-panel" id="nav-mobile-panel">
      <a href="#faq-title" id="nav-mobile-faq-link">FAQ</a>
      <span class="site-nav__auth-btn" data-auth-slot></span>
      <button type="button" class="btn btn--primary" id="nav-cta-btn-mobile">${hero.ctaPrimary}</button>
    </div>
  </header>
  <script>
    (function () {
      var nav = document.getElementById("site-nav");
      var burgerBtn = document.getElementById("nav-burger-btn");
      var mobilePanel = document.getElementById("nav-mobile-panel");
      if (!nav) return;

      var SCROLL_THRESHOLD = 64;
      function onScroll() {
        nav.classList.toggle("is-scrolled", window.scrollY > SCROLL_THRESHOLD);
      }
      onScroll();
      window.addEventListener("scroll", onScroll, { passive: true });

      if (burgerBtn && mobilePanel) {
        burgerBtn.addEventListener("click", function () {
          var willOpen = !mobilePanel.classList.contains("is-open");
          mobilePanel.classList.toggle("is-open", willOpen);
          burgerBtn.setAttribute("aria-expanded", String(willOpen));
        });
        // Ferme le panneau mobile apres un clic sur un de ses liens/boutons,
        // au lieu de le laisser ouvert par-dessus le contenu vise.
        mobilePanel.addEventListener("click", function (e) {
          if (e.target.closest("a, button")) {
            mobilePanel.classList.remove("is-open");
            burgerBtn.setAttribute("aria-expanded", "false");
          }
        });
      }
    })();
  </script>
  <main class="wrap">
    <section class="hero">
      <svg class="hero__pattern" aria-hidden="true" viewBox="0 0 800 600" preserveAspectRatio="xMidYMid slice">
        <defs>
          <pattern id="hero-dots" width="28" height="28" patternUnits="userSpaceOnUse">
            <circle cx="2" cy="2" r="1.8" fill="#B8BCC4" />
          </pattern>
        </defs>
        <rect width="800" height="600" fill="url(#hero-dots)" opacity="0.16" />
        <g stroke="#B8BCC4" stroke-width="1.2" opacity="0.16" fill="none">
          <line x1="90" y1="70" x2="270" y2="190" />
          <line x1="600" y1="310" x2="740" y2="130" />
          <line class="hero__pattern-line--desktop-only" x1="430" y1="40" x2="570" y2="230" />
          <line class="hero__pattern-line--desktop-only" x1="150" y1="410" x2="350" y2="490" />
        </g>
      </svg>
      <div class="hero__grid">
        <div class="hero__copy">
          <span class="hero__eyebrow">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <path d="M20 6L9 17l-5-5" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            ${hero.eyebrow}
          </span>
          <h1 class="hero__title">
            <span class="hero__title-line1">${hero.titleLine1a} <span class="hero__title-line1-muted">${hero.titleLine1b}</span></span>
            <span class="hero__title-line2">
              <span class="hero__title-static">${hero.prefix}</span>
              <span class="hero__rotator" id="rotator" aria-live="polite">
                <span class="hero__rotator-text" id="rotator-text">${renderRotatorNoScript(hero.rotatingPhrases)}</span>
              </span>
            </span>
          </h1>
          <div class="hero__actions">
            <button type="button" class="btn btn--primary" id="hero-quiz-btn">${hero.ctaPrimary}</button>
            <a class="btn btn--secondary" href="#faq-title">${hero.ctaSecondary}</a>
          </div>
          <div class="hero__social-proof">
            <div class="hero__social-proof-avatars" aria-hidden="true">
              <span class="hero__avatar" style="background:#7B8794">A</span>
              <span class="hero__avatar" style="background:#8A6FD9">M</span>
              <span class="hero__avatar" style="background:#4A9B8E">S</span>
              <span class="hero__avatar" style="background:#C97B4A">L</span>
              <span class="hero__avatar" style="background:#5A7FB8">R</span>
            </div>
            <span class="hero__social-proof-text">+2 300 entrepreneurs nous font confiance</span>
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

    <section class="proof" aria-label="Outils utilisés">
      <div class="proof__glow" aria-hidden="true"></div>
      <h2 class="proof__title">
        ${socialProof.titleLine1}<br />
        <span class="proof__title-accent">${socialProof.titleLine2}</span>
      </h2>
      <div class="proof__track-viewport">
        <div class="proof__track" id="proof-track">
          ${renderProofLogos(socialProof.logos)}
          ${renderProofLogos(socialProof.logos, true)}
        </div>
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
      <p class="transition-cta__lead">Sept questions rapides pour générer un concept de SaaS qui correspond à ton budget, ton temps et ton secteur.</p>
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
        coldtrend: { label: "ColdTrend", icon: ${JSON.stringify(ICON_TREND)}, gradient: "linear-gradient(135deg, var(--graphite) 0%, var(--graphite-soft) 100%)", shadow: "rgba(10, 14, 26, 0.55)" }
      };

      function buildNotification(template, pass) {
        var seedKey = template.sector + "-" + template.kind + "-" + pass;
        var meta = SOURCE_META[template.source];

        var body, amountLabel;
        if (template.kind === "sale") {
          body = "Accès débloqué — secteur " + template.sector;
          amountLabel = "Paiement confirmé";
        } else {
          body = "Concept généré — secteur " + template.sector;
          amountLabel = "Concept livré";
        }

        return {
          id: seedKey + "-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7),
          source: template.source,
          title: meta.label,
          body: body,
          amountLabel: amountLabel,
          amountColor: "var(--cobalt-soft)",
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

      // ---- FAQ apparition au scroll --------------------------------------
      // Même logique que [data-reveal] sur concept.html : IntersectionObserver
      // natif, .is-visible ajoutée une fois puis désobservée (jamais de
      // ré-animation en scrollant de haut en bas). Le stagger vient du
      // transition-delay déjà posé inline par renderFaqItems().
      (function () {
        var faqReduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        var faqItems = document.querySelectorAll("[data-faq-item]");
        if (!faqItems.length) return;
        if (faqReduceMotion || !("IntersectionObserver" in window)) {
          faqItems.forEach(function (el) { el.classList.add("is-visible"); });
          return;
        }
        var faqObserver = new IntersectionObserver(
          function (entries) {
            entries.forEach(function (entry) {
              if (!entry.isIntersecting) return;
              entry.target.classList.add("is-visible");
              faqObserver.unobserve(entry.target);
            });
          },
          { threshold: 0.15 }
        );
        faqItems.forEach(function (el) { faqObserver.observe(el); });
      })();

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
      var quizPayBtnDefaultText = document.getElementById("quiz-pay-btn").textContent;
      var quizPayBtnDefaultHref = document.getElementById("quiz-pay-btn").href;
      var TOTAL_STEPS = progressSegs.length; // dynamique : un segment par question taguée chapter (voir quiz.questions)

      var SECTOR_LABELS = ${JSON.stringify(quiz.sectorLabels)};
      var BUDGET_LABELS = ${JSON.stringify(quiz.budgetLabels)};
      var TIME_LABELS = ${JSON.stringify(quiz.timeLabels)};
      var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

      // Prix moyen par client explicite et fixe -- jamais un chiffre déduit
      // ou variable, juste une illustration transparente déclarée dans le
      // texte lui-même (voir revenue-slider__math), pas une donnée mesurée.
      var REVENUE_PER_CLIENT = 20;
      var REVENUE_BADGES = [
        { max: 3000, label: "Complément" },
        { max: 10000, label: "Revenu principal" },
        { max: Infinity, label: "Ambitieux" }
      ];

      function formatRevenueValue(v) {
        return v >= 20000 ? "20 000 € et plus / mois" : Number(v).toLocaleString("fr-FR") + " € / mois";
      }

      function revenueBadgeLabel(v) {
        for (var i = 0; i < REVENUE_BADGES.length; i += 1) {
          if (v <= REVENUE_BADGES[i].max) return REVENUE_BADGES[i].label;
        }
        return "Ambitieux";
      }

      // Appelée à l'init (valeur par défaut) et à chaque "input" sur le
      // slider (voir le handler délégué sur #stage) -- jamais seulement au
      // relâchement, pour un affichage en direct pendant le drag.
      var revenueBadgeChangeTimer = null;

      // Séparé de updateRevenueSlider() : appelé uniquement au relâchement
      // ("change", pas "input") pour la pulsation de confirmation -- un
      // retour haptique visuel n'a de sens qu'une fois le choix arrêté, pas
      // à chaque pixel de drag.
      function pulseRevenueValueOnRelease() {
        var valueEl = document.getElementById("revenue-slider-value");
        if (!valueEl || reduceMotion) return;
        valueEl.classList.remove("is-released");
        void valueEl.offsetWidth;
        valueEl.classList.add("is-released");
      }

      function updateRevenueSlider() {
        var input = document.getElementById("revenue-slider-input");
        if (!input) return;
        var v = Number(input.value);
        answers.objectifRevenu = v;

        var min = Number(input.min);
        var max = Number(input.max);
        var pct = (v - min) / (max - min);

        var valueEl = document.getElementById("revenue-slider-value");
        var newValueText = formatRevenueValue(v);
        if (valueEl.textContent !== newValueText) {
          valueEl.textContent = newValueText;
          // Pulse discret à chaque changement de tranche réel (le step du
          // slider fait déjà ce filtrage -- pas besoin de le refaire ici),
          // jamais au repos ni en boucle.
          if (!reduceMotion) {
            valueEl.classList.remove("is-pulsing");
            void valueEl.offsetWidth;
            valueEl.classList.add("is-pulsing");
          }
        }
        // Glow Cobalt Blue qui s'intensifie avec la position -- un
        // renforcement discret, jamais un effet qui distrait.
        valueEl.style.filter = "drop-shadow(0 0 " + (6 + pct * 10) + "px rgba(0, 71, 255, " + (0.15 + pct * 0.35) + "))";

        var badgeEl = document.getElementById("revenue-slider-badge");
        var newBadgeText = revenueBadgeLabel(v);
        if (!badgeEl.textContent) {
          // Premier rendu -- pas de fondu à faire, rien à croiser.
          badgeEl.textContent = newBadgeText;
        } else if (badgeEl.textContent !== newBadgeText) {
          // Fondu croisé plutôt qu'un remplacement de texte brutal : on
          // masque, on change le texte pendant que c'est invisible, on
          // réaffiche -- jamais les deux libellés visibles en même temps.
          window.clearTimeout(revenueBadgeChangeTimer);
          badgeEl.classList.add("is-changing");
          revenueBadgeChangeTimer = window.setTimeout(
            function () {
              badgeEl.textContent = newBadgeText;
              badgeEl.classList.remove("is-changing");
            },
            reduceMotion ? 0 : 150
          );
        }

        var fillEl = document.getElementById("revenue-slider-fill");
        fillEl.style.transform = "scaleX(" + pct + ")";

        var mathEl = document.getElementById("revenue-slider-math");
        if (v > 0) {
          var clientCount = Math.ceil(v / REVENUE_PER_CLIENT);
          mathEl.textContent =
            "À " + REVENUE_PER_CLIENT + " € par client en moyenne, ça fait " + clientCount + " client" + (clientCount !== 1 ? "s" : "") + " à trouver.";
        } else {
          mathEl.textContent = "";
        }
      }

      // ---- Accumulateur de tags — libellés d'affichage ----------------
      // intention retiré de TAG_ORDER : plus d'écran dédié à rouvrir en
      // édition (voir enterEditMode()), donc plus de chip cliquable pour ce
      // champ -- la valeur reste interne (défaut "creation").
      var DEJA_CHERCHE_LABELS = { yes: "Déjà cherché", no: "Nouvelle recherche" };
      var QUESTION_LABELS = {
        budget: "Budget",
        temps: "Temps",
        secteur: "Secteur",
        dejaCherche: "Recherche"
      };
      // Ordre d'affichage fixe des tags, indépendant de l'ordre dans lequel
      // les questions ont été répondues.
      var TAG_ORDER = ["budget", "temps", "secteur", "dejaCherche"];

      function tagValueLabel(id) {
        var value = answers[id];
        if (value === undefined) return null;
        if (id === "budget") return BUDGET_LABELS[value] || value;
        if (id === "temps") return TIME_LABELS[value] || value;
        if (id === "dejaCherche") return DEJA_CHERCHE_LABELS[value] || value;
        if (id === "secteur") {
          return (value || []).map(function (v) { return SECTOR_LABELS[v] || v; }).join(" + ") || null;
        }
        return String(value);
      }

      var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      // cubic-bezier(0.16,1,0.3,1) -- même easing "reveal" que le reste du
      // site (FAQ, /concept.html), pas une nouvelle courbe inventée pour le
      // quiz. Les hovers (options, boutons) restent sur leurs transitions
      // CSS existantes, non touchées ici.
      var ENTER_TRANSITION = reduceMotion
        ? "opacity 220ms ease-out"
        : "transform 420ms cubic-bezier(0.16, 1, 0.3, 1), opacity 420ms cubic-bezier(0.16, 1, 0.3, 1)";
      var EXIT_TRANSITION = reduceMotion
        ? "opacity 220ms ease-out"
        : "transform 280ms cubic-bezier(0.4, 0, 1, 1), opacity 280ms cubic-bezier(0.4, 0, 1, 1)";
      var EXIT_MS = reduceMotion ? 220 : 280;
      var ENTER_MS = reduceMotion ? 220 : 420;
      // Écran miroir -- climax émotionnel du quiz, doit se sentir différent
      // du reste : apparition nettement plus lente sur la même courbe.
      var MIRROR_ENTER_TRANSITION = reduceMotion
        ? "opacity 220ms ease-out"
        : "transform 700ms cubic-bezier(0.16, 1, 0.3, 1), opacity 700ms cubic-bezier(0.16, 1, 0.3, 1)";
      var MIRROR_ENTER_MS = reduceMotion ? 220 : 700;

      // intention n'a plus d'écran dédié -- "creation" est la valeur par
      // défaut interne, jamais demandée explicitement. Seule bascule
      // possible : le lien discret sur l'écran résultat (-> "rachat").
      var answers = { intention: "creation" };
      var navHistory = [];
      var currentScreenEl = null;
      var currentQuestionIndex = 0;
      var multiAdvanceTimer = null;
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

      // Traduit un index brut de questionScreens (intro/miroir/auth compris)
      // en nombre de segments "réels" à remplir dans la barre segmentée --
      // seules les questions marquées data-chapter comptent, et seulement
      // si elles n'ont pas été sautées (skipIf), sinon un budget sauté
      // gonflerait artificiellement la progression.
      function progressFillCount(index) {
        var count = 0;
        for (var i = 0; i < index && i < questionScreens.length; i += 1) {
          if (questionScreens[i].hasAttribute("data-chapter") && !isSkipped(i)) count += 1;
        }
        return count;
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

        if (id === "proof" || id === "intro" || id === "mirror") {
          // Écrans purement informatifs, rien à répondre — mais openQuiz()
          // désactive TOUS les boutons .quiz-next à l'ouverture (y compris
          // celui-ci), donc il faut le réactiver explicitement ici, pas
          // juste "ne pas y toucher".
          nextBtn.disabled = false;
          return;
        }

        if (id === "objectifRevenu") {
          // Le slider a toujours une valeur (position par défaut au milieu
          // de la plage) -- contrairement aux écrans à options, rien à
          // cocher pour que ce soit "répondu" : toujours activé.
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

        var isMirrorScreen = nextEl.getAttribute("data-id") === "mirror";
        if (isMirrorScreen) startPauseCountUp();

        var enterFrom = direction === "back" ? -24 : 24;
        var exitTo = direction === "back" ? 24 : -24;

        nextEl.style.transition = "none";
        nextEl.style.opacity = "0";
        nextEl.style.transform = reduceMotion ? "none" : "translateX(" + enterFrom + "px)";
        nextEl.style.pointerEvents = "none";
        nextEl.classList.add("is-active");
        void nextEl.offsetWidth;

        var enterTransition = isMirrorScreen ? MIRROR_ENTER_TRANSITION : ENTER_TRANSITION;
        var enterMs = isMirrorScreen ? MIRROR_ENTER_MS : ENTER_MS;
        nextEl.style.transition = enterTransition;
        nextEl.style.opacity = "1";
        nextEl.style.transform = "translateX(0)";
        window.setTimeout(function () {
          nextEl.style.pointerEvents = "auto";
          transitionInProgress = false;
        }, enterMs);

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

      // Appelle generate-user-concept (mise en cache côté serveur dans
      // user_concepts -- un seul appel LLM par utilisateur, jamais un
      // exemple inventé côté client). situation/passif ne sont pas encore
      // des colonnes profiles (voir quiz.questions plus haut) donc transmis
      // dans le corps de la requête plutôt qu'en base.
      function fetchGeneratedConcept(ans, cb, forceRegenerate) {
        callEdgeFunctionAuthed("generate-user-concept", {
          situation: ans.situation || null,
          passif: ans.passif || null,
          objectifRevenu: typeof ans.objectifRevenu === "number" ? ans.objectifRevenu : null,
          forceRegenerate: !!forceRegenerate
        })
          .then(function (res) {
            cb(res && res.concept ? res.concept : null);
          })
          .catch(function () {
            cb(null);
          });
      }

      // Lien discret "tu cherches plutôt à racheter ?" -- retague
      // profiles.intention côté client (même pattern que persistQuizAnswers,
      // RLS déjà en place pour l'update de sa propre ligne), puis régénère
      // le concept avec forceRegenerate:true pour contourner le cache
      // (sinon generate-user-concept renverrait l'ancien concept "creation"
      // tel quel).
      function handleIntentionToggle() {
        var btn = document.getElementById("result-intention-toggle");
        var statusEl = document.getElementById("result-intention-toggle-status");
        var supabase = window.ColdTrendSupabase;
        if (!supabase || !btn) return;

        btn.disabled = true;
        if (statusEl) statusEl.textContent = "Régénération du concept en cours…";

        supabase.auth
          .getUser()
          .then(function (res) {
            var user = res.data ? res.data.user : null;
            if (!user) throw new Error("no session");
            return supabase.from("profiles").update({ intention: "rachat" }).eq("id", user.id);
          })
          .then(function () {
            answers.intention = "rachat";
            fetchGeneratedConcept(
              answers,
              function (concept) {
                btn.disabled = false;
                if (!concept) {
                  if (statusEl) statusEl.textContent = "Échec de la régénération, réessaie plus tard.";
                  return;
                }
                answers.concept = concept;
                renderConceptTeaser(concept);
                if (statusEl) statusEl.textContent = "Concept mis à jour pour un rachat de SaaS.";
                btn.style.display = "none";
              },
              true
            );
          })
          .catch(function () {
            btn.disabled = false;
            if (statusEl) statusEl.textContent = "Échec de la mise à jour, réessaie plus tard.";
          });
      }

      function renderConceptTeaser(concept) {
        var wrap = document.getElementById("result-preview");
        var nameEl = document.getElementById("quiz-concept-name");
        var taglineEl = document.getElementById("quiz-concept-tagline");
        if (!concept) {
          // État d'attente -- affiché tel quel, sans l'animation de reveal
          // (réservée au moment où le vrai nom généré arrive).
          if (nameEl) {
            nameEl.textContent = "Ton concept";
            nameEl.classList.add("is-revealed");
          }
          if (taglineEl) taglineEl.textContent = "Débloque ton accès pour voir le concept complet généré pour toi.";
          return;
        }
        if (nameEl) {
          nameEl.textContent = concept.concept_name;
          // Reveal progressif (clip-path qui s'ouvre) au moment où le vrai
          // nom remplace le "…" de chargement -- jamais un affichage
          // statique immédiat pour le climax du parcours.
          nameEl.classList.remove("is-revealed");
          void nameEl.offsetWidth;
          nameEl.classList.add("is-revealed");
        }
        if (taglineEl) taglineEl.textContent = concept.tagline;
        if (wrap) wrap.hidden = false;
      }

      function sectorSummary() {
        var sectorIds = answers.secteur || [];
        var names = sectorIds.map(function (id) {
          return SECTOR_LABELS[id] || id;
        });
        return names.length ? names.join(", ") : "";
      }

      var pauseCountUpDone = false;

      // Compte-up 0 -> valeur cible, ~1300ms, easing cubic-bezier(0.16,1,0.3,1)
      // (même courbe "reveal" que le reste du site). Ne joue qu'une fois par
      // session de quiz -- revenir sur cet écran (Retour) réaffiche direct
      // la valeur finale plutôt que de rejouer l'animation à chaque fois.
      function easeOutExpoPause(t) {
        return t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
      }

      function startPauseCountUp() {
        var el = document.getElementById("quiz-pause-number");
        if (!el) return;
        var target = Number(el.getAttribute("data-target")) || 0;
        if (reduceMotion || pauseCountUpDone) {
          el.textContent = target.toLocaleString("fr-FR");
          return;
        }
        pauseCountUpDone = true;
        var duration = 1300;
        var start = null;
        function step(ts) {
          if (!start) start = ts;
          var progress = Math.min((ts - start) / duration, 1);
          var value = Math.round(target * easeOutExpoPause(progress));
          el.textContent = value.toLocaleString("fr-FR");
          if (progress < 1) window.requestAnimationFrame(step);
        }
        window.requestAnimationFrame(step);
      }

      function goToResult() {
        reachedResult = true;
        transitionTo(resultScreen, "forward");

        // match_count reste la colonne DB historique (pas de migration pour
        // ce pivot) mais sa sémantique change : elle marque juste "quiz
        // complété", plus un vrai comptage de fiches correspondantes.
        answers.matchCount = 1;
        persistQuizAnswers();

        var titleEl = document.getElementById("quiz-result-title");
        titleEl.textContent = "Ton concept a été généré.";

        var metaParts = [];
        var sectorText = sectorSummary();
        if (sectorText) metaParts.push(sectorText);
        if (answers.budget) metaParts.push("budget " + (BUDGET_LABELS[answers.budget] || answers.budget));
        if (answers.temps) metaParts.push((TIME_LABELS[answers.temps] || answers.temps) + " par semaine");
        document.getElementById("quiz-result-meta").textContent = metaParts.join(" · ");

        renderConceptTeaser(answers.concept || null);

        fetchGeneratedConcept(answers, function (concept) {
          if (!concept) return;
          answers.concept = concept;
          renderConceptTeaser(concept);
        });
      }

      function goToPayment() {
        trackEvent("result_cta_clicked", {});
        var teaserEl = document.getElementById("quiz-teaser");
        var conceptName = answers.concept ? answers.concept.concept_name : "ton concept";
        teaserEl.textContent = conceptName + " — débloque la description complète, la cible et les canaux d'acquisition.";

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

        applyWelcomeOffer();
        transitionTo(paymentScreen, "forward");
      }

      // Assignation déterministe du code de bienvenue à partir d'un signal
      // réel déjà en base (voir get-welcome-offer) -- jamais un tirage
      // aléatoire à chaque chargement, jamais un chiffre affiché sans
      // source. Si l'appel échoue ou si le code assigné est épuisé, le
      // price-block par défaut (prix plein, bouton "Obtenir mon accès")
      // reste affiché tel quel -- pas de dégradation visible.
      function applyWelcomeOffer() {
        var supabase = window.ColdTrendSupabase;
        var payBtn = document.getElementById("quiz-pay-btn");
        if (!supabase || !payBtn) return;

        callEdgeFunctionAuthed("get-welcome-offer").then(function (offer) {
          if (!offer || offer.error || !offer.available) return;

          var oldPrice = (offer.basePriceCents / 100).toFixed(2).replace(".", ",") + " €";
          var newPrice = (offer.finalPriceCents / 100).toFixed(2).replace(".", ",") + " €";

          document.getElementById("price-block-default").hidden = true;
          var offerBlock = document.getElementById("welcome-offer-block");
          document.getElementById("welcome-offer-eyebrow").textContent = offer.isFirstView
            ? "Offre de bienvenue — ta première visite ici"
            : "Ton offre de reprise";
          var returnBanner = document.getElementById("quiz-return-banner");
          if (returnBanner) returnBanner.hidden = offer.isFirstView;
          document.getElementById("welcome-offer-price-old").textContent = oldPrice;
          document.getElementById("welcome-offer-price-new").textContent = newPrice;

          var counterEl = document.getElementById("welcome-offer-counter");
          if (offer.showCounter) {
            counterEl.textContent = "Plus que " + offer.remaining + " place" + (offer.remaining !== 1 ? "s" : "") + " à ce tarif.";
            counterEl.hidden = false;
          } else {
            counterEl.hidden = true;
          }
          offerBlock.hidden = false;

          payBtn.textContent = "Appliquer et payer " + newPrice;
          try {
            var url = new URL(payBtn.href);
            url.searchParams.set("prefilled_promo_code", offer.code);
            payBtn.href = url.toString();
          } catch (err) {
            console.warn("[ColdTrend] impossible d'appliquer le code promo à l'URL Stripe :", err);
          }
        });
      }

      // Même pattern que callEdgeFunction() (voir /compte) : POST avec le
      // token de session courant, jamais un appel non authentifié pour une
      // route qui lit des données propres à l'utilisateur.
      async function callEdgeFunctionAuthed(name, body) {
        var supabase = window.ColdTrendSupabase;
        var sessionRes = await supabase.auth.getSession();
        var token = sessionRes.data.session ? sessionRes.data.session.access_token : null;
        if (!token) return null;
        var res = await fetch(supabase.supabaseUrl + "/functions/v1/" + name, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: supabase.supabaseKey,
            Authorization: "Bearer " + token
          },
          body: JSON.stringify(body || {})
        });
        return res.json();
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
        saveDraftLocally();
        persistProgress(next);
        if (next >= questionScreens.length) {
          setProgress(progressFillCount(questionScreens.length));
          goToResult();
        } else {
          setProgress(progressFillCount(next));
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
        // "auth" est maintenant le DERNIER écran avant le résultat (voir
        // quiz.questions) -- il n'y a plus jamais de "prochaine question"
        // après lui, contrairement à l'ancien ordre où c'était la première.
        navHistory.push(currentQuestionIndex);
        var next = findNextQuestionIndex(currentQuestionIndex);
        currentQuestionIndex = next;
        updateBackVisibility();
        authResolutionPromise = resolveIdentityRequest(email, password);

        if (next >= questionScreens.length) {
          setProgress(progressFillCount(questionScreens.length));
          goToResult();
        } else {
          setProgress(progressFillCount(next));
          var screenEl = questionScreens[next];
          updateNextEnabled(screenEl);
          transitionTo(screenEl, "forward");
        }
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
        // "auth" n'est plus forcément à l'index 0 (déplacé en dernier) --
        // on le retrouve par son data-id plutôt que de supposer sa position.
        // L'échec arrive après la transition optimiste vers le résultat
        // (voir handleAuthSubmit) : reachedResult doit repasser à false, le
        // compte n'a en réalité jamais été confirmé.
        var authIndex = -1;
        for (var i = 0; i < questionScreens.length; i += 1) {
          if (questionScreens[i].getAttribute("data-id") === "auth") {
            authIndex = i;
            break;
          }
        }
        if (authIndex === -1) return;
        reachedResult = false;
        navHistory = buildNavHistoryUpTo(authIndex);
        currentQuestionIndex = authIndex;
        setProgress(progressFillCount(authIndex), true);
        updateBackVisibility();
        var authScreen = questionScreens[authIndex];
        var emailInput = document.getElementById("quiz-auth-email");
        var passwordInput = document.getElementById("quiz-auth-password");
        emailInput.value = answers.email || "";
        passwordInput.value = "";
        updateNextEnabled(authScreen);
        transitionTo(authScreen, "back");
        passwordInput.focus();
      }

      // ---- Brouillon pré-auth (localStorage) -----------------------------
      //
      // "auth" est maintenant le DERNIER écran avant le résultat -- aucune
      // session n'existe tant qu'il n'est pas soumis, donc aucune écriture
      // Supabase n'est possible avant ce point (persistProgress() no-op
      // silencieusement faute d'utilisateur). Le brouillon vit en
      // localStorage jusque-là, migré vers profiles par persistQuizAnswers()
      // une fois le compte créé (voir goToResult()), puis vidé.
      var QUIZ_DRAFT_KEY = "coldtrend_quiz_draft";

      function saveDraftLocally() {
        try {
          window.localStorage.setItem(
            QUIZ_DRAFT_KEY,
            JSON.stringify({ answers: answers, stepIndex: currentQuestionIndex })
          );
        } catch (err) {
          // Stockage indisponible (navigation privée, quota) -- pas grave,
          // la session courante fonctionne quand même, seule la reprise
          // après fermeture d'onglet serait perdue.
        }
      }

      function loadDraftLocally() {
        try {
          var raw = window.localStorage.getItem(QUIZ_DRAFT_KEY);
          if (!raw) return null;
          var parsed = JSON.parse(raw);
          if (!parsed || typeof parsed.stepIndex !== "number") return null;
          return parsed;
        } catch (err) {
          return null;
        }
      }

      function clearDraftLocally() {
        try {
          window.localStorage.removeItem(QUIZ_DRAFT_KEY);
        } catch (err) {
          /* rien à faire si le storage est indisponible */
        }
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
                // Pivot : match_count reste la colonne DB historique (pas de
                // migration pour ce détail), mais sa sémantique n'est plus un
                // vrai comptage de fiches correspondantes -- juste un flag
                // "quiz complété" (toujours 1 une fois goToResult() atteint).
                match_count: answers.matchCount,
                funnel_last_step: 6,
                converted: true
              })
              .eq("id", user.id)
              .then(function (res) {
                if (res.error) {
                  console.warn("[ColdTrend] mise à jour profiles échouée :", res.error.message);
                  return;
                }
                // Le compte a maintenant tout en base -- le brouillon
                // localStorage n'a plus de raison d'exister (et redeviendrait
                // faux si l'utilisateur relance un quiz plus tard).
                clearDraftLocally();
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
          if (id === "objectifRevenu") {
            // Toujours resynchronisé, même si answers.objectifRevenu est
            // encore undefined (brouillon sauvegardé avant l'ajout de cette
            // question, ou reprise depuis profiles qui ne la connaît pas) --
            // sinon le slider affiche sa valeur par défaut sans que answers
            // ne la reflète, et generate-user-concept ne la recevrait jamais.
            var sliderInput = document.getElementById("revenue-slider-input");
            if (sliderInput) {
              if (typeof answers.objectifRevenu === "number") {
                sliderInput.value = String(answers.objectifRevenu);
              }
              updateRevenueSlider();
            }
            return;
          }
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

      // propagateAnswerDependencies()/fadeOutAndRemoveTag() retirés : leur
      // seule raison d'être était la dépendance intention -> budget (budget
      // skip conditionnel si intention == "copier" via l'ancien écran
      // dédié). Cet écran n'existe plus et budget n'est plus jamais sauté
      // (voir quiz.questions) -- plus aucune dépendance réelle entre
      // questions dans ce quiz.

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
        setProgress(progressFillCount(targetIndex), true);
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
        saveDraftLocally();
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
          setProgress(progressFillCount(ctx.returnIndex), true);
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

      // Le brouillon localStorage passe en premier, avant même de vérifier
      // la session : c'est la source la plus fraîche (elle survit à un
      // redirect complet, par ex. après le clic "Continuer avec Google" à
      // l'écran auth -- désormais le DERNIER écran, donc potentiellement
      // après 5 questions déjà répondues, contrairement à answers en
      // mémoire qui ne survivrait pas au rechargement de page). La reprise
      // depuis profiles (funnel_last_step) ci-dessous ne sert plus que
      // pour un retour sur un autre appareil sans ce localStorage, ou un
      // compte créé avant cette refonte du funnel.
      function determineStartIndex() {
        var supabase = window.ColdTrendSupabase;
        var draft = loadDraftLocally();
        if (draft && draft.stepIndex > 0 && draft.stepIndex < questionScreens.length) {
          answers = draft.answers || {};
          // Brouillon sauvegardé avant le retrait de l'écran "intention",
          // ou answers.intention jamais posé -- même valeur par défaut que
          // l'ouverture normale du quiz.
          if (!answers.intention) answers.intention = "creation";
          navHistory = buildNavHistoryUpTo(draft.stepIndex);
          restoreAnswersUI();
          updateBackVisibility();
          if (!supabase) return Promise.resolve(draft.stepIndex);
          return supabase.auth.getSession().then(function (res) {
            var user = res.data.session ? res.data.session.user : null;
            if (!user || user.is_anonymous) return draft.stepIndex;
            showConnectedBadge();
            // Le compte existe déjà (ex: retour d'un redirect Google
            // complet, qui recharge la page en plein milieu du brouillon) --
            // si le brouillon pointait sur "auth" ou au-delà, tout est déjà
            // répondu ET le compte confirmé : plus rien à demander, direct
            // au résultat plutôt que de remontrer l'écran auth.
            var authIndex = -1;
            for (var i = 0; i < questionScreens.length; i += 1) {
              if (questionScreens[i].getAttribute("data-id") === "auth") {
                authIndex = i;
                break;
              }
            }
            if (authIndex !== -1 && draft.stepIndex >= authIndex) {
              return questionScreens.length;
            }
            return draft.stepIndex;
          });
        }

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
                answers.intention = profile.intention || "creation";
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
        answers = { intention: "creation" };
        navHistory = [];
        currentQuestionIndex = 0;
        currentScreenEl = null;
        reachedResult = false;
        pauseCountUpDone = false;
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
        var welcomeOfferBlock = document.getElementById("welcome-offer-block");
        if (welcomeOfferBlock) welcomeOfferBlock.hidden = true;
        var resultPreviewBlock = document.getElementById("result-preview");
        if (resultPreviewBlock) resultPreviewBlock.hidden = true;
        var returnBannerReset = document.getElementById("quiz-return-banner");
        if (returnBannerReset) returnBannerReset.hidden = true;
        var priceBlockDefault = document.getElementById("price-block-default");
        if (priceBlockDefault) priceBlockDefault.hidden = false;
        var quizPayBtnReset = document.getElementById("quiz-pay-btn");
        if (quizPayBtnReset) {
          quizPayBtnReset.textContent = quizPayBtnDefaultText;
          quizPayBtnReset.href = quizPayBtnDefaultHref;
        }

        overlay.classList.add("is-open");
        document.body.style.overflow = "hidden";
        resetScreensVisualState();
        setProgress(0, true);
        updateBackVisibility();

        determineStartIndex().then(function (startIndex) {
          currentQuestionIndex = startIndex;
          if (startIndex >= questionScreens.length) {
            setProgress(progressFillCount(questionScreens.length));
            goToResult();
            return;
          }
          setProgress(progressFillCount(startIndex), true);
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
        if (multiAdvanceTimer) {
          window.clearTimeout(multiAdvanceTimer);
          multiAdvanceTimer = null;
        }
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

            if (id === "dejaCherche" || id === "budget") {
              var followupEl2 = document.getElementById("quiz-followup");
              var followupText = optBtn.getAttribute("data-followup");
              // Le budget n'a une reassurance que sur les réponses
              // "inconfortables" (low/undecided) -- pas la peine de forcer
              // une phrase là où il n'y a rien à dédramatiser (mid/high).
              if (followupEl2) {
                if (followupText) {
                  followupEl2.textContent = followupText;
                  followupEl2.classList.add("is-visible");
                } else {
                  followupEl2.classList.remove("is-visible");
                }
              }
            }
          }
          renderTags();
          updateNextEnabled(screenEl);

          // Avance automatiquement sur tous les ecrans a options, plus de
          // bouton "Continuer" (voir renderQuizQuestionScreen). Choix
          // unique : delai court, juste le temps de voir la selection (et
          // le texte de suivi sur "dejaCherche"). Choix multiple (secteur) :
          // debounce plus long, reinitialise a chaque clic -- laisse le
          // temps de cocher plusieurs cases avant de partir, sans jamais
          // partir avant que l'utilisateur arrete de cliquer.
          if (multiAdvanceTimer) {
            window.clearTimeout(multiAdvanceTimer);
            multiAdvanceTimer = null;
          }
          if (type === "multi") {
            // Ne programme l'avance que s'il reste au moins une selection --
            // decocher la derniere case ne doit jamais faire avancer avec
            // une reponse vide (meme regle que l'ancien bouton disabled).
            if (answers[id] && answers[id].length > 0) {
              multiAdvanceTimer = window.setTimeout(function () {
                multiAdvanceTimer = null;
                goForwardFromQuestion();
              }, 1100);
            }
          } else {
            window.setTimeout(function () {
              goForwardFromQuestion();
            }, 450);
          }
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

        if (e.target.closest("#result-intention-toggle")) {
          handleIntentionToggle();
          return;
        }
      });

      stage.addEventListener("input", function (e) {
        if (e.target.id === "quiz-auth-email" || e.target.id === "quiz-auth-password") {
          updateNextEnabled(e.target.closest(".quiz-screen"));
        }
        if (e.target.id === "revenue-slider-input") {
          updateRevenueSlider();
        }
      });

      // "change" (relâchement du drag/du clavier), distinct de "input" (live
      // pendant le drag) -- la pulsation de confirmation ne doit jouer
      // qu'une fois le choix arrêté.
      stage.addEventListener("change", function (e) {
        if (e.target.id === "revenue-slider-input") {
          pulseRevenueValueOnRelease();
        }
      });

      // Valeur/badge/barre affichés dès l'ouverture du quiz, avant toute
      // interaction -- le slider a déjà une valeur par défaut au rendu
      // serveur (voir renderQuizQuestionScreen), l'écran ne doit jamais
      // s'afficher vide en attendant un premier drag.
      updateRevenueSlider();

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
        // Annule une avance automatique en attente (ecran secteur) : cliquer
        // Retour pendant le debounce ne doit jamais declencher un forward
        // programme juste apres.
        if (multiAdvanceTimer) {
          window.clearTimeout(multiAdvanceTimer);
          multiAdvanceTimer = null;
        }
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
        setProgress(progressFillCount(prevIndex), true);
        updateBackVisibility();
        var screenEl = questionScreens[prevIndex];
        updateNextEnabled(screenEl);
        transitionTo(screenEl, "back");
      });

      closeBtn.addEventListener("click", closeQuiz);
      openBtn.addEventListener("click", openQuiz);
      var heroQuizBtn = document.getElementById("hero-quiz-btn");
      if (heroQuizBtn) heroQuizBtn.addEventListener("click", openQuiz);
      var navCtaBtn = document.getElementById("nav-cta-btn");
      if (navCtaBtn) navCtaBtn.addEventListener("click", openQuiz);
      var navCtaBtnMobile = document.getElementById("nav-cta-btn-mobile");
      if (navCtaBtnMobile) navCtaBtnMobile.addEventListener("click", openQuiz);
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

      // Checklist "façon reçu" affichée avant de rouvrir les questions --
      // chaque champ déjà en base est une ligne vérifiée, pas un simple %.
      // L'ordre suit TAG_ORDER (déjà utilisé pour les tags de résumé) pour
      // ne pas introduire un deuxième référentiel d'ordre des questions.
      var RESUME_CHECKLIST_LABELS = {
        budget: "Budget",
        temps: "Temps disponible",
        secteur: "Secteur visé",
        dejaCherche: "Contexte de recherche"
      };

      function resumeChecklistItems(profile) {
        var fieldMap = {
          budget: profile.budget,
          temps: profile.temps,
          secteur: profile.secteur,
          dejaCherche: profile.deja_cherche
        };
        // budget n'est plus jamais sauté (voir quiz.questions) -- plus de
        // filtre conditionnel ici.
        return TAG_ORDER.map(function (id) {
          var value = fieldMap[id];
          var isChecked = id === "secteur" ? !!(value && value.length) : value !== null && value !== undefined && value !== "";
          return { id: id, label: RESUME_CHECKLIST_LABELS[id], checked: isChecked };
        });
      }

      // Injecté au build (pas ${'$'}{ICON_CHECK_SMALL} directement : ici on est
      // dans du JS client, pas dans un template HTML) -- même icône que les
      // autres checks du quiz (options sélectionnées, badge connecté...).
      var RESUME_CHECK_ICON = ${JSON.stringify(ICON_CHECK_SMALL)};

      function renderResumeChecklist(profile) {
        var items = resumeChecklistItems(profile);
        var checkedCount = items.filter(function (item) { return item.checked; }).length;

        var listEl = document.getElementById("resume-checklist");
        listEl.innerHTML = items
          .map(function (item) {
            return (
              '<li class="quiz-resume__item' + (item.checked ? " is-checked" : "") + '">' +
              '<span class="quiz-resume__item-icon" aria-hidden="true">' + (item.checked ? RESUME_CHECK_ICON : "") + "</span>" +
              "<span>" + item.label + "</span>" +
              "</li>"
            );
          })
          .join("");

        var pct = items.length ? Math.round((checkedCount / items.length) * 100) : 0;
        document.getElementById("resume-progress-fill").style.width = pct + "%";
        document.getElementById("resume-progress-label").textContent =
          checkedCount + " réponse" + (checkedCount !== 1 ? "s" : "") + " vérifiée" + (checkedCount !== 1 ? "s" : "") + " sur " + items.length;

        var titleEl = document.getElementById("resume-title");
        if (titleEl) {
          titleEl.textContent = profile.prenom
            ? profile.prenom + ", ton dossier est vérifié à " + pct + "%."
            : "Ton dossier est vérifié à " + pct + "%.";
        }
      }

      // Retour depuis le lien de relance d'abandon (email envoyé par
      // supabase/functions/send-abandon-emails) ou depuis "Mon dossier" dans
      // le header (voir comptePage() : redirection quand match_count n'est
      // pas encore renseigné) : ?resume=quiz redirige ici avec une session
      // déjà établie. Plutôt que de rouvrir directement sur la question
      // suivante (silencieux, aucune indication de ce qui a déjà été
      // répondu), on affiche d'abord un écran de transition "façon reçu" --
      // cohérent avec le positionnement preuve/vérification du reste du
      // site -- puis determineStartIndex() reprend au bon écran une fois
      // "Terminer mon dossier" cliqué.
      (function resumeQuizFromRecoveryLink() {
        var params = new URLSearchParams(window.location.search);
        if (params.get("resume") !== "quiz") return;

        params.delete("resume");
        var cleanUrl = window.location.pathname + (params.toString() ? "?" + params.toString() : "");
        window.history.replaceState({}, "", cleanUrl);

        function openTransitionScreen(profile) {
          renderResumeChecklist(profile);
          overlay.classList.add("is-open");
          document.body.style.overflow = "hidden";
          resetScreensVisualState();
          setProgress(0, true);
          currentScreenEl = null;
          var transitionScreen = document.getElementById("quiz-resume-transition");
          transitionTo(transitionScreen, "forward");

          var continueBtn = document.getElementById("resume-continue-btn");
          continueBtn.onclick = function () {
            determineStartIndex().then(function (startIndex) {
              currentQuestionIndex = startIndex;
              if (startIndex >= questionScreens.length) {
                setProgress(progressFillCount(questionScreens.length));
                goToResult();
                return;
              }
              setProgress(progressFillCount(startIndex), true);
              var screenEl = questionScreens[startIndex];
              updateNextEnabled(screenEl);
              transitionTo(screenEl, "forward");
            });
          };
        }

        function tryResume() {
          var supabase = window.ColdTrendSupabase;
          if (!supabase) return;
          supabase.auth.getSession().then(function (res) {
            var user = res.data.session ? res.data.session.user : null;
            if (!user) return;
            // Quiz déjà qualifié (match_count renseigné) : rien à reprendre,
            // ?resume=result est le chemin dédié à ce cas -- ici on se
            // contente d'un fallback vers l'ouverture normale du quiz.
            supabase
              .from("profiles")
              .select("intention, budget, temps, secteur, deja_cherche, match_count, prenom")
              .eq("id", user.id)
              .single()
              .then(function (profileRes) {
                var profile = profileRes.data;
                if (!profile || (profile.match_count !== null && profile.match_count !== undefined)) {
                  openQuiz();
                  return;
                }
                openTransitionScreen(profile);
              });
          });
        }

        if (window.ColdTrendSupabase) {
          tryResume();
        } else {
          document.addEventListener("coldtrend:supabase-ready", tryResume, { once: true });
        }
      })();

      // Retour depuis "Mon dossier" quand le quiz est déjà qualifié
      // (match_count renseigné) mais pas encore payé : reconstruit l'écran
      // résultat/paiement directement depuis profiles, sans repasser par les
      // questions déjà répondues (goToResult() lit la variable "answers",
      // pas la base -- on la remplit à la main avant de l'appeler).
      (function resumeToResultScreen() {
        var params = new URLSearchParams(window.location.search);
        if (params.get("resume") !== "result") return;

        params.delete("resume");
        var cleanUrl = window.location.pathname + (params.toString() ? "?" + params.toString() : "");
        window.history.replaceState({}, "", cleanUrl);

        function tryResume() {
          var supabase = window.ColdTrendSupabase;
          if (!supabase) return;
          supabase.auth.getSession().then(function (res) {
            var user = res.data.session ? res.data.session.user : null;
            if (!user) return;
            supabase
              .from("profiles")
              .select("intention, budget, temps, secteur, deja_cherche, match_count")
              .eq("id", user.id)
              .single()
              .then(function (profileRes) {
                var profile = profileRes.data;
                if (!profile || profile.match_count === null || profile.match_count === undefined) {
                  openQuiz();
                  return;
                }
                answers.intention = profile.intention || "creation";
                answers.budget = profile.budget || undefined;
                answers.temps = profile.temps || undefined;
                answers.secteur = profile.secteur || undefined;
                if (profile.deja_cherche === true) answers.dejaCherche = "yes";
                else if (profile.deja_cherche === false) answers.dejaCherche = "no";
                answers.matchCount = profile.match_count;

                overlay.classList.add("is-open");
                document.body.style.overflow = "hidden";
                resetScreensVisualState();
                currentScreenEl = null;
                goToResult();
              });
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

// Composant réutilisable : liste de logos { src, alt } -> deux passages
// dupliqués (le second aria-hidden) pour une boucle de marquee sans coupure
// visible, même technique déjà en place ailleurs sur cette page (mask-image
// + translateX(-50%)).
function renderProofLogos(logos, ariaHidden) {
  return logos
    .map(
      (logo) => `<div class="proof__card"${ariaHidden ? ' aria-hidden="true"' : ""}>
        <img class="proof__logo" src="${logo.src}" alt="${ariaHidden ? "" : logo.alt}" loading="lazy" />
      </div>`
    )
    .join("\n          ");
}

function renderFaqItems(items) {
  return items
    .map(
      // transition-delay a une valeur par propriété listée dans `transition`
      // (opacity, transform, background, dans cet ordre) -- seules les deux
      // premières (le reveal au scroll) sont décalées en cascade, le
      // background d'ouverture reste instantané au clic, sinon ouvrir
      // l'item #8 traînerait le tint de 720ms derrière le clic.
      (item, index) => `<div class="faq__item" data-faq-item style="transition-delay:${index * 90}ms,${index * 90}ms,0ms">
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
// une seule timeline CSS (jamais une animation par mini-carte). Contenu tiré
// de REAL_SAAS_SAMPLE (vraies lignes de saas_listings_public, secteur +
// tranche de MRR) au lieu d'exemples inventés -- si la requête de build a
// échoué (REAL_SAAS_SAMPLE vide), on retombe sur les 3 libellés de secteur
// sans tranche de MRR plutôt que de crasher ou d'inventer des chiffres.
const proofSampleCards = REAL_SAAS_SAMPLE.length
  ? REAL_SAAS_SAMPLE.map((row) => {
      const secteurId = Array.isArray(row.secteur) && row.secteur.length ? row.secteur[0] : null;
      const sector = secteurId ? quiz.sectorLabels[secteurId] || secteurId : null;
      return sector ? { sector, bucket: row.mrr_bucket || null } : null;
    }).filter(Boolean)
  : [quiz.sectorLabels.b2b, quiz.sectorLabels.b2c, quiz.sectorLabels.both].map((sector) => ({
      sector,
      bucket: null
    }));

function renderProofBackground() {
  const cards = proofSampleCards.length
    ? proofSampleCards
    : [{ sector: quiz.sectorLabels.both, bucket: null }];

  function miniCard(i, withRecentLabel) {
    const card = cards[i % cards.length];
    const label = card.bucket ? `SaaS · ${card.sector} · MRR ${card.bucket}` : `SaaS · ${card.sector}`;
    return `<span class="proof-mini">
              <span class="proof-mini__bar"></span>
              <span class="proof-mini__sector">${label}</span>
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

// Icônes de chapitre du quiz -- traits fins, outline uniquement (jamais
// remplies), même famille visuelle que ICON_CHECK_SMALL/ICON_ARROW_LEFT
// (définies plus bas dans le fichier), juste plus grandes (28px) pour tenir
// seules au-dessus du label. Déclarées ici (avant QUIZ_CHAPTER_ICONS qui les
// référence) plutôt que groupées avec les autres ICON_* -- des `const` de
// premier niveau s'évaluent dans l'ordre du fichier, pas à l'appel.
const ICON_QUIZ_SITUATION =
  '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="8" r="3.5" stroke="currentColor" stroke-width="1.75"/><path d="M5 20c0-3.6 3.13-6.5 7-6.5s7 2.9 7 6.5" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/></svg>';
const ICON_QUIZ_PASSIF =
  '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M4 16l4.5-5 3.5 3 6-7.5" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/><path d="M14 6h4v4" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 20h16" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/></svg>';
const ICON_QUIZ_SECTEUR =
  '<svg width="32" height="24" viewBox="0 0 32 24" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="2" y="6" width="10" height="16" rx="1" stroke="currentColor" stroke-width="1.75"/><path d="M5.5 9.5h1M5.5 13h1M5.5 16.5h1M9.5 9.5h1M9.5 13h1M9.5 16.5h1" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><circle cx="23" cy="9.5" r="3" stroke="currentColor" stroke-width="1.75"/><path d="M18 22c0-3 2.24-5.5 5-5.5s5 2.5 5 5.5" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/></svg>';
const ICON_QUIZ_BUDGET =
  '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="8.5" stroke="currentColor" stroke-width="1.75"/><path d="M9.3 14.5c.4 1 1.4 1.6 2.7 1.6 1.6 0 2.7-.8 2.7-2s-1-1.7-2.7-2c-1.7-.3-2.7-.8-2.7-2s1.1-2 2.7-2c1.3 0 2.3.6 2.7 1.6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M12 7.3v1.1M12 15.6v1.1" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';
const ICON_QUIZ_TEMPS =
  '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="8.5" stroke="currentColor" stroke-width="1.75"/><path d="M12 7.5V12l3.2 2" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const ICON_QUIZ_OBJECTIF =
  '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="8.5" stroke="currentColor" stroke-width="1.75"/><circle cx="12" cy="12" r="4.5" stroke="currentColor" stroke-width="1.75"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/></svg>';
const ICON_QUIZ_RECHERCHE =
  '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="10.5" cy="10.5" r="6.5" stroke="currentColor" stroke-width="1.75"/><path d="M19 19l-4-4" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/></svg>';

const QUIZ_CHAPTER_ICONS = {
  situation: ICON_QUIZ_SITUATION,
  passif: ICON_QUIZ_PASSIF,
  secteur: ICON_QUIZ_SECTEUR,
  budget: ICON_QUIZ_BUDGET,
  objectif: ICON_QUIZ_OBJECTIF,
  temps: ICON_QUIZ_TEMPS,
  recherche: ICON_QUIZ_RECHERCHE
};

// Icône + libellé de chapitre au-dessus du titre -- absent sur les
// écrans sans chapterIcon (intention, intro, mirror, auth...) plutôt que
// d'inventer une icône pour des écrans qui n'en avaient pas dans le brief.
function renderChapterHeader(question) {
  if (!question.chapterIcon) return "";
  const icon = QUIZ_CHAPTER_ICONS[question.chapterIcon] || "";
  return `<div class="quiz-chapter-icon" data-reveal style="transition-delay:0ms" aria-hidden="true">${icon}</div>
          <p class="quiz-chapter-label" data-reveal style="transition-delay:60ms">${question.chapterLabel || ""}</p>`;
}

function renderQuizQuestionScreen(question, index) {
  const skipAttrs = question.skipIf
    ? ` data-skip-field="${question.skipIf.field}" data-skip-equals="${question.skipIf.equals}"`
    : "";

  if (question.type === "intro") {
    // Écran de contexte, pas une question -- même bouton .quiz-next que le
    // reste pour rester dans le même moteur d'avancement (goForwardFromQuestion).
    return `<div class="quiz-screen quiz-intro" data-screen="question" data-index="${index}" data-id="${question.id}" data-step-name="${question.stepName}"${skipAttrs}>
          <h2 class="quiz-question-title">${question.title}</h2>
          <p class="quiz-subtext">${question.subtext}</p>
          <div class="quiz-footer">
            <button class="btn btn--primary quiz-next" type="button">${question.cta}</button>
          </div>
        </div>`;
  }

  if (question.type === "mirror") {
    // Charnière de fin de chapitre 1 -- écran de pause statistique (voir
    // commentaire sur la question "mirror" dans quiz.questions). Le
    // compte-up de #quiz-pause-number est déclenché dans transitionTo(),
    // pas ici (jamais lancé tant que l'écran n'est pas réellement affiché).
    // Positions/durées des avatars flottants et orbitaux fixées au build
    // (pas Math.random() côté client à chaque rendu -- déterministe, donc
    // stable si l'écran est revisité).
    const floatSeeds = [
      { top: 8, left: 6, dur: 14, delay: 0 },
      { top: 18, left: 82, dur: 17, delay: 1.2 },
      { top: 30, left: 20, dur: 12, delay: 2.4 },
      { top: 42, left: 68, dur: 16, delay: 0.6 },
      { top: 55, left: 12, dur: 13, delay: 3 },
      { top: 62, left: 90, dur: 15, delay: 1.8 },
      { top: 74, left: 34, dur: 18, delay: 2.1 },
      { top: 80, left: 58, dur: 12.5, delay: 0.9 },
      { top: 15, left: 45, dur: 14.5, delay: 2.7 },
      { top: 88, left: 78, dur: 16.5, delay: 1.5 }
    ];
    const floatAvatars = floatSeeds
      .map(
        (s, i) =>
          `<span class="pause-avatar-float pause-avatar-float--${(i % 5) + 1}" style="top:${s.top}%;left:${s.left}%;animation-duration:${s.dur}s;animation-delay:${s.delay}s"></span>`
      )
      .join("");
    const orbitAvatars = [1, 2, 3, 4, 5]
      .map((n) => `<span class="pause-avatar-orbit pause-avatar-orbit--${n}"></span>`)
      .join("");
    return `<div class="quiz-screen quiz-mirror" data-screen="question" data-index="${index}" data-id="${question.id}" data-step-name="${question.stepName}"${skipAttrs}>
          <div class="pause-avatars-bg" aria-hidden="true">${floatAvatars}</div>
          <div class="pause-content">
            <div class="pause-orbit" aria-hidden="true">${orbitAvatars}</div>
            <p class="quiz-mirror__eyebrow">${question.eyebrow}</p>
            <div class="pause-number-wrap">
              <div class="pause-glow" aria-hidden="true"></div>
              <div class="pause-number" id="quiz-pause-number" data-target="${question.pauseValue}">0</div>
            </div>
            <p class="pause-subtext">${question.subtext}</p>
          </div>
          <div class="quiz-footer">
            <button class="btn btn--primary quiz-next" type="button">Continuer — Chapitre 2</button>
          </div>
        </div>`;
  }

  if (question.type === "auth") {
    // Dernière étape du parcours, pas un gate à part : même carte, même
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

  if (question.type === "slider") {
    // Valeur de départ au milieu de la plage, jamais 0 -- un slider qui
    // démarre à zéro laisse croire à une réponse déjà donnée ("aucun
    // objectif"), alors qu'aucune interaction n'a encore eu lieu.
    const initial = Math.round((question.min + question.max) / 2 / question.step) * question.step;
    return `<div class="quiz-screen" data-screen="question" data-index="${index}" data-id="${question.id}" data-step-name="${question.stepName}"${skipAttrs}${question.chapter ? ` data-chapter="${question.chapter}"` : ""}>
          ${renderChapterHeader(question)}
          <h2 class="quiz-question-title">${question.title}</h2>
          ${question.subtext ? `<p class="quiz-subtext">${question.subtext}</p>` : ""}
          <div class="revenue-slider">
            <p class="revenue-slider__badge" id="revenue-slider-badge"></p>
            <p class="revenue-slider__value" id="revenue-slider-value"></p>
            <div class="revenue-slider__control">
              <div class="revenue-slider__track">
                <div class="revenue-slider__fill" id="revenue-slider-fill"></div>
              </div>
              <input type="range" class="revenue-slider__input" id="revenue-slider-input" min="${question.min}" max="${question.max}" step="${question.step}" value="${initial}" aria-label="${question.title}" />
            </div>
            <div class="revenue-slider__ticks">
              <span class="revenue-slider__tick">0 €</span>
              <span class="revenue-slider__tick">5 000 €</span>
              <span class="revenue-slider__tick">10 000 €</span>
              <span class="revenue-slider__tick">15 000 €</span>
              <span class="revenue-slider__tick">20 000 €</span>
            </div>
            <p class="revenue-slider__math" id="revenue-slider-math"></p>
          </div>
          <p class="revenue-slider__note">Ça nous aide à orienter le concept vers un modèle économique cohérent avec ton objectif.</p>
          <div class="quiz-footer">
            <button class="btn btn--primary quiz-next" type="button">Continuer</button>
          </div>
        </div>`;
  }

  const followupBlock =
    question.id === "dejaCherche" || question.id === "budget"
      ? `<p class="quiz-followup" id="quiz-followup" aria-live="polite"></p>`
      : "";

  // Avance automatiquement au clic sur tous les écrans à options (voir le
  // handler "quiz-option, quiz-chip" plus bas) -- jamais de bouton
  // "Continuer" a afficher. Le choix multiple (secteur) utilise un delai
  // plus long (debounce, reinitialise a chaque clic) pour laisser le temps
  // de cocher plusieurs cases avant de partir.
  const footerBlock = "";

  const chapterAttr = question.chapter ? ` data-chapter="${question.chapter}"` : "";

  return `<div class="quiz-screen" data-screen="question" data-index="${index}" data-id="${question.id}" data-step-name="${question.stepName}"${skipAttrs}${chapterAttr}>
          ${renderChapterHeader(question)}
          <h2 class="quiz-question-title">${question.title}</h2>
          ${question.subtext ? `<p class="quiz-subtext">${question.subtext}</p>` : ""}
          ${renderQuizOptions(question)}
          ${followupBlock}
          ${footerBlock}
        </div>`;
}

function renderQuizOverlay({ quiz, pricing, stripeLink }) {
  const questionScreens = quiz.questions.map(renderQuizQuestionScreen).join("\n        ");

  // Barre segmentée par chapitre, pas un simple avancement brut -- seules
  // les 5 questions "réelles" (marquées chapter) ont un segment ; intro,
  // miroir et auth sont des moments de cadrage, pas de la progression
  // comptabilisée. Voir progressFillCount() côté client pour la conversion
  // index d'écran -> nombre de segments remplis.
  function renderChapterSegs(count) {
    return Array.from({ length: count })
      .map(() => `<span class="quiz-progress__seg"><span class="quiz-progress__seg-fill"></span></span>`)
      .join("\n        ");
  }
  const chapter1Count = quiz.questions.filter((q) => q.chapter === 1).length;
  const chapter2Count = quiz.questions.filter((q) => q.chapter === 2).length;

  return `<div class="quiz-overlay" id="quiz-overlay" role="dialog" aria-modal="true" aria-label="Trouver ton SaaS">
    <div class="quiz-header">
      <button class="quiz-back" id="quiz-back-btn" type="button">${ICON_ARROW_LEFT} Retour</button>
      <span class="connected-badge" id="quiz-connected-badge" aria-live="polite">${ICON_CHECK_SMALL} Connecté</span>
      <button class="quiz-close" id="quiz-close-btn" type="button" aria-label="Fermer">${ICON_CLOSE}</button>
    </div>
    <div class="quiz-progress" id="quiz-progress">
      <div class="quiz-progress__group" data-chapter="1">
        ${renderChapterSegs(chapter1Count)}
      </div>
      <div class="quiz-progress__group-gap" aria-hidden="true"></div>
      <div class="quiz-progress__group" data-chapter="2">
        ${renderChapterSegs(chapter2Count)}
      </div>
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
        <h2 class="quiz-question-title" id="quiz-result-title">Ton concept a été généré.</h2>
        <p class="quiz-result__concept-eyebrow" id="quiz-concept-eyebrow">Concept généré pour toi</p>
        <div class="quiz-result__concept-name" id="quiz-concept-name">…</div>
        <p class="quiz-result__concept-tagline" id="quiz-concept-tagline"></p>
        <p class="quiz-result-meta" id="quiz-result-meta"></p>

        <div class="result-preview" id="result-preview" hidden>
          <p class="result-preview__label">Débloqué avec ton accès</p>
          <div class="result-preview__list" id="result-preview-list">
            <div class="result-preview__card">
              <span class="result-preview__meta-label">Description complète du concept</span>
              <span class="result-preview__lock" aria-hidden="true">${ICON_LOCK}</span>
            </div>
            <div class="result-preview__card">
              <span class="result-preview__meta-label">Cible et canaux d'acquisition</span>
              <span class="result-preview__lock" aria-hidden="true">${ICON_LOCK}</span>
            </div>
            <div class="result-preview__card">
              <span class="result-preview__meta-label">Direction artistique (palette, logo)</span>
              <span class="result-preview__lock" aria-hidden="true">${ICON_LOCK}</span>
            </div>
          </div>
        </div>

        <button class="btn btn--primary btn--full" id="quiz-see-offer-btn" type="button">Débloquer mon concept complet</button>

        <button class="result-intention-toggle" id="result-intention-toggle" type="button">Tu cherches plutôt à racheter un SaaS existant ? &rarr;</button>
        <p class="result-intention-toggle__status" id="result-intention-toggle-status" aria-live="polite"></p>

        <a class="result-bonus-chapter" href="/compte">
          <span class="result-bonus-chapter__eyebrow">Chapitre bonus, gratuit</span>
          <span class="result-bonus-chapter__title">Ton profil entrepreneur</span>
          <span class="result-bonus-chapter__text">9 questions courtes, un profil généré pour toi — disponible depuis ton dossier une fois ton accès débloqué.</span>
        </a>

        <div class="payment-faq">
          <p class="payment-faq__title">Questions fréquentes</p>
          ${renderFaqItems(paymentFaqItems)}
        </div>
      </div>

      <div class="quiz-screen quiz-payment" data-screen="payment" data-step-name="paiement">
        <p class="quiz-payment__teaser" id="quiz-teaser"></p>

        <div class="payment-card" id="payment-card">
          <div class="price-block" id="price-block-default">
            <div class="price-block__daily">Moins de <strong>${pricing.dailyPrice}</strong> par jour</div>
            <div class="price-block__total">${pricing.totalPrice} — ${pricing.totalNote}</div>
          </div>
          <p class="quiz-return-banner" id="quiz-return-banner" hidden>Bon retour — reprends exactement là où tu en étais.</p>
          <div class="welcome-offer" id="welcome-offer-block" hidden>
            <p class="welcome-offer__eyebrow" id="welcome-offer-eyebrow"></p>
            <div class="welcome-offer__price">
              <span class="welcome-offer__price-old" id="welcome-offer-price-old"></span>
              <span class="welcome-offer__price-new" id="welcome-offer-price-new"></span>
            </div>
            <p class="welcome-offer__counter" id="welcome-offer-counter" hidden></p>
          </div>
          <a class="btn btn--primary btn--cta-final" id="quiz-pay-btn" href="${stripeLink}">Obtenir mon accès — ${pricing.totalPrice}</a>
          <p class="stripe-reassurance">${ICON_LOCK} Paiement sécurisé via <strong>&nbsp;Stripe</strong></p>
        </div>

        <p class="included-list__title">Ce que tu débloques</p>
        <ul class="included-list">
          <li>${ICON_CHECK_SMALL} Ton concept de SaaS complet : description, cible, canaux, direction artistique</li>
          <li>${ICON_CHECK_SMALL} Concept affiché à l'écran juste après le paiement</li>
          <li>${ICON_CHECK_SMALL} Accès à une base de SaaS réels, pour t'inspirer ou approfondir</li>
          <li>${ICON_CHECK_SMALL} Accès à vie, paiement unique — jamais d'abonnement</li>
          <li>${ICON_CHECK_SMALL} Générés à partir de ton secteur, ton budget et ton temps disponible</li>
        </ul>

        <div class="payment-faq">
          <p class="payment-faq__title">Questions fréquentes</p>
          ${renderFaqItems(paymentFaqItems)}
        </div>
      </div>

      <div class="quiz-screen quiz-resume" data-screen="resume-transition" data-step-name="reprise" id="quiz-resume-transition">
        <h2 class="quiz-question-title" id="resume-title">Ton dossier est en cours de vérification.</h2>
        <div class="quiz-resume__progress-track" aria-hidden="true">
          <div class="quiz-resume__progress-fill" id="resume-progress-fill"></div>
        </div>
        <p class="quiz-resume__progress-label" id="resume-progress-label"></p>
        <ul class="quiz-resume__checklist" id="resume-checklist"></ul>
        <button class="btn btn--primary btn--full" id="resume-continue-btn" type="button">Terminer mon dossier</button>
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
<meta name="description" content="Ton paiement est confirmé, voici ton concept de SaaS généré pour toi." />
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
    padding: 40px 20px 60px;
  }
  .wrap { max-width: 640px; margin: 0 auto; }
  .card { max-width: 440px; margin: 0 auto; text-align: center; }
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
  h1 { font-size: 24px; font-weight: 800; margin: 0 0 12px; text-align: center; }
  p { font-size: 15px; line-height: 1.6; color: #8A8F98; margin: 0 0 8px; }
  .card p { text-align: center; }
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
  #results-zone { margin-top: 40px; display: none; }
  #results-zone.is-visible { display: block; }
  .result-intro { text-align: center; margin-bottom: 24px; }
  .result-intro h2 { font-size: 18px; font-weight: 800; margin: 0 0 6px; }
  .listing-card {
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 14px;
    overflow: hidden;
    margin-bottom: 18px;
  }
  .listing-card__verified { padding: 16px 20px 18px; }
  .concept-mockup { border-bottom: 1px solid rgba(255, 255, 255, 0.08); }
  .concept-mockup__chrome {
    display: flex;
    gap: 5px;
    padding: 8px 12px;
    background: rgba(255, 255, 255, 0.03);
  }
  .concept-mockup__chrome span {
    width: 8px;
    height: 8px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.15);
    display: inline-block;
  }
  .concept-mockup__hero {
    padding: 28px 20px;
    text-align: center;
  }
  .concept-mockup__logo {
    width: 44px;
    height: 44px;
    margin: 0 auto 10px;
    border-radius: 12px;
    background: rgba(255, 255, 255, 0.2);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 800;
    font-size: 15px;
    color: #fff;
  }
  .concept-mockup__brand { font-size: 16px; font-weight: 800; color: #fff; margin: 0 0 6px; }
  .concept-mockup__headline { font-size: 13px; color: rgba(255, 255, 255, 0.85); margin: 0 0 14px; line-height: 1.4; }
  .concept-mockup__cta {
    display: inline-block;
    padding: 7px 16px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.92);
    color: #0A0E1A;
    font-size: 12px;
    font-weight: 800;
  }
  .concept-mockup__label {
    font-size: 10px;
    color: #8A8F98;
    text-align: center;
    margin: 0;
    padding: 6px 12px;
    background: rgba(255, 255, 255, 0.02);
    letter-spacing: 0.02em;
  }
  .listing-card__top {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 8px;
  }
  .listing-card__name { font-size: 16px; font-weight: 700; color: #F5F6F8; margin: 0; }
  .listing-card__link { font-size: 12px; color: #0047FF; text-decoration: none; }
  .listing-card__meta { font-size: 13px; color: #8A8F98; margin: 0 0 8px; }
  .listing-card__range { font-size: 12px; color: #8A8F98; margin: 0 0 10px; font-style: italic; }
  .listing-card__cta {
    display: inline-block;
    margin-bottom: 10px;
    padding: 6px 14px;
    border-radius: 8px;
    background: rgba(0, 71, 255, 0.14);
    border: 1px solid rgba(0, 71, 255, 0.4);
    font-weight: 700;
  }
  .listing-card__reason {
    font-size: 12px;
    color: #8A8F98;
    background: rgba(255, 255, 255, 0.04);
    border-radius: 8px;
    padding: 6px 10px;
    display: inline-block;
    margin-top: 4px;
  }
  .badge {
    display: inline-flex;
    align-items: center;
    font-size: 11px;
    font-weight: 700;
    border-radius: 999px;
    padding: 3px 9px;
    white-space: nowrap;
  }
  .badge--verified { color: #00C48C; background: rgba(0, 196, 140, 0.12); border: 1px solid rgba(0, 196, 140, 0.3); }
  .badge--platform { color: #8A8F98; background: rgba(138, 143, 152, 0.12); border: 1px solid rgba(138, 143, 152, 0.3); }
  .badge--partial { color: #D9A23D; background: rgba(217, 162, 61, 0.12); border: 1px solid rgba(217, 162, 61, 0.3); }
  #empty-state, #error-state { text-align: center; color: #8A8F98; font-size: 14px; margin-top: 24px; display: none; }
  #empty-state.is-visible, #error-state.is-visible { display: block; }

  .concept-card {
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 14px;
    padding: 24px 20px;
  }
  .concept-card__eyebrow {
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #0047FF;
    margin: 0 0 8px;
  }
  .concept-card__name { font-size: 22px; font-weight: 800; color: #F5F6F8; margin: 0 0 6px; }
  .concept-card__tagline { font-size: 15px; color: #F5F6F8; margin: 0 0 16px; }
  .concept-card__description { font-size: 14px; line-height: 1.6; color: #C7CBD4; margin: 0 0 20px; }
  .concept-card__row { margin-bottom: 14px; }
  .concept-card__label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.03em; color: #8A8F98; margin: 0 0 4px; }
  .concept-card__value { font-size: 14px; line-height: 1.5; color: #E4E6EB; margin: 0; }
  .concept-card__note { font-size: 12px; font-style: italic; color: #8A8F98; margin: 16px 0 0; }
</style>
</head>
<body>
  <div class="wrap">
    <div class="card">
      <div class="check" aria-hidden="true">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M20 6L9 17l-5-5" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </div>
      <h1>Paiement confirmé.</h1>
      <p id="status-line">Confirmation en cours...</p>
    </div>

    <div id="results-zone">
      <div class="result-intro">
        <h2 id="results-title">Ton concept complet.</h2>
        <p id="results-subtitle">Généré pour toi, à partir de ton profil.</p>
      </div>
      <div class="concept-card">
        <p class="concept-card__eyebrow">Concept généré pour toi</p>
        <h3 class="concept-card__name" id="concept-name"></h3>
        <p class="concept-card__tagline" id="concept-tagline"></p>
        <p class="concept-card__description" id="concept-description"></p>
        <div class="concept-card__row">
          <p class="concept-card__label">Cible</p>
          <p class="concept-card__value" id="concept-persona"></p>
        </div>
        <div class="concept-card__row">
          <p class="concept-card__label">Canaux d'acquisition</p>
          <p class="concept-card__value" id="concept-channels"></p>
        </div>
        <div class="concept-card__row">
          <p class="concept-card__label">Palette</p>
          <p class="concept-card__value" id="concept-palette"></p>
        </div>
        <div class="concept-card__row">
          <p class="concept-card__label">Style de logo</p>
          <p class="concept-card__value" id="concept-logo"></p>
        </div>
        <p class="concept-card__note" id="concept-note" style="display:none"></p>
      </div>
    </div>

    <div id="empty-state">Ton concept n'a pas encore pu être généré — écris-nous via le chat, on s'en occupe.</div>
    <div id="error-state">Un souci technique empêche d'afficher ton concept. Écris-nous via le chat, on corrige ça vite.</div>

    <div class="card">
      <a class="btn" href="${siteUrl}">Retour à l'accueil</a>
    </div>
  </div>

  <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
  <script src="/js/supabase-client.js"></script>
  <script>
    (function () {
      function showConcept(concept) {
        var statusLine = document.getElementById("status-line");
        statusLine.textContent = "Ton accès est actif.";

        document.getElementById("concept-name").textContent = concept.concept_name;
        document.getElementById("concept-tagline").textContent = concept.tagline;
        document.getElementById("concept-description").textContent = concept.description;
        document.getElementById("concept-persona").textContent = concept.target_persona;
        document.getElementById("concept-channels").textContent = concept.channels;
        document.getElementById("concept-palette").textContent = concept.palette;
        document.getElementById("concept-logo").textContent = concept.logo_style;

        if (concept.confidence_note) {
          var noteEl = document.getElementById("concept-note");
          noteEl.textContent = concept.confidence_note;
          noteEl.style.display = "";
        }

        document.getElementById("results-zone").className = "is-visible";
      }

      // Le concept est déjà généré et mis en cache (user_concepts) depuis
      // l'écran résultat du quiz -- on le relit ici plutôt que de rappeler le
      // LLM. Filet de secours si le cache est vide (ex : paiement complété
      // avant la fin de l'appel generate-user-concept côté quiz) : un appel
      // direct à la fonction, qui renvoie alors le même contenu mis en cache.
      async function fetchConceptFromEdge(supabase) {
        var sessionRes = await supabase.auth.getSession();
        var token = sessionRes.data.session ? sessionRes.data.session.access_token : null;
        if (!token) return null;
        var res = await fetch(supabase.supabaseUrl + "/functions/v1/generate-user-concept", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: supabase.supabaseKey,
            Authorization: "Bearer " + token
          },
          body: JSON.stringify({})
        });
        var body = await res.json();
        return body && body.concept ? body.concept : null;
      }

      async function loadResults(supabase, userId) {
        var statusLine = document.getElementById("status-line");
        try {
          var cacheRes = await supabase.from("user_concepts").select("*").eq("user_id", userId).maybeSingle();
          var concept = cacheRes.data || (await fetchConceptFromEdge(supabase));
          if (!concept) {
            statusLine.textContent = "Ton accès est actif.";
            document.getElementById("empty-state").className = "is-visible";
            return;
          }
          showConcept(concept);
        } catch (err) {
          console.error("[succes] échec du chargement du concept :", err);
          statusLine.textContent = "Ton accès est actif.";
          document.getElementById("error-state").className = "is-visible";
        }
      }

      function waitForPayment(supabase, userId) {
        var statusLine = document.getElementById("status-line");

        function tryOnce() {
          return supabase.from("profiles").select("paid_at").eq("id", userId).single().then(function (res) {
            if (!res.error && res.data && res.data.paid_at) {
              loadResults(supabase, userId);
              return true;
            }
            return false;
          });
        }

        tryOnce().then(function (done) {
          if (done) return;
          statusLine.textContent = "Confirmation du paiement en cours (quelques secondes)...";
          // Le webhook Stripe peut avoir un léger décalage par rapport à la
          // redirection du client -- même pattern de secours que /compte
          // (Realtime + poll de secours, jamais une seule tentative sèche).
          supabase
            .channel("succes-paid-" + userId)
            .on(
              "postgres_changes",
              { event: "UPDATE", schema: "public", table: "profiles", filter: "id=eq." + userId },
              function (payload) {
                if (payload.new && payload.new.paid_at) loadResults(supabase, userId);
              }
            )
            .subscribe();

          var attempts = 0;
          var interval = setInterval(function () {
            attempts += 1;
            tryOnce().then(function (done2) {
              if (done2 || attempts >= 10) clearInterval(interval);
            });
          }, 3000);
        });
      }

      function boot() {
        var supabase = window.ColdTrendSupabase;
        if (!supabase) return;
        supabase.auth.getUser().then(function (res) {
          var user = res.data ? res.data.user : null;
          if (!user) {
            document.getElementById("status-line").textContent =
              "Session introuvable -- reconnecte-toi pour voir ton accès.";
            return;
          }
          waitForPayment(supabase, user.id);
        });
      }

      if (window.ColdTrendSupabase) {
        boot();
      } else {
        document.addEventListener("coldtrend:supabase-ready", boot, { once: true });
      }
    })();
  </script>
  ${crispWidgetScript()}
</body>
</html>
`;
}

// ---------------------------------------------------------------------------
// Page concept — /concept/{slug} (rewrite vercel.json -> concept.html)
// ---------------------------------------------------------------------------
// Génération LLM déclenchée UNIQUEMENT au clic sur "Je teste mon idée" côté
// succes.html -- jamais en pré-chargement. Cette page affiche donc un écran
// de chargement pendant l'appel à generate-concept (qui sert le cache si le
// listing a déjà été généré pour un autre utilisateur), puis révèle la LP.
//
// Système d'espacement/typo/easing appliqué systématiquement (voir wireframe
// validé) : une seule échelle d'espacement (4/8/12/16/24/32/48/64/96/128),
// easing cubic-bezier custom (jamais ease/linear), stagger réel via
// IntersectionObserver, séparation visuelle stricte entre le bloc "concept
// généré" (mouvement, couleur) et le bloc "preuve vérifiée" (fade seul,
// volontairement statique).
function conceptPage({ brand, siteUrl, commPlanPaymentLink }) {
  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${brand.name} — Concept</title>
<meta name="description" content="Un concept adapté au marché français, à partir d'un SaaS réel à revenus vérifiés." />
<meta name="robots" content="noindex" />
<style>
  :root {
    color-scheme: dark;
    --space-4: 4px; --space-8: 8px; --space-12: 12px; --space-16: 16px;
    --space-24: 24px; --space-32: 32px; --space-48: 48px; --space-64: 64px;
    --space-96: 96px; --space-128: 128px;
    --ease-out-expo: cubic-bezier(0.16, 1, 0.3, 1);
    --ease-standard: cubic-bezier(0.4, 0, 0.2, 1);
    --cobalt: #0047FF;
    --steel: #8A8F98;
    --ink: #0A0E1A;
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; background: var(--ink); color: #F5F6F8; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Inter, Arial, sans-serif; }
  body { position: relative; overflow-x: hidden; }
  body::before {
    content: "";
    position: fixed;
    top: -20%;
    left: 50%;
    transform: translateX(-50%);
    width: 900px;
    height: 900px;
    background: radial-gradient(circle, rgba(0,71,255,0.10), transparent 70%);
    pointer-events: none;
    z-index: 0;
  }
  a { color: inherit; }

  /* ---- Écran de chargement ---- */
  #loading {
    min-height: 100dvh;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-16);
    text-align: center;
    padding: var(--space-24);
  }
  .loading-spinner {
    width: 32px;
    height: 32px;
    border-radius: 999px;
    border: 2px solid rgba(255,255,255,0.12);
    border-top-color: var(--cobalt);
    animation: spin 900ms linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
  #loading p { color: var(--steel); font-size: 15px; margin: 0; }
  #loading.is-hidden { display: none; }

  #error-state {
    min-height: 100dvh;
    display: none;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-16);
    text-align: center;
    padding: var(--space-24);
    color: var(--steel);
  }
  #error-state.is-visible { display: flex; }

  /* ---- Contenu principal ---- */
  #content { display: none; position: relative; z-index: 1; }
  #content.is-visible { display: block; }

  .wrap { max-width: 720px; margin: 0 auto; padding: 0 var(--space-24); }

  [data-reveal] { opacity: 0; transform: translateY(16px); transition: opacity 600ms var(--ease-out-expo), transform 600ms var(--ease-out-expo); }
  [data-reveal].is-visible { opacity: 1; transform: translateY(0); }
  [data-reveal="fade-only"] { transform: none; transition: opacity 400ms var(--ease-standard); }

  @media (prefers-reduced-motion: reduce) {
    [data-reveal] { transition: none !important; transform: none !important; opacity: 1 !important; }
    .loading-spinner { animation: none; border-top-color: rgba(255,255,255,0.12); }
  }

  /* Hero */
  .hero { padding: var(--space-96) 0 var(--space-64); text-align: center; }
  .hero__badge { display: inline-block; font-size: 11px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; color: var(--steel); margin-bottom: var(--space-16); }
  .hero h1 { font-size: 40px; line-height: 1.08; letter-spacing: -0.03em; font-weight: 800; margin: 0 0 var(--space-16); }
  .hero__tagline { font-size: 17px; line-height: 1.5; color: var(--steel); font-weight: 400; margin: 0 0 var(--space-32); max-width: 520px; margin-left: auto; margin-right: auto; }
  .hero__ctas { display: flex; gap: var(--space-12); justify-content: center; flex-wrap: wrap; }

  .btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 12px 22px;
    border-radius: 10px;
    font-weight: 700;
    font-size: 14px;
    text-decoration: none;
    cursor: pointer;
    transition: transform 200ms var(--ease-standard), box-shadow 200ms var(--ease-standard), background 200ms var(--ease-standard);
  }
  .btn:active { transform: scale(0.97); }
  .btn:focus-visible { outline: 2px solid var(--cobalt); outline-offset: 2px; }
  .btn--primary { background: var(--cobalt); color: #fff; border: none; }
  .btn--primary:hover { box-shadow: 0 0 0 6px rgba(0,71,255,0.16); transform: scale(1.02); }
  .btn--ghost { background: transparent; color: #F5F6F8; border: 1px solid rgba(255,255,255,0.16); }
  .btn--ghost:hover { border-color: rgba(255,255,255,0.32); }

  /* Besoin */
  .section { padding: var(--space-64) 0; }
  .section__title { font-size: 22px; font-weight: 800; letter-spacing: -0.01em; margin: 0 0 var(--space-32); text-align: center; }
  .need-grid { display: grid; grid-template-columns: 1fr; gap: var(--space-16); }
  @media (min-width: 640px) { .need-grid { grid-template-columns: 1fr 1fr; } }
  .need-card {
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 14px;
    padding: var(--space-24);
    background: rgba(255,255,255,0.02);
  }
  .need-card__icon { width: 22px; height: 22px; margin-bottom: var(--space-12); color: var(--cobalt); }
  .need-card__label { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.03em; color: var(--steel); margin: 0 0 var(--space-8); }
  .need-card p.need-card__text { font-size: 14px; line-height: 1.6; margin: 0; color: #E4E6EB; }

  /* Preuve */
  .proof-section {
    border-top: 1px solid rgba(0,71,255,0.3);
    border-bottom: 1px solid rgba(0,71,255,0.3);
    background: rgba(0,71,255,0.04);
  }
  .proof-grid { display: flex; flex-wrap: wrap; gap: var(--space-24); align-items: center; justify-content: space-between; }
  .proof-item__label { font-size: 11px; color: var(--steel); text-transform: uppercase; letter-spacing: 0.03em; margin: 0 0 4px; }
  .proof-item__value { font-size: 18px; font-weight: 800; margin: 0; }
  .proof-badge { display: inline-flex; align-items: center; font-size: 11px; font-weight: 700; border-radius: 999px; padding: 4px 10px; color: #00C48C; background: rgba(0,196,140,0.12); border: 1px solid rgba(0,196,140,0.3); }
  .proof-link { font-size: 13px; color: var(--cobalt); text-decoration: none; }

  /* Comment le lancer */
  .timeline { position: relative; padding-left: var(--space-32); }
  .timeline__line { position: absolute; left: 11px; top: 8px; bottom: 8px; width: 1px; background: rgba(255,255,255,0.12); transform-origin: top; transform: scaleY(0); transition: transform 700ms var(--ease-out-expo); }
  .timeline__line.is-visible { transform: scaleY(1); }
  .timeline__step { position: relative; padding-bottom: var(--space-32); }
  .timeline__step:last-child { padding-bottom: 0; }
  .timeline__dot {
    position: absolute;
    left: -32px;
    top: 2px;
    width: 24px;
    height: 24px;
    border-radius: 999px;
    background: var(--ink);
    border: 1px solid rgba(0,71,255,0.5);
    color: var(--cobalt);
    font-size: 12px;
    font-weight: 800;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .timeline__step h3 { font-size: 15px; font-weight: 700; margin: 0 0 4px; }
  .timeline__step p { font-size: 13px; color: var(--steel); line-height: 1.6; margin: 0; }

  /* CTA sortie */
  /* Concurrents (donnee reelle, pas generee -- style stable comme la preuve) */
  .competitors-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--space-8); }
  .competitors-list li {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--space-12) var(--space-16);
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 10px;
    font-size: 13px;
  }
  .competitors-list a { color: #F5F6F8; text-decoration: none; font-weight: 600; }
  .competitors-list span { color: var(--steel); }

  /* Stack technique / temps de lancement -- statique, generique, jamais par listing */
  .static-grid { display: grid; grid-template-columns: 1fr; gap: var(--space-16); }
  @media (min-width: 640px) { .static-grid { grid-template-columns: 1fr 1fr; } }
  .static-card {
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 14px;
    padding: var(--space-24);
    background: rgba(255,255,255,0.02);
  }
  .static-card__label { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.03em; color: var(--steel); margin: 0 0 var(--space-8); }
  .static-card p.static-card__text { font-size: 14px; line-height: 1.6; margin: 0; color: #E4E6EB; }

  /* Upsell plan de communication */
  .upsell-card {
    border: 1px solid rgba(0,71,255,0.35);
    border-radius: 16px;
    padding: var(--space-32);
    background: rgba(0,71,255,0.05);
    text-align: center;
  }
  .upsell-card__price { font-size: 13px; color: var(--steel); margin: var(--space-8) 0 var(--space-16); }
  .upsell-plan { text-align: left; }
  .upsell-plan__block { margin-bottom: var(--space-16); }
  .upsell-plan__label { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.03em; color: var(--steel); margin: 0 0 4px; }
  .upsell-plan__text { font-size: 14px; line-height: 1.6; margin: 0; color: #E4E6EB; white-space: pre-line; }
  .upsell-generated-label { font-size: 10px; color: var(--steel); text-transform: uppercase; letter-spacing: 0.02em; margin: 0 0 var(--space-16); }

  .exit-cta { text-align: center; padding: var(--space-64) 0 var(--space-96); background: rgba(255,255,255,0.02); border-top: 1px solid rgba(255,255,255,0.06); }
  .exit-cta h2 { font-size: 24px; font-weight: 800; margin: 0 0 var(--space-16); letter-spacing: -0.02em; }
  .confidence-note { font-size: 12px; color: var(--steel); text-align: center; margin: var(--space-16) 0 0; font-style: italic; }

  footer.page-footer { text-align: center; padding: var(--space-24); }
  footer.page-footer a { font-size: 13px; color: var(--steel); text-decoration: none; }
</style>
</head>
<body>
  <div id="loading">
    <div class="loading-spinner" aria-hidden="true"></div>
    <p>Nous préparons ton site...</p>
  </div>

  <div id="error-state">
    <p id="error-message">Génération momentanément indisponible. Réessaie dans quelques minutes.</p>
    <a class="btn btn--ghost" href="/succes">Retour</a>
  </div>

  <div id="content">
    <section class="hero wrap">
      <p class="hero__badge" data-reveal style="transition-delay:0ms">Concept généré</p>
      <h1 id="concept-name" data-reveal style="transition-delay:100ms"></h1>
      <p class="hero__tagline" id="concept-tagline" data-reveal style="transition-delay:200ms"></p>
      <div class="hero__ctas" data-reveal style="transition-delay:300ms">
        <a class="btn btn--primary" id="cta-primary" href="#comment-lancer"></a>
        <a class="btn btn--ghost" id="cta-secondary" href="#" target="_blank" rel="noopener"></a>
      </div>
    </section>

    <section class="section wrap">
      <h2 class="section__title">Le besoin</h2>
      <div class="need-grid">
        <div class="need-card" data-reveal style="transition-delay:0ms">
          <svg class="need-card__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 3v18M3 12h18" stroke-linecap="round"/></svg>
          <p class="need-card__label">Pourquoi ce besoin existe</p>
          <p class="need-card__text" id="concept-need-angle"></p>
        </div>
        <div class="need-card" data-reveal style="transition-delay:100ms">
          <svg class="need-card__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3" stroke-linecap="round"/></svg>
          <p class="need-card__label">Pourquoi maintenant</p>
          <p class="need-card__text" id="concept-why-now"></p>
        </div>
        <div class="need-card" data-reveal style="transition-delay:200ms">
          <svg class="need-card__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="9" cy="8" r="3"/><path d="M3 20c0-3 2.5-5 6-5s6 2 6 5" stroke-linecap="round"/></svg>
          <p class="need-card__label">Public cible probable</p>
          <p class="need-card__text" id="concept-target-audience"></p>
        </div>
      </div>
    </section>

    <section class="section proof-section">
      <div class="wrap">
        <h2 class="section__title" data-reveal="fade-only">Données vérifiées</h2>
        <div class="proof-grid" data-reveal="fade-only">
          <div>
            <p class="proof-item__label">SaaS source</p>
            <p class="proof-item__value" id="proof-name"></p>
          </div>
          <div>
            <p class="proof-item__label">MRR vérifié</p>
            <p class="proof-item__value" id="proof-mrr"></p>
          </div>
          <div>
            <p class="proof-item__label">Fourchette secteur</p>
            <p class="proof-item__value" id="proof-range">—</p>
          </div>
          <div>
            <span class="proof-badge" id="proof-badge">Vérifié · TrustMRR</span><br/>
            <a class="proof-link" id="proof-link" href="#" target="_blank" rel="noopener">Voir la source &rarr;</a>
          </div>
        </div>
      </div>
    </section>

    <section class="section wrap" id="competitors-section" style="display:none">
      <h2 class="section__title" data-reveal="fade-only">Autres SaaS du secteur</h2>
      <ul class="competitors-list" id="competitors-list" data-reveal="fade-only"></ul>
    </section>

    <section class="section wrap" id="comment-lancer">
      <h2 class="section__title">Comment le lancer</h2>
      <div class="timeline">
        <div class="timeline__line" id="timeline-line"></div>
        <div class="timeline__step" data-reveal style="transition-delay:0ms">
          <div class="timeline__dot">1</div>
          <h3>Étudie le modèle vérifié</h3>
          <p>Va voir le vrai site et le vrai MRR affichés ci-dessus — c'est la base réelle du concept.</p>
        </div>
        <div class="timeline__step" data-reveal style="transition-delay:100ms">
          <div class="timeline__dot">2</div>
          <h3>Récupère l'angle</h3>
          <p>Le besoin identifié et pourquoi il existe en France sont détaillés plus haut — c'est ton point de départ.</p>
        </div>
        <div class="timeline__step" data-reveal style="transition-delay:200ms">
          <div class="timeline__dot">3</div>
          <h3>Lance ta version</h3>
          <p>Construis avec tes propres outils, à ton rythme — ce concept n'est qu'un point de départ, pas une promesse.</p>
        </div>
      </div>
    </section>

    <section class="section wrap">
      <h2 class="section__title">Pour aller plus vite</h2>
      <div class="static-grid">
        <div class="static-card" data-reveal style="transition-delay:0ms">
          <p class="static-card__label">Stack technique suggérée</p>
          <p class="static-card__text">No-code : Bubble, Webflow ou Softr pour un premier prototype sans écrire de code. Code : Next.js + Supabase (auth, base de données) + Stripe pour le paiement — la même base technique que ColdTrend.</p>
        </div>
        <div class="static-card" data-reveal style="transition-delay:100ms">
          <p class="static-card__label">Temps de lancement estimé</p>
          <p class="static-card__text">MVP simple (une fonctionnalité centrale, sans paiement) : 4 à 8 semaines. Version complète avec paiement intégré : 2 à 4 mois. Ce sont des ordres de grandeur généraux, pas une estimation propre à ce SaaS précis.</p>
        </div>
      </div>
    </section>

    <section class="section wrap" id="upsell-section">
      <h2 class="section__title">Plan de communication</h2>
      <div id="upsell-locked" class="upsell-card">
        <p>Un plan de lancement organique concret pour ce concept — canaux pertinents, angle de contenu, idées, cadence. Généré une fois, jamais de promesse de résultats chiffrés.</p>
        <p class="upsell-card__price">3,90 €</p>
        <a class="btn btn--primary" id="upsell-cta" href="#">Débloquer le plan</a>
      </div>
      <div id="upsell-unlocked" class="upsell-plan" style="display:none">
        <p class="upsell-generated-label">Généré pour ce concept</p>
        <div class="upsell-plan__block">
          <p class="upsell-plan__label">Canaux</p>
          <p class="upsell-plan__text" id="plan-channels"></p>
        </div>
        <div class="upsell-plan__block">
          <p class="upsell-plan__label">Angle organique</p>
          <p class="upsell-plan__text" id="plan-organic-angle"></p>
        </div>
        <div class="upsell-plan__block">
          <p class="upsell-plan__label">Idées de contenu</p>
          <p class="upsell-plan__text" id="plan-content-ideas"></p>
        </div>
        <div class="upsell-plan__block">
          <p class="upsell-plan__label">Cadence</p>
          <p class="upsell-plan__text" id="plan-cadence"></p>
        </div>
        <p class="confidence-note" id="plan-confidence-note"></p>
      </div>
      <div id="upsell-loading" style="display:none; text-align:center; color:var(--steel); font-size:13px;">Génération du plan...</div>
    </section>

    <section class="exit-cta">
      <div class="wrap">
        <h2 data-reveal>Prêt à commencer ?</h2>
        <a class="btn btn--primary" id="cta-exit" href="#comment-lancer" data-reveal style="transition-delay:100ms"></a>
        <p class="confidence-note" id="confidence-note"></p>
      </div>
    </section>

    <footer class="page-footer"><a href="${siteUrl}">Retour à l'accueil</a></footer>
  </div>

  <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
  <script src="/js/supabase-client.js"></script>
  <script>
    (function () {
      function escapeHtml(str) {
        var div = document.createElement("div");
        div.textContent = String(str == null ? "" : str);
        return div.innerHTML;
      }

      function median(sortedNums) {
        var n = sortedNums.length;
        var mid = Math.floor(n / 2);
        return n % 2 !== 0 ? sortedNums[mid] : (sortedNums[mid - 1] + sortedNums[mid]) / 2;
      }

      function sectorsOverlap(a, b) {
        if (!a || !a.length || !b || !b.length) return false;
        if (b.indexOf("both") !== -1) return true;
        return a.some(function (id) { return id === "both" || b.indexOf(id) !== -1; });
      }

      function formatUsd(value) {
        if (typeof value !== "number") return "non communiqué";
        return Math.round(value).toLocaleString("fr-FR") + " $";
      }

      function showError(message) {
        document.getElementById("loading").className = "is-hidden";
        document.getElementById("error-message").textContent = message;
        document.getElementById("error-state").className = "is-visible";
      }

      function setupReveals() {
        var items = document.querySelectorAll("[data-reveal]");
        var observer = new IntersectionObserver(
          function (entries) {
            entries.forEach(function (entry) {
              if (entry.isIntersecting) {
                entry.target.classList.add("is-visible");
                observer.unobserve(entry.target);
              }
            });
          },
          { threshold: 0.2 }
        );
        items.forEach(function (el) { observer.observe(el); });

        var line = document.getElementById("timeline-line");
        var lineObserver = new IntersectionObserver(
          function (entries) {
            entries.forEach(function (entry) {
              if (entry.isIntersecting) {
                line.classList.add("is-visible");
                lineObserver.disconnect();
              }
            });
          },
          { threshold: 0.1 }
        );
        lineObserver.observe(line);

        // Hero : révélé immédiatement (pas besoin de scroll pour le voir).
        document.querySelectorAll(".hero [data-reveal]").forEach(function (el) {
          requestAnimationFrame(function () { el.classList.add("is-visible"); });
        });
      }

      function escapeAttr(str) {
        return String(str || "").replace(/"/g, "&quot;");
      }

      function renderCompetitors(competitors) {
        var section = document.getElementById("competitors-section");
        var list = document.getElementById("competitors-list");
        if (!competitors.length) {
          section.style.display = "none";
          return;
        }
        list.innerHTML = "";
        competitors.forEach(function (c) {
          var li = document.createElement("li");
          var nameHtml = c.website
            ? '<a href="' + escapeAttr(c.website) + '" target="_blank" rel="noopener">' + escapeHtmlLocal(c.name || "SaaS") + "</a>"
            : "<span>" + escapeHtmlLocal(c.name || "SaaS") + "</span>";
          li.innerHTML = nameHtml + "<span>" + formatMrrShort(c.mrr_usd) + "</span>";
          list.appendChild(li);
        });
        section.style.display = "";
      }

      function escapeHtmlLocal(str) {
        var div = document.createElement("div");
        div.textContent = String(str == null ? "" : str);
        return div.innerHTML;
      }

      function formatMrrShort(value) {
        if (typeof value !== "number" || value <= 0) return "MRR non communiqué";
        return formatUsd(value) + " MRR";
      }

      function renderConcept(concept, listing, range) {
        document.getElementById("concept-name").textContent = concept.concept_name;
        document.getElementById("concept-tagline").textContent = concept.tagline;
        document.getElementById("concept-need-angle").textContent = concept.need_angle;
        document.getElementById("concept-why-now").textContent = concept.why_now;
        document.getElementById("concept-target-audience").textContent = concept.target_audience || "";

        var ctaPrimary = document.getElementById("cta-primary");
        ctaPrimary.textContent = concept.cta_primary;
        var ctaExit = document.getElementById("cta-exit");
        ctaExit.textContent = concept.cta_primary;

        var ctaSecondary = document.getElementById("cta-secondary");
        ctaSecondary.textContent = concept.cta_secondary;
        if (listing.website) {
          ctaSecondary.href = listing.website;
        } else {
          ctaSecondary.style.display = "none";
        }

        document.getElementById("proof-name").textContent = listing.name || "Non communiqué";
        document.getElementById("proof-mrr").textContent = formatUsd(listing.mrr_usd);
        document.getElementById("proof-range").textContent = range
          ? formatUsd(range.min) + " – " + formatUsd(range.max)
          : "Échantillon insuffisant";
        document.getElementById("proof-badge").textContent =
          listing.source_level === "verified" ? "Vérifié · TrustMRR" : "Revue par l'équipe";
        var proofLink = document.getElementById("proof-link");
        if (listing.website) {
          proofLink.href = listing.website;
        } else {
          proofLink.style.display = "none";
        }

        if (concept.confidence_note) {
          document.getElementById("confidence-note").textContent = concept.confidence_note;
        }

        document.getElementById("loading").className = "is-hidden";
        document.getElementById("content").className = "is-visible";
        setupReveals();
      }

      // Trace la selection au clic sur le CTA "Lancer cette version" --
      // en plus du scroll existant vers #comment-lancer, jamais a la place.
      // Un seul projet actif a la fois (upsert sur user_id, cf. migration
      // 0018) : une nouvelle selection remplace l'ancienne.
      function setupProjectSelection(supabase, session, slug) {
        function recordSelection() {
          supabase
            .from("selected_projects")
            .upsert({ user_id: session.user.id, listing_slug: slug, selected_at: new Date().toISOString() }, { onConflict: "user_id" })
            .then(function (res) {
              if (res.error) console.error("[concept] échec d'enregistrement de la sélection :", res.error.message);
            });
        }
        ["cta-primary", "cta-exit"].forEach(function (id) {
          var el = document.getElementById(id);
          if (el) el.addEventListener("click", recordSelection);
        });
      }

      function setupUpsell(supabase, session, slug) {
        var cta = document.getElementById("upsell-cta");
        try {
          var url = new URL(${JSON.stringify(commPlanPaymentLink)});
          url.searchParams.set("client_reference_id", session.user.id + "::" + slug);
          if (session.user.email) url.searchParams.set("prefilled_email", session.user.email);
          cta.href = url.toString();
        } catch (err) {
          console.warn("[concept] lien de paiement plan de comm invalide :", err);
        }
        cta.addEventListener("click", function () {
          // Le Payment Link Stripe redirige vers une URL fixe (pas de slug
          // dynamique possible) -- on stocke le slug pour le retrouver au
          // retour, meme pattern que QUIZ_RESUME_FLAG ailleurs sur le site.
          try {
            sessionStorage.setItem("coldtrend_pending_comm_plan_slug", slug);
          } catch (err) {
            /* pas grave si sessionStorage est indisponible */
          }
        });

        supabase
          .from("comm_plan_purchases")
          .select("paid_at")
          .eq("user_id", session.user.id)
          .eq("slug", slug)
          .maybeSingle()
          .then(function (res) {
            if (res.data && res.data.paid_at) {
              loadCommPlan(supabase, session, slug);
            }
          });
      }

      async function loadCommPlan(supabase, session, slug) {
        document.getElementById("upsell-locked").style.display = "none";
        document.getElementById("upsell-loading").style.display = "";
        try {
          var res = await fetch(supabase.supabaseUrl + "/functions/v1/generate-comm-plan", {
            method: "POST",
            headers: {
              Authorization: "Bearer " + session.access_token,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ slug: slug }),
          });
          var body = await res.json();
          document.getElementById("upsell-loading").style.display = "none";
          if (!res.ok || !body.plan) {
            document.getElementById("upsell-locked").style.display = "";
            console.error("[concept] échec génération plan de comm :", body.error);
            return;
          }
          document.getElementById("plan-channels").textContent = body.plan.channels;
          document.getElementById("plan-organic-angle").textContent = body.plan.organic_angle;
          document.getElementById("plan-content-ideas").textContent = body.plan.content_ideas;
          document.getElementById("plan-cadence").textContent = body.plan.posting_cadence;
          if (body.plan.confidence_note) {
            document.getElementById("plan-confidence-note").textContent = body.plan.confidence_note;
          }
          document.getElementById("upsell-unlocked").style.display = "";
        } catch (err) {
          console.error("[concept] échec du chargement du plan de comm :", err);
          document.getElementById("upsell-loading").style.display = "none";
          document.getElementById("upsell-locked").style.display = "";
        }
      }

      async function loadConcept(supabase, session, slug) {
        try {
          var listingRes = await supabase
            .from("saas_listings")
            .select("slug, name, website, description, secteur, mrr_usd, source_level")
            .eq("slug", slug)
            .eq("active", true)
            .single();
          if (listingRes.error || !listingRes.data) {
            showError("Ce SaaS n'est plus disponible.");
            return;
          }
          var listing = listingRes.data;

          var allRes = await supabase.from("saas_listings").select("slug, name, website, secteur, mrr_usd").eq("active", true);
          var allListings = allRes.data || [];

          // mrr_usd = 0 exclu, meme regle que succes.html : un MRR confirme a
          // zero n'est pas un revenu verifie utile pour une fourchette.
          var peers = allListings.filter(function (p) {
            return sectorsOverlap(listing.secteur, p.secteur) && typeof p.mrr_usd === "number" && p.mrr_usd > 0;
          });
          var range = null;
          if (peers.length >= 3) {
            var values = peers.map(function (p) { return p.mrr_usd; }).sort(function (a, b) { return a - b; });
            range = { min: values[0], max: values[values.length - 1], med: median(values) };
          }

          // Concurrents : donnee reelle deja chargee, aucun calcul par LLM --
          // meme secteur, exclut le listing courant, trie par MRR reel
          // (les MRR 0/non-communiques passent en dernier plutot qu'exclus,
          // ce sont quand meme de vrais concurrents du meme secteur).
          var competitors = allListings
            .filter(function (p) { return p.slug !== slug && sectorsOverlap(listing.secteur, p.secteur); })
            .sort(function (a, b) { return (b.mrr_usd || -1) - (a.mrr_usd || -1); })
            .slice(0, 5);

          var genRes = await fetch(supabase.supabaseUrl + "/functions/v1/generate-concept", {
            method: "POST",
            headers: {
              Authorization: "Bearer " + session.access_token,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ slug: slug }),
          });
          var genBody = await genRes.json();
          if (!genRes.ok || !genBody.concept) {
            showError(genBody.error || "Génération momentanément indisponible.");
            return;
          }

          renderConcept(genBody.concept, listing, range);
          renderCompetitors(competitors);
          setupUpsell(supabase, session, slug);
          setupProjectSelection(supabase, session, slug);
        } catch (err) {
          console.error("[concept] échec du chargement :", err);
          showError("Un souci technique est survenu. Réessaie dans quelques minutes.");
        }
      }

      function boot() {
        var supabase = window.ColdTrendSupabase;
        if (!supabase) return;

        var slug = new URLSearchParams(window.location.search).get("slug") || "";
        if (!slug) {
          // Le Payment Link Stripe de l'upsell "plan de communication"
          // redirige vers une URL fixe sans slug -- on retombe sur celui
          // stocke juste avant de partir payer (voir setupUpsell).
          try {
            slug = sessionStorage.getItem("coldtrend_pending_comm_plan_slug") || "";
            sessionStorage.removeItem("coldtrend_pending_comm_plan_slug");
          } catch (err) {
            /* pas grave si sessionStorage est indisponible */
          }
        }
        if (!slug) {
          showError("Lien invalide.");
          return;
        }

        supabase.auth.getUser().then(function (res) {
          var user = res.data ? res.data.user : null;
          if (!user) {
            showError("Session introuvable — reconnecte-toi pour accéder à ce concept.");
            return;
          }
          supabase.from("profiles").select("paid_at").eq("id", user.id).single().then(function (profileRes) {
            if (profileRes.error || !profileRes.data || !profileRes.data.paid_at) {
              showError("Accès non payé.");
              return;
            }
            supabase.auth.getSession().then(function (sessionRes) {
              var session = sessionRes.data ? sessionRes.data.session : null;
              if (!session) {
                showError("Session invalide — reconnecte-toi.");
                return;
              }
              loadConcept(supabase, session, slug);
            });
          });
        });
      }

      if (window.ColdTrendSupabase) {
        boot();
      } else {
        document.addEventListener("coldtrend:supabase-ready", boot, { once: true });
      }
    })();
  </script>
</body>
</html>
`;
}

// ---------------------------------------------------------------------------
// Page profil entrepreneur — /profil-entrepreneur, module optionnel proposé
// APRÈS l'écran de résultat gratuit du quiz existant (jamais avant, jamais
// une fusion) -- decision produit explicite. Reutilise
// profiles.secteur/budget/temps deja collectes par le quiz, ne les
// redemande jamais : seulement 9 questions introspectives ici.
// ---------------------------------------------------------------------------
// Meme systeme d'easing/reveal que /concept (cubic-bezier custom, jamais
// ease/linear) pour coherence visuelle entre les deux parcours "generes".
function entrepreneurProfilePage({ brand, siteUrl, stripePaymentLink }) {
  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${brand.name} — Ton profil entrepreneur</title>
<meta name="description" content="9 questions pour un profil entrepreneur personnalisé, gratuit." />
<meta name="robots" content="noindex" />
<style>
  :root {
    color-scheme: dark;
    --space-4: 4px; --space-8: 8px; --space-12: 12px; --space-16: 16px;
    --space-24: 24px; --space-32: 32px; --space-48: 48px; --space-64: 64px;
    --space-96: 96px;
    --ease-out-expo: cubic-bezier(0.16, 1, 0.3, 1);
    --ease-standard: cubic-bezier(0.4, 0, 0.2, 1);
    --cobalt: #0047FF;
    --steel: #8A8F98;
    --ink: #0A0E1A;
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; background: var(--ink); color: #F5F6F8; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Inter, Arial, sans-serif; }
  body { position: relative; overflow-x: hidden; min-height: 100dvh; }
  a { color: inherit; }

  #loading, #error-state {
    min-height: 100dvh;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-16);
    text-align: center;
    padding: var(--space-24);
  }
  #error-state { display: none; color: var(--steel); }
  #error-state.is-visible { display: flex; }
  #loading.is-hidden { display: none; }
  .loading-spinner {
    width: 32px; height: 32px; border-radius: 999px;
    border: 2px solid rgba(255,255,255,0.12);
    border-top-color: var(--cobalt);
    animation: spin 900ms linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
  #loading p { color: var(--steel); font-size: 15px; margin: 0; }

  #app { display: none; }
  #app.is-visible { display: block; }

  .wrap { max-width: 560px; margin: 0 auto; padding: var(--space-24); }

  .progress-track { height: 4px; background: rgba(255,255,255,0.08); border-radius: 999px; overflow: hidden; margin-bottom: var(--space-32); }
  .progress-fill { height: 100%; background: var(--cobalt); border-radius: 999px; transition: width 500ms var(--ease-out-expo); width: 0%; }
  .progress-label { font-size: 12px; color: var(--steel); margin: 0 0 var(--space-16); }

  .question-screen { display: none; }
  .question-screen.is-active { display: block; animation: fadeSlideIn 500ms var(--ease-out-expo); }
  @keyframes fadeSlideIn { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
  @media (prefers-reduced-motion: reduce) {
    .question-screen.is-active { animation: none; }
    .progress-fill { transition: none; }
  }

  .question-title { font-size: 22px; font-weight: 800; letter-spacing: -0.01em; line-height: 1.3; margin: 0 0 var(--space-24); }

  textarea, input[type="text"] {
    width: 100%;
    background: rgba(255,255,255,0.04);
    border: 1px solid rgba(255,255,255,0.12);
    border-radius: 10px;
    color: #F5F6F8;
    font-size: 15px;
    font-family: inherit;
    padding: var(--space-12) var(--space-16);
    resize: none;
    transition: border-color 200ms var(--ease-standard);
  }
  textarea:focus, input[type="text"]:focus {
    outline: none;
    border-color: var(--cobalt);
  }
  textarea.size-short { min-height: 70px; }
  textarea.size-medium { min-height: 120px; }
  textarea.size-large { min-height: 180px; }
  .char-counter { font-size: 12px; color: var(--steel); text-align: right; margin-top: 6px; }

  .choice-grid { display: flex; flex-direction: column; gap: var(--space-8); }
  .choice-card {
    display: block;
    width: 100%;
    text-align: left;
    background: rgba(255,255,255,0.03);
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 10px;
    padding: var(--space-12) var(--space-16);
    color: #F5F6F8;
    font-size: 15px;
    cursor: pointer;
    transition: border-color 200ms var(--ease-standard), background 200ms var(--ease-standard);
  }
  .choice-card:hover { border-color: rgba(255,255,255,0.28); }
  .choice-card.is-selected { border-color: var(--cobalt); background: rgba(0,71,255,0.1); }
  .choice-other-field { margin-top: var(--space-12); display: none; }
  .choice-other-field.is-visible { display: block; }

  .slider-block { text-align: center; }
  .slider-value { font-size: 40px; font-weight: 800; letter-spacing: -0.02em; margin: 0 0 var(--space-8); }
  .slider-emoji { font-size: 40px; margin: 0 0 var(--space-8); }
  input[type="range"] {
    width: 100%;
    accent-color: var(--cobalt);
    margin: var(--space-16) 0;
  }
  .slider-scale-labels { display: flex; justify-content: space-between; font-size: 12px; color: var(--steel); }

  .nav-row { display: flex; justify-content: space-between; align-items: center; margin-top: var(--space-32); gap: var(--space-12); }
  .btn {
    display: inline-flex; align-items: center; justify-content: center; gap: 6px;
    padding: 12px 22px; border-radius: 10px; font-weight: 700; font-size: 14px;
    text-decoration: none; cursor: pointer; border: none;
    transition: transform 200ms var(--ease-standard), box-shadow 200ms var(--ease-standard), background 200ms var(--ease-standard), opacity 200ms var(--ease-standard);
  }
  .btn:active { transform: scale(0.97); }
  .btn:focus-visible { outline: 2px solid var(--cobalt); outline-offset: 2px; }
  .btn--primary { background: var(--cobalt); color: #fff; }
  .btn--primary:hover { box-shadow: 0 0 0 6px rgba(0,71,255,0.16); }
  .btn--primary:disabled { opacity: 0.4; cursor: not-allowed; box-shadow: none; }
  .btn--ghost { background: transparent; color: var(--steel); border: 1px solid rgba(255,255,255,0.14); }
  .btn--ghost:hover { border-color: rgba(255,255,255,0.32); }
  .btn--ghost:disabled { opacity: 0.3; cursor: not-allowed; }

  /* Écran de résultat -- tout est "généré" ici (parcours gratuit, avant
     paiement) : pas de bloc "données vérifiées" comme sur /concept, ce
     serait faux -- aucune vérification n'a eu lieu à ce stade. */
  #result-screen { display: none; text-align: center; padding: var(--space-64) 0; }
  #result-screen.is-visible { display: block; }
  .result-badge { font-size: 11px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; color: var(--steel); margin-bottom: var(--space-16); }
  #result-name { font-size: 32px; font-weight: 800; letter-spacing: -0.02em; margin: 0 0 var(--space-24); }
  .result-block { text-align: left; margin-bottom: var(--space-24); }
  .result-block p { font-size: 15px; line-height: 1.6; color: #E4E6EB; margin: 0; }
  .result-transition { font-size: 14px; color: var(--steel); margin: var(--space-32) 0 var(--space-24); }

  footer.page-footer { text-align: center; padding: var(--space-24); }
  footer.page-footer a { font-size: 13px; color: var(--steel); text-decoration: none; }
</style>
</head>
<body>
  <div id="loading">
    <div class="loading-spinner" aria-hidden="true"></div>
    <p>Chargement...</p>
  </div>

  <div id="error-state">
    <p id="error-message">Un souci technique est survenu.</p>
    <a class="btn btn--ghost" href="${siteUrl}">Retour à l'accueil</a>
  </div>

  <div id="app">
    <div class="wrap">
      <div id="questionnaire">
        <p class="progress-label" id="progress-label">Question 1 / 9</p>
        <div class="progress-track"><div class="progress-fill" id="progress-fill"></div></div>
        <div id="questions-container"></div>
        <div class="nav-row">
          <button type="button" class="btn btn--ghost" id="btn-prev">Précédent</button>
          <button type="button" class="btn btn--primary" id="btn-next" disabled>Suivant</button>
        </div>
      </div>

      <div id="result-screen">
        <p class="result-badge">Ton profil entrepreneur</p>
        <h1 id="result-name"></h1>
        <div class="result-block"><p id="result-opening"></p></div>
        <div class="result-block"><p id="result-strength"></p></div>
        <div class="result-block"><p id="result-direction"></p></div>
        <p class="result-transition" id="result-transition"></p>
        <a class="btn btn--primary" id="result-cta" href="#">Lancer mon business</a>
      </div>
    </div>
    <footer class="page-footer"><a href="${siteUrl}">Retour à l'accueil</a></footer>
  </div>

  <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
  <script src="/js/supabase-client.js"></script>
  <script>
    (function () {
      var QUESTIONS = [
        {
          id: "revenu_vise",
          type: "slider",
          title: "Quel revenu mensuel vises-tu ?",
          min: 500,
          max: 20000,
          step: 100,
          format: function (v) { return v >= 20000 ? "20 000 € et plus" : Number(v).toLocaleString("fr-FR") + " € / mois"; }
        },
        {
          id: "reponse_nuit",
          type: "textarea",
          size: "short",
          maxlength: 280,
          title: "Qu'est-ce qui te réveille la nuit quand tu penses à ton projet ?"
        },
        {
          id: "confiance",
          type: "slider-emoji",
          title: "Ton niveau de confiance actuel, sur 10 ?",
          min: 1,
          max: 10,
          step: 1,
          emojiFor: function (v) {
            if (v <= 3) return "😟";
            if (v <= 6) return "😐";
            if (v <= 8) return "🙂";
            return "😄";
          }
        },
        {
          id: "frein",
          type: "single-choice-other",
          title: "Qu'est-ce qui te freine le plus aujourd'hui ?",
          options: [
            { value: "temps", label: "Manque de temps" },
            { value: "argent", label: "Manque d'argent" },
            { value: "peur_echec", label: "Peur de l'échec" },
            { value: "ne_sait_pas", label: "Ne sait pas par où commencer" },
            { value: "autre", label: "Autre" }
          ]
        },
        {
          id: "fierte",
          type: "single-choice",
          title: "Si tu réussissais, qui serait le plus fier de toi ?",
          options: [
            { value: "parents", label: "Mes parents" },
            { value: "partenaire", label: "Mon/ma partenaire" },
            { value: "amis", label: "Mes amis" },
            { value: "moi_meme", label: "Moi-même" },
            { value: "personne", label: "Personne en particulier" }
          ]
        },
        {
          id: "frequence",
          type: "single-choice",
          title: "À quelle fréquence tu penses à ton projet ?",
          options: [
            { value: "constamment", label: "Constamment" },
            { value: "plusieurs_fois_jour", label: "Plusieurs fois par jour" },
            { value: "une_fois_jour", label: "Une fois par jour" },
            { value: "rarement", label: "Rarement" }
          ]
        },
        {
          id: "habitude_regrettee",
          type: "textarea",
          size: "short",
          maxlength: 280,
          title: "Quelle habitude aimerais-tu avoir prise il y a un an ?"
        },
        {
          id: "incompris",
          type: "textarea",
          size: "medium",
          maxlength: 500,
          title: "Qu'est-ce que ton entourage ne comprend pas sur ton ambition ?"
        },
        {
          id: "projection_10ans",
          type: "textarea",
          size: "large",
          maxlength: 800,
          title: "Où te vois-tu dans 10 ans si rien ne change ?"
        }
      ];

      var answers = {};
      var currentIndex = 0;
      var container = document.getElementById("questions-container");
      var btnPrev = document.getElementById("btn-prev");
      var btnNext = document.getElementById("btn-next");

      function escapeHtml(str) {
        var div = document.createElement("div");
        div.textContent = String(str == null ? "" : str);
        return div.innerHTML;
      }

      function isAnswered(q) {
        var val = answers[q.id];
        if (q.type === "slider" || q.type === "slider-emoji") return typeof val === "number";
        if (q.type === "single-choice") return typeof val === "string" && val.length > 0;
        if (q.type === "single-choice-other") {
          if (typeof val !== "string" || !val) return false;
          if (val === "autre") return typeof answers.frein_autre === "string" && answers.frein_autre.trim().length > 0;
          return true;
        }
        if (q.type === "textarea") return typeof val === "string" && val.trim().length > 0;
        return false;
      }

      function renderQuestion(index) {
        var q = QUESTIONS[index];
        var el = document.createElement("div");
        el.className = "question-screen is-active";
        el.setAttribute("data-question-id", q.id);

        var html = '<h2 class="question-title">' + escapeHtml(q.title) + "</h2>";

        if (q.type === "slider" || q.type === "slider-emoji") {
          var current = typeof answers[q.id] === "number" ? answers[q.id] : Math.round((q.min + q.max) / 2);
          html +=
            '<div class="slider-block">' +
            (q.type === "slider-emoji" ? '<div class="slider-emoji" id="field-emoji">' + q.emojiFor(current) + "</div>" : "") +
            '<p class="slider-value" id="field-value">' + (q.format ? q.format(current) : current) + "</p>" +
            '<input type="range" id="field-input" min="' + q.min + '" max="' + q.max + '" step="' + q.step + '" value="' + current + '" />' +
            '<div class="slider-scale-labels"><span>' + (q.format ? q.format(q.min) : q.min) + "</span><span>" + (q.format ? q.format(q.max) : q.max) + "</span></div>" +
            "</div>";
        } else if (q.type === "single-choice" || q.type === "single-choice-other") {
          html += '<div class="choice-grid" id="field-choices">';
          q.options.forEach(function (opt) {
            var selected = answers[q.id] === opt.value;
            html +=
              '<button type="button" class="choice-card' + (selected ? " is-selected" : "") + '" data-value="' + escapeHtml(opt.value) + '">' +
              escapeHtml(opt.label) +
              "</button>";
          });
          html += "</div>";
          if (q.type === "single-choice-other") {
            var otherVisible = answers[q.id] === "autre";
            html +=
              '<div class="choice-other-field' + (otherVisible ? " is-visible" : "") + '" id="field-other">' +
              '<input type="text" id="field-other-input" placeholder="Précise..." value="' + escapeHtml(answers.frein_autre || "") + '" maxlength="140" />' +
              "</div>";
          }
        } else if (q.type === "textarea") {
          var text = answers[q.id] || "";
          html +=
            '<textarea id="field-input" class="size-' + q.size + '" maxlength="' + q.maxlength + '" placeholder="Ta réponse...">' + escapeHtml(text) + "</textarea>" +
            '<p class="char-counter" id="field-counter">' + text.length + " / " + q.maxlength + "</p>";
        }

        el.innerHTML = html;
        return el;
      }

      function attachHandlers(index) {
        var q = QUESTIONS[index];

        if (q.type === "slider" || q.type === "slider-emoji") {
          var input = document.getElementById("field-input");
          var valueEl = document.getElementById("field-value");
          var emojiEl = document.getElementById("field-emoji");
          answers[q.id] = Number(input.value);
          input.addEventListener("input", function () {
            var v = Number(input.value);
            answers[q.id] = v;
            valueEl.textContent = q.format ? q.format(v) : String(v);
            if (emojiEl) emojiEl.textContent = q.emojiFor(v);
            updateNextEnabled();
          });
        } else if (q.type === "single-choice" || q.type === "single-choice-other") {
          var cards = document.querySelectorAll("#field-choices .choice-card");
          cards.forEach(function (card) {
            card.addEventListener("click", function () {
              cards.forEach(function (c) { c.classList.remove("is-selected"); });
              card.classList.add("is-selected");
              answers[q.id] = card.getAttribute("data-value");
              if (q.type === "single-choice-other") {
                var otherField = document.getElementById("field-other");
                if (answers[q.id] === "autre") {
                  otherField.className = "choice-other-field is-visible";
                } else {
                  otherField.className = "choice-other-field";
                  answers.frein_autre = "";
                }
              }
              updateNextEnabled();
            });
          });
          var otherInput = document.getElementById("field-other-input");
          if (otherInput) {
            otherInput.addEventListener("input", function () {
              answers.frein_autre = otherInput.value;
              updateNextEnabled();
            });
          }
        } else if (q.type === "textarea") {
          var textarea = document.getElementById("field-input");
          var counter = document.getElementById("field-counter");
          answers[q.id] = textarea.value;
          textarea.addEventListener("input", function () {
            answers[q.id] = textarea.value;
            counter.textContent = textarea.value.length + " / " + q.maxlength;
            updateNextEnabled();
          });
        }
      }

      function updateNextEnabled() {
        btnNext.disabled = !isAnswered(QUESTIONS[currentIndex]);
      }

      function renderStep() {
        container.innerHTML = "";
        container.appendChild(renderQuestion(currentIndex));
        attachHandlers(currentIndex);
        updateNextEnabled();

        document.getElementById("progress-label").textContent = "Question " + (currentIndex + 1) + " / " + QUESTIONS.length;
        document.getElementById("progress-fill").style.width = Math.round(((currentIndex + 1) / QUESTIONS.length) * 100) + "%";
        btnPrev.disabled = currentIndex === 0;
        btnNext.textContent = currentIndex === QUESTIONS.length - 1 ? "Voir mon profil" : "Suivant";
      }

      btnPrev.addEventListener("click", function () {
        if (currentIndex === 0) return;
        currentIndex -= 1;
        renderStep();
      });

      btnNext.addEventListener("click", function () {
        if (!isAnswered(QUESTIONS[currentIndex])) return;
        if (currentIndex < QUESTIONS.length - 1) {
          currentIndex += 1;
          renderStep();
        } else {
          submitQuestionnaire();
        }
      });

      var supabaseRef = null;
      var sessionRef = null;

      async function submitQuestionnaire() {
        btnNext.disabled = true;
        btnNext.textContent = "Enregistrement...";
        try {
          var row = {
            user_id: sessionRef.user.id,
            revenu_vise: answers.revenu_vise,
            reponse_nuit: answers.reponse_nuit,
            confiance: answers.confiance,
            frein: answers.frein,
            frein_autre: answers.frein === "autre" ? answers.frein_autre : null,
            fierte: answers.fierte,
            frequence: answers.frequence,
            habitude_regrettee: answers.habitude_regrettee,
            incompris: answers.incompris,
            projection_10ans: answers.projection_10ans,
            completed_at: new Date().toISOString()
          };
          var saveRes = await supabaseRef.from("entrepreneur_profile_answers").upsert(row, { onConflict: "user_id" });
          if (saveRes.error) throw saveRes.error;

          document.getElementById("questionnaire").style.display = "none";
          document.getElementById("loading").className = "";
          document.getElementById("loading").querySelector("p").textContent = "On prépare ton profil...";

          var genRes = await fetch(supabaseRef.supabaseUrl + "/functions/v1/generate-entrepreneur-profile", {
            method: "POST",
            headers: { Authorization: "Bearer " + sessionRef.access_token, "Content-Type": "application/json" }
          });
          var genBody = await genRes.json();
          document.getElementById("loading").className = "is-hidden";
          if (!genRes.ok || !genBody.profile) {
            showError(genBody.error || "Génération momentanément indisponible.");
            return;
          }

          renderResult(genBody.profile);
        } catch (err) {
          console.error("[profil-entrepreneur] échec de soumission :", err);
          document.getElementById("loading").className = "is-hidden";
          showError("Un souci technique est survenu. Réessaie dans quelques minutes.");
        }
      }

      function renderResult(profile) {
        document.getElementById("result-name").textContent = profile.profile_name;
        document.getElementById("result-opening").textContent = profile.opening_line;
        document.getElementById("result-strength").textContent = profile.strength_recognition;
        document.getElementById("result-direction").textContent = profile.direction_hint;
        document.getElementById("result-transition").textContent = profile.transition_line;

        var cta = document.getElementById("result-cta");
        try {
          var url = new URL(${JSON.stringify(stripePaymentLink)});
          url.searchParams.set("client_reference_id", sessionRef.user.id);
          if (sessionRef.user.email) url.searchParams.set("prefilled_email", sessionRef.user.email);
          cta.href = url.toString();
        } catch (err) {
          console.warn("[profil-entrepreneur] lien de paiement invalide :", err);
        }

        document.getElementById("result-screen").className = "is-visible";
      }

      function showError(message) {
        document.getElementById("error-message").textContent = message;
        document.getElementById("error-state").className = "is-visible";
      }

      function boot() {
        var supabase = window.ColdTrendSupabase;
        if (!supabase) return;
        supabaseRef = supabase;

        supabase.auth.getUser().then(function (res) {
          var user = res.data ? res.data.user : null;
          if (!user) {
            showError("Session introuvable — reconnecte-toi pour continuer.");
            return;
          }
          supabase.auth.getSession().then(function (sessionRes) {
            var session = sessionRes.data ? sessionRes.data.session : null;
            if (!session) {
              showError("Session invalide — reconnecte-toi.");
              return;
            }
            sessionRef = session;

            // Si un profil existe deja (un seul par utilisateur), on saute
            // directement au resultat plutot que de refaire les 9 questions.
            supabase
              .from("entrepreneur_profiles")
              .select("*")
              .eq("user_id", user.id)
              .maybeSingle()
              .then(function (existingRes) {
                document.getElementById("loading").className = "is-hidden";
                document.getElementById("app").className = "is-visible";
                if (existingRes.data) {
                  document.getElementById("questionnaire").style.display = "none";
                  renderResult(existingRes.data);
                } else {
                  renderStep();
                }
              });
          });
        });
      }

      if (window.ColdTrendSupabase) {
        boot();
      } else {
        document.addEventListener("coldtrend:supabase-ready", boot, { once: true });
      }
    })();
  </script>
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
  position: relative;
  min-height: 100dvh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  overflow: hidden;
}

/* Fond du hero repris à l'identique (motif points/lignes) sur /connexion
   uniquement -- dérive lente en boucle, pas une simple image statique, mais
   assez discrète pour ne pas distraire sur un écran de connexion. */
.auth-bg-pattern {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  z-index: 0;
  animation: authBgDrift 40s linear infinite;
}

.auth-card {
  position: relative;
  z-index: 1;
}

@keyframes authBgDrift {
  0% { transform: translate(0, 0); }
  50% { transform: translate(-1.5%, 1%); }
  100% { transform: translate(0, 0); }
}

@media (prefers-reduced-motion: reduce) {
  .auth-bg-pattern { animation: none; }
}

/* Bouton Google + séparateur -- repris à l'identique de l'écran d'auth du
   quiz (scripts/build.mjs, quiz-google-btn/quiz-auth-divider), avec les
   tokens --color-* des pages d'auth au lieu de ceux de l'accueil. */
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
  color: var(--color-steel);
  font-size: 12px;
}

.quiz-auth-divider::before,
.quiz-auth-divider::after {
  content: "";
  flex: 1;
  height: 1px;
  background: rgba(255, 255, 255, 0.1);
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
.field input:focus + label,
.field input:-webkit-autofill + label,
.field input:autofill + label {
  transform: translateY(-11px) scale(0.78);
  color: var(--color-cobalt-soft);
}

/* Détection fiable de l'autofill Chrome/Safari : ces navigateurs ne
   déclenchent pas toujours un vrai événement 'input' quand ils remplissent
   le champ (surtout via un gestionnaire de mots de passe tiers), donc le
   'input.value.length > 0' de initFloatingLabel() peut ne jamais se
   redéclencher. :-webkit-autofill seul (ci-dessus) suffit pour l'affichage,
   mais cette animation vide + l'événement 'animationstart' qu'elle déclenche
   permet à initFloatingLabel() de resynchroniser la classe .is-filled au
   bon moment plutôt que de dépendre d'un setTimeout arbitraire.
   Voir https://stackoverflow.com/a/41530164 pour ce pattern. */
@keyframes onFieldAutofillStart {
  from {}
  to {}
}

.field input:-webkit-autofill {
  animation-name: onFieldAutofillStart;
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
  text-decoration: none;
  box-sizing: border-box;
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

/* Section "Mon projet" -- ajoutee sous la timeline narrative existante,
   pas un onglet separe (decision produit : evite d'introduire un pattern
   UI nouveau pour une seule fonctionnalite). Refait les memes requetes
   que /concept/{slug} a l'affichage, ne stocke aucune copie du contenu. */
.dossier__project {
  margin-top: 32px;
  padding-top: 32px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}

.dossier__project-title {
  font-size: 16px;
  font-weight: 800;
  margin: 0 0 16px;
  color: var(--color-paper-soft);
}

.dossier-project-card {
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 14px;
  padding: 20px;
  background: rgba(255, 255, 255, 0.02);
}

.dossier-project-card__top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
}

.dossier-project-card__concept {
  font-size: 16px;
  font-weight: 700;
  margin: 0;
  color: var(--color-paper-soft);
}

.dossier-project-card__badge {
  display: inline-flex;
  align-items: center;
  font-size: 11px;
  font-weight: 700;
  border-radius: 999px;
  padding: 3px 9px;
  color: var(--color-verified-green);
  background: rgba(0, 196, 140, 0.12);
  border: 1px solid rgba(0, 196, 140, 0.3);
  white-space: nowrap;
}

.dossier-project-card__meta {
  font-size: 13px;
  color: var(--color-steel);
  margin: 0 0 12px;
}

.dossier-project-card__link,
.dossier-project-card__concept-link {
  display: block;
  font-size: 13px;
  color: var(--color-cobalt-soft);
  text-decoration: none;
  margin-top: 6px;
}

.dossier-project-empty__text {
  font-size: 14px;
  color: var(--color-steel);
  margin: 0 0 12px;
}

.dossier-project-empty__cta {
  font-size: 13px;
  color: var(--color-cobalt-soft);
  text-decoration: none;
}

/* Chapitre bonus -- même traitement visuel que son équivalent sur l'écran
   résultat du quiz (result-bonus-chapter), adapté aux tokens --color-*
   de /compte. Module gratuit en soi, mais /compte lui-même n'est
   accessible qu'après paiement (voir check() dans comptePage()) -- de
   facto réservé aux comptes payés par la position du lien, pas par une
   condition explicite ici. */
.dossier-bonus-chapter {
  display: block;
  margin-top: 24px;
  padding: 18px;
  border-radius: var(--radius-lg);
  border: 1px solid rgba(0, 71, 255, 0.25);
  background: rgba(0, 71, 255, 0.06);
  text-decoration: none;
  transition: border-color 0.2s ease, background 0.2s ease;
}

.dossier-bonus-chapter:hover {
  border-color: rgba(0, 71, 255, 0.45);
  background: rgba(0, 71, 255, 0.1);
}

.dossier-bonus-chapter__eyebrow {
  display: block;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-cobalt-soft);
  margin-bottom: 6px;
}

.dossier-bonus-chapter__title {
  display: block;
  font-size: 16px;
  font-weight: 700;
  color: var(--color-paper-soft);
  margin-bottom: 4px;
}

.dossier-bonus-chapter__text {
  display: block;
  font-size: 13px;
  color: var(--color-steel);
  line-height: 1.5;
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

/* ---- /admin -- back-office interne, hors de la charte "produit" -------- */
.admin-skeleton,
.admin-denied {
  max-width: 1100px;
  margin: 60px auto;
  padding: 0 24px;
}

.admin-shell {
  max-width: 1100px;
  margin: 0 auto;
  padding: 40px 24px 80px;
}

.admin-header {
  display: flex;
  align-items: baseline;
  gap: 16px;
  margin-bottom: 24px;
}

.admin-title {
  font-size: 22px;
  font-weight: 800;
  margin: 0;
}

.admin-count {
  color: var(--color-steel);
  font-size: 13px;
  margin-left: auto;
}

.admin-filters {
  display: flex;
  gap: 20px;
  flex-wrap: wrap;
  margin-bottom: 20px;
  font-size: 13px;
  color: var(--color-steel);
}

.admin-filters select {
  display: block;
  margin-top: 4px;
  padding: 6px 10px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: var(--color-ink-soft);
  color: var(--color-paper-soft);
  font-family: inherit;
}

.admin-table-wrap {
  overflow-x: auto;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: var(--radius-md);
  margin-bottom: 40px;
}

.admin-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
  white-space: nowrap;
}

.admin-table th,
.admin-table td {
  padding: 10px 14px;
  text-align: left;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.admin-table th {
  color: var(--color-steel);
  font-weight: 600;
  background: rgba(255, 255, 255, 0.02);
}

.admin-table__email {
  color: var(--color-steel);
  font-size: 11px;
}

.admin-campaign {
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  padding-top: 32px;
}

.admin-campaign__title {
  font-size: 18px;
  font-weight: 700;
  margin: 0 0 16px;
}

.admin-campaign__templates {
  display: flex;
  gap: 10px;
  margin-bottom: 20px;
}

.admin-campaign__form {
  display: flex;
  flex-direction: column;
  gap: 14px;
  max-width: 560px;
}

.admin-campaign__form label {
  display: block;
  font-size: 13px;
  color: var(--color-steel);
}

.admin-campaign__form input,
.admin-campaign__form textarea {
  display: block;
  width: 100%;
  margin-top: 6px;
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: rgba(255, 255, 255, 0.04);
  color: var(--color-paper-soft);
  font-family: inherit;
  font-size: 14px;
}

.admin-campaign__preview {
  font-size: 12px;
  color: var(--color-cobalt-soft);
  margin: 0;
}

.admin-campaign__result {
  font-size: 13px;
  color: var(--color-steel);
  margin: 0;
}

.admin-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 10px 18px;
  border-radius: 999px;
  border: none;
  font-family: inherit;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
}

.admin-btn--primary {
  background: var(--color-cobalt);
  color: #fff;
}

.admin-btn--primary:hover {
  background: var(--color-cobalt-dark);
}

.admin-btn--secondary {
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.16);
  color: var(--color-paper-soft);
}

.admin-btn--secondary:hover {
  border-color: var(--color-cobalt);
  color: var(--color-cobalt-soft);
}

.admin-campaign__status {
  margin-top: 28px;
  padding-top: 20px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}

.admin-campaign__status-note {
  font-size: 12px;
  color: var(--color-steel);
  margin: 10px 0 16px;
}

.admin-status-table {
  width: 100%;
  max-width: 560px;
  border-collapse: collapse;
  font-size: 13px;
}

.admin-status-table th,
.admin-status-table td {
  padding: 8px 12px;
  text-align: left;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.admin-status-table th {
  color: var(--color-steel);
  font-weight: 600;
  background: rgba(255, 255, 255, 0.02);
}

.admin-status--bad {
  color: #ff6b6b;
  font-weight: 700;
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
    // Jamais l'email en clair dans un header/nav visible en permanence --
    // libelle generique coherent avec le vocabulaire "dossier" deja utilise
    // sur /compte (timeline "Dossier ouvert", etc.), quel que soit
    // l'utilisateur.
    var html = isRealUser
      ? '<a href="/compte">Mon dossier</a>'
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
  // Autofill Chrome/Safari (surtout via un gestionnaire de mots de passe
  // tiers) : pas toujours de vrai événement 'input', mais :-webkit-autofill
  // déclenche l'animation vide définie dans authCss() -- 'animationstart' la
  // capture au moment exact où le navigateur remplit le champ, sans
  // dépendre d'un setTimeout arbitraire qui peut arriver trop tôt.
  input.addEventListener("animationstart", function (e) {
    if (e.animationName === "onFieldAutofillStart") sync();
  });
  // Filet de sécurité si l'autofill arrive avant que ce script ne tourne.
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
    <svg class="auth-bg-pattern" aria-hidden="true" viewBox="0 0 800 600" preserveAspectRatio="xMidYMid slice">
      <defs>
        <pattern id="auth-dots" width="28" height="28" patternUnits="userSpaceOnUse">
          <circle cx="2" cy="2" r="1.8" fill="#B8BCC4" />
        </pattern>
      </defs>
      <rect width="800" height="600" fill="url(#auth-dots)" opacity="0.16" />
      <g stroke="#B8BCC4" stroke-width="1.2" opacity="0.16" fill="none">
        <line x1="90" y1="70" x2="270" y2="190" />
        <line x1="600" y1="310" x2="740" y2="130" />
        <line x1="430" y1="40" x2="570" y2="230" />
        <line x1="150" y1="410" x2="350" y2="490" />
      </g>
    </svg>
    <div class="auth-card">
      <a class="auth-brand" href="/">${brand.name}</a>
      <h1 class="auth-title">Se connecter</h1>
      <p class="auth-subtitle">Retrouve ton concept de SaaS généré.</p>
      <div class="auth-banner auth-banner--alert" id="login-error" style="display:none;"></div>
      <button type="button" class="quiz-google-btn" id="login-google-btn">
        ${ICON_GOOGLE}
        Continuer avec Google
      </button>
      <div class="quiz-auth-divider"><span>ou</span></div>
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

      // Redirige vers /compte plutôt que "/" : sa propre logique (déjà en
      // place pour "Mon dossier" dans le header) décide ensuite où envoyer
      // l'utilisateur selon l'état réel du dossier (quiz à reprendre,
      // résultat à débloquer, ou dossier complet) -- pas de double
      // implémentation de cette décision ici.
      var googleBtn = document.getElementById("login-google-btn");
      if (googleBtn) {
        googleBtn.addEventListener("click", function () {
          if (!window.ColdTrendSupabase) return;
          window.ColdTrendSupabase.auth.signInWithOAuth({
            provider: "google",
            options: { redirectTo: window.location.origin + "/compte" }
          });
        });
      }

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
        <p class="auth-subtitle">Sécurise l'accès à ton concept de SaaS généré.</p>
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
    description: "Crée ton compte ColdTrend pour accéder à ton concept de SaaS généré.",
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
            <a class="dossier__user-dropdown-item" id="admin-link-btn" href="/admin" style="display:none;">Accéder à l'admin</a>
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

      <div class="dossier__project" id="dossier-project" style="display:none">
        <h2 class="dossier__project-title">Mon concept</h2>
        <div class="dossier-project-card">
          <div class="dossier-project-card__top">
            <p class="dossier-project-card__concept" id="project-concept-name"></p>
            <span class="dossier-project-card__badge" id="project-badge">Concept généré</span>
          </div>
          <p class="dossier-project-card__meta" id="project-meta"></p>
          <a class="dossier-project-card__concept-link" id="project-concept-link" href="/succes">Revoir le concept complet &rarr;</a>
        </div>
      </div>

      <div class="dossier__project" id="dossier-project-empty" style="display:none">
        <h2 class="dossier__project-title">Mon concept</h2>
        <p class="dossier-project-empty__text">Ton concept n'est pas encore généré.</p>
        <a class="dossier-project-empty__cta" href="/succes">Voir mes résultats &rarr;</a>
      </div>

      <a class="dossier-bonus-chapter" href="/profil-entrepreneur">
        <span class="dossier-bonus-chapter__eyebrow">Chapitre bonus, gratuit</span>
        <span class="dossier-bonus-chapter__title">Ton profil entrepreneur</span>
        <span class="dossier-bonus-chapter__text">9 questions courtes, un profil généré rien que pour toi.</span>
      </a>
    </div>
  </div>
  <div class="dossier-toast" id="dossier-toast" role="status" aria-live="polite"></div>
  <script>
    (function () {
      var SESSION_SEEN_KEY = "coldtrend_dossier_seen";
      var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

      // racheter/copier : anciennes valeurs (comptes créés avant le retrait
      // de l'écran "intention" dédié) -- rachat/creation : valeurs actuelles
      // ("creation" par défaut silencieux, "rachat" via le lien discret de
      // l'écran résultat).
      var INTENTION_LABELS = { racheter: "racheter", copier: "copier", rachat: "racheter", creation: "créer" };
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
            ? "Tu avais déjà cherché avant ColdTrend — cette fois avec un concept pensé pour ton profil : " + secteur + ", " + temps + " par semaine" + budgetPart + "."
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
          .select("intention, budget, temps, secteur, deja_cherche, match_count, paid_at, created_at, prenom, is_admin")
          .eq("id", user.id)
          .single();
        var profile = profileRes.data || {};
        if (!profile.created_at) profile.created_at = user.created_at;

        // Pas de dossier a montrer tant que le quiz n'est pas qualifie --
        // renvoie vers la reprise (ecran de transition dedie) plutot que
        // d'afficher un /compte vide. Une fois le quiz termine (match_count
        // renseigne par persistQuizAnswers) mais sans paiement, renvoie vers
        // l'ecran de resultat/paiement au lieu de laisser un /compte sans
        // contenu ni CTA. Voir resumeQuizFromRecoveryLink /
        // resumeToResultScreen dans page().
        // Un compte admin n'a jamais de dossier a completer -- il n'est pas
        // cense passer le quiz, donc ces deux redirections ne le concernent
        // jamais, quel que soit l'etat reel de son funnel/paiement.
        if (!profile.is_admin) {
          if (profile.match_count === null || profile.match_count === undefined) {
            window.location.replace("/?resume=quiz");
            return;
          }
          if (!profile.paid_at) {
            window.location.replace("/?resume=result");
            return;
          }
        }

        if (profile.is_admin) {
          document.getElementById("admin-link-btn").style.display = "block";
        }

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

        loadGeneratedConcept(supabase, user.id, profile.paid_at);
      }

      // Pivot : /compte n'affiche plus une fiche réelle sélectionnée
      // (selected_projects, retiré ici -- table encore en base mais plus
      // lue côté client) mais le concept généré par utilisateur, mis en
      // cache dans user_concepts (RLS : lecture limitée à son propre id).
      async function loadGeneratedConcept(supabase, userId, paidAt) {
        if (!paidAt) {
          document.getElementById("dossier-project-empty").style.display = "";
          return;
        }
        try {
          var conceptRes = await supabase.from("user_concepts").select("concept_name, tagline").eq("user_id", userId).maybeSingle();
          if (!conceptRes.data) {
            document.getElementById("dossier-project-empty").style.display = "";
            return;
          }
          var concept = conceptRes.data;

          document.getElementById("project-concept-name").textContent = concept.concept_name;
          document.getElementById("project-meta").textContent = concept.tagline;

          document.getElementById("dossier-project").style.display = "";
        } catch (err) {
          console.error("[compte] échec du chargement du concept généré :", err);
          document.getElementById("dossier-project-empty").style.display = "";
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

// ---- /admin — back-office interne (accès is_admin) ------------------------
//
// Statique comme les autres pages : la protection réelle est la double
// vérification côté serveur dans admin-list-profiles/admin-send-campaign
// (is_admin relu en base avec le rôle service), jamais un check ici. Ce
// script se contente d'afficher un skeleton tant que le fetch initial n'a
// pas répondu, puis affiche soit le tableau, soit une page "Accès refusé"
// si l'appel renvoie 403 -- pas de fuite de layout avant vérification.
//
// Vue par défaut = tous les profils sans filtre. Les filtres (payé, quiz,
// secteur) ne sont que des options d'affichage appliquées en JS sur le jeu
// de données déjà chargé -- ils ne refont jamais de requête et n'excluent
// jamais une ligne côté serveur.
function adminPage() {
  const body = `  <div class="admin-skeleton" id="admin-skeleton" aria-hidden="true">
    <div class="skeleton-line" style="width:160px;height:20px;"></div>
    <div class="skeleton-line" style="width:100%;height:200px;"></div>
  </div>
  <div class="admin-denied" id="admin-denied" hidden>
    <p>Accès refusé.</p>
  </div>
  <div class="admin-shell" id="admin-content" hidden>
    <header class="admin-header">
      <a class="auth-brand" href="/">${brand.name}</a>
      <h1 class="admin-title">Back-office</h1>
      <span class="admin-count" id="admin-count"></span>
    </header>

    <section class="admin-filters" aria-label="Filtres d'affichage">
      <label>Paiement
        <select id="filter-paid">
          <option value="all">Tous</option>
          <option value="paid">Payé</option>
          <option value="unpaid">Non payé</option>
        </select>
      </label>
      <label>Quiz
        <select id="filter-quiz">
          <option value="all">Tous</option>
          <option value="complete">Complet</option>
          <option value="incomplete">Abandonné / en cours</option>
        </select>
      </label>
      <label>Secteur
        <select id="filter-secteur">
          <option value="all">Tous</option>
          <option value="b2b">B2B</option>
          <option value="b2c">B2C</option>
          <option value="both">Les deux</option>
        </select>
      </label>
    </section>

    <div class="admin-table-wrap">
      <table class="admin-table">
        <thead>
          <tr>
            <th></th>
            <th>Prénom / email</th>
            <th>Secteur</th>
            <th>Budget</th>
            <th>Temps</th>
            <th>Intention</th>
            <th>Frein</th>
            <th>Revenu visé</th>
            <th>Paiement</th>
            <th>Concept</th>
            <th>Inscrit le</th>
            <th>Étape funnel</th>
          </tr>
        </thead>
        <tbody id="admin-table-body"></tbody>
      </table>
    </div>

    <section class="admin-campaign" aria-label="Envoi ciblé">
      <h2 class="admin-campaign__title">Envoi ciblé</h2>
      <div class="admin-campaign__templates">
        <button type="button" class="admin-btn admin-btn--secondary" id="template-quiz-abandonne">Relance quiz abandonné</button>
        <button type="button" class="admin-btn admin-btn--secondary" id="template-resultat-non-paye">Relance résultat non payé</button>
      </div>
      <div class="admin-campaign__form">
        <label>Segment
          <select id="campaign-segment">
            <option value="quiz_abandonne">Quiz abandonné</option>
            <option value="resultat_non_paye">Résultat non payé</option>
          </select>
        </label>
        <label>Inactif depuis (heures)
          <input type="number" id="campaign-hours" value="48" min="0" />
        </label>
        <p class="admin-campaign__preview" id="campaign-preview"></p>
        <label>Objet
          <input type="text" id="campaign-subject" placeholder="Objet de l'email" />
        </label>
        <label>Corps (variables : {{prenom}}, {{secteur}}, {{frein}})
          <textarea id="campaign-body" rows="8" placeholder="&lt;p&gt;Salut {{prenom}},&lt;/p&gt;"></textarea>
        </label>
        <button type="button" class="admin-btn admin-btn--primary" id="campaign-send-btn">Envoyer la campagne</button>
        <p class="admin-campaign__result" id="campaign-result"></p>
      </div>

      <div class="admin-campaign__status">
        <button type="button" class="admin-btn admin-btn--secondary" id="check-status-btn">Vérifier le statut d'envoi</button>
        <p class="admin-campaign__status-note">Lecture seule -- interroge Resend pour les derniers envois, ne renvoie jamais d'email.</p>
        <table class="admin-status-table" id="status-table" hidden>
          <thead>
            <tr>
              <th>Destinataire</th>
              <th>Template</th>
              <th>Envoyé le</th>
              <th>Statut Resend</th>
            </tr>
          </thead>
          <tbody id="status-table-body"></tbody>
        </table>
      </div>
    </section>
  </div>
  <script>
    (function () {
      var SECTOR_LABELS = ${JSON.stringify(quiz.sectorLabels)};
      var BUDGET_LABELS = ${JSON.stringify(quiz.budgetLabels)};
      var TIME_LABELS = ${JSON.stringify(quiz.timeLabels)};
      var FREIN_LABELS = {
        temps: "Le temps",
        argent: "Le budget",
        peur_echec: "La peur de se lancer",
        ne_sait_pas: "Ne sait pas encore",
        autre: "Autre"
      };
      var TEMPLATES = {
        quiz_abandonne: {
          segment: "quiz_abandonne",
          subject: "Tu avais commencé à générer ton concept de SaaS",
          body: "<p>Salut {{prenom}},</p><p>Tu avais commencé à générer un concept de SaaS dans le secteur {{secteur}} sans aller jusqu'au bout.</p><p><a href=\\"https://coldtrend.com/?resume=quiz\\">Reprends exactement où tu t'étais arrêté</a> — tes réponses précédentes sont toujours là.</p><p>— ColdTrend</p>"
        },
        resultat_non_paye: {
          segment: "resultat_non_paye",
          subject: "Ton concept de SaaS t'attend toujours",
          body: "<p>Salut {{prenom}},</p><p>On avait généré un concept de SaaS pour ton profil ({{secteur}}) — {{frein}} t'a peut-être arrêté avant le dernier pas.</p><p><a href=\\"https://coldtrend.com/?resume=result\\">Voir mon concept</a></p><p>— ColdTrend</p>"
        }
      };

      var rows = [];

      function formatDateFr(iso) {
        try {
          return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
        } catch (err) {
          return "";
        }
      }

      function sectorText(secteur) {
        if (!secteur || !secteur.length) return "—";
        return secteur.map(function (s) { return SECTOR_LABELS[s] || s; }).join(", ");
      }

      function quizStatus(row) {
        if (row.match_count !== null && row.match_count !== undefined) return "complete";
        return "incomplete";
      }

      function renderRow(row) {
        var tr = document.createElement("tr");
        tr.innerHTML =
          "<td><input type=\\"checkbox\\" class=\\"admin-row-check\\" data-id=\\"" + row.id + "\\" /></td>" +
          "<td>" + (row.prenom || "—") + "<br><span class=\\"admin-table__email\\">" + (row.email || "") + "</span></td>" +
          "<td>" + sectorText(row.secteur) + "</td>" +
          "<td>" + (BUDGET_LABELS[row.budget] || row.budget || "—") + "</td>" +
          "<td>" + (TIME_LABELS[row.temps] || row.temps || "—") + "</td>" +
          "<td>" + (row.intention || "—") + "</td>" +
          "<td>" + (FREIN_LABELS[row.frein] || row.frein_autre || "—") + "</td>" +
          "<td>" + (row.revenu_vise != null ? row.revenu_vise + " €" : "—") + "</td>" +
          "<td>" + (row.paid_at ? "Payé le " + formatDateFr(row.paid_at) : "Non payé") + "</td>" +
          "<td>" + (row.concept_genere || "—") + "</td>" +
          "<td>" + formatDateFr(row.created_at) + "</td>" +
          "<td>" + (row.funnel_last_step != null ? row.funnel_last_step : "—") + "</td>";
        return tr;
      }

      function applyFilters() {
        var paidFilter = document.getElementById("filter-paid").value;
        var quizFilter = document.getElementById("filter-quiz").value;
        var secteurFilter = document.getElementById("filter-secteur").value;

        var filtered = rows.filter(function (row) {
          if (paidFilter === "paid" && !row.paid_at) return false;
          if (paidFilter === "unpaid" && row.paid_at) return false;
          if (quizFilter !== "all" && quizStatus(row) !== quizFilter) return false;
          if (secteurFilter !== "all" && !(row.secteur || []).includes(secteurFilter)) return false;
          return true;
        });

        var tbody = document.getElementById("admin-table-body");
        tbody.innerHTML = "";
        filtered.forEach(function (row) {
          tbody.appendChild(renderRow(row));
        });
        document.getElementById("admin-count").textContent = filtered.length + " / " + rows.length + " profils";
      }

      ["filter-paid", "filter-quiz", "filter-secteur"].forEach(function (id) {
        document.getElementById(id).addEventListener("change", applyFilters);
      });

      function updateCampaignPreview() {
        var segment = document.getElementById("campaign-segment").value;
        var hours = Number(document.getElementById("campaign-hours").value) || 0;
        var cutoff = Date.now() - hours * 60 * 60 * 1000;

        var matching = rows.filter(function (row) {
          if (row.unsubscribed_at) return false;
          var updatedAt = new Date(row.created_at).getTime();
          if (segment === "quiz_abandonne") {
            return row.funnel_last_step > 0 && (row.match_count === null || row.match_count === undefined) && updatedAt < cutoff;
          }
          if (segment === "resultat_non_paye") {
            return row.match_count !== null && row.match_count !== undefined && !row.paid_at && updatedAt < cutoff;
          }
          return false;
        });

        document.getElementById("campaign-preview").textContent =
          matching.length + " destinataire" + (matching.length !== 1 ? "s" : "") + " correspondent à ce segment (aperçu approximatif -- le serveur revérifie au moment de l'envoi).";
      }

      document.getElementById("campaign-segment").addEventListener("change", updateCampaignPreview);
      document.getElementById("campaign-hours").addEventListener("input", updateCampaignPreview);

      function applyTemplate(key) {
        var tpl = TEMPLATES[key];
        document.getElementById("campaign-segment").value = tpl.segment;
        document.getElementById("campaign-subject").value = tpl.subject;
        document.getElementById("campaign-body").value = tpl.body;
        updateCampaignPreview();
      }

      document.getElementById("template-quiz-abandonne").addEventListener("click", function () {
        applyTemplate("quiz_abandonne");
      });
      document.getElementById("template-resultat-non-paye").addEventListener("click", function () {
        applyTemplate("resultat_non_paye");
      });

      async function callAdminFunction(name, payload) {
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
          },
          body: JSON.stringify(payload || {})
        });
        return res.json();
      }

      document.getElementById("campaign-send-btn").addEventListener("click", async function () {
        var segment = document.getElementById("campaign-segment").value;
        var hours = Number(document.getElementById("campaign-hours").value) || 0;
        var subject = document.getElementById("campaign-subject").value.trim();
        var bodyHtml = document.getElementById("campaign-body").value.trim();
        if (!subject || !bodyHtml) {
          document.getElementById("campaign-result").textContent = "Objet et corps requis.";
          return;
        }
        var confirmed = window.confirm("Envoyer cette campagne maintenant ? Cette action ne peut pas être annulée.");
        if (!confirmed) return;

        var btn = this;
        btn.disabled = true;
        var result = await callAdminFunction("admin-send-campaign", {
          templateId: segment,
          segment: { type: segment, inactiveSinceHours: hours },
          subject: subject,
          bodyHtml: bodyHtml
        });
        btn.disabled = false;

        var resultEl = document.getElementById("campaign-result");
        if (result && result.error) {
          resultEl.textContent = "Erreur : " + result.error;
        } else {
          resultEl.textContent = result.sent + " envoyé(s), " + result.failed + " échec(s), sur " + result.eligible + " éligible(s).";
        }
      });

      // Statuts Resend qui indiquent que l'email n'a pas atteint la boîte de
      // réception malgré une acceptation initiale -- mis en évidence en
      // rouge, jamais confondus visuellement avec "delivered".
      var STATUS_LABELS = {
        delivered: "Livré",
        sent: "Envoyé (pas encore confirmé livré)",
        queued: "En file d'attente",
        delivery_delayed: "Livraison retardée",
        bounced: "Rejeté (bounce)",
        complained: "Marqué comme spam",
        introuvable_chez_resend: "Introuvable chez Resend",
        erreur_requete: "Erreur de requête",
        statut_inconnu: "Statut inconnu"
      };
      var STATUS_BAD = ["bounced", "complained", "introuvable_chez_resend", "erreur_requete"];

      document.getElementById("check-status-btn").addEventListener("click", async function () {
        var btn = this;
        btn.disabled = true;
        btn.textContent = "Vérification en cours…";

        var response = await callAdminFunction("admin-check-email-status", {});

        btn.disabled = false;
        btn.textContent = "Vérifier le statut d'envoi";

        var table = document.getElementById("status-table");
        var tbody = document.getElementById("status-table-body");

        if (!response || response.error || !response.results) {
          table.hidden = true;
          window.alert("Erreur : " + (response && response.error ? response.error : "réponse invalide."));
          return;
        }

        tbody.innerHTML = response.results
          .map(function (row) {
            var label = STATUS_LABELS[row.status] || row.status;
            var badClass = STATUS_BAD.indexOf(row.status) !== -1 ? " admin-status--bad" : "";
            return (
              "<tr>" +
              "<td>" + row.recipientId.slice(0, 8) + "…</td>" +
              "<td>" + row.templateId + "</td>" +
              "<td>" + formatDateFr(row.sentAt) + "</td>" +
              '<td class="admin-status' + badClass + '">' + label + "</td>" +
              "</tr>"
            );
          })
          .join("");
        table.hidden = response.results.length === 0;
      });

      async function init() {
        function check() {
          if (!window.ColdTrendSupabase) {
            document.addEventListener("coldtrend:supabase-ready", check, { once: true });
            return;
          }
          callAdminFunction("admin-list-profiles").then(function (result) {
            document.getElementById("admin-skeleton").hidden = true;
            if (!result || result.error || !result.rows) {
              document.getElementById("admin-denied").hidden = false;
              return;
            }
            rows = result.rows;
            document.getElementById("admin-content").hidden = false;
            applyFilters();
            updateCampaignPreview();
          });
        }
        check();
      }

      init();
    })();
  </script>`;

  return authPageShell({
    title: "Back-office",
    description: "Administration ColdTrend.",
    bodyHtml: body
  });
}

// ---- /desabonnement — RGPD, public, sans session requise -------------------
function desabonnementPage() {
  const body = `  <div class="auth-shell">
    <div class="auth-card">
      <a class="auth-brand" href="/">${brand.name}</a>
      <h1 class="auth-title" id="unsub-title">Désabonnement…</h1>
      <p class="auth-subtitle" id="unsub-subtitle">Un instant.</p>
    </div>
  </div>
  <script>
    (function () {
      function check() {
        if (!window.ColdTrendSupabase) {
          document.addEventListener("coldtrend:supabase-ready", check, { once: true });
          return;
        }
        var params = new URLSearchParams(window.location.search);
        var token = params.get("token");
        var titleEl = document.getElementById("unsub-title");
        var subtitleEl = document.getElementById("unsub-subtitle");
        if (!token) {
          titleEl.textContent = "Lien invalide.";
          subtitleEl.textContent = "";
          return;
        }
        var supabase = window.ColdTrendSupabase;
        fetch(supabase.supabaseUrl + "/functions/v1/unsubscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey: supabase.supabaseKey },
          body: JSON.stringify({ token: token })
        })
          .then(function (res) { return res.json(); })
          .then(function (result) {
            if (result && result.success) {
              titleEl.textContent = "Tu es désabonné.";
              subtitleEl.textContent = "Tu ne recevras plus d'emails de relance ColdTrend.";
            } else {
              titleEl.textContent = "Lien invalide ou expiré.";
              subtitleEl.textContent = "";
            }
          })
          .catch(function () {
            titleEl.textContent = "Une erreur est survenue.";
            subtitleEl.textContent = "Réessaie dans un instant.";
          });
      }
      check();
    })();
  </script>`;

  return authPageShell({
    title: "Désabonnement",
    description: "Se désabonner des emails ColdTrend.",
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

writeBuiltFile(OUT_FILE, page({ brand, hero, socialProof, notificationStack, pricing, faq, quiz }));
writeBuiltFile(OUT_FILE_SUCCESS, successPage({ brand, siteUrl: SITE_URL }));
writeBuiltFile(OUT_FILE_CONCEPT, conceptPage({ brand, siteUrl: SITE_URL, commPlanPaymentLink: COMM_PLAN_PAYMENT_LINK }));
writeBuiltFile(OUT_FILE_ENTREPRENEUR_PROFILE, entrepreneurProfilePage({ brand, siteUrl: SITE_URL, stripePaymentLink: STRIPE_PAYMENT_LINK }));

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
writeBuiltFile(path.join(OUT_DIR, "admin.html"), adminPage());
writeBuiltFile(path.join(OUT_DIR, "desabonnement.html"), desabonnementPage());

console.log("Aucun motif interdit (service_role / sb_secret_ / SUPABASE_SERVICE) trouvé dans la sortie buildée.");
