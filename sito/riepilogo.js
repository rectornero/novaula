/* Novaula · Riepilogo settimanale, solo per il docente.
   Quante domande sono aperte in Aiuto e i compiti e le verifiche della prossima settimana, classe per classe.
   Senza dati personali: nessun nome, nessuna consegna, nessun voto (funzione teacher_weekly_summary, vedi aggiornamenti/2026-10-20-riepilogo.sql).
   Lo stesso riepilogo arriva ogni venerdì pomeriggio nel progetto Novaula su Claude.
   app.js chiama:
     window.NovaulaRiepilogo.board(contenitore, aiuti)   riquadro "Riepilogo della settimana" in Area docente */
(function () {
  "use strict";

  var DAYS = ["dom", "lun", "mar", "mer", "gio", "ven", "sab"];
  var KIND = { compito: "compito", progetto: "progetto", classe: "in classe", verifica: "verifica" };

  function day(iso) {
    if (!iso) return "";
    var d = new Date(iso.slice(0, 10) + "T12:00:00");
    return DAYS[d.getDay()] + " " + d.getDate() + "/" + (d.getMonth() + 1);
  }

  // Solo conteggi e compiti: nessun nome, nessun testo scritto dagli studenti, nessuna consegna o voto.
  // Funziona sia con la funzione vecchia (helpdesk_open è un elenco) sia con quella senza dati personali (un numero).
  function count(v) { return Array.isArray(v) ? v.length : +v || 0; }
  function stuck(c) { return Array.isArray(c.helpdesk_open) ? c.helpdesk_open.filter(function (t) { return t.stuck; }).length : +c.helpdesk_stuck || 0; }

  function section(h, title, items) {
    items = items.filter(Boolean);
    if (!items.length) return null;
    return h("div", { class: "rp-sec" }, h("h4", { text: title }), h("ul", null, items.map(function (t) { return h("li", null, t); })));
  }

  function classBlock(h, c, cl, open) {
    var nHelp = count(c.helpdesk_open), nStuck = stuck(c), nSlide = count(c.slide_questions_open);
    var help = [
      nHelp ? nHelp + (nHelp === 1 ? " domanda aperta" : " domande aperte") + " in Aiuto" + (nStuck ? " (" + nStuck + " 🆘 bloccati)" : "") : null,
      nSlide ? nSlide + " domande sulle slide senza risposta" : null
    ];
    var next = (c.due_next_week || []).map(function (a) {
      return day(a.due) + " · " + a.title + " (" + (KIND[a.kind] || a.kind) + (a.group ? ", di gruppo" : "") + ")" +
        (a.planned ? " · previsto, se l'argomento viene segnato come fatto" : "");
    }).concat((c.tests_next_week || []).map(function (t) { return day(t.date) + " · Verifica: " + t.title; }));
    var n = nHelp + nSlide;
    var body = [
      section(h, "Domande aperte", help),
      section(h, "Prossima settimana", next)
    ].filter(Boolean);
    return h("details", { class: "rp-class", open: open && n > 0 },
      h("summary", null,
        h("span", { class: "rp-name", text: cl ? cl.name : c.name }),
        h("span", { class: "badge" + (n ? " flag-badge" : " ok-badge"), text: n ? n + " da vedere" : "tutto a posto" })),
      body.length ? body : h("p", { class: "small muted", text: "Niente da segnalare." }),
      n ? h("a", { class: "small", href: "#/c/" + c.id + "/aiuto", text: "Apri Aiuto →" }) : null);
  }

  window.NovaulaRiepilogo = {
    board: function (box, x) {
      if (!x.sb) return;
      var h = x.h;
      var heading = h("h2", { text: "Riepilogo della settimana" });
      var list = h("section", { class: "card rp-board" }, h("p", { class: "empty", text: "Caricamento del riepilogo…" }));
      box.appendChild(heading);
      box.appendChild(list);
      (async function () {
        var res = await x.sb.rpc("teacher_weekly_summary");
        if (res.error) {
          // funzione non ancora creata: il riquadro non serve
          if (/teacher_weekly_summary|schema cache|function/i.test(res.error.message || "")) { heading.remove(); list.remove(); return; }
          throw res.error;
        }
        var s = res.data;
        list.textContent = "";
        list.appendChild(h("p", { class: "small muted",
          text: "Dal " + day(s.week_start) + " a oggi · prossima settimana " + day(s.next_mon) + " – " + day(s.next_sun) +
            ". Ogni venerdì pomeriggio Claude ti manda lo stesso riepilogo nel progetto Novaula." }));
        (s.classes || []).forEach(function (c) { list.appendChild(classBlock(h, c, x.findClass(c.id), true)); });
      })().catch(function (e) { list.replaceChildren(x.notice("err", x.errText(e))); });
    }
  };
})();
