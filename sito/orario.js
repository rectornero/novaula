/* Novaula · Orario: riquadro "Adesso / Dopo" nella home del docente.
   Mostra in grande la lezione in corso (classe, aula, minuti che mancano) e la successiva,
   più la striscia delle lezioni di oggi. L'orario sta nella tabella timetable (solo docente);
   in modalità demo, o se la tabella non risponde, usa l'orario qui sotto.
   app.js chiama window.NovaulaOrario(contenitore, aiuti) e riceve una funzione di chiusura. */
(function () {
  "use strict";

  // [giorno 1=lun, inizio, fine, classe, materia, aula, nota]
  var DEFAULT = [
    [1, "08:00", "09:55", "1d", "Info. Reti · Lab", "TC02 LI", "CAR_24"],
    [1, "09:55", "10:55", "1e", "Info. Reti", "2B01 TB1"],
    [1, "10:55", "11:55", "5f", "GPO · Lab", "4B01 LI", "CAR_23"],
    [2, "08:00", "09:55", "5g", "TPSI · Lab", "4B02", "GUE_75"],
    [2, "09:55", "10:55", "3g", "TPSI · Lab", "TC02 LI", "SCA_131"],
    [3, "08:00", "08:55", "1e", "Info. Reti", "2B01 TB1"],
    [3, "08:55", "09:55", "5g", "TPSI · Lab", "4B02", "GUE_75"],
    [3, "09:55", "10:55", "1d", "Info. Reti", "2B01 TB1"],
    [3, "10:55", "11:55", "5f", "GPO", "1C04"],
    [4, "08:00", "08:55", "1d", "Info. Reti", "2B06 TB2"],
    [4, "08:55", "09:55", "3g", "TPSI", "3B03"],
    [5, "08:00", "08:55", "5f", "GPO", "1C04"],
    [5, "08:55", "10:55", "1e", "Info. Reti · Lab", "TC02 LI", "SCA_131"],
    [5, "11:55", "12:45", "3g", "TPSI", "3B04"],
    [5, "12:45", "13:35", "5g", "TPSI", "1C05"]
  ].map(function (r) { return { weekday: r[0], starts: r[1], ends: r[2], class_id: r[3], subject: r[4], room: r[5] || null, note: r[6] || null }; });
  var DAYS = ["domenica", "lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato"];
  var cache = null;

  function mins(t) { var p = String(t).split(":"); return +p[0] * 60 + +p[1]; }
  function hhmm(t) { return String(t).slice(0, 5).replace(":", "."); }
  function weekday(d) { return d.getDay() === 0 ? 7 : d.getDay(); }
  function span(m) {
    if (m < 60) return m + " min";
    var hh = Math.floor(m / 60), mm = m % 60;
    return hh + (hh === 1 ? " ora" : " ore") + (mm ? " e " + mm + " min" : "");
  }

  async function load(sb) {
    if (cache) return cache;
    if (sb) {
      try {
        var res = await sb.from("timetable").select("*").order("weekday").order("starts");
        if (!res.error && res.data && res.data.length) return (cache = res.data);
      } catch (e) { /* si usa l'orario incorporato */ }
    }
    return (cache = DEFAULT);
  }

  // Lezione in corso, prossima lezione (anche nei giorni seguenti) e lezioni di oggi
  function situation(rows, now) {
    var wd = weekday(now), t = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;
    var today = rows.filter(function (r) { return r.weekday === wd; });
    var current = today.filter(function (r) { return mins(r.starts) <= t && t < mins(r.ends); })[0] || null;
    var next = today.filter(function (r) { return mins(r.starts) > t; })[0] || null, nextDay = 0;
    for (var i = 1; !next && i <= 7; i++) {
      var d = (wd - 1 + i) % 7 + 1;
      next = rows.filter(function (r) { return r.weekday === d; })[0] || null;
      if (next) nextDay = i;
    }
    return { t: t, today: today, current: current, next: next, nextDay: nextDay };
  }

  window.NovaulaOrario = function (box, x) {
    var h = x.h, timer = null, rows = null, stopped = false;
    var root = h("section", { class: "now-board", "aria-label": "Lezione in corso e successiva" },
      h("p", { class: "empty", text: "Caricamento dell'orario…" }));
    box.appendChild(root);

    function classInfo(id) {
      var c = x.findClass(id);
      return { code: c ? x.classParts(c)[0] : id.toUpperCase(), color: c ? x.classColor(c) : "var(--accent)", href: "#/c/" + id + "/programma" };
    }
    function place(r) {
      return h("span", { class: "now-place" },
        r.room && h("span", { class: "now-room", text: "Aula " + r.room }),
        r.note && h("span", { class: "now-note", text: r.note }));
    }
    function whenNext(s) {
      var n = s.next;
      if (!s.nextDay) return "alle " + hhmm(n.starts) + " · tra " + span(Math.max(1, Math.round(mins(n.starts) - s.t)));
      var day = s.nextDay === 1 ? "domani" : DAYS[n.weekday % 7];
      return day + " alle " + hhmm(n.starts);
    }

    function render() {
      var s = situation(rows, new Date());
      var parts = [];
      if (s.current) {
        var c = classInfo(s.current.class_id), a = mins(s.current.starts), b = mins(s.current.ends);
        var left = Math.max(1, Math.ceil(b - s.t)), pct = Math.min(100, Math.max(0, (s.t - a) / (b - a) * 100));
        parts.push(h("a", { class: "now-card now", style: "--cc:" + c.color, href: c.href },
          h("span", { class: "now-label" }, h("span", { class: "now-dot", "aria-hidden": "true" }), "Adesso"),
          h("span", { class: "now-code", text: c.code }),
          h("span", { class: "now-subject", text: s.current.subject }),
          place(s.current),
          h("span", { class: "now-bar", role: "progressbar", "aria-valuemin": "0", "aria-valuemax": "100", "aria-valuenow": String(Math.round(pct)) },
            h("span", { style: "width:" + pct.toFixed(1) + "%" })),
          h("span", { class: "now-time" },
            h("b", { text: hhmm(s.current.starts) + " – " + hhmm(s.current.ends) }),
            h("span", { text: "mancano " + span(left) })),
          h("span", { class: "now-go", text: "Apri la classe →" })));
      } else {
        var later = s.today.some(function (r) { return mins(r.starts) > s.t; });
        parts.push(h("div", { class: "now-card free" },
          h("span", { class: "now-label", text: "Adesso" }),
          h("span", { class: "now-free", text: later ? "Ora libera" : s.today.length ? "Lezioni finite per oggi" : "Oggi niente lezioni" }),
          h("span", { class: "now-subject", text: later ? "Pausa fino alle " + hhmm(s.next.starts) : "Buon riposo!" })));
      }
      if (s.next) {
        var n = classInfo(s.next.class_id);
        parts.push(h("a", { class: "now-card next", style: "--cc:" + n.color, href: n.href },
          h("span", { class: "now-label", text: s.nextDay ? "Prossima lezione" : "Dopo" }),
          h("span", { class: "now-code", text: n.code }),
          h("span", { class: "now-subject", text: s.next.subject }),
          place(s.next),
          h("span", { class: "now-time" }, h("b", { text: whenNext(s) }))));
      }
      var strip = s.today.length ? h("ol", { class: "now-strip", "aria-label": "Lezioni di oggi" }, s.today.map(function (r) {
        var ci = classInfo(r.class_id), done = mins(r.ends) <= s.t;
        return h("li", { class: r === s.current ? "on" : done ? "done" : null, style: "--cc:" + ci.color },
          h("a", { href: ci.href },
            h("span", { class: "t", text: hhmm(r.starts) }),
            h("b", { text: ci.code }),
            h("span", { class: "r", text: r.room || "" })));
      })) : null;
      root.replaceChildren(h("div", { class: "now-grid" }, parts), strip);
    }

    load(x.sb).then(function (r) {
      if (stopped) return;
      rows = r; render();
      timer = setInterval(render, 20000);
    });
    function onVisible() { if (document.visibilityState === "visible" && rows) render(); }
    document.addEventListener("visibilitychange", onVisible);
    return function () { stopped = true; clearInterval(timer); document.removeEventListener("visibilitychange", onVisible); };
  };
})();
