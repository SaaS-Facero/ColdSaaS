// ---------------------------------------------------------------------------
// /admin — tableau de suivi des utilisateurs (composant réutilisable).
//
// Données : supabase/functions/admin-list-profiles (rôle admin revérifié
// côté serveur). Ce module fournit le HTML, le CSS et le JS client :
//   - colonnes : âge, revenus actuels, objectif, délai, cible, heures/sem.,
//     plateformes, frein, rêve, vidéos IA, accompagnement, engagement signé,
//     écran d'abandon, score d'intention, palier/statut Stripe, dernière
//     relance ;
//   - recherche, filtres, tri par colonne, export CSV (lignes filtrées),
//     fiche détaillée en panneau latéral, graphique des abandons par écran.
// Sécurité : tout le contenu venant des utilisateurs (prénom, email...) est
// inséré avec textContent, jamais innerHTML (l'ancien tableau était exposé
// à une injection de script via le prénom).
// Pas de backtick ni d'antislash dans le JS client (template literal).
// ---------------------------------------------------------------------------

// Texte injecté dans le JS client via JSON.stringify : sans guillemet double
// ni antislash (sinon un antislash-guillemet dans le template literal casse le script).
const safe = (v) => String(v ?? "").replace(/<[^>]+>/g, "").split('"').join("'").split(String.fromCharCode(92)).join("/");

// Libellés des réponses, lus dans quiz.questions au build (une seule source).
export function buildAdminLabels(quiz) {
  const optionsOf = (id) => {
    const q = quiz.questions.find((x) => x.id === id);
    const opts = q && Array.isArray(q.options) ? q.options : [];
    return Object.fromEntries(opts.map((o) => [o.value, safe(o.label)]));
  };
  return {
    age: optionsOf("age"),
    plateformes: optionsOf("plateformes"),
    blocage: optionsOf("blocage"),
    reve: optionsOf("reve"),
    temps: Object.fromEntries(Object.entries(quiz.timeLabels || {}).map(([k, v]) => [k, safe(v)])),
    secteur: Object.fromEntries(Object.entries(quiz.sectorLabels || {}).map(([k, v]) => [k, safe(v)])),
    support: optionsOf("accompagnement")
  };
}

// Écrans du quiz dans l'ordre réel (index = funnel_last_step).
export function buildScreenList(quiz) {
  return quiz.questions.map((q, i) => ({ index: i, id: q.id, title: safe(q.title || q.id) }));
}

