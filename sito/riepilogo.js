/* Novaula · Riepilogo settimanale, solo per il docente.
   Domande aperte in Aiuto, consegne mancanti, segnalazioni di coerenza e compiti della prossima settimana,
   classe per classe (funzione teacher_weekly_summary, vedi aggiornamenti/2026-10-20-riepilogo.sql).
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

  function total(c) {
    return c.helpdesk_open.length + c.slide_questions_open + c.flags.length + c.marks_to_review +
      c.missing.reduce(function (n, a) { return n + a.missing.length; }, 0);
  }

  function section(h, title, items) {
    items = items.filter(Boolean);
    if (!items.length) return null;
    return h("div", { class: "rp-sec" }, h("h4", { text: title }), h("ul", null, items.map(function (t) { return h("li", null, t); })));
  }

  function classBlock(h, c, cl, open) {
    var help = c.helpdesk_open.map(function (t) {
      return (t.stuck ? "🆘 " : "") + t.author + ": «" + t.body + "»" + (t.metoo ? " (+" + t.metoo + ")" : "") +
        (t.status !== "nuova" ? " · " + t.status : "");
    });
    if (c.slide_questions_open) help.push(c.slide_questions_open + " domande sulle slide senza risposta");
    var missing = c.missing.map(function (a) {
      var who = a.missing.length ? "mancano " + a.missing.join(", ") : a.profiles ? "tutti i profili hanno consegnato" : "nessun profilo studente";
      return a.title + " (scadenza " + day(a.due) + "): " + a.received + " consegne, " + who;
    });
    var flags = c.flags.map(function (f) {
      return "⚠ " + (f.kind === "same_file" ? "File identico" : "Stesso dispositivo") + " · " + f.title + ": " + (f.students || []).join(" e ");
    });
    if (c.late) flags.push(c.late + " consegne in ritardo questa settimana");
    if (c.marks_to_review) flags.push(c.marks_to_review + " voti proposti da Claude da confermare");
    if (c.redo) flags.push(c.redo + " lavori «Da rifare» in sospeso");
    var next = c.due_next_week.map(function (a) {
      return day(a.due) + " · " + a.title + " (" + (KIND[a.kind] || a.kind) + (a.group ? ", di gruppo" : "") + ")" +
        (a.planned ? " · previsto, se l'argomento viene segnato come fatto" : "");
    }).concat(c.tests_next_week.map(function (t) { return day(t.date) + " · Verifica: " + t.title; }));
    var n = total(c);
    var body = [
      section(h, "Domande aperte", help),
      section(h, "Consegne mancanti", missing),
      section(h, "Da controllare", flags),
      section(h, "Prossima settimana", next)
    ].filter(Boolean);
    return h("details", { class: "rp-class", open: open && n > 0 },
      h("summary", null,
        h("span", { class: "rp-name", text: cl ? cl.name : c.name }),
        h("span", { class: "badge" + (n ? " flag-badge" : " ok-badge"), text: n ? n + " da vedere" : "tutto a posto" })),
      body.length ? body : h("p", { class: "small muted", text: "Niente da segnalare." }));
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
