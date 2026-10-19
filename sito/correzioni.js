/* Novaula · Correzioni: le consegne corrette da Claude, solo per il docente.
   Claude prepara un PDF con il giusto in verde e lo sbagliato in rosso, più voto proposto e sintesi
   (tabella corrections, bucket privato "correzioni"; vedi strumenti/GUIDA-CORREZIONI.md).
   app.js chiama:
     window.NovaulaCorrezioni.board(contenitore, aiuti)        riquadro "Correzioni da controllare" in Area docente
     window.NovaulaCorrezioni.forAssignment(idCompito, aiuti)  restituisce una funzione consegna -> elemento */
(function () {
  "use strict";

  var COUNTS = [["correct", "giusta", "giuste", "ok"], ["partial", "parziale", "parziali", "half"], ["wrong", "sbagliata", "sbagliate", "ko"]];

  async function openPdf(x, c, title) {
    var w = window.open("", "_blank");
    try {
      var res = await x.sb.storage.from("correzioni").createSignedUrl(c.file_path, 3600);
      if (res.error) throw res.error;
      var href = "pdf.html?f=" + encodeURIComponent(res.data.signedUrl) + "&t=" + encodeURIComponent(title) + "&da=docente";
      if (w) w.location.href = href; else location.href = href;
    } catch (e) {
      if (w) w.close();
      x.toast(x.errText(e));
    }
  }

  async function setReviewed(x, c, value) {
    var res = await x.sb.from("corrections").update({ reviewed: value }).eq("id", c.id);
    if (res.error) throw res.error;
    c.reviewed = value;
  }

  function counts(h, c) {
    return h("span", { class: "corr-counts" }, COUNTS.map(function (k) {
      var n = c[k[0]], label = n + " " + (n === 1 ? k[1] : k[2]);
      return n ? h("span", { class: "corr-n " + k[3], title: label, text: label }) : null;
    }));
  }

  // Scheda di una correzione: voto, conteggi, sintesi, Apri e "Vista"
  function card(x, c, student, title, onChange) {
    var h = x.h;
    var seen = h("button", { class: "btn" + (c.reviewed ? "" : " primary"), type: "button" });
    function paint() {
      seen.textContent = c.reviewed ? "Vista ✓" : "Segna come vista";
      seen.className = "btn" + (c.reviewed ? "" : " primary");
      el.classList.toggle("is-reviewed", !!c.reviewed);
    }
    seen.onclick = async function () {
      seen.disabled = true;
      try { await setReviewed(x, c, !c.reviewed); paint(); if (onChange) onChange(c); }
      catch (e) { x.toast(x.errText(e)); }
      seen.disabled = false;
    };
    var el = h("div", { class: "corr" },
      h("div", { class: "corr-head" },
        c.grade && h("span", { class: "corr-grade", title: "Voto proposto", text: c.grade }),
        h("span", { class: "corr-who" }, h("b", { text: student }), counts(h, c))),
      c.summary && h("p", { class: "corr-sum", text: c.summary }),
      h("div", { class: "row" },
        h("button", { class: "btn", type: "button", text: "Apri la correzione", onclick: function () { openPdf(x, c, "Correzione · " + student + " · " + title); } }),
        seen));
    paint();
    return el;
  }

  window.NovaulaCorrezioni = {
    // Sotto "Consegne ricevute" di un compito
    forAssignment: async function (aid, x) {
      if (!x.sb) return function () { return null; };
      var res = await x.sb.from("corrections").select("*").eq("assignment_id", aid);
      var map = {};
      (res.data || []).forEach(function (c) { map[c.submission_id] = c; });
      return function (s, title) {
        var c = map[s.id];
        return c ? card(x, c, s.student_name, title || "", null) : null;
      };
    },

    // Area docente: correzioni non ancora viste, per compito
    board: function (box, x) {
      if (!x.sb) return;
      var h = x.h;
      var list = h("section", { class: "list corr-board" }, h("p", { class: "empty", text: "Caricamento delle correzioni…" }));
      var heading = h("h2", { text: "Correzioni da controllare" });
      box.appendChild(heading);
      box.appendChild(list);
      (async function () {
        var res = await x.sb.from("corrections")
          .select("*, submissions(student_name, created_at), assignments(title, class_id)")
          .eq("reviewed", false).order("updated_at", { ascending: false });
        if (res.error) {
          // tabella non ancora creata: il riquadro non serve
          if (/corrections|relation|schema cache/i.test(res.error.message || "")) { heading.remove(); list.remove(); return; }
          throw res.error;
        }
        list.textContent = "";
        if (!res.data.length) {
          list.appendChild(h("p", { class: "empty", text: "Nessuna correzione in attesa. Chiedi a Claude di correggere un compito nel progetto Novaula." }));
          return;
        }
        var groups = {}, order = [];
        res.data.forEach(function (c) {
          if (!groups[c.assignment_id]) { groups[c.assignment_id] = []; order.push(c.assignment_id); }
          groups[c.assignment_id].push(c);
        });
        order.forEach(function (aid) {
          var g = groups[aid], a = g[0].assignments || {}, cl = x.findClass(a.class_id);
          var left = h("span", { class: "corr-left", text: g.length + " da vedere" });
          function recount() {
            var n = g.filter(function (c) { return !c.reviewed; }).length;
            left.textContent = n ? n + " da vedere" : "tutte viste ✓";
          }
          var grid = h("div", { class: "corr-grid" });
          g.sort(function (p, q) { return ((p.submissions || {}).student_name || "").localeCompare((q.submissions || {}).student_name || ""); });
          g.forEach(function (c) { grid.appendChild(card(x, c, (c.submissions || {}).student_name || "Studente", a.title || "", recount)); });
          list.appendChild(h("div", { class: "corr-group" },
            h("h3", null, h("span", { text: (cl ? cl.name : (a.class_id || "").toUpperCase()) + " · " + (a.title || "Compito") }), left),
            grid));
        });
      })().catch(function (e) { list.replaceChildren(x.notice("err", x.errText(e))); });
    }
  };
})();
