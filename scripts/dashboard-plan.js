// ---------------------------------------------------------------------------
// ColdTrend — module déterministe du dashboard /compte : programme des
// missions hebdomadaires, prochaine action unique, série de jours actifs,
// jalons de progression.
//
// - Mêmes entrées -> mêmes sorties. Aucune donnée inventée : les missions
//   sont des consignes, la série et les jalons ne se calculent qu'à partir
//   de ce que la personne a réellement fait ou déclaré (missions cochées,
//   revenus saisis).
// - Copy : tutoiement, ton de coach, titres de 10 mots maximum.
// - ES5, servi tel quel en /js/dashboard-plan.js (window.ColdTrendPlan),
//   testé sous Node (scripts/dashboard-plan.test.mjs). S'appuie sur
//   window.ColdTrendGoal (goal-math.js) pour le rythme hebdomadaire.
// ---------------------------------------------------------------------------
(function (root) {
  "use strict";

  var DAY = 86400000;
  var TZ = "Europe/Paris";
  var DATE_FORMAT = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });

  // Date du jour à Paris, "AAAA-MM-JJ".
  function parisDate(ms) {
    return DATE_FORMAT.format(new Date(ms));
  }

  function dateToUtcMs(isoDate) {
    var p = isoDate.split("-");
    return Date.UTC(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
  }

  function utcMsToDate(ms) {
    return new Date(ms).toISOString().slice(0, 10);
  }

  // Lundi de la semaine (Paris) contenant ms -> "AAAA-MM-JJ".
  function weekStart(ms) {
    var d = dateToUtcMs(parisDate(ms));
    var isoDay = (new Date(d).getUTCDay() + 6) % 7; // 0 = lundi
    return utcMsToDate(d - isoDay * DAY);
  }

  // Semaine du programme (0 = semaine du début), alignée sur les lundis.
  function weekIndex(startMs, nowMs) {
    var a = dateToUtcMs(weekStart(startMs));
    var b = dateToUtcMs(weekStart(nowMs));
    return Math.max(0, Math.round((b - a) / (7 * DAY)));
  }

  // Premier jour du mois (Paris) -> "AAAA-MM-01".
  function monthStart(ms) {
    return parisDate(ms).slice(0, 8) + "01";
  }

  // ---- Programme des missions ----------------------------------------------
  var VIDEOS_PER_WEEK = { low: 3, mid: 5, high: 7 };

  function videosFor(ctx) {
    return VIDEOS_PER_WEEK[ctx.temps] || VIDEOS_PER_WEEK.mid;
  }

  var PROGRAM = [
    {
      theme: "Valide ton idée",
      missions: function () {
        return [
          { key: "pitch", title: "Écris ton pitch en une phrase" },
          { key: "ask5", title: "Montre-le à 5 personnes de ta cible" },
          { key: "video1", title: "Publie ta première vidéo" }
        ];
      }
    },
    {
      theme: "Lance ton contenu",
      missions: function (ctx) {
        return [
          { key: "videos", title: "Publie " + videosFor(ctx) + " vidéos cette semaine" },
          { key: "replies", title: "Réponds à chaque commentaire reçu" },
          { key: "objections", title: "Note 3 objections entendues" }
        ];
      }
    },
    {
      theme: "Capte tes premiers intéressés",
      missions: function (ctx) {
        return [
          { key: "waitlist", title: "Crée une page pour récolter des emails" },
          { key: "invite", title: "Invite 10 personnes à s'inscrire" },
          { key: "videos", title: "Publie " + videosFor(ctx) + " vidéos cette semaine" }
        ];
      }
    },
    {
      theme: "Vends à tes premiers clients",
      missions: function (ctx) {
        return [
          { key: "offer", title: "Propose ton offre à 3 personnes" },
          { key: "feedback", title: "Demande un avis à un client" },
          { key: "videos", title: "Publie " + videosFor(ctx) + " vidéos cette semaine" }
        ];
      }
    }
  ];

  // Après le programme de lancement : rythme de croisière, calé sur
  // l'objectif et le délai (goal-math) quand ils sont connus.
  function cruiseMissions(ctx) {
    var G = root.ColdTrendGoal;
    var list = [{ key: "videos", title: "Publie " + videosFor(ctx) + " vidéos cette semaine" }];
    if (G && ctx.objectif > 0 && ctx.delai > 0) {
      var perWeek = Math.max(1, Math.ceil(G.clientsPerWeek(ctx.objectif, ctx.delai, G.averagePrice(ctx.secteur))));
      list.push({ key: "clients", title: "Vise " + perWeek + " nouveau" + (perWeek > 1 ? "x" : "") + " client" + (perWeek > 1 ? "s" : "") + " cette semaine" });
    } else {
      list.push({ key: "offer", title: "Propose ton offre à 3 personnes" });
    }
    list.push({ key: "revenue", title: "Saisis tes revenus du mois" });
    return list;
  }

  function weekPlan(index, ctx) {
    var c = ctx || {};
    if (index < PROGRAM.length) return { theme: PROGRAM[index].theme, missions: PROGRAM[index].missions(c) };
    return { theme: "Garde le rythme", missions: cruiseMissions(c) };
  }

  // Prochaine action unique : première mission non cochée de la semaine.
  function nextAction(missions, doneKeys) {
    for (var i = 0; i < missions.length; i += 1) {
      if (doneKeys.indexOf(missions[i].key) === -1) return missions[i];
    }
    return null;
  }

  // ---- Série de jours actifs ---------------------------------------------
  // Jours (Paris) où la personne a coché une mission ou saisi un revenu.
  // La série court jusqu'à aujourd'hui, ou jusqu'à hier si rien n'est
  // encore fait aujourd'hui (elle n'est pas perdue avant minuit).
  function activeStreak(activityDates, todayDate) {
    var set = {};
    for (var i = 0; i < activityDates.length; i += 1) set[activityDates[i]] = true;
    var cursor = dateToUtcMs(todayDate);
    if (!set[todayDate]) cursor -= DAY;
    var count = 0;
    while (set[utcMsToDate(cursor)]) {
      count += 1;
      cursor -= DAY;
    }
    return { days: count, activeToday: !!set[todayDate] };
  }

  // ---- Jalons de progression --------------------------------------------------
  // Sur les revenus DÉCLARÉS du mois : premier euro, 100 €, puis 25 / 50 /
  // 100 % de l'objectif. Triés, sans doublon.
  function milestones(goal) {
    var list = [
      { key: "first_euro", amount: 1, label: "Ton premier euro" },
      { key: "hundred", amount: 100, label: "100 € gagnés" }
    ];
    var g = Number(goal) || 0;
    if (g > 0) {
      list.push({ key: "quarter", amount: Math.ceil(g * 0.25), label: "Un quart de ton objectif" });
      list.push({ key: "half", amount: Math.ceil(g * 0.5), label: "La moitié de ton objectif" });
      list.push({ key: "goal", amount: g, label: "Objectif atteint" });
    }
    var seen = {};
    return list
      .filter(function (m) {
        if (seen[m.amount] || m.amount <= 0) return false;
        seen[m.amount] = true;
        return true;
      })
      .sort(function (a, b) {
        return a.amount - b.amount;
      });
  }

  // Jalons franchis en passant de `before` à `after` (pour les confettis).
  function crossedMilestones(before, after, goal) {
    var b = Number(before) || 0;
    var a = Number(after) || 0;
    return milestones(goal).filter(function (m) {
      return b < m.amount && a >= m.amount;
    });
  }

  root.ColdTrendPlan = {
    parisDate: parisDate,
    weekStart: weekStart,
    weekIndex: weekIndex,
    monthStart: monthStart,
    weekPlan: weekPlan,
    nextAction: nextAction,
    activeStreak: activeStreak,
    milestones: milestones,
    crossedMilestones: crossedMilestones,
    PROGRAM_LENGTH: PROGRAM.length
  };
})(typeof window !== "undefined" ? window : globalThis);
