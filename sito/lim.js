/* Novaula · Strumenti per la LIM: sorteggio e timer.
   Compaiono sotto il riquadro "Adesso / Dopo" del docente (orario.js chiama window.NovaulaLim)
   e si aprono a tutto schermo. Senza dati personali: il sorteggio estrae un numero (quello del registro),
   e numero di studenti, assenti ed estratti del giorno restano solo su questo dispositivo.
   Il timer continua anche cambiando pagina: un bollino in basso lo mostra. */
(function () {
  "use strict";

  var x = null;                 // aiuti ricevuti da orario.js
  var overlay = null, ui = {};  // finestra a tutto schermo
  var T = { total: 300, left: 300, endAt: 0, running: false, done: false, tick: null, chip: null, audio: null, lock: null };

  /* ---------- Aiuti ---------- */
  function today() { var d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
  function getList(key) { try { return JSON.parse(localStorage.getItem(key) || "[]"); } catch (e) { return []; } }
  function setList(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); } catch (e) {} }
  function absKey(cid) { return "lim-assenti-" + cid + "-" + today(); }
  function pickKey(cid) { return "lim-estratti-" + cid + "-" + today(); }
  function sizeKey(cid) { return "lim-studenti-" + cid; }
  function classSize(cid) { var n = 0; try { n = +localStorage.getItem(sizeKey(cid)); } catch (e) {} return n >= 2 && n <= 40 ? n : 24; }
  function shuffle(a) { for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function reduced() { return window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches; }
  function clock(sec) { sec = Math.max(0, Math.ceil(sec)); return Math.floor(sec / 60) + ":" + String(sec % 60).padStart(2, "0"); }
  function info(cid) {
    var c = x.findClass(cid);
    return { code: c ? x.classParts(c)[0] : cid.toUpperCase(), color: c ? x.classColor(c) : "var(--accent)" };
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
    ui.tabs = h("div", { class: "lim-tabs", role: "tablist" }, [["pick", "🎲", "Sorteggio"], ["timer", "⏱️", "Timer"]].map(function (t) {
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
  function paint() {
    ui.draw = null;
    ui.body.replaceChildren(ui.tab === "timer" ? timerView() : pickView(ui.cid));
  }

  /* ---------- Sorteggio: un numero del registro, tra i presenti ---------- */
  function pickView(cid) {
    var h = x.h, rolling = false, size = classSize(cid);
    var absent = getList(absKey(cid)), picked = getList(pickKey(cid));
    var stage = h("div", { class: "lim-stage" });
    var drawBtn = h("button", { type: "button", class: "btn primary lim-draw", onclick: function () { draw(); } }, h("span", { "aria-hidden": "true", text: "🎲" }), "Estrai");
    var reset = h("button", { type: "button", class: "btn", text: "Rimetti tutti in gioco", onclick: function () { picked = []; setList(pickKey(cid), picked); idle(); roster(); } });
    var list = h("div", { class: "lim-roster lim-nums" });
    var out = h("b", { text: String(size) });

    function all() { var a = []; for (var i = 1; i <= size; i++) a.push(i); return a; }
    function pool() { return all().filter(function (n) { return absent.indexOf(n) < 0 && picked.indexOf(n) < 0; }); }
    function idle() {
      var p = pool();
      stage.replaceChildren(h("p", { class: "lim-big muted", text: p.length ? "Chi sarà?" : "Tutti estratti!" }),
        h("p", { class: "muted", text: p.length ? p.length + " numeri in gioco" : "Premi «Rimetti tutti in gioco» per ricominciare." }));
      drawBtn.disabled = !p.length;
    }
    function roster() {
      list.replaceChildren.apply(list, all().map(function (n) {
        var abs = absent.indexOf(n) >= 0, was = picked.indexOf(n) >= 0;
        return h("button", { type: "button", class: "lim-who lim-num" + (abs ? " abs" : "") + (was ? " was" : ""), "aria-pressed": String(abs),
          "aria-label": "Numero " + n + (abs ? ", assente" : was ? ", già estratto" : ""),
          title: abs ? "Assente: tocca per rimetterlo in gioco" : "Tocca per segnarlo assente",
          onclick: function () {
            if (abs) absent.splice(absent.indexOf(n), 1); else absent.push(n);
            setList(absKey(cid), absent); roster(); if (!rolling && !stage.querySelector(".lim-name.win")) idle();
          } }, h("span", { class: "n", text: String(n) }));
      }));
    }
    function setSize(v) {
      if (v < 2 || v > 40) return;
      size = v; out.textContent = String(v);
      try { localStorage.setItem(sizeKey(cid), String(v)); } catch (e) {}
      absent = absent.filter(function (n) { return n <= v; }); picked = picked.filter(function (n) { return n <= v; });
      setList(absKey(cid), absent); setList(pickKey(cid), picked);
      roster(); idle();
    }
    function draw() {
      if (rolling || !pool().length) return;
      var p = pool(), win = p[Math.floor(Math.random() * p.length)], seq = shuffle(p.slice()), num = h("p", { class: "lim-name lim-n" }), steps = reduced() ? 0 : 18, i = 0;
      rolling = true; drawBtn.disabled = true;
      stage.replaceChildren(num);
      (function spin() {
        if (i < steps) { num.textContent = String(seq[i % seq.length]); i++; setTimeout(spin, 30 + i * i * 0.6); return; }
        rolling = false;
        picked.push(win); setList(pickKey(cid), picked);
        stage.replaceChildren(
          h("p", { class: "lim-name lim-n win", text: String(win) }),
          h("p", { class: "lim-meta" }, h("span", { text: "numero del registro" })),
          h("div", { class: "lim-after" },
            h("button", { type: "button", class: "btn", text: "Assente, estrai un altro", onclick: function () {
              picked.splice(picked.indexOf(win), 1); setList(pickKey(cid), picked);
              absent.push(win); setList(absKey(cid), absent); roster(); draw();
            } })));
        drawBtn.disabled = !pool().length;
        roster();
      })();
    }
    ui.draw = draw;
    idle(); roster();
    return h("div", { class: "lim-pick" }, stage,
      h("div", { class: "lim-row" }, drawBtn, picked.length ? reset : null,
        h("span", { class: "lim-step" }, "Studenti",
          h("button", { type: "button", class: "btn", "aria-label": "Studenti meno", text: "−", onclick: function () { setSize(size - 1); } }), out,
          h("button", { type: "button", class: "btn", "aria-label": "Studenti più", text: "+", onclick: function () { setSize(size + 1); } })),
        h("span", { class: "small muted", text: "Barra spaziatrice = estrai" })),
      h("p", { class: "lim-hint small muted", text: "Estrae un numero del registro. Tocca un numero per segnarlo assente. Numeri, assenti ed estratti restano solo su questo dispositivo e valgono per oggi." }),
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
        h("div", { class: "lim-bar-btns" }, [["pick", "🎲", "Sorteggia"], ["timer", "⏱️", "Timer"]].map(function (t) {
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
