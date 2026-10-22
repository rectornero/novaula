/* Novaula · Orario: riquadro "Adesso / Dopo" nella home del docente (con aula in grande e percorso).
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
      root.replaceChildren(h("div", { class: "now-grid" }, parts), strip);
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
