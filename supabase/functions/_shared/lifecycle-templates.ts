// ---------------------------------------------------------------------------
// ColdTrend — templates des emails de lifecycle.
//
// Format imposé : texte brut signé Max, un seul lien d'action (CTA), reply-to
// réel (réglé dans lifecycle_settings). Chaque template renvoie la version
// texte ET une version HTML minimale qui a l'air d'un email écrit à la main
// (pas de bannière, pas de bouton coloré ; seule exception : la carte du
// concept de l'email +1 h, demandée explicitement).
//
// Honnêteté : aucun chiffre de revenu promis, aucune fausse urgence, aucun
// prix (les montants vivent sur la page de paiement). Les rythmes affichés
// viennent du module déterministe goal-math.js et sont présentés comme des
// repères. La garantie citée est celle de /conditions-remboursement.
// ---------------------------------------------------------------------------

import "./goal-math.js";

// deno-lint-ignore no-explicit-any
const GOAL: any = (globalThis as any).ColdTrendGoal;

export type TemplateContext = {
  prenom: string | null;
  conceptName: string | null;
  tagline: string | null;
  objectif: number | null; // €/mois
  delai: number | null; // mois
  temps: string | null; // low | mid | high
  secteur: string[] | null; // ["b2b"] ...
  blocage: string[] | null; // freins déclarés au quiz
  stoppedAtScreen: number | null; // quiz arrêté à l'écran N
  totalScreens: number;
  ctaUrl: string; // lien magique (lifecycle-link) vers l'écran exact
  unsubscribeUrl: string | null; // null pour un email transactionnel
  invoiceUrl?: string | null; // paiement échoué : page Stripe de la facture
  amountCents?: number | null;
};

export type RenderedEmail = { subject: string; text: string; html: string };

const TEMPS_PHRASES: Record<string, string> = {
  low: "moins de 5 h par semaine",
  mid: "5 à 15 h par semaine",
  high: "plus de 15 h par semaine",
};
const SECTEUR_PHRASES: Record<string, string> = {
  b2b: "des professionnels",
  b2c: "des particuliers",
  both: "des pros et des particuliers",
};
// Vidéos à publier pendant la semaine du mini-plan, selon le temps déclaré.
const VIDEOS_PER_WEEK: Record<string, number> = { low: 3, mid: 5, high: 7 };

function hello(ctx: TemplateContext) {
  return ctx.prenom ? `Salut ${ctx.prenom},` : "Salut,";
}

function concept(ctx: TemplateContext) {
  return ctx.conceptName || "ton concept";
}

function goalLine(ctx: TemplateContext) {
  if (!ctx.objectif || !GOAL) return null;
  return `Objectif : ${GOAL.formatGoal(ctx.objectif)}${ctx.delai ? ` en ${ctx.delai} mois` : ""}`;
}

const SIGNATURE = "Max\nColdTrend";

function footer(ctx: TemplateContext) {
  if (!ctx.unsubscribeUrl) return "";
  return `\n\n--\nTu reçois cet email parce que tu as accepté les conseils de ColdTrend en créant ton compte.\nNe plus recevoir ces emails : ${ctx.unsubscribeUrl}`;
}

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// Texte -> HTML « écrit à la main » : paragraphes, liens cliquables, rien
// d'autre. cardHtml : bloc optionnel inséré après le 1er paragraphe.
function toHtml(text: string, cardHtml = "") {
  const paragraphs = text.split("\n\n").map((p) => {
    const safe = escapeHtml(p)
      .replace(/(https?:[/][/][^\s]+)/g, '<a href="$1" style="color:#0047FF">$1</a>')
      .replace(/\n/g, "<br>");
    return `<p style="margin:0 0 16px">${safe}</p>`;
  });
  if (cardHtml) paragraphs.splice(2, 0, cardHtml);
  return `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;font-size:15px;line-height:1.6;color:#111;max-width:560px">${paragraphs.join("")}</div>`;
}