export function adminUsersHtml() {
  return `
    <section class="admin-campaign au" aria-label="Suivi des utilisateurs" id="users-section">
      <h2 class="admin-campaign__title">Utilisateurs</h2>
      <div class="au-chart" id="au-chart" aria-label="Abandons par écran"></div>
      <div class="au-toolbar">
        <input type="search" id="au-search" placeholder="Rechercher (prénom, email, concept)" aria-label="Rechercher" />
        <select id="au-f-paid" aria-label="Statut">
          <option value="all">Tous statuts</option><option value="paid">Abonnés</option><option value="unpaid">Non abonnés</option>
        </select>
        <select id="au-f-quiz" aria-label="Quiz">
          <option value="all">Tout le quiz</option><option value="complete">Quiz terminé</option><option value="incomplete">Quiz abandonné</option>
        </select>
        <select id="au-f-secteur" aria-label="Cible">
          <option value="all">Toutes cibles</option><option value="b2b">B2B</option><option value="b2c">B2C</option><option value="both">Les deux</option>
        </select>
        <select id="au-f-support" aria-label="Accompagnement">
          <option value="all">Tout accompagnement</option><option value="autonome">Autonome</option><option value="etapes_cles">Étapes clés</option><option value="automatisation_max">Automatisation max</option>
        </select>
        <select id="au-f-video" aria-label="Vidéos IA">
          <option value="all">Vidéos IA : tous</option><option value="yes">Vidéos IA : oui</option><option value="no">Vidéos IA : non</option>
        </select>
        <select id="au-f-optin" aria-label="Consentement emails">
          <option value="all">Emails : tous</option><option value="yes">Emails : consentis</option><option value="no">Emails : non consentis</option>
        </select>
        <button type="button" class="admin-btn admin-btn--secondary" id="au-export">Exporter en CSV</button>
        <span class="au-count" id="au-count"></span>
      </div>
      <div class="au-table-wrap">
        <table class="au-table" id="au-table">
          <thead><tr id="au-head"></tr></thead>
          <tbody id="au-body"></tbody>
        </table>
      </div>
      <aside class="au-panel" id="au-panel" aria-label="Fiche utilisateur" hidden>
        <button type="button" class="au-panel__close" id="au-panel-close" aria-label="Fermer la fiche">×</button>
        <h3 class="au-panel__title" id="au-panel-title"></h3>
        <dl class="au-panel__list" id="au-panel-list"></dl>
      </aside>
    </section>
    <style>
      .au-chart { margin: 8px 0 16px; overflow-x: auto; }
      .au-chart svg { display: block; min-width: 640px; }
      .au-toolbar { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-bottom: 12px; }
      .au-toolbar input, .au-toolbar select { min-height: 40px; padding: 6px 10px; border-radius: 10px; border: 1px solid rgba(255,255,255,0.15); background: rgba(255,255,255,0.04); color: inherit; font: inherit; font-size: 13px; }
      .au-toolbar input { min-width: 240px; flex: 1; }
      .au-count { font-size: 13px; opacity: 0.7; }
      .au-table-wrap { overflow: auto; max-height: 70vh; border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; }
      .au-table { width: 100%; border-collapse: collapse; font-size: 13px; }
      .au-table th { position: sticky; top: 0; z-index: 1; background: #141a2b; text-align: left; white-space: nowrap; padding: 0; }
      .au-table th button { all: unset; display: block; padding: 10px; cursor: pointer; font-weight: 700; }
      .au-table th[aria-sort="ascending"] button::after { content: " ▲"; }
      .au-table th[aria-sort="descending"] button::after { content: " ▼"; }
      .au-table td { padding: 9px 10px; border-top: 1px solid rgba(255,255,255,0.06); white-space: nowrap; max-width: 220px; overflow: hidden; text-overflow: ellipsis; }
      .au-table tbody tr { cursor: pointer; }
      .au-table tbody tr:hover { background: rgba(0,71,255,0.08); }
      .au-table .au-mail { display: block; font-size: 11px; opacity: 0.6; }
      .au-score { display: inline-block; min-width: 34px; text-align: center; padding: 2px 6px; border-radius: 8px; font-weight: 700; }
      .au-panel { position: fixed; top: 0; right: 0; bottom: 0; z-index: 60; width: min(420px, 100vw); overflow-y: auto; padding: 24px 22px; background: #0f1424; border-left: 1px solid rgba(255,255,255,0.12); box-shadow: -20px 0 60px rgba(0,0,0,0.6); animation: au-in 280ms cubic-bezier(0.16,1,0.3,1); }
      @keyframes au-in { from { transform: translateX(40px); opacity: 0; } to { transform: none; opacity: 1; } }
      .au-panel__close { position: absolute; top: 12px; right: 12px; width: 40px; height: 40px; border: 0; border-radius: 10px; background: rgba(255,255,255,0.08); color: inherit; font-size: 22px; cursor: pointer; }
      .au-panel__title { margin: 0 40px 14px 0; font-size: 18px; }
      .au-panel__list { display: grid; grid-template-columns: 42% 1fr; gap: 8px 12px; margin: 0; font-size: 13px; }
      .au-panel__list dt { opacity: 0.65; }
      .au-panel__list dd { margin: 0; word-break: break-word; }
      @media (prefers-reduced-motion: reduce) { .au-panel { animation: none; } }
    </style>`;
}

