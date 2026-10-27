/* Novaula · Orario: riquadro "Adesso / Dopo" nella home del docente (con aula in grande e percorso)
   e pagina dell'orario completo #/docente/orario (un giorno alla volta, con menu dei giorni e griglia della settimana).
   Mostra in grande la lezione in corso (classe, aula, minuti che mancano) e la successiva,
   più la striscia delle lezioni di oggi. L'orario sta nella tabella timetable (solo docente);
   in modalità demo, o se la tabella non risponde, usa l'orario qui sotto.
   app.js chiama window.NovaulaOrario(contenitore, aiuti) e window.NovaulaOrarioPage(contenitore, aiuti, giorno);
   entrambe restituiscono una funzione di chiusura. */
(function () {
  "use strict";

  // [giorno 1=lun, inizio, fine, classe, materia, aula, nota]
  var DEFAULT = [
    [1, "08:00", "09:50", "5g", "TPSI · Lab", "4B02 LI", "GUE_77"],
    [1, "09:50", "10:50", "5f", "GPO · Lab", "4B01 LI", "CAR_24"],
    [1, "11:50", "12:45", "3g", "TPSI", "3B03"],
    [1, "12:45", "13:35", "1e", "Info. Reti", "2B01 TB1"],
    [2, "08:00", "09:50", "1d", "Info. Reti · Lab", "TC02 LI", "CAR_25"],
    [2, "09:50", "10:50", "5g", "TPSI · Lab", "4B02 LI", "GUE_77"],
    [2, "10:50", "11:50", "3g", "TPSI", "3B03"],
    [3, "08:00", "08:55", "1d", "Info. Reti", "2B01 TB1"],
    [3, "08:55", "09:50", "5f", "GPO", "1C03"],
    [3, "09:50", "10:50", "5g", "TPSI", "2C05"],
    [4, "08:00", "09:50", "1e", "Info. Reti · Lab", "TC02 LI", "SCA_133"],
    [4, "09:50", "10:50", "5f", "GPO", "1C05"],
    [4, "10:50", "11:50", "3g", "TPSI · Lab", "TC02 LI", "SCA_133"],
    [5, "10:50", "11:50", "1e", "Info. Reti", "2B01 TB1"],
    [5, "12:45", "13:35", "1d", "Info. Reti", "2B01 TB1"]
  ].map(function (r) { return { weekday: r[0], starts: r[1], ends: r[2], class_id: r[3], subject: r[4], room: r[5] || null, note: r[6] || null }; });
  // Aule: piano + edificio + numero, es. "2B01" = 2º piano, edificio B, aula 01; "TC02" = piano terra, edificio C.
  // B e C sono collegati; A (e ogni altro edificio) è separato: si esce e si rientra.
  var LINKED = { B: "C", C: "B" };
  var LINK_FLOORS = null; // piani in cui c'è il passaggio B–C (es. [0, 1]); null = su tutti i piani
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

  function parseRoom(room) {
    var m = /^\s*(T|\d)\s*([A-Z])\s*(\d+)\s*(.*)$/i.exec(room || "");
    if (!m) return null;
    return { code: (m[1] + m[2] + m[3]).toUpperCase(), floor: /t/i.test(m[1]) ? 0 : +m[1], building: m[2].toUpperCase(), num: m[3], extra: m[4].trim() };
  }
  function floorName(f) { return f === 0 ? "piano terra" : f + "º piano"; }
  function toFloor(from, to) {
    if (from === to) return null;
    var d = Math.abs(to - from);
    return (to > from ? "sali" : "scendi") + " al " + floorName(to) + " (" + d + (d === 1 ? " piano" : " piani") + ")";
  }
  function cap(t) { return t.charAt(0).toUpperCase() + t.slice(1); }
  // Suggerimento di percorso tra due aule: { steps: [...], far: true se serve tempo }
  function route(fromRoom, toRoom) {
    var a = parseRoom(fromRoom), b = parseRoom(toRoom);
    if (!a || !b) return null;
    var steps = [], floors = 0;
    if (a.code === b.code) return { steps: ["Resti nella stessa aula"], far: false };
    if (a.building === b.building) {
      var f = toFloor(a.floor, b.floor);
      steps.push(f ? cap(f) + " nell'edificio " + b.building : "Stesso piano, stesso edificio: è a pochi passi");
      floors = Math.abs(a.floor - b.floor);
    } else if (LINKED[a.building] === b.building) {
      var via = a.floor;
      if (LINK_FLOORS && LINK_FLOORS.indexOf(via) < 0) {
        via = LINK_FLOORS.slice().sort(function (x, y) { return Math.abs(x - a.floor) + Math.abs(x - b.floor) - Math.abs(y - a.floor) - Math.abs(y - b.floor); })[0];
        steps.push(cap(toFloor(a.floor, via)) + " nell'edificio " + a.building);
      }
      steps.push("Passa da " + a.building + " a " + b.building + " dal collegamento" + (LINK_FLOORS ? " al " + floorName(via) : ""));
      var g = toFloor(via, b.floor);
      if (g) steps.push(cap(g) + " nell'edificio " + b.building);
      floors = Math.abs(a.floor - via) + Math.abs(via - b.floor);
    } else {
      if (a.floor > 0) steps.push("Scendi al piano terra dell'edificio " + a.building);
      steps.push("Esci e vai all'edificio " + b.building + (a.building === "A" || b.building === "A" ? " (A non è collegato agli altri)" : ""));
      if (b.floor > 0) steps.push("Sali al " + floorName(b.floor) + " (" + b.floor + (b.floor === 1 ? " piano" : " piani") + ")");
      floors = a.floor + b.floor;
      return { steps: steps, far: true };
    }
    return { steps: steps, far: floors >= 3 };
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

  /* ---------- Orario completo: #/docente/orario[/giorno] ---------- */
  var BELLS = ["08:00", "08:55", "09:50", "10:50", "11:50", "12:45", "13:35", "14:25"];
  // Ore di lezione coperte da una riga: { from: 1, to: 2 } = 1ª–2ª ora (null se fuori dalla campanella)
  function periods(r) {
    var a = BELLS.indexOf(String(r.starts).slice(0, 5)), b = BELLS.indexOf(String(r.ends).slice(0, 5));
    return a < 0 || b <= a ? null : { from: a + 1, to: b };
  }
  function nHours(r) { var p = periods(r); return p ? p.to - p.from + 1 : Math.max(1, Math.round((mins(r.ends) - mins(r.starts)) / 55)); }
  function ordinal(p) { return !p ? "" : p.from === p.to ? p.from + "ª ora" : p.from + "ª–" + p.to + "ª ora"; }
  function hoursText(n) { return n + (n === 1 ? " ora" : " ore"); }

  window.NovaulaOrarioPage = function (box, x, wanted) {
    var h = x.h, rows = null, day = 0, timer = null, stopped = false;
    var head = h("div", { class: "tt-head" }), dayBox = h("section", { class: "tt-day", "aria-live": "polite" }), weekBox = h("section", { class: "tt-week-wrap" });
    box.appendChild(h("a", { class: "back", href: "#/docente", text: "← Area docente" }));
    box.appendChild(h("section", { class: "tt-hello" },
      h("p", { class: "eyebrow", text: "Orario del docente · a.s. " + schoolYear() }),
      h("h1", null, "Il mio ", h("span", { class: "mark", text: "orario" }))));
    box.appendChild(head);
    box.appendChild(dayBox);
    box.appendChild(weekBox);
    dayBox.appendChild(h("p", { class: "empty", text: "Caricamento dell'orario…" }));

    function schoolYear() { var d = new Date(), y = d.getMonth() >= 8 ? d.getFullYear() : d.getFullYear() - 1; return y + "/" + String(y + 1).slice(2); }
    function classInfo(id) {
      var c = x.findClass(id);
      return { code: c ? x.classParts(c)[0] : String(id).toUpperCase(), name: c ? x.classParts(c)[1] : "", color: c ? x.classColor(c) : "var(--accent)", href: "#/c/" + id + "/programma" };
    }
    function days() {
      var last = rows.reduce(function (m, r) { return Math.max(m, r.weekday); }, 5);
      var out = []; for (var d = 1; d <= Math.min(last, 6); d++) out.push(d);
      return out;
    }
    function ofDay(d) { return rows.filter(function (r) { return r.weekday === d; }).sort(function (a, b) { return mins(a.starts) - mins(b.starts); }); }
    function nowT() { var n = new Date(); return n.getHours() * 60 + n.getMinutes() + n.getSeconds() / 60; }

    function pick(d, focus) {
      day = d;
      try { history.replaceState(null, "", "#/docente/orario/" + d); } catch (e) { /* va bene anche senza */ }
      render(focus);
    }

    function roomBlock(r) {
      var p = parseRoom(r.room);
      if (!r.room) return null;
      return h("span", { class: "tt-room" },
        h("b", { text: p ? p.code : r.room }),
        p && h("span", { text: "Edificio " + p.building + " · " + floorName(p.floor) + (p.extra ? " · " + p.extra : "") }));
    }

    function lessonCard(r, today, t) {
      var c = classInfo(r.class_id), p = periods(r), a = mins(r.starts), b = mins(r.ends);
      var on = today && a <= t && t < b, done = today && b <= t;
      var pct = on ? Math.min(100, Math.max(0, (t - a) / (b - a) * 100)) : 0;
      return h("li", { class: "tt-lesson" + (on ? " on" : done ? " done" : ""), style: "--cc:" + c.color, "data-start": r.starts },
        h("div", { class: "tt-when" },
          h("b", { text: hhmm(r.starts) }),
          h("span", { text: hhmm(r.ends) }),
          p && h("em", { text: ordinal(p) })),
        h("a", { class: "tt-card", href: c.href },
          h("span", { class: "tt-top" },
            h("span", { class: "tt-code", text: c.code }),
            on ? h("span", { class: "tt-badge now" }, h("span", { class: "now-dot", "aria-hidden": "true" }), "Adesso")
              : nHours(r) > 1 ? h("span", { class: "tt-badge", text: "Doppia ora" }) : null),
          h("span", { class: "tt-subject", text: r.subject }),
          h("span", { class: "tt-place" }, roomBlock(r), r.note && h("span", { class: "tt-note", title: "Nota dell'orario", text: r.note })),
          on && h("span", { class: "now-bar", role: "progressbar", "aria-valuemin": "0", "aria-valuemax": "100", "aria-valuenow": String(Math.round(pct)) },
            h("span", { style: "width:" + pct.toFixed(1) + "%" })),
          on && h("span", { class: "tt-left", text: "mancano " + span(Math.max(1, Math.ceil(b - t))) })));
    }
    function gap(prev, next) {
      var a = mins(prev.ends), b = mins(next.starts), free = [];
      BELLS.forEach(function (s, i) { if (i < 7 && mins(s) >= a && mins(BELLS[i + 1]) <= b) free.push(i + 1); });
      var rt = route(prev.room, next.room), tight = b <= a;
      var parts = [];
      if (b > a) parts.push(h("li", { class: "tt-free" },
        h("div", { class: "tt-when" }, h("b", { text: hhmm(prev.ends) }), h("span", { text: hhmm(next.starts) })),
        h("div", { class: "tt-free-box" },
          h("b", { text: free.length ? "Ora libera" + (free.length > 1 ? " · " + hoursText(free.length) : "") : "Pausa" }),
          h("span", { text: (free.length ? ordinal({ from: free[0], to: free[free.length - 1] }) + " · " : "") + span(b - a) + " senza lezione" }))));
      if (rt) parts.push(h("li", { class: "tt-move" + (rt.far && tight ? " far" : "") },
        h("div", { class: "tt-when", "aria-hidden": "true" }),
        h("div", { class: "tt-move-box" },
          h("span", { class: "tt-move-h" }, "🧭 ", h("b", { text: (parseRoom(prev.room) || {}).code || prev.room }), " → ", h("b", { text: (parseRoom(next.room) || {}).code || next.room })),
          h("span", { class: "tt-move-steps", text: rt.steps.join(" · ") }),
          rt.far && tight && h("span", { class: "tt-move-warn", text: "Cambio d'ora senza pausa e aula lontana: avviati appena suona" }))));
      return parts;
    }

    function renderHead() {
      var wd = weekday(new Date()), list = days();
      var sel = h("select", { class: "tt-select", "aria-label": "Scegli il giorno" }, list.map(function (d) {
        var n = ofDay(d).length;
        return h("option", { value: String(d), selected: d === day, text: cap(DAYS[d % 7]) + (d === wd ? " (oggi)" : "") + " · " + (n ? n + (n === 1 ? " lezione" : " lezioni") : "libero") });
      }));
      sel.addEventListener("change", function () { pick(+sel.value); });
      var i = list.indexOf(day);
      function step(k) { return function () { pick(list[(i + k + list.length) % list.length]); }; }
      head.replaceChildren(h("div", { class: "tt-bar" },
        h("button", { class: "tt-arrow", type: "button", "aria-label": "Giorno precedente", text: "‹", onclick: step(-1) }),
        h("label", { class: "tt-pick" }, h("span", { text: "Giorno" }), sel),
        h("button", { class: "tt-arrow", type: "button", "aria-label": "Giorno seguente", text: "›", onclick: step(1) }),
        day !== wd && list.indexOf(wd) >= 0 && h("button", { class: "btn tt-today", type: "button", text: "Oggi", onclick: function () { pick(wd); } })));
    }

    function renderDay() {
      var list = ofDay(day), wd = weekday(new Date()), today = day === wd, t = nowT();
      var hours = list.reduce(function (s, r) { return s + nHours(r); }, 0);
      var codes = list.map(function (r) { return classInfo(r.class_id); }).filter(function (c, i, a) { return a.map(function (z) { return z.code; }).indexOf(c.code) === i; });
      var summary = h("div", { class: "tt-sum" },
        h("h2", null, cap(DAYS[day % 7]), today && h("span", { class: "tt-today-tag", text: "Oggi" })),
        list.length ? h("p", { class: "tt-sum-line" },
          h("b", { text: hoursText(hours) }), " di lezione · dalle ", h("b", { text: hhmm(list[0].starts) }), " alle ", h("b", { text: hhmm(list[list.length - 1].ends) }))
          : h("p", { class: "tt-sum-line", text: "Nessuna lezione in questo giorno." }),
        codes.length ? h("div", { class: "tt-chips" }, codes.map(function (c) { return h("span", { class: "tt-chip", style: "--cc:" + c.color, text: c.code }); })) : null);
      if (!list.length) { dayBox.replaceChildren(summary, h("div", { class: "tt-empty" }, h("b", { text: "Giornata libera" }), h("span", { text: "Buon riposo!" }))); return; }
      var items = [];
      list.forEach(function (r, i) {
        if (i) items = items.concat(gap(list[i - 1], r));
        items.push(lessonCard(r, today, t));
      });
      var end = today && mins(list[list.length - 1].ends) <= t;
      items.push(h("li", { class: "tt-end" }, h("div", { class: "tt-when" }, h("b", { text: hhmm(list[list.length - 1].ends) })),
        h("span", { text: end ? "Lezioni finite per oggi ✓" : "Fine delle lezioni" })));
      dayBox.replaceChildren(summary, h("ol", { class: "tt-list" }, items));
    }

    function renderWeek() {
      var list = days(), wd = weekday(new Date()), t = nowT(), cells = [], tot = 0, perClass = {};
      cells.push(h("span", { class: "tt-wk-corner", "aria-hidden": "true" }));
      list.forEach(function (d, j) {
        cells.push(h("button", { type: "button", class: "tt-wk-day" + (d === day ? " sel" : "") + (d === wd ? " today" : ""), style: "grid-column:" + (j + 2),
          "aria-pressed": String(d === day), onclick: function () { pick(d); window.scrollTo({ top: 0, behavior: "smooth" }); } },
          h("b", { text: cap(DAYS[d % 7]).slice(0, 3) }), d === wd && h("span", { text: "oggi" })));
      });
      for (var p = 1; p <= 7; p++) cells.push(h("span", { class: "tt-wk-hour", style: "grid-row:" + (p + 1) }, h("b", { text: p + "ª" }), h("span", { text: hhmm(BELLS[p - 1]) })));
      list.forEach(function (d, j) {
        var taken = {};
        ofDay(d).forEach(function (r) {
          var pr = periods(r), c = classInfo(r.class_id), n = nHours(r);
          tot += n; perClass[c.code] = perClass[c.code] || { c: c, n: 0 }; perClass[c.code].n += n;
          if (!pr) return;
          for (var k = pr.from; k <= pr.to; k++) taken[k] = 1;
          var on = d === wd && mins(r.starts) <= t && t < mins(r.ends);
          cells.push(h("a", { class: "tt-wk-cell" + (d === day ? " sel" : "") + (on ? " on" : ""), href: c.href,
            style: "--cc:" + c.color + ";grid-column:" + (j + 2) + ";grid-row:" + (pr.from + 1) + " / span " + (pr.to - pr.from + 1),
            title: cap(DAYS[d % 7]) + " " + hhmm(r.starts) + "–" + hhmm(r.ends) + " · " + c.code + " · " + r.subject + (r.room ? " · aula " + r.room : "") },
            h("b", { text: c.code }),
            h("span", { class: "s", text: r.subject }),
            r.room && h("span", { class: "r", text: (parseRoom(r.room) || {}).code || r.room })));
        });
        for (var k = 1; k <= 7; k++) if (!taken[k]) cells.push(h("span", { class: "tt-wk-gap" + (d === day ? " sel" : ""), style: "grid-column:" + (j + 2) + ";grid-row:" + (k + 1) }));
      });
      var grid = h("div", { class: "tt-week", style: "--days:" + list.length, role: "table", "aria-label": "Orario della settimana" }, cells);
      var keys = Object.keys(perClass).sort();
      weekBox.replaceChildren(
        h("div", { class: "tt-week-head" },
          h("h2", { text: "Tutta la settimana" }),
          h("button", { class: "btn tt-print", type: "button", text: "🖨️ Stampa", onclick: function () { window.print(); } })),
        h("p", { class: "muted small", text: hoursText(tot) + " di lezione a settimana. Tocca un giorno per aprirlo, una lezione per andare alla classe." }),
        h("div", { class: "tt-week-scroll" }, grid),
        h("div", { class: "tt-totals" }, keys.map(function (k) {
          var e = perClass[k];
          return h("a", { class: "tt-total", href: e.c.href, style: "--cc:" + e.c.color }, h("b", { text: e.c.code }), h("span", { text: hoursText(e.n) }));
        })));
    }

    function render(focus) {
      if (stopped) return;
      renderHead(); renderDay(); renderWeek();
      if (focus) { var s = head.querySelector("select"); if (s) s.focus(); }
    }
    function onKey(e) {
      if (e.altKey || e.ctrlKey || e.metaKey || /input|textarea|select/i.test((e.target || {}).tagName || "")) return;
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      var list = days(), i = list.indexOf(day);
      pick(list[(i + (e.key === "ArrowLeft" ? -1 : 1) + list.length) % list.length]);
    }

    load(x.sb).then(function (r) {
      if (stopped) return;
      rows = r;
      var list = days(), wd = weekday(new Date()), w = +wanted;
      day = list.indexOf(w) >= 0 ? w : list.indexOf(wd) >= 0 ? wd : list[0];
      render();
      timer = setInterval(function () { if (document.visibilityState === "visible") render(); }, 30000);
      document.addEventListener("keydown", onKey);
    });
    return function () { stopped = true; clearInterval(timer); document.removeEventListener("keydown", onKey); };
  };

  window.NovaulaOrarioRoute = route; // per prove dalla console

  window.NovaulaOrario = function (box, x) {
    var h = x.h, timer = null, rows = null, stopped = false;
    var root = h("section", { class: "now-board", "aria-label": "Lezione in corso e successiva" },
      h("p", { class: "empty", text: "Caricamento dell'orario…" }));
    var tools = h("div"), stopTools = null;
    box.appendChild(root);
    box.appendChild(tools);

    function classInfo(id) {
      var c = x.findClass(id);
      return { code: c ? x.classParts(c)[0] : id.toUpperCase(), color: c ? x.classColor(c) : "var(--accent)", href: "#/c/" + id + "/programma" };
    }
    // Aula in grande: codice, edificio e piano, così si capisce subito dove andare
    function place(r) {
      var p = parseRoom(r.room);
      return h("span", { class: "now-place" },
        r.room && h("span", { class: "now-room" },
          h("span", { class: "now-room-k", text: "Aula" }),
          h("b", { class: "now-room-code", text: p ? p.code : r.room }),
          p && h("span", { class: "now-room-where", text: "Edificio " + p.building + " · " + floorName(p.floor) + (p.extra ? " · " + p.extra : "") })),
        r.note && h("span", { class: "now-note", text: r.note }));
    }
    // Da dove arrivo: l'aula della lezione in corso, oppure dell'ultima lezione di oggi già finita
    function fromRoom(s) {
      if (s.current) return s.current.room;
      var past = s.today.filter(function (r) { return mins(r.ends) <= s.t; });
      return past.length ? past[past.length - 1].room : null;
    }
    function routeBox(s) {
      if (s.nextDay || !s.next) return null;
      var from = fromRoom(s), rt = from && route(from, s.next.room);
      if (!rt) return null;
      var prevEnd = s.current ? mins(s.current.ends) : null, tight = prevEnd !== null && prevEnd >= mins(s.next.starts);
      return h("span", { class: "now-route" + (rt.far ? " far" : "") },
        h("span", { class: "now-route-h" }, "🧭 Percorso da ", h("b", { text: (parseRoom(from) || {}).code || from })),
        h("ol", null, rt.steps.map(function (t) { return h("li", { text: t }); })),
        rt.far && tight && h("span", { class: "now-route-warn", text: "Cambio d'ora senza pausa e aula lontana: avviati appena suona" }));
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
          h("span", { class: "now-time" }, h("b", { text: whenNext(s) })),
          routeBox(s)));
      }
      var strip = s.today.length ? h("ol", { class: "now-strip", "aria-label": "Lezioni di oggi" }, s.today.map(function (r) {
        var ci = classInfo(r.class_id), done = mins(r.ends) <= s.t;
        return h("li", { class: r === s.current ? "on" : done ? "done" : null, style: "--cc:" + ci.color },
          h("a", { href: ci.href },
            h("span", { class: "t", text: hhmm(r.starts) }),
            h("b", { text: ci.code }),
            h("span", { class: "r", text: (parseRoom(r.room) || {}).code || r.room || "" })));
      })) : null;
      root.replaceChildren(h("div", { class: "now-grid" }, parts), strip,
        h("a", { class: "now-all", href: "#/docente/orario", text: "📅 Orario completo della settimana →" }));
    }

    load(x.sb).then(function (r) {
      if (stopped) return;
      rows = r; render();
      timer = setInterval(render, 20000);
      // Strumenti per la LIM (lim.js): sorteggio, timer e posti della classe in corso
      if (window.NovaulaLim) stopTools = window.NovaulaLim(tools, {
        h: h, sb: x.sb, findClass: x.findClass, classParts: x.classParts, classColor: x.classColor,
        classIds: function () { return rows.map(function (r) { return r.class_id; }).filter(function (id, i, a) { return a.indexOf(id) === i; }); },
        currentClass: function () { var s = situation(rows, new Date()); return s.current ? s.current.class_id : s.next && !s.nextDay ? s.next.class_id : null; },
        lessonEnd: function () {
          var s = situation(rows, new Date()), d = new Date();
          if (!s.current) return null;
          d.setHours(0, mins(s.current.ends), 0, 0);
          return d.getTime();
        }
      });
    });
    function onVisible() { if (document.visibilityState === "visible" && rows) render(); }
    document.addEventListener("visibilitychange", onVisible);
    return function () { stopped = true; clearInterval(timer); if (stopTools) stopTools(); document.removeEventListener("visibilitychange", onVisible); };
  };
})();
