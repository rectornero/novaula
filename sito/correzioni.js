/* Novaula · Correzioni: le consegne corrette da Claude, solo per il docente.
   Claude prepara un PDF con il giusto in verde e lo sbagliato in rosso, più voto proposto e sintesi
   (tabella corrections, bucket privato "correzioni"; vedi strumenti/GUIDA-CORREZIONI.md).
   app.js chiama:
     window.NovaulaCorrezioni.board(contenitore, aiuti)        riquadro "Correzioni da controllare" in Area docente
     window.NovaulaCorrezioni.forAssignment(idCompito, aiuti)  restituisce una funzione consegna -> elemento
     window.NovaulaCorrezioni.autoToggle(compito, aiuti)        interruttore "Correzione automatica" del compito
   Correzione automatica: un'attività programmata di Claude corregge da sola le consegne nuove
   (corrections.auto = true); quelle che non può correggere finiscono in correction_skips con il motivo. */
(function () {
  "use strict";

  var AUTO_INFO = "Claude corregge da solo le consegne nuove ogni ora, dal lunedì al sabato tra le 8 e le 20.";
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

  function when(iso) {
    var d = new Date(iso);
    return d.toLocaleDateString("it-IT", { day: "numeric", month: "short" }) + ", " + d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
  }

  // Riprova: la consegna saltata torna in coda per il prossimo giro automatico
  function skipCard(x, k, student, onDone) {
    var h = x.h;
    var btn = h("button", { class: "btn", type: "button", text: "Riprova al prossimo giro" });
    btn.onclick = async function () {
      btn.disabled = true;
      try {
        var res = await x.sb.from("correction_skips").update({ retry: true }).eq("submission_id", k.submission_id);
        if (res.error) throw res.error;
        btn.textContent = "In coda ✓";
        if (onDone) onDone(k);
      } catch (e) { x.toast(x.errText(e)); btn.disabled = false; }
    };
    if (k.retry) { btn.disabled = true; btn.textContent = "In coda ✓"; }
    return h("div", { class: "corr corr-skip" },
      h("div", { class: "corr-head" },
        h("span", { class: "corr-grade is-skip", title: "Non corretta in automatico", text: "?" }),
        h("span", { class: "corr-who" }, h("b", { text: student }), h("span", { class: "corr-tag skip", text: "Da correggere a mano" }))),
      h("p", { class: "corr-sum", text: k.reason }),
      h("div", { class: "row" }, btn));
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
        h("span", { class: "corr-who" }, h("b", { text: student }),
          c.auto && h("span", { class: "corr-tag", title: AUTO_INFO, text: "⚡ Automatica · " + when(c.created_at) }),
          counts(h, c))),
      c.summary && h("p", { class: "corr-sum", text: c.summary }),
      h("div", { class: "row" },
        h("button", { class: "btn", type: "button", text: "Apri la correzione", onclick: function () { openPdf(x, c, "Correzione · " + student + " · " + title); } }),
        seen),
      x.extra && x.extra(c));
    paint();
    return el;
  }

  window.NovaulaCorrezioni = {
    // Sotto "Consegne ricevute" di un compito
    forAssignment: async function (aid, x) {
      if (!x.sb) return function () { return null; };
      var res = await x.sb.from("corrections").select("*").eq("assignment_id", aid);
      var sk = await x.sb.from("correction_skips").select("*").eq("assignment_id", aid);
      var map = {}, skips = {};
      (res.data || []).forEach(function (c) { map[c.submission_id] = c; });
      (sk.data || []).forEach(function (k) { skips[k.submission_id] = k; });
      return function (s, title) {
        var c = map[s.id];
        if (c) return card(Object.assign({}, x, { extra: null }), c, s.student_name, title || "", null);
        return skips[s.id] ? skipCard(x, skips[s.id], s.student_name, null) : null;
      };
    },

    // Sul compito, lato docente: accende o spegne la correzione automatica
    autoToggle: function (a, x) {
      if (!x.sb || a.auto_correct === undefined) return null;
      var h = x.h;
      var box = h("input", { type: "checkbox" });
      box.checked = a.auto_correct !== false;
      box.onchange = async function () {
        box.disabled = true;
        try {
          var res = await x.sb.from("assignments").update({ auto_correct: box.checked }).eq("id", a.id);
          if (res.error) throw res.error;
          a.auto_correct = box.checked;
        } catch (e) { box.checked = !box.checked; x.toast(x.errText(e)); }
        box.disabled = false;
      };
      return h("label", { class: "check-row corr-auto", title: AUTO_INFO }, box,
        h("span", { text: "Correzione automatica di Claude: voto proposto e PDF corretto appena arriva una consegna" }));
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
        // consegne che la correzione automatica ha lasciato al docente (se la tabella c'è)
        var sk = await x.sb.from("correction_skips")
          .select("*, submissions(student_name), assignments(title, class_id)").eq("retry", false);
        var done = {};
        res.data.forEach(function (c) { done[c.submission_id] = true; });
        var skips = (sk.error ? [] : sk.data).filter(function (k) { return !done[k.submission_id]; });
        list.textContent = "";
        var autos = res.data.filter(function (c) { return c.auto; }).length;
        list.appendChild(h("p", { class: "corr-intro" },
          h("span", { class: "corr-tag", text: "⚡ Correzione automatica" }),
          h("span", { class: "muted", text: " " + AUTO_INFO + " Il voto resta nascosto agli studenti finché non lo accetti o ne metti un altro." +
            (autos ? " In attesa: " + autos + (autos === 1 ? " correzione automatica." : " correzioni automatiche.") : "") })));
        if (!res.data.length && !skips.length) {
          list.appendChild(h("p", { class: "empty", text: "Nessuna correzione in attesa." }));
          return;
        }
        var groups = {}, order = [];
        function group(aid, a) {
          if (!groups[aid]) { groups[aid] = { a: a || {}, items: [], skips: [] }; order.push(aid); }
          return groups[aid];
        }
        res.data.forEach(function (c) { group(c.assignment_id, c.assignments).items.push(c); });
        skips.forEach(function (k) { group(k.assignment_id, k.assignments).skips.push(k); });
        order.forEach(function (aid) {
          var gg = groups[aid], g = gg.items, a = gg.a, cl = x.findClass(a.class_id);
          var left = h("span", { class: "corr-left" });
          function recount() {
            var n = g.filter(function (c) { return !c.reviewed; }).length;
            var m = gg.skips.filter(function (k) { return !k.retry; }).length;
            left.textContent = [n ? n + " da vedere" : g.length ? "tutte viste ✓" : "", m ? m + " da correggere a mano" : ""].filter(Boolean).join(" · ");
          }
          recount();
          var grid = h("div", { class: "corr-grid" });
          // prima le automatiche più recenti, poi le altre in ordine alfabetico
          g.sort(function (p, q) {
            if (!!p.auto !== !!q.auto) return p.auto ? -1 : 1;
            return ((p.submissions || {}).student_name || "").localeCompare((q.submissions || {}).student_name || "");
          });
          g.forEach(function (c) { grid.appendChild(card(x, c, (c.submissions || {}).student_name || "Studente", a.title || "", recount)); });
          gg.skips.forEach(function (k) { grid.appendChild(skipCard(x, k, (k.submissions || {}).student_name || "Studente", function () { k.retry = true; recount(); })); });
          list.appendChild(h("div", { class: "corr-group" },
            h("h3", null, h("span", { text: (cl ? cl.name : (a.class_id || "").toUpperCase()) + " · " + (a.title || "Compito") }), left),
            grid));
        });
      })().catch(function (e) { list.replaceChildren(x.notice("err", x.errText(e))); });
    }
  };
})();
