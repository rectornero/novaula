/* Novaula · lezioni: parti interattive delle slide.
   Sondaggi e quiz (.poll), puzzle (.puzzle-ordina, .puzzle-abbina, .puzzle-completa con .blank, .puzzle-codice),
   carte da girare (.flip), timer (.timer), voto dal telefono e domande sulle slide.
   In modalità PDF (?pdf) disegna tutto in forma statica, senza pulsanti e senza soluzioni. */
(function () {
  "use strict";
  var LETTERS = "ABCDEFGHIJ";
  var PRINT = false, SLIDES = [], TITLE = "";
  var DECK = location.pathname.split("/").pop().replace(/\.html?$/, "");

  function h(tag, attrs, kids) {
    var e = document.createElement(tag);
    for (var k in attrs || {}) {
      var v = attrs[k];
      if (v == null || v === false) continue;
      if (k === "text") e.textContent = v;
      else if (k === "html") e.innerHTML = v;
      else if (k.slice(0, 2) === "on") e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v === true ? "" : v);
    }
    [].concat(kids || []).forEach(function (c) { if (c) e.appendChild(typeof c === "string" ? document.createTextNode(c) : c); });
    return e;
  }
  // Mescolamento ripetibile (stesso ordine sul LIM, sul telefono e nel PDF), mai uguale all'ordine giusto
  function seeded(str) {
    var x = 2166136261;
    for (var i = 0; i < str.length; i++) { x ^= str.charCodeAt(i); x = Math.imul(x, 16777619); }
    return function () { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return ((x >>> 0) % 100000) / 100000; };
  }
  function shuffled(n, seed) {
    var idx = [], r = seeded(seed), i, j, t;
    for (i = 0; i < n; i++) idx.push(i);
    if (n < 2) return idx;
    for (var tries = 0; tries < 20; tries++) {
      for (i = n - 1; i > 0; i--) { j = Math.floor(r() * (i + 1)); t = idx[i]; idx[i] = idx[j]; idx[j] = t; }
      if (idx.some(function (v, k) { return v !== k; })) break;
    }
    return idx;
  }
  function norm(s) { return String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[\s.,;:'"’]+/g, " ").trim(); }
  function slideOf(el) { return SLIDES.indexOf(el.closest("section.slide")); }
  function tools(parent) { var t = h("div", { class: "ia-tools" }); parent.appendChild(t); return t; }
  function btn(label, fn, cls) { return h("button", { type: "button", class: "ia-btn" + (cls ? " " + cls : ""), onclick: fn, html: label }); }
  function say(el, text, kind) { el.className = "ia-msg " + (kind || ""); el.textContent = text; }

  // ---------- Sondaggi e quiz ----------
  // <div class="poll" data-id="p1" [data-tipo="quiz" data-risposta="B"]><ol><li>…</li></ol><p class="why">…</p></div>
  function poll(el) {
    var items = [].slice.call(el.querySelectorAll(":scope > ol > li"));
    var quiz = el.getAttribute("data-tipo") === "quiz" || el.hasAttribute("data-risposta");
    var answer = LETTERS.indexOf((el.getAttribute("data-risposta") || "").trim().toUpperCase());
    var why = el.querySelector(":scope > .why");
    var counts = items.map(function () { return 0; });
    var mode = "self", revealed = false, picked = -1;
    el.classList.add("ia", quiz ? "is-quiz" : "is-poll");
    el.setAttribute("data-n", items.length);
    var label = h("p", { class: "poll-label", text: quiz ? "Quiz" : "Sondaggio" });
    el.insertBefore(label, el.firstChild);
    items.forEach(function (li, i) {
      li.insertBefore(h("span", { class: "poll-letter", text: LETTERS[i] }), li.firstChild);
      li.appendChild(h("span", { class: "poll-bar" }));
      li.appendChild(h("span", { class: "poll-count" }));
      if (!PRINT) li.addEventListener("click", function () { tap(i); });
    });
    if (PRINT) return;
    var t = tools(el), msg = h("span", { class: "ia-msg" });
    var bHands = btn("✋ Alzata di mano", function () { setMode(mode === "hands" ? "self" : "hands"); });
    var bPhone = btn("📱 Voto dal telefono", function () { Live.start(api); });
    var bReveal = quiz ? btn("Rivela", function () { reveal(); }, "strong") : null;
    var bReset = btn("Azzera", function () { reset(); });
    [bPhone, bHands, bReveal, bReset, msg].forEach(function (b) { if (b) t.appendChild(b); });

    function setMode(m) {
      mode = m;
      el.classList.toggle("mode-hands", m === "hands");
      el.classList.toggle("mode-phone", m === "phone");
      bHands.classList.toggle("on", m === "hands");
      bPhone.classList.toggle("on", m === "phone");
      say(msg, m === "hands" ? "Tocca un'opzione per ogni mano alzata (tasto destro per togliere)." : m === "phone" ? "" : "");
      draw();
    }
    function tap(i) {
      if (mode === "hands") { counts[i]++; draw(); return; }
      if (mode === "phone") return;
      if (revealed && quiz) return;
      picked = i;
      items.forEach(function (li, k) { li.classList.toggle("picked", k === i); });
      if (quiz && answer >= 0) {
        revealed = true;
        el.classList.add("revealed");
        items.forEach(function (li, k) { li.classList.toggle("right", k === answer); li.classList.toggle("wrong", k === i && i !== answer); });
        say(msg, i === answer ? "Esatto!" : "Non è questa: guarda la risposta giusta.", i === answer ? "ok" : "bad");
      } else say(msg, "Risposta segnata: confrontala con la classe.");
    }
    items.forEach(function (li, i) {
      li.addEventListener("contextmenu", function (e) { if (mode === "hands") { e.preventDefault(); counts[i] = Math.max(0, counts[i] - 1); draw(); } });
    });
    function draw() {
      var tot = counts.reduce(function (a, b) { return a + b; }, 0);
      var show = mode !== "self";
      el.classList.toggle("has-counts", show);
      items.forEach(function (li, i) {
        var pct = tot ? Math.round(counts[i] / tot * 100) : 0;
        li.querySelector(".poll-bar").style.width = (show ? pct : 0) + "%";
        li.querySelector(".poll-count").textContent = show ? counts[i] + (tot ? " · " + pct + "%" : "") : "";
      });
      if (mode === "phone") say(msg, tot + (tot === 1 ? " voto" : " voti"));
    }
    function reveal() {
      if (answer < 0) return;
      revealed = true;
      el.classList.add("revealed");
      items.forEach(function (li, k) { li.classList.toggle("right", k === answer); li.classList.toggle("wrong", k !== answer && counts[k] > 0); });
      if (mode === "phone") Live.reveal(answer);
    }
    function reset() {
      counts = counts.map(function () { return 0; });
      revealed = false; picked = -1;
      el.classList.remove("revealed");
      items.forEach(function (li) { li.classList.remove("right", "wrong", "picked"); });
      if (mode === "phone") Live.start(api); else setMode("self");
      draw();
    }
    var api = {
      el: el, id: el.getAttribute("data-id") || ("p" + slideOf(el)),
      question: (el.querySelector(".q") || el.closest("section.slide").querySelector("h2,h3") || {}).textContent || "",
      options: items.map(function (li) { return li.cloneNode(true); }).map(function (c) {
        [].slice.call(c.querySelectorAll(".poll-letter,.poll-bar,.poll-count")).forEach(function (x) { x.remove(); });
        return c.textContent.trim();
      }),
      answer: quiz ? answer : null,
      setCounts: function (c) { counts = c; draw(); },
      phoneOn: function () { setMode("phone"); },
      phoneOff: function () { if (mode === "phone") setMode("self"); }
    };
    el._poll = api;
  }

  // ---------- Metti in ordine ----------
  // <ol class="puzzle-ordina"> con gli elementi nell'ordine GIUSTO: la pagina li mescola
  function ordina(el) {
    var items = [].slice.call(el.children);
    var order = shuffled(items.length, DECK + (el.getAttribute("data-id") || el.textContent));
    el.classList.add("ia");
    order.forEach(function (k) { el.appendChild(items[k]); });
    items.forEach(function (li, k) { li.dataset.k = k; });
    if (PRINT) return;
    var sel = null, t = tools(el.parentNode.insertBefore(h("div", { class: "ia-wrap" }), el.nextSibling)), msg = h("span", { class: "ia-msg" });
    t.appendChild(btn("Controlla", check, "strong"));
    t.appendChild(btn("Mescola di nuovo", function () { items.slice().sort(function () { return Math.random() - .5; }).forEach(function (li) { el.appendChild(li); }); clear(); }));
    t.appendChild(msg);
    say(msg, "Tocca due voci per scambiarle.");
    el.addEventListener("click", function (e) {
      var li = e.target.closest("li"); if (!li || li.parentNode !== el) return;
      clear(true);
      if (!sel) { sel = li; li.classList.add("sel"); return; }
      if (sel !== li) {
        var a = sel, b = li, an = a.nextSibling === b ? a : a.nextSibling;
        el.insertBefore(a, b); el.insertBefore(b, an);
      }
      sel.classList.remove("sel"); sel = null;
    });
    function clear(keepSel) { [].forEach.call(el.children, function (li) { li.classList.remove("right", "wrong"); if (!keepSel) li.classList.remove("sel"); }); if (!keepSel) sel = null; }
    function check() {
      var ok = 0;
      [].forEach.call(el.children, function (li, i) { var g = +li.dataset.k === i; li.classList.toggle("right", g); li.classList.toggle("wrong", !g); if (g) ok++; });
      say(msg, ok === items.length ? "Perfetto, tutto in ordine!" : ok + " su " + items.length + " al posto giusto.", ok === items.length ? "ok" : "");
    }
  }

  // ---------- Abbina ----------
  // <dl class="puzzle-abbina"><dt>…</dt><dd>…</dd>…</dl> con le coppie GIUSTE: la colonna destra viene mescolata
  function abbina(el) {
    var dts = [].slice.call(el.querySelectorAll(":scope > dt")), dds = [].slice.call(el.querySelectorAll(":scope > dd"));
    var order = shuffled(dds.length, DECK + (el.getAttribute("data-id") || el.textContent));
    var left = h("div", { class: "ab-col ab-left" }), right = h("div", { class: "ab-col ab-right" });
    dts.forEach(function (dt) { left.appendChild(h("div", { class: "ab-item" }, [].slice.call(dt.childNodes))); });
    var rights = dds.map(function (dd, k) { var d = h("div", { class: "ab-item" }, [].slice.call(dd.childNodes)); d.dataset.k = k; return d; });
    order.forEach(function (k) { right.appendChild(rights[k]); });
    el.textContent = "";
    el.classList.add("ia");
    el.appendChild(left); el.appendChild(right);
    if (PRINT) return;
    var sel = null, t = tools(el.parentNode.insertBefore(h("div", { class: "ia-wrap" }), el.nextSibling)), msg = h("span", { class: "ia-msg" });
    t.appendChild(btn("Controlla", check, "strong"));
    t.appendChild(msg);
    say(msg, "Tocca due voci a destra per scambiarle, finché ogni riga è giusta.");
    right.addEventListener("click", function (e) {
      var it = e.target.closest(".ab-item"); if (!it) return;
      [].forEach.call(right.children, function (x) { x.classList.remove("right", "wrong"); });
      if (!sel) { sel = it; it.classList.add("sel"); return; }
      if (sel !== it) { var an = sel.nextSibling === it ? sel : sel.nextSibling; right.insertBefore(sel, it); right.insertBefore(it, an); }
      sel.classList.remove("sel"); sel = null;
    });
    function check() {
      var ok = 0;
      [].forEach.call(right.children, function (it, i) { var g = +it.dataset.k === i; it.classList.toggle("right", g); it.classList.toggle("wrong", !g); if (g) ok++; });
      say(msg, ok === dds.length ? "Tutte le coppie sono giuste!" : ok + " su " + dds.length + " coppie giuste.", ok === dds.length ? "ok" : "");
    }
  }

  // ---------- Completa ----------
  // Dentro .puzzle-completa: <span class="blank" data-risposta="otto|8"></span>
  function completa(el) {
    el.classList.add("ia");
    var blanks = [].slice.call(el.querySelectorAll(".blank"));
    blanks.forEach(function (b) {
      var alts = (b.getAttribute("data-risposta") || "").split("|");
      var w = Math.max.apply(null, alts.map(function (a) { return a.length; }));
      b.style.setProperty("--w", Math.max(3, w + 1) + "ch");
      if (PRINT) return;
      var inp = h("input", { type: "text", autocomplete: "off", spellcheck: "false", "aria-label": "Completa" });
      b.appendChild(inp);
    });
    if (PRINT) return;
    var t = tools(el), msg = h("span", { class: "ia-msg" });
    t.appendChild(btn("Controlla", function () {
      var ok = 0;
      blanks.forEach(function (b) {
        var v = norm(b.querySelector("input").value), g = (b.getAttribute("data-risposta") || "").split("|").some(function (a) { return norm(a) === v; });
        b.classList.toggle("right", g); b.classList.toggle("wrong", !g && v !== ""); if (g) ok++;
      });
      say(msg, ok === blanks.length ? "Tutto giusto!" : ok + " su " + blanks.length + " giuste.", ok === blanks.length ? "ok" : "");
    }, "strong"));
    t.appendChild(btn("Mostra soluzioni", function () {
      blanks.forEach(function (b) { b.querySelector("input").value = (b.getAttribute("data-risposta") || "").split("|")[0]; b.classList.add("right"); b.classList.remove("wrong"); });
    }));
    t.appendChild(msg);
  }

  // ---------- Lucchetto: trova il codice ----------
  // <div class="puzzle-codice" data-risposta="1011">indizi…<div class="premio">si vede quando apri</div></div>
  function codice(el) {
    el.classList.add("ia");
    var lock = h("div", { class: "lock", "aria-hidden": "true" }, [h("span", { class: "lock-shackle" }), h("span", { class: "lock-body" })]);
    el.insertBefore(lock, el.firstChild);
    var row = h("div", { class: "code-row" });
    var inp = h("input", { type: "text", class: "code-in", autocomplete: "off", spellcheck: "false", placeholder: "codice", "aria-label": "Codice" });
    row.appendChild(inp);
    var premio = el.querySelector(".premio");
    if (PRINT) { el.appendChild(row); return; }
    var msg = h("span", { class: "ia-msg" });
    row.appendChild(btn("Apri", open, "strong"));
    row.appendChild(msg);
    el.appendChild(row);
    if (premio) el.appendChild(premio);
    inp.addEventListener("keydown", function (e) { if (e.key === "Enter") open(); });
    var tries = 0;
    function open() {
      var ok = (el.getAttribute("data-risposta") || "").split("|").some(function (a) { return norm(a) === norm(inp.value); });
      tries++;
      if (ok) { el.classList.add("opened"); say(msg, "Aperto!", "ok"); }
      else { el.classList.remove("shake"); void el.offsetWidth; el.classList.add("shake"); say(msg, tries >= 3 && el.getAttribute("data-aiuto") ? "Aiuto: " + el.getAttribute("data-aiuto") : "Codice sbagliato, riprova.", "bad"); }
    }
  }

  // ---------- Carte da girare ----------
  // <div class="flip"><div class="fronte">…</div><div class="retro">…</div></div>
  function flip(el) {
    el.classList.add("ia");
    if (PRINT) return;
    el.setAttribute("role", "button"); el.setAttribute("tabindex", "0");
    el.addEventListener("click", function () { el.classList.toggle("turned"); });
  }

  // ---------- Timer ----------
  // <div class="timer" data-min="3"></div>
  function timer(el) {
    var total = Math.round(parseFloat(el.getAttribute("data-min") || "3") * 60), left = total, iv = null;
    el.classList.add("ia");
    var face = h("span", { class: "timer-face" });
    el.appendChild(face);
    function draw() { face.textContent = Math.floor(left / 60) + ":" + String(left % 60).padStart(2, "0"); el.classList.toggle("done", left === 0); }
    draw();
    if (PRINT) return;
    el.setAttribute("role", "button"); el.title = "Tocca per avviare o fermare";
    el.addEventListener("click", function () {
      if (iv) { clearInterval(iv); iv = null; el.classList.remove("running"); return; }
      if (left === 0) left = total;
      el.classList.add("running");
      iv = setInterval(function () { left--; draw(); if (left <= 0) { clearInterval(iv); iv = null; el.classList.remove("running"); } }, 1000);
    });
  }

  function loadScript(src) {
    return new Promise(function (res, rej) {
      if (document.querySelector('script[src="' + src + '"]')) return res();
      var s = document.createElement("script"); s.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s);
    });
  }
  // ---------- Collegamento con Supabase (voto dal telefono, domande) ----------
  var Cloud = (function () {
    var p = null;
    var load = loadScript;
    function get() {
      if (p) return p;
      p = load("../../config.js").then(function () {
        var cfg = window.PIATTAFORMA_CONFIG || {};
        if (!cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY) return null;
        return load("../../vendor/supabase.js").then(function () {
          var sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
          return sb.auth.getSession().then(function (r) {
            var user = r.data && r.data.session && r.data.session.user;
            if (!user) return { sb: sb, teacher: false };
            return sb.rpc("current_user_is_teacher").then(function (t) { return { sb: sb, teacher: !!t.data }; });
          });
        });
      }).catch(function () { return null; });
      return p;
    }
    return { get: get };
  })();

  // La classe: dal link del sito (?da=c/1e/...), altrimenti l'ultima scelta su questo dispositivo
  function classId() {
    var m = /[?&]da=c%2F([a-z0-9]+)|[?&]da=c\/([a-z0-9]+)/i.exec(location.search);
    var c = m ? (m[1] || m[2]).toLowerCase() : null;
    try { if (c) localStorage.setItem("novaula-classe", c); else c = localStorage.getItem("novaula-classe"); } catch (e) {}
    return c;
  }
  function askClass(cb) {
    Cloud.get().then(function (cl) {
      var list = cl ? cl.sb.from("classes").select("id,name").order("sort").then(function (r) { return r.data || []; }) : Promise.resolve([{ id: "1d", name: "1D Informatica" }, { id: "1e", name: "1E Informatica" }]);
      list.then(function (cs) {
        var box = panel("Di che classe sei?");
        cs.forEach(function (c) {
          box.body.appendChild(btn(c.name, function () { try { localStorage.setItem("novaula-classe", c.id); } catch (e) {} box.close(); cb(c.id); }, "wide"));
        });
      });
    });
  }
  function panel(title) {
    var old = document.querySelector(".ia-panel"); if (old) old.remove();
    var body = h("div", { class: "ia-panel-body" });
    var p = h("div", { class: "ia-panel", role: "dialog", "aria-label": title }, [
      h("div", { class: "ia-panel-head" }, [h("b", { text: title }), h("button", { type: "button", class: "ia-x", "aria-label": "Chiudi", text: "✕", onclick: function () { p.remove(); } })]),
      body
    ]);
    document.body.appendChild(p);
    return { el: p, body: body, close: function () { p.remove(); } };
  }

  // ---------- Voto dal telefono ----------
  var Live = (function () {
    var current = null, round = null, timer = null, cls = null;
    function stop() { clearInterval(timer); timer = null; if (current) current.phoneOff(); current = null; var q = document.querySelector(".ia-qr"); if (q) q.remove(); }
    function start(poll) {
      var c = classId();
      if (!c) return askClass(function () { start(poll); });
      Cloud.get().then(function (cl) {
        if (!cl) return alertBox("Il voto dal telefono funziona sul sito pubblicato. Qui usa l'alzata di mano.");
        if (!cl.teacher) return alertBox("Per far votare la classe dal telefono, accedi prima come docente su Novaula (Area docente) da questo dispositivo.");
        stop();
        current = poll; cls = c;
        round = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        cl.sb.from("votes").delete().eq("class_id", c).then(function () {
          return cl.sb.from("live_polls").upsert({ class_id: c, deck: DECK, poll: poll.id, round: round, question: poll.question, options: poll.options, answer: poll.answer, revealed: false, updated_at: new Date().toISOString() });
        }).then(function (r) {
          if (r && r.error) { alertBox("Non riesco ad avviare il voto: " + r.error.message); return stop(); }
          poll.phoneOn();
          showQr(c);
          var tick = function () {
            cl.sb.from("votes").select("choice").eq("round", round).then(function (res) {
              if (!current || current !== poll) return;
              var counts = poll.options.map(function () { return 0; });
              (res.data || []).forEach(function (v) { if (counts[v.choice] != null) counts[v.choice]++; });
              poll.setCounts(counts);
            });
          };
          tick(); timer = setInterval(tick, 1500);
        });
      });
    }
    function reveal(answer) {
      Cloud.get().then(function (cl) { if (cl && cl.teacher && cls && round) cl.sb.from("live_polls").update({ revealed: true, answer: answer }).eq("class_id", cls).eq("round", round).then(function () {}); });
    }
    function showQr(c) {
      var url = location.origin + "/vota.html?c=" + c;
      var img = h("div", { class: "qr-img", role: "img", "aria-label": "Codice QR per votare" });
      loadScript("../../vendor/qrcode.js").then(function () {
        var q = window.qrcode(0, "M"); q.addData(url); q.make();
        img.innerHTML = q.createSvgTag({ cellSize: 6, margin: 2, scalable: true });
      });
      var box = h("div", { class: "ia-qr" }, [
        img,
        h("p", { html: "Vota su<br><b>" + location.host + "/vota</b><br>classe " + c.toUpperCase() }),
        h("button", { type: "button", class: "ia-x", "aria-label": "Nascondi il codice", text: "✕", onclick: function () { box.remove(); } })
      ]);
      var old = document.querySelector(".ia-qr"); if (old) old.remove();
      document.body.appendChild(box);
    }
    document.addEventListener("slide", function () { var q = document.querySelector(".ia-qr"); if (q && current && slideOf(current.el) !== window.NovaulaDeck.current()) q.remove(); });
    return { start: start, reveal: reveal };
  })();
  function alertBox(text) { var p = panel("Voto dal telefono"); p.body.appendChild(h("p", { text: text })); }

  // ---------- Domande sulle slide ----------
  var Questions = (function () {
    var all = [], cls = null, cl = null, demo = false;
    var KEY = "novaula-domande-demo";
    function badge() {
      var b = document.querySelector(".bar .ask .badge"); if (!b) return;
      var n = all.filter(function (q) { return q.slide === window.NovaulaDeck.current() + 1; }).length;
      b.hidden = !n; b.textContent = n;
    }
    function load() {
      cls = classId();
      return Cloud.get().then(function (c) {
        cl = c; demo = !c;
        if (!cls) { all = []; return badge(); }
        if (demo) {
          try { all = JSON.parse(localStorage.getItem(KEY) || "[]").filter(function (q) { return q.class_id === cls && q.deck === DECK; }); } catch (e) { all = []; }
          return badge();
        }
        return cl.sb.from("slide_questions").select("*").eq("class_id", cls).eq("deck", DECK).order("created_at").then(function (r) { all = r.data || []; badge(); });
      });
    }
    function open() {
      if (!classId()) return askClass(function () { load().then(open); });
      var n = window.NovaulaDeck.current() + 1;
      var s = SLIDES[n - 1], st = ((s.querySelector("h1,h2") || {}).textContent || "").trim().slice(0, 200);
      var p = panel("Domande sulla slide " + n);
      var list = h("div", { class: "q-list" });
      var mine = all.filter(function (q) { return q.slide === n; });
      if (!mine.length) list.appendChild(h("p", { class: "q-empty", text: "Ancora nessuna domanda su questa slide. Rompi il ghiaccio!" }));
      mine.forEach(function (q) { list.appendChild(item(q)); });
      p.body.appendChild(list);
      var name = h("input", { type: "text", maxlength: "40", placeholder: "Il tuo nome", required: true, "aria-label": "Il tuo nome" });
      try { name.value = localStorage.getItem("novaula-nome") || ""; } catch (e) {}
      var body = h("textarea", { maxlength: "800", rows: "3", placeholder: "Scrivi la tua domanda su questa slide…", required: true, "aria-label": "La tua domanda" });
      var msg = h("p", { class: "q-msg", role: "status" });
      var form = h("form", { class: "q-form" }, [name, body, h("button", { type: "submit", class: "ia-btn strong", text: "Invia al docente" }), msg]);
      form.addEventListener("submit", function (e) {
        e.preventDefault();
        var row = { class_id: cls, deck: DECK, slide: n, slide_title: st || null, name: name.value.trim(), body: body.value.trim() };
        if (row.name.length < 2 || row.body.length < 3) { msg.textContent = "Scrivi il tuo nome e la domanda."; return; }
        try { localStorage.setItem("novaula-nome", row.name); } catch (e2) {}
        msg.textContent = "Invio…";
        send(row).then(function () { body.value = ""; msg.textContent = "Inviata! La vedrà il docente e tutta la classe."; return load(); })
          .then(function () { open(); })
          .catch(function (err) { msg.textContent = "Non inviata: " + (err.message || err); });
      });
      p.body.appendChild(form);
      p.body.appendChild(h("p", { class: "q-note", text: "Le domande sono visibili a tutta la classe " + cls.toUpperCase() + "." }));
    }
    function item(q) {
      var kids = [h("p", { class: "q-who" }, [h("b", { text: q.name }), " · " + new Date(q.created_at).toLocaleDateString("it-IT", { day: "numeric", month: "short" })]), h("p", { class: "q-body", text: q.body })];
      if (q.answer) kids.push(h("p", { class: "q-answer" }, [h("b", { text: "Risposta del docente: " }), q.answer]));
      var box = h("div", { class: "q-item" + (q.answer ? " answered" : "") }, kids);
      if (cl && cl.teacher) {
        var ta = h("textarea", { rows: "2", placeholder: "Rispondi…", "aria-label": "Risposta" }); ta.value = q.answer || "";
        box.appendChild(ta);
        box.appendChild(h("div", { class: "q-tools" }, [
          btn("Salva risposta", function () { cl.sb.from("slide_questions").update({ answer: ta.value.trim() || null, answered_at: new Date().toISOString() }).eq("id", q.id).then(function () { load().then(open); }); }, "strong"),
          btn("Elimina", function () { cl.sb.from("slide_questions").delete().eq("id", q.id).then(function () { load().then(open); }); })
        ]));
      }
      return box;
    }
    function send(row) {
      if (demo) {
        var list = []; try { list = JSON.parse(localStorage.getItem(KEY) || "[]"); } catch (e) {}
        list.push(Object.assign({ id: String(Date.now()), created_at: new Date().toISOString(), answer: null }, row));
        localStorage.setItem(KEY, JSON.stringify(list));
        return Promise.resolve();
      }
      return cl.sb.from("slide_questions").insert(row).then(function (r) { if (r.error) throw r.error; });
    }
    return { load: load, open: open, badge: badge };
  })();

  // ---------- Note del docente (tasto N): solo per il docente collegato, o in prova locale ----------
  var Notes = (function () {
    function render() {
      var i = window.NovaulaDeck.current(), n = SLIDES[i] && SLIDES[i].querySelector("aside.notes");
      var p = panel("Note del docente · slide " + (i + 1));
      p.el.classList.add("is-notes");
      var box = h("div", { class: "ia-notes" });
      box.innerHTML = n ? n.innerHTML : "<p>Nessuna nota per questa slide.</p>";
      p.body.appendChild(box);
    }
    function toggle() {
      var open = document.querySelector(".ia-panel.is-notes");
      if (open) { open.remove(); return; }
      Cloud.get().then(function (cl) { if (!cl || cl.teacher) render(); });
    }
    document.addEventListener("slide", function () { if (document.querySelector(".ia-panel.is-notes")) render(); });
    return { toggle: toggle };
  })();

  function init(opts) {
    PRINT = !!opts.print; SLIDES = opts.slides || [].slice.call(document.querySelectorAll("section.slide")); TITLE = opts.title || "";
    [].forEach.call(document.querySelectorAll(".poll"), poll);
    [].forEach.call(document.querySelectorAll(".puzzle-ordina"), ordina);
    [].forEach.call(document.querySelectorAll(".puzzle-abbina"), abbina);
    [].forEach.call(document.querySelectorAll(".puzzle-completa"), completa);
    [].forEach.call(document.querySelectorAll(".puzzle-codice"), codice);
    [].forEach.call(document.querySelectorAll(".flip"), flip);
    [].forEach.call(document.querySelectorAll(".timer"), timer);
    if (PRINT) return;
    document.addEventListener("ask", Questions.open);
    document.addEventListener("keydown", function (e) {
      if ((e.key === "n" || e.key === "N") && !(e.target.closest && e.target.closest("input,textarea,select,[contenteditable]"))) Notes.toggle();
    });
    document.addEventListener("slide", Questions.badge);
    Questions.load();
  }
  window.NovaulaIA = { init: init };
})();
