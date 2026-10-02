// ---------------------------------------------------------------------------
// ColdTrend — module de calcul de l'objectif (écrans « Montant » et « Délai »
// du quiz). SEUL endroit où vivent les chiffres de ces deux écrans : paliers,
// slider non linéaire, prix moyen par client, équivalences, rythme
// hebdomadaire, ton de l'accompagnement et délai suggéré.
//
// - 100 % déterministe : mêmes entrées -> mêmes sorties, aucun aléa, aucune
//   donnée mesurée. Ce sont des repères de lecture, jamais une prédiction.
// - Aucune promesse : les textes produits décrivent un rythme à tenir ou un
//   niveau de défi, jamais un résultat garanti.
// - ES5 sans dépendance : copié tel quel dans public/js/goal-math.js par
//   scripts/build.mjs (window.ColdTrendGoal), et testable sous Node
//   (scripts/goal-math.test.mjs).
// - Pas de backtick ni d'antislash : ce fichier ne passe pas par un template
//   literal, mais la règle reste la même que dans build.mjs, par sécurité.
// ---------------------------------------------------------------------------
(function (root) {
  "use strict";

  var MIN = 0;
  var MAX = 50000;

  // ---- Slider non linéaire --------------------------------------------------
  // Le <input type="range"> va de 0 à SLIDER_POSITIONS. Les 60 premiers % de
  // la course couvrent 0 -> 5 000 € (là où se trouvent la plupart des
  // objectifs, donc là où il faut de la précision), les 40 % restants
  // couvrent 5 000 -> 50 000 €.
  var SLIDER_POSITIONS = 1000;
  var KNEE_POSITION = 600;
  var KNEE_VALUE = 5000;

  // Pas d'arrondi selon la zone : 50 € sous 1 000 €, 100 € jusqu'à
  // 5 000 €, 500 € au-delà.
  function snap(value) {
    var v = Math.max(MIN, Math.min(MAX, Number(value) || 0));
    var step = v < 1000 ? 50 : v < KNEE_VALUE ? 100 : 500;
    return Math.min(MAX, Math.round(v / step) * step);
  }

  function positionToValue(position) {
    var p = Math.max(0, Math.min(SLIDER_POSITIONS, Number(position) || 0));
    var raw =
      p <= KNEE_POSITION
        ? (p / KNEE_POSITION) * KNEE_VALUE
        : KNEE_VALUE + ((p - KNEE_POSITION) / (SLIDER_POSITIONS - KNEE_POSITION)) * (MAX - KNEE_VALUE);
    return snap(raw);
  }

  function valueToPosition(value) {
    var v = Math.max(MIN, Math.min(MAX, Number(value) || 0));
    var p =
      v <= KNEE_VALUE
        ? (v / KNEE_VALUE) * KNEE_POSITION
        : KNEE_POSITION + ((v - KNEE_VALUE) / (MAX - KNEE_VALUE)) * (SLIDER_POSITIONS - KNEE_POSITION);
    return Math.round(p);
  }

  // Fraction 0..1 de la course (jauges, remplissage de piste).
  function valueToRatio(value) {
    return valueToPosition(value) / SLIDER_POSITIONS;
  }

  // ---- Paliers ----------------------------------------------------------------
  // Badges affichés au-dessus du montant. La vibration se déclenche quand
  // l'index de palier change pendant le glissé.
  var TIERS = [
    { max: 1000, id: "premiers", label: "Premiers euros" },
    { max: 5000, id: "solide", label: "Solide" },
    { max: 20000, id: "ambitieux", label: "Ambitieux" },
    { max: Infinity, id: "tres_ambitieux", label: "Très ambitieux" }
  ];

  function tierIndex(value) {
    for (var i = 0; i < TIERS.length; i += 1) {
      if (value <= TIERS[i].max) return i;
    }
    return TIERS.length - 1;
  }

  function tier(value) {
    return TIERS[tierIndex(value)];
  }

  // ---- Prix moyen par client -------------------------------------------------
  // Hypothèses d'illustration, affichées telles quelles à l'écran (jamais un
  // chiffre caché) : 20 €/mois pour un abonnement grand public, 49 €/mois
  // pour un outil pro, 30 €/mois si la cible mélange les deux.
  var PRICE_BY_SECTOR = { b2c: 20, b2b: 49, both: 30 };
  var DEFAULT_PRICE = 20;

  function averagePrice(secteur) {
    var key = Array.isArray(secteur) ? secteur[0] : secteur;
    return PRICE_BY_SECTOR[key] || DEFAULT_PRICE;
  }

  function clientsNeeded(goal, price) {
    var v = Number(goal) || 0;
    if (v <= 0) return 0;
    return Math.ceil(v / (price || DEFAULT_PRICE));
  }

  // ---- Équivalences concrètes -----------------------------------------------
  // SMIC net mensuel (temps plein), référence officielle en vigueur au
  // 1er novembre 2024 : 1 426,30 €. À mettre à jour à chaque revalorisation.
  // Volontairement pas de « loyer moyen » : aucun chiffre de référence
  // national fiable à citer, on n'invente pas.
  var SMIC_NET_MENSUEL = 1426.3;

  // Séparateur de milliers fixe (espace fine insécable U+202F), pour TOUS
  // les nombres dès 1 000 : toLocaleString("fr-FR") ne groupe pas les
  // nombres à 4 chiffres dans certains navigateurs (« 1000 € » à côté de
  // « 5 000 € »), et Node ne fait pas toujours comme le navigateur.
  var THIN_SPACE = String.fromCharCode(0x202f);

  function formatNumber(n) {
    var digits = String(Math.round(Math.abs(Number(n) || 0)));
    var out = "";
    while (digits.length > 3) {
      out = THIN_SPACE + digits.slice(-3) + out;
      digits = digits.slice(0, -3);
    }
    return (Number(n) < 0 ? "-" : "") + digits + out;
  }

  function formatEuro(n) {
    return formatNumber(n) + " €";
  }

  function equivalence(goal) {
    var v = Number(goal) || 0;
    if (v <= 0) return "";
    var smic = v / SMIC_NET_MENSUEL;
    if (smic < 0.4) {
      // Petits montants : l'équivalent journalier parle plus qu'une
      // fraction de SMIC.
      return "≈ " + formatEuro(v / 30) + " de plus par jour";
    }
    if (smic < 0.75) return "≈ un demi-SMIC";
    if (smic < 1.25) return "≈ un SMIC";
    // Au-delà : demi-unités jusqu'à 5 SMIC, puis unités entières.
    var rounded = smic < 5 ? Math.round(smic * 2) / 2 : Math.round(smic);
    return "≈ " + String(rounded).replace(".", ",") + " SMIC";
  }

  // ---- Rythme hebdomadaire ----------------------------------------------------
  var WEEKS_PER_MONTH = 52 / 12;

  function clientsPerWeek(goal, months, price) {
    var m = Math.max(1, Math.min(6, parseInt(months, 10) || 1));
    var total = clientsNeeded(goal, price);
    return total / (m * WEEKS_PER_MONTH);
  }

  function formatPerWeek(perWeek) {
    if (perWeek <= 0) return "Aucun client à trouver pour l'instant";
    if (perWeek < 1) return "Moins d'1 client par semaine à trouver";
    var n = Math.ceil(perWeek);
    return "≈ " + formatNumber(n) + " client" + (n > 1 ? "s" : "") + " par semaine à trouver";
  }

  // ---- Accompagnement : objectif × délai × heures/semaine --------------------
  // Capacité de référence (nouveaux clients par semaine qu'on considère
  // tenables avec ce temps disponible). Seuils de TON uniquement : ils
  // choisissent entre un message encourageant et un message bienveillant,
  // ils ne prédisent rien et ne bloquent jamais un choix.
  var WEEKLY_CAPACITY = { low: 2, mid: 5, high: 10 };
  var TIME_PHRASES = { low: "moins de 5h/semaine", mid: "5-15h/semaine", high: "plus de 15h/semaine" };
  var AMBITIOUS_RATIO = 1; // au-delà : ambitieux
  var VERY_AMBITIOUS_RATIO = 2.5; // au-delà : très ambitieux

  function capacity(temps) {
    return WEEKLY_CAPACITY[temps] || WEEKLY_CAPACITY.mid;
  }

  function paceRatio(goal, months, temps, price) {
    return clientsPerWeek(goal, months, price) / capacity(temps);
  }

  // Plus court délai (1 à 6 mois) qui ramène le défi sous le seuil
  // « très ambitieux ». null si même 6 mois n'y suffit pas : on ne suggère
  // alors rien plutôt qu'un délai qui ne changerait pas le message.
  function suggestedMonths(goal, temps, price) {
    for (var m = 1; m <= 6; m += 1) {
      if (paceRatio(goal, m, temps, price) <= VERY_AMBITIOUS_RATIO) return m;
    }
    return null;
  }

  // Résultat complet pour l'écran Délai. level : "realiste" | "ambitieux" |
  // "tres_ambitieux". suggestion : délai plus réaliste proposé en un tap
  // (uniquement en très ambitieux, et seulement s'il diffère du choix).
  function assess(input) {
    var goal = Number(input.goal) || 0;
    var months = parseInt(input.months, 10) || 0;
    var temps = TIME_PHRASES[input.temps] ? input.temps : "mid";
    var price = averagePrice(input.secteur);
    var timePhrase = TIME_PHRASES[temps];
    var perWeek = months ? clientsPerWeek(goal, months, price) : 0;

    if (!months) {
      return { level: null, perWeek: 0, perWeekText: "", message: "", suggestion: null, price: price };
    }

    var ratio = perWeek / capacity(temps);
    var level = ratio <= AMBITIOUS_RATIO ? "realiste" : ratio <= VERY_AMBITIOUS_RATIO ? "ambitieux" : "tres_ambitieux";
    var message;
    var suggestion = null;

    if (level === "realiste") {
      message = "Ce rythme colle à tes " + timePhrase + ". On construit ton plan là-dessus.";
    } else if (level === "ambitieux") {
      message = "Ça demande de la régularité avec " + timePhrase + ". Ton plan va s'y caler, semaine après semaine.";
    } else {
      var s = suggestedMonths(goal, temps, price);
      if (s !== null && s > months) suggestion = s;
      message = "C'est un sacré défi avec " + timePhrase + ". On te montre la voie la plus rapide.";
    }

    return {
      level: level,
      perWeek: perWeek,
      perWeekText: formatPerWeek(perWeek),
      message: message,
      suggestion: suggestion,
      price: price
    };
  }

  // ---- Assistant ColdTrend (écran Montant) -----------------------------------
  // Réaction au montant choisi, par palier. Textes fixes et déterministes
  // (aucun LLM, aucune donnée inventée) : bienveillants, honnêtes, jamais une
  // promesse de résultat. La bulle est présentée comme un assistant à
  // réponses automatiques, jamais comme un humain.
  var ASSISTANT_MESSAGES = {
    zero: "Choisis un montant, même modeste : on construit ton plan à partir de là.",
    premiers: "Un premier objectif concret. Décrocher tes premiers clients, c'est l'étape qui compte le plus.",
    solide: "Un vrai complément de revenus. Ça se construit avec de la régularité, et on va la planifier.",
    ambitieux: "Objectif ambitieux. On va le découper en étapes, pour que chaque semaine ait un cap clair.",
    tres_ambitieux: "Très ambitieux, et viser haut, c'est permis. Je ne peux rien te garantir : à l'étape suivante, on regarde honnêtement le rythme que ça demande."
  };

  function assistantMessage(goal) {
    var v = Number(goal) || 0;
    if (v <= 0) return ASSISTANT_MESSAGES.zero;
    return ASSISTANT_MESSAGES[tier(v).id];
  }

  // Libellés partagés (titre en écho de l'écran Délai, puce récap).
  function formatGoal(goal) {
    var v = Number(goal) || 0;
    return v >= MAX ? formatEuro(MAX) + " et plus/mois" : formatEuro(v) + "/mois";
  }

  var api = {
    MIN: MIN,
    MAX: MAX,
    SLIDER_POSITIONS: SLIDER_POSITIONS,
    TIERS: TIERS,
    PRICE_BY_SECTOR: PRICE_BY_SECTOR,
    SMIC_NET_MENSUEL: SMIC_NET_MENSUEL,
    snap: snap,
    positionToValue: positionToValue,
    valueToPosition: valueToPosition,
    valueToRatio: valueToRatio,
    tier: tier,
    tierIndex: tierIndex,
    averagePrice: averagePrice,
    clientsNeeded: clientsNeeded,
    equivalence: equivalence,
    clientsPerWeek: clientsPerWeek,
    formatPerWeek: formatPerWeek,
    suggestedMonths: suggestedMonths,
    assess: assess,
    formatGoal: formatGoal,
    assistantMessage: assistantMessage,
    formatEuro: formatEuro,
    formatNumber: formatNumber
  };

  root.ColdTrendGoal = api;
})(typeof window !== "undefined" ? window : globalThis);
