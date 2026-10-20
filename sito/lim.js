/* Novaula · Strumenti per la LIM: sorteggio, timer e piantina dei posti.
   Compaiono sotto il riquadro "Adesso / Dopo" del docente (orario.js chiama window.NovaulaLim)
   e si aprono a tutto schermo. Il sorteggio favorisce chi ha pochi voti; assenti ed estratti
   del giorno restano su questo dispositivo. La piantina si salva nella tabella seating_plans.
   Il timer continua anche cambiando pagina: un bollino in basso lo mostra. */
(function () {
  "use strict";

  var DEMO_NAMES = ["Alessandro Bianchi", "Giulia Romano", "Matteo Colombo", "Sofia Ricci", "Lorenzo Marino", "Aurora Greco",
    "Leonardo Bruno", "Ginevra Gallo", "Francesco Conti", "Beatrice De Luca", "Tommaso Mancini", "Alice Costa",
    "Riccardo Giordano", "Martina Rizzo", "Edoardo Lombardi", "Chiara Moretti", "Gabriele Barbieri", "Emma Fontana"];
  var x = null;                 // aiuti ricevuti da orario.js
  var cache = {};               // dati per classe: { students, counts, lastOral, plan }
  var overlay = null, ui = {};  // finestra a tutto schermo
  var T = { total: 300, left: 300, endAt: 0, running: false, done: false, tick: null, chip: null, audio: null, lock: null };

  /* ---------- Aiuti ---------- */
  function today() { var d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
  function getList(key) { try { return JSON.parse(localStorage.getItem(key) || "[]"); } catch (e) { return []; } }
  function setList(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); } catch (e) {} }
  function absKey(cid) { return "lim-assenti-" + cid + "-" + today(); }
  function pickKey(cid) { return "lim-estratti-" + cid + "-" + today(); }
  function fullName(s) { return (s.first_name + " " + s.last_name).trim(); }
  function markValue(label) {
    var m = /^(\d{1,2})(?:[.,](\d{1,2}))?\s*(\+|-|½|1\/2|e mezzo)?/.exec(String(label || "").trim());
    if (!m) return null;
    var v = +m[1] + (m[2] ? +("0." + m[2]) : 0);
    if (m[3] === "+") v += 0.25; else if (m[3] === "-") v -= 0.25; else if (m[3]) v += 0.5;
    return v >= 0 && v <= 10 ? v : null;
  }
  function ok(res) { if (res.error) throw res.error; return res.data; }
  function errText(e) { return (e && (e.message || e.error_description)) || "Qualcosa non ha funzionato."; }
  function shuffle(a) { for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function reduced() { return window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches; }
  function clock(sec) { sec = Math.max(0, Math.ceil(sec)); return Math.floor(sec / 60) + ":" + String(sec % 60).padStart(2, "0"); }
  function info(cid) {
    var c = x.findClass(cid);
    return { code: c ? x.classParts(c)[0] : cid.toUpperCase(), color: c ? x.classColor(c) : "var(--accent)" };
  }

  /* ---------- Dati della classe ---------- */
  async function load(cid, fresh) {
    if (cache[cid] && !fresh) return cache[cid];
    var d = { students: [], counts: {}, lastOral: {}, plan: { rows: 5, cols: 6, seats: {} } };
    if (!x.sb) {
      d.students = DEMO_NAMES.map(function (n, i) { var sp = n.indexOf(" "); return { id: "demo-" + i, first_name: n.slice(0, sp), last_name: n.slice(sp + 1) }; });
      d.students.forEach(function (s, i) { d.counts[s.id] = (i * 7) % 4; });
      try { var saved = JSON.parse(localStorage.getItem("lim-posti-" + cid) || "null"); if (saved) d.plan = saved; } catch (e) {}
      return (cache[cid] = d);
    }
    var r = await Promise.all([
      x.sb.from("students").select("id, first_name, last_name").eq("class_id", cid).order("last_name").order("first_name"),
      x.sb.from("marks").select("student_id, category, status, mark_date").eq("class_id", cid).eq("status", "confermato"),
      x.sb.from("seating_plans").select("rows, cols, seats").eq("class_id", cid).maybeSingle()
    ]);
    d.students = ok(r[0]) || [];
    (ok(r[1]) || []).forEach(function (m) {
      d.counts[m.student_id] = (d.counts[m.student_id] || 0) + 1;
      if (m.category === "orale" && (!d.lastOral[m.student_id] || m.mark_date > d.lastOral[m.student_id])) d.lastOral[m.student_id] = m.mark_date;
    });
    if (!r[2].error && r[2].data) d.plan = { rows: r[2].data.rows, cols: r[2].data.cols, seats: r[2].data.seats || {} };
    return (cache[cid] = d);
  }
  function seatOf(d, id) {
    for (var k in d.plan.seats) if (d.plan.seats[k] === id) {
      var p = k.split("-");
      return "Fila " + (+p[0] + 1) + " · banco " + (+p[1] + 1);
    }
    return null;
  }

  /* ---------- Finestra a tutto schermo ---------- */
  function open(cid, tab) {
    if (!overlay) build();
    ui.cid = cid;
    ui.tab = tab;
    document.body.classList.add("lim-open");
    overlay.hidden = false;
    paintHead();
    paint();
    ui.close.focus();
  }
  function close() {
    if (!overlay) return;
    if (document.fullscreenElement) document.exitFullscreen().catch(function () {});
    overlay.hidden = true;
    document.body.classList.remove("lim-open");
    paintChip();
  }
  function build() {
    var h = x.h;
    ui.classes = h("div", { class: "lim-classes", role: "group", "aria-label": "Classe" });
    ui.tabs = h("div", { class: "lim-tabs", role: "tablist" }, [["pick", "🎲", "Sorteggio"], ["timer", "⏱️", "Timer"], ["seats", "🪑", "Posti"]].map(function (t) {
      return h("button", { type: "button", role: "tab", "data-tab": t[0], onclick: function () { ui.tab = t[0]; paintHead(); paint(); } },
        h("span", { "aria-hidden": "true", text: t[1] }), t[2]);
    }));
    ui.close = h("button", { type: "button", class: "lim-x", "aria-label": "Chiudi", text: "✕", onclick: close });
    var full = h("button", { type: "button", class: "lim-full", "aria-label": "Schermo intero", title: "Schermo intero", text: "⛶", onclick: function () {
      if (document.fullscreenElement) document.exitFullscreen().catch(function () {});
      else if (overlay.requestFullscreen) overlay.requestFullscreen().catch(function () {});
    } });
    ui.body = h("div", { class: "lim-body" });
    overlay = h("div", { class: "lim-overlay", role: "dialog", "aria-modal": "true", "aria-label": "Strumenti per la classe", hidden: true },
      h("header", { class: "lim-head" }, ui.classes, ui.tabs, h("div", { class: "lim-win" }, document.documentElement.requestFullscreen ? full : null, ui.close)),
      ui.body);
    document.body.appendChild(overlay);
    document.addEventListener("keydown", function (e) {
      if (overlay.hidden) return;
      if (e.key === "Escape" && !document.fullscreenElement) { close(); return; }
      var tag = (e.target && e.target.tagName) || "";
      if (e.key === " " && tag !== "INPUT" && tag !== "BUTTON" && tag !== "SELECT") {
        e.preventDefault();
        if (ui.tab === "pick" && ui.draw) ui.draw();
        if (ui.tab === "timer") toggleTimer();
      }
    });
  }
  function paintHead() {
    var h = x.h;
    ui.classes.replaceChildren.apply(ui.classes, x.classIds().map(function (id) {
      var c = info(id);
      return h("button", { type: "button", class: id === ui.cid ? "on" : null, style: "--cc:" + c.color, "aria-pressed": String(id === ui.cid), text: c.code,
        onclick: function () { ui.cid = id; paintHead(); paint(); } });
    }));
    overlay.style.setProperty("--cc", info(ui.cid).color);
    Array.prototype.forEach.call(ui.tabs.children, function (b) { b.setAttribute("aria-selected", String(b.getAttribute("data-tab") === ui.tab)); });
  }
  async function paint() {
    var h = x.h, cid = ui.cid, tab = ui.tab;
    ui.draw = null;
    if (tab === "timer") { ui.body.replaceChildren(timerView()); return; }
    ui.body.replaceChildren(h("p", { class: "empty", text: "Caricamento della classe…" }));
    var d;
    try { d = await load(cid); } catch (e) { ui.body.replaceChildren(h("p", { class: "notice err", text: errText(e) })); return; }
    if (ui.cid !== cid || ui.tab !== tab) return;
    if (!d.students.length) {
      ui.body.replaceChildren(h("div", { class: "lim-none" },
        h("p", { class: "lim-big", text: "Nessuno studente in " + info(cid).code }),
        h("p", { class: "muted", text: "Gli studenti compaiono qui quando creano il loro profilo nella pagina della classe (Profilo)." })));
      return;
    }
    ui.body.replaceChildren(tab === "pick" ? pickView(d) : seatsView(d));
  }

  /* ---------- Sorteggio ---------- */
  function weight(d, s) { var n = d.counts[s.id] || 0; return 1 / ((1 + n) * (1 + n)); }
  function pickView(d) {
    var h = x.h, cid = ui.cid, rolling = false;
    var absent = getList(absKey(cid)), picked = getList(pickKey(cid));
    var stage = h("div", { class: "lim-stage" });
    var drawBtn = h("button", { type: "button", class: "btn primary lim-draw", onclick: function () { draw(); } }, h("span", { "aria-hidden": "true", text: "🎲" }), "Estrai");
    var reset = h("button", { type: "button", class: "btn", text: "Rimetti tutti in gioco", onclick: function () { picked = []; setList(pickKey(cid), picked); idle(); roster(); } });
    var list = h("div", { class: "lim-roster" });

    function pool() { return d.students.filter(function (s) { return absent.indexOf(s.id) < 0 && picked.indexOf(s.id) < 0; }); }
    function idle() {
      var p = pool(), tot = p.reduce(function (a, s) { return a + weight(d, s); }, 0);
      stage.replaceChildren(h("p", { class: "lim-big muted", text: p.length ? "Chi sarà?" : "Tutti estratti!" }),
        h("p", { class: "muted", text: p.length ? p.length + " in gioco · chi ha meno voti ha più probabilità" : "Premi «Rimetti tutti in gioco» per ricominciare." }));
      drawBtn.disabled = !p.length;
      return tot;
    }
    function roster() {
      var p = pool(), tot = p.reduce(function (a, s) { return a + weight(d, s); }, 0);
      list.replaceChildren.apply(list, d.students.map(function (s) {
        var abs = absent.indexOf(s.id) >= 0, was = picked.indexOf(s.id) >= 0, n = d.counts[s.id] || 0;
        var pct = !abs && !was && tot ? Math.round(weight(d, s) / tot * 100) : 0;
        return h("button", { type: "button", class: "lim-who" + (abs ? " abs" : "") + (was ? " was" : ""), "aria-pressed": String(abs),
          title: abs ? "Assente: tocca per segnarlo presente" : "Tocca per segnarlo assente",
          onclick: function () {
            if (abs) absent.splice(absent.indexOf(s.id), 1); else absent.push(s.id);
            setList(absKey(cid), absent); roster(); if (!rolling && !stage.querySelector(".lim-name.win")) idle();
          } },
          h("span", { class: "n", text: fullName(s) }),
          h("span", { class: "c", text: abs ? "assente" : was ? "già estratto" : n + (n === 1 ? " voto" : " voti") + (pct ? " · " + pct + "%" : "") }));
      }));
    }
    function choose() {
      var p = pool(), tot = p.reduce(function (a, s) { return a + weight(d, s); }, 0), r = Math.random() * tot;
      for (var i = 0; i < p.length; i++) { r -= weight(d, p[i]); if (r <= 0) return p[i]; }
      return p[p.length - 1];
    }
    function draw() {
      if (rolling || !pool().length) return;
      var win = choose(), names = shuffle(pool().slice()), name = h("p", { class: "lim-name" }), steps = reduced() ? 0 : 18, i = 0;
      rolling = true; drawBtn.disabled = true;
      stage.replaceChildren(name);
      (function spin() {
        if (i < steps) {
          name.textContent = fullName(names[i % names.length]);
          i++;
          setTimeout(spin, 30 + i * i * 0.6);
          return;
        }
        rolling = false;
        picked.push(win.id); setList(pickKey(cid), picked);
        result(win);
        roster();
      })();
    }
    ui.draw = draw;
    function result(s) {
      var n = d.counts[s.id] || 0, seat = seatOf(d, s.id), last = d.lastOral[s.id];
      var label = h("input", { type: "text", inputmode: "decimal", maxlength: "12", placeholder: "es. 7+", "aria-label": "Voto dell'interrogazione", class: "lim-mark-in" });
      var msg = h("span", { class: "small muted", role: "status" });
      var form = h("form", { class: "lim-mark" }, label, h("button", { type: "submit", class: "btn primary", text: "Salva interrogazione" }), msg);
      form.addEventListener("submit", async function (e) {
        e.preventDefault();
        var v = markValue(label.value);
        if (v == null) { msg.textContent = "Formati: 7, 7+, 7-, 6½, 6,5."; label.focus(); return; }
        if (!x.sb) { msg.textContent = "In modalità demo il voto non viene salvato."; return; }
        try {
          ok(await x.sb.from("marks").insert({ student_id: s.id, class_id: ui.cid, category: "orale", title: "Interrogazione", label: label.value.trim().slice(0, 12), value: v, status: "confermato", source: "docente", mark_date: today() }));
          d.counts[s.id] = n + 1; d.lastOral[s.id] = today();
          form.replaceChildren(h("span", { class: "lim-saved", text: "Voto " + label.value.trim() + " salvato ✓" }));
          roster();
        } catch (err) { msg.textContent = errText(err); }
      });
      stage.replaceChildren(
        h("p", { class: "lim-name win", text: fullName(s) }),
        h("p", { class: "lim-meta" },
          h("span", { text: n + (n === 1 ? " voto" : " voti") }),
          seat && h("span", { text: seat }),
          h("span", { text: last ? "ultima interrogazione " + new Date(last + "T12:00:00").toLocaleDateString("it-IT", { day: "numeric", month: "long" }) : "mai interrogato" })),
        h("div", { class: "lim-after" },
          h("button", { type: "button", class: "btn", text: "Assente, estrai un altro", onclick: function () {
            picked.splice(picked.indexOf(s.id), 1); setList(pickKey(cid), picked);
            absent.push(s.id); setList(absKey(cid), absent); roster(); draw();
          } })),
        form);
      drawBtn.disabled = !pool().length;
    }
    idle(); roster();
    return h("div", { class: "lim-pick" }, stage,
      h("div", { class: "lim-row" }, drawBtn, picked.length ? reset : null, h("span", { class: "small muted", text: "Barra spaziatrice = estrai" })),
      h("p", { class: "lim-hint small muted", text: "Tocca un nome per segnarlo assente. Assenti ed estratti valgono solo per oggi e solo su questo dispositivo." }),
      list);
  }

  /* ---------- Timer ---------- */
  function remaining() { return T.running ? Math.max(0, (T.endAt - Date.now()) / 1000) : T.left; }
  function setTimer(sec) {
    T.total = T.left = Math.max(5, Math.round(sec)); T.running = false; T.done = false;
    clearInterval(T.tick); release(); refresh();
  }
  function toggleTimer() {
    if (T.done) { setTimer(T.total); return; }
    if (T.running) { T.left = remaining(); T.running = false; clearInterval(T.tick); release(); }
    else {
      try { T.audio = T.audio || new (window.AudioContext || window.webkitAudioContext)(); T.audio.resume(); } catch (e) {}
      T.endAt = Date.now() + T.left * 1000; T.running = true;
      clearInterval(T.tick); T.tick = setInterval(step, 250);
      if (navigator.wakeLock) navigator.wakeLock.request("screen").then(function (l) { T.lock = l; }).catch(function () {});
    }
    refresh();
  }
  function release() { if (T.lock) { T.lock.release().catch(function () {}); T.lock = null; } }
  function step() {
    if (T.running && remaining() <= 0) {
      T.running = false; T.left = 0; T.done = true; clearInterval(T.tick); release(); ring();
    }
    refresh();
  }
  function ring() {
    var a = T.audio;
    if (!a) return;
    try {
      [0, .35, .7, 1.4, 1.75, 2.1].forEach(function (t) {
        var o = a.createOscillator(), g = a.createGain(), s = a.currentTime + t;
        o.frequency.value = 880; o.connect(g); g.connect(a.destination);
        g.gain.setValueAtTime(0.0001, s); g.gain.exponentialRampToValueAtTime(0.4, s + .02); g.gain.exponentialRampToValueAtTime(0.0001, s + .28);
        o.start(s); o.stop(s + .3);
      });
    } catch (e) {}
    if (navigator.vibrate) navigator.vibrate([300, 150, 300]);
  }
  function refresh() {
    var left = remaining();
    if (ui.time) {
      ui.time.textContent = T.done ? "Tempo!" : clock(left);
      ui.ring.style.setProperty("--p", String(T.total ? (1 - left / T.total) * 100 : 0));
      ui.timerBox.classList.toggle("done", T.done);
      ui.timerBox.classList.toggle("warn", !T.done && T.running && left <= 10);
      ui.go.textContent = T.done ? "Ricomincia" : T.running ? "Pausa" : left < T.total ? "Riprendi" : "Avvia";
    }
    paintChip();
  }
  function timerView() {
    var h = x.h, end = x.lessonEnd && x.lessonEnd();
    function adjust(d) {
      var left = remaining() + d;
      if (left < 5) return;
      if (T.running) T.endAt += d * 1000; else T.left = left;
      T.total = Math.max(T.total + d, left); T.done = false;
      refresh();
    }
    ui.time = h("span", { class: "lim-time", "aria-live": "off" });
    ui.ring = h("div", { class: "lim-ring" }, ui.time);
    ui.go = h("button", { type: "button", class: "btn primary lim-go", onclick: toggleTimer });
    ui.timerBox = h("div", { class: "lim-timer" },
      ui.ring,
      h("div", { class: "lim-row" },
        h("button", { type: "button", class: "btn", text: "− 1 min", onclick: function () { adjust(-60); } }),
        ui.go,
        h("button", { type: "button", class: "btn", text: "+ 1 min", onclick: function () { adjust(60); } }),
        h("button", { type: "button", class: "btn link", text: "Azzera", onclick: function () { setTimer(T.total); } })),
      h("div", { class: "lim-presets", role: "group", "aria-label": "Durata" },
        [1, 2, 3, 5, 10, 15, 20, 30].map(function (m) { return h("button", { type: "button", class: "btn", text: m + " min", onclick: function () { setTimer(m * 60); } }); }),
        end && end > Date.now() + 60000 ? h("button", { type: "button", class: "btn", text: "Fino a fine ora", onclick: function () { setTimer((end - Date.now()) / 1000); toggleTimer(); } }) : null),
      h("p", { class: "small muted", text: "Barra spaziatrice = avvia/pausa. Il timer continua anche se chiudi questa finestra o cambi pagina." }));
    refresh();
    return ui.timerBox;
  }
  function paintChip() {
    var show = (T.running || T.done || (T.left < T.total)) && (!overlay || overlay.hidden);
    if (!show) { if (T.chip) T.chip.hidden = true; return; }
    if (!T.chip) {
      T.chip = x.h("button", { type: "button", class: "lim-chip", onclick: function () { open(ui.cid || x.classIds()[0], "timer"); } });
      document.body.appendChild(T.chip);
    }
    T.chip.hidden = false;
    T.chip.classList.toggle("done", T.done);
    T.chip.textContent = "⏱️ " + (T.done ? "Tempo scaduto" : clock(remaining()) + (T.running ? "" : " · in pausa"));
  }

  /* ---------- Piantina dei posti ---------- */
  function seatsView(d) {
    var h = x.h, cid = ui.cid, sel = null, timer = null;
    var flip = false; try { flip = localStorage.getItem("lim-posti-vista") === "studenti"; } catch (e) {}
    var absent = getList(absKey(cid));
    var status = h("span", { class: "small muted", role: "status" });
    var room = h("div", { class: "lim-room" }), tray = h("div", { class: "lim-tray" });
    var byId = {}; d.students.forEach(function (s) { byId[s.id] = s; });
    // Toglie dalla piantina chi non è più nella classe
    for (var k in d.plan.seats) if (!byId[d.plan.seats[k]]) delete d.plan.seats[k];

    function save() {
      clearTimeout(timer);
      status.textContent = "Salvataggio…";
      timer = setTimeout(async function () {
        try {
          if (x.sb) ok(await x.sb.from("seating_plans").upsert({ class_id: cid, rows: d.plan.rows, cols: d.plan.cols, seats: d.plan.seats, updated_at: new Date().toISOString() }));
          else localStorage.setItem("lim-posti-" + cid, JSON.stringify(d.plan));
          status.textContent = "Salvato ✓";
        } catch (e) { status.textContent = errText(e); }
      }, 600);
    }
    function keyOf(id) { for (var k in d.plan.seats) if (d.plan.seats[k] === id) return k; return null; }
    function place(key) {
      var here = d.plan.seats[key];
      if (!sel) { if (here) { sel = here; draw(); } return; }
      var from = keyOf(sel);
      if (here === sel) { sel = null; draw(); return; }
      if (from) { if (here) d.plan.seats[from] = here; else delete d.plan.seats[from]; }
      d.plan.seats[key] = sel;
      sel = null; draw(); save();
    }
    function nameBtn(s, cls, onclick) {
      return h("button", { type: "button", class: cls + (sel === s.id ? " sel" : "") + (absent.indexOf(s.id) >= 0 ? " abs" : ""), "aria-pressed": String(sel === s.id), onclick: onclick },
        h("b", { text: s.first_name }), h("span", { text: s.last_name }));
    }
    function draw() {
      var rows = [], desk = h("div", { class: "lim-desk", text: "Cattedra · LIM" });
      for (var r = 0; r < d.plan.rows; r++) {
        var cells = [];
        for (var c = 0; c < d.plan.cols; c++) (function (key) {
          var s = byId[d.plan.seats[key]];
          cells.push(s ? nameBtn(s, "lim-seat full", function () { place(key); })
            : h("button", { type: "button", class: "lim-seat" + (sel ? " target" : ""), "aria-label": "Banco libero, fila " + (r + 1) + " posto " + (c + 1), onclick: function () { place(key); } }));
        })(r + "-" + c);
        rows.push(h("div", { class: "lim-seat-row", style: "--cols:" + d.plan.cols }, cells));
      }
      if (flip) rows.reverse();
      room.replaceChildren.apply(room, flip ? rows.concat([desk]) : [desk].concat(rows));
      var free = d.students.filter(function (s) { return !keyOf(s.id); });
      tray.replaceChildren(
        h("p", { class: "small muted", text: sel ? "Tocca un banco per spostare " + fullName(byId[sel]) + (keyOf(sel) ? ", oppure «Togli dal banco»." : ".") : free.length ? "Senza banco: tocca un nome, poi un banco." : "Tutti hanno un banco. Tocca un nome nella piantina per spostarlo o scambiarlo." }),
        h("div", { class: "lim-free" }, free.map(function (s) { return nameBtn(s, "lim-who small", function () { sel = sel === s.id ? null : s.id; draw(); }); }),
          sel && keyOf(sel) ? h("button", { type: "button", class: "btn", text: "Togli dal banco", onclick: function () { delete d.plan.seats[keyOf(sel)]; sel = null; draw(); save(); } }) : null));
    }
    function stepper(label, prop) {
      var out = h("b", { text: String(d.plan[prop]) });
      function set(v) {
        if (v < 1 || v > 12) return;
        d.plan[prop] = v;
        for (var k in d.plan.seats) { var p = k.split("-"); if (+p[0] >= d.plan.rows || +p[1] >= d.plan.cols) delete d.plan.seats[k]; }
        out.textContent = String(v); draw(); save();
      }
      return h("span", { class: "lim-step" }, label,
        h("button", { type: "button", class: "btn", "aria-label": label + " meno", text: "−", onclick: function () { set(d.plan[prop] - 1); } }), out,
        h("button", { type: "button", class: "btn", "aria-label": label + " più", text: "+", onclick: function () { set(d.plan[prop] + 1); } }));
    }
    draw();
    return h("div", { class: "lim-seats" },
      h("div", { class: "lim-row" },
        h("button", { type: "button", class: "btn primary", text: "Mescola", onclick: function () {
          var keys = []; for (var r = 0; r < d.plan.rows; r++) for (var c = 0; c < d.plan.cols; c++) keys.push(r + "-" + c);
          var people = shuffle(d.students.map(function (s) { return s.id; }));
          if (people.length > keys.length) { status.textContent = "Servono più banchi: aggiungi file o colonne."; return; }
          // riempie dalle prime file, lasciando i banchi in fondo vuoti
          d.plan.seats = {}; people.forEach(function (id, i) { d.plan.seats[keys[i]] = id; });
          sel = null; draw(); save();
        } }),
        h("button", { type: "button", class: "btn", text: "Svuota", onclick: function () { d.plan.seats = {}; sel = null; draw(); save(); } }),
        h("button", { type: "button", class: "btn", text: flip ? "Vista dalla cattedra" : "Vista dagli studenti", onclick: function () {
          flip = !flip; try { localStorage.setItem("lim-posti-vista", flip ? "studenti" : "cattedra"); } catch (e) {}
          this.textContent = flip ? "Vista dalla cattedra" : "Vista dagli studenti"; draw();
        } }),
        stepper("File", "rows"), stepper("Banchi per fila", "cols"), status),
      room, tray);
  }

  /* ---------- Barra sotto il riquadro "Adesso" ---------- */
  window.NovaulaLim = function (box, aiuti) {
    x = aiuti;
    var h = x.h, chosen = null;
    var bar = h("section", { class: "lim-bar", "aria-label": "Strumenti per la classe" });
    function current() { return chosen || x.currentClass() || x.classIds()[0]; }
    function paintBar() {
      var cid = current(), ids = x.classIds();
      if (!cid) { bar.hidden = true; return; }
      bar.hidden = false;
      bar.style.setProperty("--cc", info(cid).color);
      bar.replaceChildren(
        h("label", { class: "lim-bar-class" }, h("span", { class: "now-label", text: "Strumenti per la classe" }),
          h("select", { "aria-label": "Classe", onchange: function () { chosen = this.value; paintBar(); } }, ids.map(function (id) {
            return h("option", { value: id, text: info(id).code, selected: id === cid ? true : null });
          }))),
        h("div", { class: "lim-bar-btns" }, [["pick", "🎲", "Sorteggia"], ["timer", "⏱️", "Timer"], ["seats", "🪑", "Posti"]].map(function (t) {
          return h("button", { type: "button", class: "btn lim-tool", onclick: function () { open(current(), t[0]); } },
            h("span", { "aria-hidden": "true", text: t[1] }), t[2]);
        })));
    }
    box.appendChild(bar);
    paintBar();
    paintChip();
    var t = setInterval(function () { if (!chosen) paintBar(); }, 60000);
    return function () { clearInterval(t); };
  };
})();