function build(subject: string, body: string, ctx: TemplateContext, cardHtml = ""): RenderedEmail {
  const text = `${body}\n\n${SIGNATURE}${footer(ctx)}`;
  return { subject, text, html: toHtml(text, cardHtml) };
}

// ---- Résultat non payé ----------------------------------------------------------

// +1 h : le concept l'attend, avec une carte visuelle.
function resultStep1(ctx: TemplateContext): RenderedEmail {
  const name = concept(ctx);
  const goal = goalLine(ctx);
  const card = `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 16px;border:1px solid #d6dcf5;border-radius:12px;width:100%;max-width:480px"><tr><td style="padding:16px 18px;font-family:-apple-system,Segoe UI,Arial,sans-serif">
<div style="font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#0047FF;font-weight:700">Ton concept</div>
<div style="font-size:20px;font-weight:800;color:#0A0E1A;margin:4px 0">${escapeHtml(name)}</div>
${ctx.tagline ? `<div style="font-size:14px;color:#444">${escapeHtml(ctx.tagline)}</div>` : ""}
${goal ? `<div style="font-size:13px;color:#666;margin-top:8px">${escapeHtml(goal)}</div>` : ""}
</td></tr></table>`;
  const body = [
    hello(ctx),
    `Ton concept ${name} est prêt. Il t'attend exactement là où tu l'as laissé.`,
    `Tu as fait le plus dur : répondre honnêtement aux questions. La suite, c'est passer de l'idée au plan.`,
    `Reprendre mon concept : ${ctx.ctaUrl}`,
    `PS : une question, un doute ? Réponds simplement à cet email, je lis tout.`,
  ].join("\n\n");
  return build(`Ton concept ${name} t'attend`, body, ctx, card);
}

// +24 h : une objection, choisie selon le frein déclaré au quiz.
const OBJECTIONS: Record<string, (ctx: TemplateContext) => { subject: string; lines: string[] }> = {
  par_ou_commencer: (ctx) => ({
    subject: "Par où commencer (vraiment)",
    lines: [
      "Tu m'as dit ne pas savoir par où commencer. C'est le blocage le plus courant, et il ne vient presque jamais d'un manque de capacité : il vient d'un plan trop flou.",
      `C'est pour ça que ${concept(ctx)} arrive avec des étapes dans l'ordre, calées sur ${ctx.temps ? TEMPS_PHRASES[ctx.temps] : "ton temps disponible"}. Une seule chose à faire cette semaine, puis la suivante.`,
    ],
  }),
  pas_idee: (ctx) => ({
    subject: "« Je n'ai pas la bonne idée »",
    lines: [
      "Tu m'as dit ne pas avoir la bonne idée. Personne ne l'a au départ : une idée devient bonne quand des gens sont prêts à payer pour elle.",
      `${concept(ctx)} a été construit à partir de tes réponses, pour ${ctx.secteur?.[0] ? SECTEUR_PHRASES[ctx.secteur[0]] : "ta cible"}. Le plan commence par vérifier ça vite, avant d'y passer des mois.`,
    ],
  }),
  peur_argent: () => ({
    subject: "Et si je perds de l'argent ?",
    lines: [
      "Tu m'as dit avoir peur de perdre de l'argent. C'est un bon réflexe, et je ne vais pas te promettre de gains : personne ne peut.",
      "Ce que je peux te dire : si tu publies comme prévu pendant 7 jours sans aucune vente, ton premier paiement est remboursé, selon les conditions écrites ici : https://www.coldtrend.com/conditions-remboursement",
    ],
  }),
  pas_temps: (ctx) => {
    const pace = ctx.objectif && ctx.delai && GOAL
      ? GOAL.formatPerWeek(GOAL.clientsPerWeek(ctx.objectif, ctx.delai, GOAL.averagePrice(ctx.secteur)))
      : null;
    return {
      subject: "Avec le temps que tu as vraiment",
      lines: [
        `Tu m'as dit manquer de temps. Ton plan est calé sur ce que tu m'as donné : ${ctx.temps ? TEMPS_PHRASES[ctx.temps] : "ton temps réel"}, pas sur un emploi du temps idéal.`,
        pace ? `Pour ton objectif, le rythme à tenir est d'environ : ${pace.replace(/^≈ /, "").toLowerCase()}. C'est un repère calculé, pas une promesse.` : "Le plan découpe ton objectif en petites actions hebdomadaires.",
      ],
    };
  },
  technique: (ctx) => ({
    subject: "Tu n'as pas besoin de savoir coder pour commencer",
    lines: [
      "Tu m'as dit ne pas savoir coder. Le vrai point de départ n'est pas le code : c'est de vérifier que des gens veulent ton produit.",
      `Le plan de ${concept(ctx)} commence par là. La partie technique vient après, quand tu sais quoi construire.`,
    ],
  }),
  motivation: () => ({
    subject: "Si tu as tendance à lâcher vite",
    lines: [
      "Tu m'as dit que tu lâches vite. Merci pour l'honnêteté, c'est rare.",
      "On lâche surtout quand l'objectif est énorme et la prochaine étape floue. Ton plan fait l'inverse : de petites étapes, une par semaine, que tu peux cocher.",
    ],
  }),
};