export function adminUsersJs({ labels, screens }) {
  return `
      // ---- Suivi des utilisateurs (scripts/admin-users.mjs) ---------------
      var AU_LABELS = ${JSON.stringify(labels)};
      var AU_SCREENS = ${JSON.stringify(screens)};
      var AU_TOTAL = AU_SCREENS.length;
      var auSort = { key: "created_at", dir: "desc" };

      function auList(values, map) {
        if (!values || !values.length) return "";
        return values.map(function (v) { return (map && map[v]) || v; }).join(", ");
      }
      function auEuro(v) {
        return typeof v === "number" ? v.toLocaleString("fr-FR") + " €" : "";
      }
      function auDate(iso) {
        if (!iso) return "";
        try { return new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "2-digit" }); } catch (e) { return ""; }
      }
      function auPaid(row) {
        return !!row.paid_at || row.subscription_status === "active" || row.subscription_status === "trialing";
      }
      function auQuizDone(row) {
        return row.match_count !== null && row.match_count !== undefined;
      }
      // Écran d'abandon : dernier écran atteint, pour un quiz non terminé.
      function auDropScreen(row) {
        if (auQuizDone(row) || !row.funnel_last_step) return null;
        var s = AU_SCREENS[row.funnel_last_step];
        return s ? s : null;
      }
      function auStripe(row) {
        if (!auPaid(row) && !row.subscription_status) return "";
        var parts = [];
        if (row.subscription_duration_months) parts.push(row.subscription_duration_months + " mois");
        parts.push(row.subscription_status || (row.paid_at ? "payé" : ""));
        return parts.join(" · ");
      }

      // Colonnes : clé, titre, valeur affichée, valeur de tri.
      var AU_COLUMNS = [
        { key: "user", title: "Utilisateur", text: function (r) { return r.prenom || "—"; }, sort: function (r) { return (r.prenom || r.email || "").toLowerCase(); } },
        { key: "created_at", title: "Inscrit", text: function (r) { return auDate(r.created_at); }, sort: function (r) { return r.created_at || ""; } },
        { key: "age", title: "Âge", text: function (r) { return AU_LABELS.age[r.age_range] || ""; }, sort: function (r) { return r.age_range || ""; } },
        { key: "current_revenue", title: "Revenus actuels", text: function (r) { return auEuro(r.current_revenue); }, sort: function (r) { return r.current_revenue == null ? -1 : r.current_revenue; } },
        { key: "objectif", title: "Objectif", text: function (r) { return auEuro(r.objectif_mensuel); }, sort: function (r) { return r.objectif_mensuel || 0; } },
        { key: "delai", title: "Délai", text: function (r) { return r.delai_mois ? r.delai_mois + " mois" : ""; }, sort: function (r) { return r.delai_mois || 0; } },
        { key: "secteur", title: "Cible", text: function (r) { return auList(r.secteur, AU_LABELS.secteur); }, sort: function (r) { return auList(r.secteur, AU_LABELS.secteur); } },
        { key: "temps", title: "Heures/sem.", text: function (r) { return AU_LABELS.temps[r.temps] || r.temps || ""; }, sort: function (r) { return { low: 1, mid: 2, high: 3 }[r.temps] || 0; } },
        { key: "plateformes", title: "Plateformes", text: function (r) { return AU_LABELS.plateformes[r.plateformes] || r.plateformes || ""; }, sort: function (r) { return r.plateformes || ""; } },
        { key: "blocage", title: "Frein", text: function (r) { return auList(r.blocage, AU_LABELS.blocage); }, sort: function (r) { return auList(r.blocage, AU_LABELS.blocage); } },
        { key: "reve", title: "Rêve", text: function (r) { return auList(r.reve, AU_LABELS.reve); }, sort: function (r) { return auList(r.reve, AU_LABELS.reve); } },
        { key: "wants_ai_video", title: "Vidéos IA", text: function (r) { return r.wants_ai_video === true ? "Oui" : r.wants_ai_video === false ? "Non" : ""; }, sort: function (r) { return r.wants_ai_video === true ? 2 : r.wants_ai_video === false ? 1 : 0; } },
        { key: "support_level", title: "Accompagnement", text: function (r) { return AU_LABELS.support[r.support_level] || r.support_level || ""; }, sort: function (r) { return r.support_level || ""; } },
        { key: "engagement", title: "Engagement", text: function (r) { return r.engagement_signed_at ? "Signé " + auDate(r.engagement_signed_at) : ""; }, sort: function (r) { return r.engagement_signed_at || ""; } },
        { key: "drop", title: "Écran d'abandon", text: function (r) { var s = auDropScreen(r); return s ? s.index + 1 + "/" + AU_TOTAL + " " + s.id : auQuizDone(r) ? "Terminé" : ""; }, sort: function (r) { var s = auDropScreen(r); return s ? s.index : auQuizDone(r) ? 999 : -1; } },
        { key: "score", title: "Score", text: function (r) { return String(r.intent_score || 0); }, sort: function (r) { return r.intent_score || 0; } },
        { key: "stripe", title: "Stripe", text: auStripe, sort: function (r) { return (auPaid(r) ? 100 : 0) + (r.subscription_duration_months || 0); } },
        { key: "relance", title: "Dernière relance", text: function (r) { return r.last_relance_at ? auDate(r.last_relance_at) + " · " + (r.last_relance || "") : ""; }, sort: function (r) { return r.last_relance_at || ""; } }
      ];

      function auFiltered() {
        var q = document.getElementById("au-search").value.trim().toLowerCase();
        var fPaid = document.getElementById("au-f-paid").value;
        var fQuiz = document.getElementById("au-f-quiz").value;
        var fSecteur = document.getElementById("au-f-secteur").value;
        var fSupport = document.getElementById("au-f-support").value;
        var fVideo = document.getElementById("au-f-video").value;
        var fOptin = document.getElementById("au-f-optin").value;
        var list = rows.filter(function (r) {
          if (q && [r.prenom, r.email, r.concept_genere].join(" ").toLowerCase().indexOf(q) === -1) return false;
          if (fPaid === "paid" && !auPaid(r)) return false;
          if (fPaid === "unpaid" && auPaid(r)) return false;
          if (fQuiz === "complete" && !auQuizDone(r)) return false;
          if (fQuiz === "incomplete" && auQuizDone(r)) return false;
          if (fSecteur !== "all" && (r.secteur || []).indexOf(fSecteur) === -1) return false;
          if (fSupport !== "all" && r.support_level !== fSupport) return false;
          if (fVideo === "yes" && r.wants_ai_video !== true) return false;
          if (fVideo === "no" && r.wants_ai_video !== false) return false;
          if (fOptin === "yes" && !r.marketing_opt_in) return false;
          if (fOptin === "no" && r.marketing_opt_in) return false;
          return true;
        });
        var col = AU_COLUMNS.filter(function (c) { return c.key === auSort.key; })[0] || AU_COLUMNS[1];
        list.sort(function (a, b) {
          var x = col.sort(a);
          var y = col.sort(b);
          var cmp = x < y ? -1 : x > y ? 1 : 0;
          return auSort.dir === "asc" ? cmp : -cmp;
        });
        return list;
      }

      function auRenderHead() {
        var head = document.getElementById("au-head");
        head.textContent = "";
        AU_COLUMNS.forEach(function (c) {
          var th = document.createElement("th");
          th.setAttribute("scope", "col");
          if (c.key === auSort.key) th.setAttribute("aria-sort", auSort.dir === "asc" ? "ascending" : "descending");
          var btn = document.createElement("button");
          btn.type = "button";
          btn.textContent = c.title;
          btn.addEventListener("click", function () {
            auSort = { key: c.key, dir: auSort.key === c.key && auSort.dir === "desc" ? "asc" : "desc" };
            applyFilters();
          });
          th.appendChild(btn);
          head.appendChild(th);
        });
      }

      function auScoreColor(score) {
        return score >= 70 ? "rgba(34,197,94,0.25)" : score >= 40 ? "rgba(0,71,255,0.25)" : "rgba(255,255,255,0.08)";
      }

      // Nom conservé : appelé par le chargement initial de /admin.
      function applyFilters() {
        auRenderHead();
        var list = auFiltered();
        var body = document.getElementById("au-body");
        body.textContent = "";
        list.forEach(function (r) {
          var tr = document.createElement("tr");
          tr.addEventListener("click", function () { auOpenPanel(r); });
          AU_COLUMNS.forEach(function (c) {
            var td = document.createElement("td");
            if (c.key === "user") {
              td.textContent = r.prenom || "—";
              var mail = document.createElement("span");
              mail.className = "au-mail";
              mail.textContent = r.email || "";
              td.appendChild(mail);
            } else if (c.key === "score") {
              var badge = document.createElement("span");
              badge.className = "au-score";
              badge.style.background = auScoreColor(r.intent_score || 0);
              badge.textContent = c.text(r);
              td.appendChild(badge);
            } else {
              td.textContent = c.text(r) || "—";
            }
            td.title = td.textContent;
            tr.appendChild(td);
          });
          body.appendChild(tr);
        });
        document.getElementById("au-count").textContent = list.length + " / " + rows.length + " profils";
        document.getElementById("admin-count").textContent = rows.length + " profils";
        auRenderChart();
      }

      // Graphique des abandons : nombre de quiz non terminés par dernier
      // écran atteint (SVG, aucun calcul inventé).
      function auRenderChart() {
        var counts = AU_SCREENS.map(function () { return 0; });
        rows.forEach(function (r) { var s = auDropScreen(r); if (s) counts[s.index] += 1; });
        var max = Math.max.apply(null, counts.concat([1]));
        var ns = "http://www.w3.org/2000/svg";
        var W = Math.max(640, AU_TOTAL * 34);
        var H = 170;
        var svgEl = document.createElementNS(ns, "svg");
        svgEl.setAttribute("viewBox", "0 0 " + W + " " + H);
        svgEl.setAttribute("width", "100%");
        var bw = W / AU_TOTAL;
        counts.forEach(function (n, i) {
          var h = Math.round((n / max) * 110);
          var rect = document.createElementNS(ns, "rect");
          rect.setAttribute("x", String(i * bw + 4));
          rect.setAttribute("y", String(130 - h));
          rect.setAttribute("width", String(bw - 8));
          rect.setAttribute("height", String(Math.max(h, n ? 2 : 0)));
          rect.setAttribute("rx", "4");
          rect.setAttribute("fill", n ? "#3D6BFF" : "rgba(255,255,255,0.08)");
          var title = document.createElementNS(ns, "title");
          title.textContent = "Écran " + (i + 1) + " (" + AU_SCREENS[i].id + ") : " + n + " abandon" + (n > 1 ? "s" : "");
          rect.appendChild(title);
          svgEl.appendChild(rect);
          var val = document.createElementNS(ns, "text");
          val.setAttribute("x", String(i * bw + bw / 2));
          val.setAttribute("y", String(124 - h));
          val.setAttribute("text-anchor", "middle");
          val.setAttribute("font-size", "11");
          val.setAttribute("fill", "#E4E6EB");
          val.textContent = n ? String(n) : "";
          svgEl.appendChild(val);
          var lab = document.createElementNS(ns, "text");
          lab.setAttribute("x", String(i * bw + bw / 2));
          lab.setAttribute("y", "148");
          lab.setAttribute("text-anchor", "middle");
          lab.setAttribute("font-size", "10");
          lab.setAttribute("fill", "#8A8F98");
          lab.textContent = String(i + 1);
          svgEl.appendChild(lab);
        });
        var caption = document.createElementNS(ns, "text");
        caption.setAttribute("x", "4");
        caption.setAttribute("y", "166");
        caption.setAttribute("font-size", "11");
        caption.setAttribute("fill", "#8A8F98");
        caption.textContent = "Abandons du quiz par dernier écran atteint (survole une barre pour le détail)";
        svgEl.appendChild(caption);
        var box = document.getElementById("au-chart");
        box.textContent = "";
        box.appendChild(svgEl);
      }

      function auOpenPanel(r) {
        var panel = document.getElementById("au-panel");
        document.getElementById("au-panel-title").textContent = (r.prenom || "Sans prénom") + " · " + (r.email || "");
        var dl = document.getElementById("au-panel-list");
        dl.textContent = "";
        var extra = [
          ["Identifiant", r.id],
          ["Concept", r.concept_genere || ""],
          ["Consentement emails", r.marketing_opt_in ? "Oui" : "Non"],
          ["Désinscrit", r.unsubscribed_at ? auDate(r.unsubscribed_at) : "Non"],
          ["Adresse en erreur", r.email_suppressed_at ? auDate(r.email_suppressed_at) : "Non"],
          ["Payé le", r.paid_at ? auDate(r.paid_at) : ""],
          ["Étape (index brut)", r.funnel_last_step == null ? "" : String(r.funnel_last_step)],
          ["Frein (profil bonus)", r.frein || r.frein_autre || ""],
          ["Revenu visé (profil bonus)", r.revenu_vise != null ? r.revenu_vise + " €" : ""]
        ];
        AU_COLUMNS.filter(function (c) { return c.key !== "user"; }).map(function (c) { return [c.title, c.text(r)]; }).concat(extra).forEach(function (pair) {
          var dt = document.createElement("dt");
          dt.textContent = pair[0];
          var dd = document.createElement("dd");
          dd.textContent = pair[1] || "—";
          dl.appendChild(dt);
          dl.appendChild(dd);
        });
        panel.hidden = false;
        document.getElementById("au-panel-close").focus();
      }
      document.getElementById("au-panel-close").addEventListener("click", function () { document.getElementById("au-panel").hidden = true; });
      document.addEventListener("keydown", function (e) { if (e.key === "Escape") document.getElementById("au-panel").hidden = true; });

      // Export CSV des lignes filtrées et triées (séparateur ; pour Excel FR,
      // BOM UTF-8 pour les accents).
      function auCsvCell(v) {
        var s = String(v == null ? "" : v);
        return /[";]/.test(s) || s.indexOf(String.fromCharCode(10)) !== -1 ? '"' + s.replace(/"/g, '""') + '"' : s;
      }
      document.getElementById("au-export").addEventListener("click", function () {
        var header = ["Prénom", "Email"].concat(AU_COLUMNS.filter(function (c) { return c.key !== "user"; }).map(function (c) { return c.title; })).concat(["Consentement emails"]);
        var lines = [header.map(auCsvCell).join(";")];
        auFiltered().forEach(function (r) {
          var cells = [r.prenom || "", r.email || ""].concat(AU_COLUMNS.filter(function (c) { return c.key !== "user"; }).map(function (c) { return c.text(r); })).concat([r.marketing_opt_in ? "oui" : "non"]);
          lines.push(cells.map(auCsvCell).join(";"));
        });
        var blob = new Blob([String.fromCharCode(0xfeff) + lines.join(String.fromCharCode(13, 10))], { type: "text/csv;charset=utf-8" });
        var a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "coldtrend-utilisateurs-" + new Date().toISOString().slice(0, 10) + ".csv";
        document.body.appendChild(a);
        a.click();
        a.remove();
      });

      ["au-search", "au-f-paid", "au-f-quiz", "au-f-secteur", "au-f-support", "au-f-video", "au-f-optin"].forEach(function (id) {
        document.getElementById(id).addEventListener(id === "au-search" ? "input" : "change", applyFilters);
      });
`;
}