function resultStep2(ctx: TemplateContext): RenderedEmail {
  const key = (ctx.blocage || []).find((b) => OBJECTIONS[b]);
  const content = key
    ? OBJECTIONS[key](ctx)
    : {
        subject: "La question que tout le monde se pose",
        lines: [
          "« Est-ce que ça peut marcher pour moi ? » Honnêtement, ça dépend surtout de ce que tu vas faire dans les prochaines semaines.",
          `Ce que ${concept(ctx)} t'apporte, c'est un point de départ construit sur tes réponses, et des étapes claires pour avancer.`,
        ],
      };
  const body = [hello(ctx), ...content.lines, `Voir mon concept : ${ctx.ctaUrl}`].join("\n\n");
  return build(content.subject, body, ctx);
}

// +72 h : de la valeur avant de vendre -- un mini-plan utilisable tel quel.
function resultStep3(ctx: TemplateContext): RenderedEmail {
  const name = concept(ctx);
  const videos = VIDEOS_PER_WEEK[ctx.temps || "mid"] || 5;
  const target = ctx.secteur?.[0] ? SECTEUR_PHRASES[ctx.secteur[0]] : "ta cible";
  let paceLine = "Jours 6-7 : compte les réponses positives. C'est ton premier vrai signal.";
  if (ctx.objectif && ctx.delai && GOAL) {
    const pace = GOAL.formatPerWeek(GOAL.clientsPerWeek(ctx.objectif, ctx.delai, GOAL.averagePrice(ctx.secteur)));
    paceLine = `Jours 6-7 : compte les réponses positives. Ton repère pour ${GOAL.formatGoal(ctx.objectif)} : ${pace.replace(/^≈ /, "").toLowerCase()} (un calcul, pas une promesse).`;
  }
  const body = [
    hello(ctx),
    `Voici un mini-plan gratuit pour les 7 prochains jours avec ${name}. Tu peux l'appliquer même sans aller plus loin avec ColdTrend.`,
    `Jours 1-2 : écris ce que fait ${name} en une phrase, puis montre-la à 5 personnes parmi ${target}. Note leurs mots exacts.`,
    `Jours 3-5 : publie ${videos} vidéos courtes qui parlent du problème (pas du produit). Une idée par vidéo.`,
    paceLine,
    `Le plan complet (cible, canaux, étapes semaine par semaine) est ici : ${ctx.ctaUrl}`,
  ].join("\n\n");
  return build(`Ton mini-plan pour les 7 prochains jours`, body, ctx);
}

// +7 j : email de rupture. Dernier email de la séquence, et c'est vrai.
function resultStep4(ctx: TemplateContext): RenderedEmail {
  const body = [
    hello(ctx),
    `Je n'ai pas eu de nouvelles depuis que ${concept(ctx)} a été généré, et je ne veux pas t'encombrer.`,
    "Si ce n'est pas le moment, aucun souci : je ferme ton dossier et tu ne recevras plus de relance sur ce concept.",
    `Si tu veux le garder ouvert, un clic suffit : ${ctx.ctaUrl}`,
  ].join("\n\n");
  return build("Je ferme ton dossier ?", body, ctx);
}

// ---- Intention haute -----------------------------------------------------------

function checkoutAbandon(ctx: TemplateContext): RenderedEmail {
  const body = [
    hello(ctx),
    `Tu étais sur la page de paiement pour ${concept(ctx)}, et ça ne semble pas être allé au bout.`,
    "Un souci de carte ? Une question sur l'offre ? Réponds à cet email, je te réponds personnellement.",
    `Sinon, tu peux reprendre exactement où tu en étais : ${ctx.ctaUrl}`,
  ].join("\n\n");
  return build("Ton paiement n'est pas allé au bout", body, ctx);
}

// Transactionnel : pas de pied de désinscription marketing.
function paymentFailed(ctx: TemplateContext): RenderedEmail {
  const amount = ctx.amountCents ? `${(ctx.amountCents / 100).toFixed(2).replace(".", ",")} €` : null;
  const body = [
    hello(ctx),
    `Le paiement de ton abonnement ColdTrend${amount ? ` (${amount})` : ""} n'est pas passé. Ça arrive : carte expirée, plafond atteint, banque trop prudente.`,
    "Stripe va retenter automatiquement. Pour éviter toute coupure, tu peux mettre ta carte à jour et régler en une minute ici :",
    `${ctx.invoiceUrl || ctx.ctaUrl}`,
    "Une question ? Réponds à cet email.",
  ].join("\n\n");
  return build("Ton paiement n'est pas passé", body, { ...ctx, unsubscribeUrl: null });
}

// ---- Quiz arrêté à l'écran N -----------------------------------------------------

function quizAbandon(ctx: TemplateContext): RenderedEmail {
  const n = ctx.stoppedAtScreen || 1;
  const left = Math.max(1, ctx.totalScreens - n);
  const body = [
    hello(ctx),
    `Tu t'es arrêté à l'écran ${n} sur ${ctx.totalScreens}. Il t'en reste ${left} pour obtenir ton concept, et tes réponses sont gardées.`,
    `Reprendre à l'écran ${n} : ${ctx.ctaUrl}`,
  ].join("\n\n");
  return build(`Il te reste ${left} écran${left > 1 ? "s" : ""}`, body, ctx);
}

// ---- Registre --------------------------------------------------------------------
export function renderEmail(sequence: string, step: number, ctx: TemplateContext): RenderedEmail {
  if (sequence === "result_unpaid") return [resultStep1, resultStep2, resultStep3, resultStep4][step - 1](ctx);
  if (sequence === "checkout_abandon") return checkoutAbandon(ctx);
  if (sequence === "payment_failed") return paymentFailed(ctx);
  if (sequence === "quiz_abandon") return quizAbandon(ctx);
  throw new Error(`Template inconnu : ${sequence}:${step}`);
}

// Écran rouvert par le CTA de chaque email (voir lifecycle-link).
export function ctaDestination(sequence: string): "result" | "quiz" | "account" {
  if (sequence === "quiz_abandon") return "quiz";
  if (sequence === "payment_failed") return "account";
  return "result";
}

export const TEST_TEMPLATES = [
  "result_unpaid:1",
  "result_unpaid:2",
  "result_unpaid:3",
  "result_unpaid:4",
  "checkout_abandon:1",
  "payment_failed:1",
  "quiz_abandon:1",
];
