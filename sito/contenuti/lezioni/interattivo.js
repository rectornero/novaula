/* Novaula · lezioni: parti interattive delle slide.
   Sondaggi e quiz (.poll), puzzle (.puzzle-ordina, .puzzle-abbina, .puzzle-completa con .blank, .puzzle-codice,
   .puzzle-categorie e .puzzle-trascina da trascinare),
   carte da girare (.flip), timer (.timer), voto dal telefono, domande sulle slide e consegne dalle slide di laboratorio.
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
    say(msg, "Trascina le voci, oppure tocca due voci per scambiarle.");
    sortable(el, "li", function () { clear(); });
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
    say(msg, "Trascina le voci a destra (o tocca due voci per scambiarle) finché ogni riga è giusta.");
    sortable(right, ".ab-item", function () { [].forEach.call(right.children, function (x) { x.classList.remove("right", "wrong", "sel"); }); sel = null; });
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

  // ---------- Trascinamento (mouse, dito, penna della LIM) ----------
  // drag(item, {onMove(x, y, ghost), onDrop(x, y), onTap()}): sotto i 6 px è un tocco, oltre parte il trascinamento
  // con una copia che segue il puntatore. Il tocco resta come alternativa (accessibilità, LIM poco precise).
  function drag(item, cb) {
    item.style.touchAction = "none";
    item.addEventListener("pointerdown", function (e) {
      if (e.button > 0) return;
      var x0 = e.clientX, y0 = e.clientY, ghost = null, r = item.getBoundingClientRect(), dx = x0 - r.left, dy = y0 - r.top;
      var scale = r.width / (item.offsetWidth || r.width) || 1;
      e.preventDefault();
      function move(ev) {
        if (!ghost && Math.hypot(ev.clientX - x0, ev.clientY - y0) < 6) return;
        if (!ghost) {
          ghost = item.cloneNode(true);
          ghost.classList.add("ia-ghost");
          ghost.style.width = item.offsetWidth + "px";
          ghost.style.transform = "scale(" + scale + ")";
          document.body.appendChild(ghost);
          item.classList.add("ia-dragging");
        }
        ghost.style.left = (ev.clientX - dx) + "px";
        ghost.style.top = (ev.clientY - dy) + "px";
        if (cb.onMove) cb.onMove(ev.clientX, ev.clientY);
      }
      function up(ev) {
        document.removeEventListener("pointermove", move);
        document.removeEventListener("pointerup", up);
        document.removeEventListener("pointercancel", up);
        if (ghost) {
          // il click che il browser manda dopo un trascinamento non deve contare come tocco
          var stop = function (ce) { ce.stopPropagation(); ce.preventDefault(); };
          window.addEventListener("click", stop, true);
          setTimeout(function () { window.removeEventListener("click", stop, true); }, 0);
          ghost.remove(); item.classList.remove("ia-dragging");
          if (ev.type === "pointerup" && cb.onDrop) cb.onDrop(ev.clientX, ev.clientY);
          if (cb.onEnd) cb.onEnd();
        } else if (ev.type === "pointerup" && cb.onTap) cb.onTap();
      }
      document.addEventListener("pointermove", move);
      document.addEventListener("pointerup", up);
      document.addEventListener("pointercancel", up);
    });
  }
  function under(x, y, sel, root) {
    var t = document.elementFromPoint(x, y), m = t && t.closest(sel);
    return m && (!root || root.contains(m)) ? m : null;
  }
  // Riordino trascinando dentro un contenitore (usato da ordina e abbina)
  function sortable(box, itemSel, after) {
    [].forEach.call(box.querySelectorAll(itemSel), function (it) {
      drag(it, {
        onMove: function (x, y) {
          var o = under(x, y, itemSel, box);
          if (!o || o === it || o.parentNode !== box) return;
          // appena entri in un'altra voce prendi il suo posto: sopra se arrivi dal basso, sotto se arrivi dall'alto
          var before = !!(o.compareDocumentPosition(it) & Node.DOCUMENT_POSITION_FOLLOWING);
          box.insertBefore(it, before ? o : o.nextSibling);
          if (after) after();
        }
      });
    });
  }

  // ---------- Dividi in categorie (trascina le carte nei contenitori giusti) ----------
  // <div class="puzzle-categorie" data-id="…" [style="--cols:3"]>
  //   <div class="cat"><h4>Costi fissi</h4><ul><li>Affitto</li>…</ul></div> … </div>
  // Le carte giuste sono scritte dentro la loro categoria; la pagina le toglie, le mescola e le mette nel mazzo.
  function categorie(el) {
    var cats = [].slice.call(el.querySelectorAll(":scope > .cat")), cards = [];
    el.classList.add("ia");
    cats.forEach(function (c, ci) {
      var ul = c.querySelector("ul") || c.appendChild(h("ul"));
      ul.classList.add("cat-drop");
      [].slice.call(ul.children).forEach(function (li) { li.classList.add("chip"); li.dataset.k = ci; cards.push(li); li.remove(); });
    });
    var pool = h("ul", { class: "cat-pool cat-drop" });
    var poolBox = h("div", { class: "cat-pool-box" }, [h("p", { class: "cat-pool-label", text: PRINT ? "Carte da sistemare" : "Trascina ogni carta nel contenitore giusto" }), pool]);
    el.insertBefore(poolBox, el.firstChild);
    shuffled(cards.length, DECK + (el.getAttribute("data-id") || el.textContent)).forEach(function (k) { pool.appendChild(cards[k]); });
    if (PRINT) return;
    var sel = null, t = tools(el.parentNode.insertBefore(h("div", { class: "ia-wrap" }), el.nextSibling)), msg = h("span", { class: "ia-msg" });
    t.appendChild(btn("Controlla", check, "strong"));
    t.appendChild(btn("Soluzione", function () { cards.forEach(function (c) { cats[+c.dataset.k].querySelector(".cat-drop").appendChild(c); }); check(); }));
    t.appendChild(btn("Ricomincia", function () { shuffled(cards.length, String(Math.random())).forEach(function (k) { pool.appendChild(cards[k]); }); clear(); say(msg, ""); }));
    t.appendChild(msg);
    function clear() { cards.forEach(function (c) { c.classList.remove("right", "wrong", "sel"); }); sel = null; el.classList.remove("picking"); }
    function place(card, zone) { zone.appendChild(card); clear(); }
    cards.forEach(function (c) {
      drag(c, {
        onMove: function (x, y) { [].forEach.call(el.querySelectorAll(".cat-drop"), function (z) { z.classList.remove("over"); }); var z = under(x, y, ".cat,.cat-pool-box", el); if (z) z.querySelector(".cat-drop").classList.add("over"); },
        onDrop: function (x, y) { var z = under(x, y, ".cat,.cat-pool-box", el); if (z) place(c, z.querySelector(".cat-drop")); },
        onEnd: function () { [].forEach.call(el.querySelectorAll(".cat-drop"), function (z) { z.classList.remove("over"); }); },
        onTap: function () { var was = sel === c; clear(); if (!was) { sel = c; c.classList.add("sel"); el.classList.add("picking"); } }
      });
    });
    // Tocco: scegli una carta, poi tocca il contenitore
    el.addEventListener("click", function (e) {
      if (!sel || e.target.closest(".chip")) return;
      var z = e.target.closest(".cat,.cat-pool-box"); if (z) place(sel, z.querySelector(".cat-drop"));
    });
    function check() {
      var ok = 0, placed = 0;
      cards.forEach(function (c) {
        var cat = c.closest(".cat"); c.classList.remove("sel");
        if (!cat) { c.classList.remove("right", "wrong"); return; }
        placed++;
        var g = cats.indexOf(cat) === +c.dataset.k; c.classList.toggle("right", g); c.classList.toggle("wrong", !g); if (g) ok++;
      });
      say(msg, ok === cards.length ? "Tutto al posto giusto!" : ok + " su " + cards.length + " giuste" + (placed < cards.length ? " (" + (cards.length - placed) + " ancora nel mazzo)" : "") + ".", ok === cards.length ? "ok" : "");
    }
  }

  // ---------- Trascina le parole (nei buchi di un testo o sulle etichette di uno schema) ----------
  // <div class="puzzle-trascina" data-extra="distrattore|altro"> … <span class="slot" data-risposta="Gantt"></span> … </div>
  // Le parole del mazzo sono le risposte (la prima alternativa) più gli eventuali distrattori in data-extra.
  // Uno .slot può stare anche sopra un disegno (position:absolute con left/top) per etichettare uno schema.
  function trascina(el) {
    var slots = [].slice.call(el.querySelectorAll(".slot"));
    el.classList.add("ia");
    var words = slots.map(function (s) { return (s.getAttribute("data-risposta") || "").split("|")[0]; });
    (el.getAttribute("data-extra") || "").split("|").forEach(function (w) { if (w.trim()) words.push(w.trim()); });
    slots.forEach(function (s) {
      // largo quanto la carta che ci va (la prima risposta), non quanto le alternative
      s.style.setProperty("--w", Math.max(4, (s.getAttribute("data-risposta") || "").split("|")[0].length + 2) + "ch");
    });
    var bank = h("div", { class: "word-bank" });
    var chips = words.map(function (w) { return h("span", { class: "chip word", text: w }); });
    shuffled(chips.length, DECK + (el.getAttribute("data-id") || el.textContent)).forEach(function (k) { bank.appendChild(chips[k]); });
    el.insertBefore(bank, el.firstChild);
    if (PRINT) return;
    var sel = null, t = tools(el), msg = h("span", { class: "ia-msg" });
    t.appendChild(btn("Controlla", check, "strong"));
    t.appendChild(btn("Soluzione", function () {
      chips.forEach(function (c) { bank.appendChild(c); });
      slots.forEach(function (s, i) { s.appendChild(chips[i]); });
      check();
    }));
    t.appendChild(btn("Ricomincia", function () { chips.forEach(function (c) { bank.appendChild(c); }); clear(); say(msg, ""); }));
    t.appendChild(msg);
    function clear() { slots.forEach(function (s) { s.classList.remove("right", "wrong", "over"); }); chips.forEach(function (c) { c.classList.remove("sel"); }); sel = null; el.classList.remove("picking"); }
    function put(chip, slot) {
      var old = slot.querySelector(".chip");
      if (old && old !== chip) { var from = chip.parentNode; if (from && from.classList.contains("slot")) from.appendChild(old); else bank.appendChild(old); }
      slot.appendChild(chip); clear();
    }
    chips.forEach(function (c) {
      drag(c, {
        onMove: function (x, y) { slots.forEach(function (s) { s.classList.remove("over"); }); var s = under(x, y, ".slot", el); if (s) s.classList.add("over"); },
        onDrop: function (x, y) { var s = under(x, y, ".slot", el); if (s) put(c, s); else if (under(x, y, ".word-bank", el)) { bank.appendChild(c); clear(); } },
        onEnd: function () { slots.forEach(function (s) { s.classList.remove("over"); }); },
        onTap: function () {
          if (c.parentNode.classList.contains("slot") && !sel) { bank.appendChild(c); clear(); return; }
          var was = sel === c; clear(); if (!was) { sel = c; c.classList.add("sel"); el.classList.add("picking"); }
        }
      });
    });
    slots.forEach(function (s) { s.addEventListener("click", function (e) { if (sel && !e.target.closest(".chip")) put(sel, s); }); });
    function check() {
      var ok = 0;
      slots.forEach(function (s) {
        var c = s.querySelector(".chip"), v = c ? norm(c.textContent) : "";
        var g = !!c && (s.getAttribute("data-risposta") || "").split("|").some(function (a) { return norm(a) === v; });
        s.classList.toggle("right", g); s.classList.toggle("wrong", !!c && !g); if (g) ok++;
      });
      say(msg, ok === slots.length ? "Tutto giusto!" : ok + " su " + slots.length + " giuste.", ok === slots.length ? "ok" : "");
    }
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

  // ---------- Consegna dalle slide di laboratorio ----------
  // Lo studente consegna dal suo profilo (stessa sessione del sito) o scrivendo nome e cognome;
  // se il nome ha un profilo con PIN, chiede il PIN. I file vanno nel bucket "consegne".
  var HandIn = (function () {
    var MAX_FILES = 10, MAX_MB = 20;
    var people = null;
    function skey(c) { return "novaula-profilo-" + c; }
    function getSession(c) {
      var raw = null;
      try { raw = sessionStorage.getItem(skey(c)) || localStorage.getItem(skey(c)); } catch (e) {}
      try { return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
    }
    function setSession(c, s) {
      try { sessionStorage.removeItem(skey(c)); if (s) sessionStorage.setItem(skey(c), JSON.stringify(s)); } catch (e) {}
    }
    function forget(c) { try { sessionStorage.removeItem(skey(c)); localStorage.removeItem(skey(c)); } catch (e) {} }
    function nameKey(a, b) { return (String(a || "").trim() + " " + String(b || "").trim()).replace(/\s+/g, " ").toLowerCase(); }
    function safeName(n) { return String(n || "file").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(-80) || "file"; }
    function rnd() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
    function size(b) { return b > 1048576 ? (b / 1048576).toFixed(1).replace(".", ",") + " MB" : Math.max(1, Math.round(b / 1024)) + " KB"; }
    function when(t) { return new Date(t).toLocaleString("it-IT", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }); }
    async function sha256(buf) {
      var d = await crypto.subtle.digest("SHA-256", buf);
      return Array.prototype.map.call(new Uint8Array(d), function (b) { return ("0" + b.toString(16)).slice(-2); }).join("");
    }
    async function deviceHash() {
      var id;
      try { id = localStorage.getItem("novaula-dispositivo"); } catch (e) {}
      if (!id) { id = rnd(); try { localStorage.setItem("novaula-dispositivo", id); } catch (e) {} }
      try { return (await sha256(new TextEncoder().encode("novaula:" + id))).slice(0, 32); } catch (e) { return null; }
    }
    function slideInfo(i) {
      var s = SLIDES[i], t = ((s.querySelector("h1,h2") || {}).textContent || "").replace(/\s+/g, " ").trim();
      var c = s.cloneNode(true);
      [].forEach.call(c.querySelectorAll("aside.notes,.foot,.ia-tools,.lab-tag,script,style"), function (x) { x.remove(); });
      [].forEach.call(c.querySelectorAll("*"), function (x) { x.appendChild(document.createTextNode(" ")); });
      var text = (c.textContent || "").replace(/\s+/g, " ").trim();
      return { n: i + 1, heading: t, title: (TITLE + " · slide " + (i + 1) + (t ? ": " + t : "")).slice(0, 200), text: ("Esercizio della slide " + (i + 1) + " della lezione «" + TITLE + "». " + text).slice(0, 3900) };
    }
    function open() {
      var c = classId();
      if (!c) return askClass(function () { open(); });
      Cloud.get().then(function (cl) {
        var info = slideInfo(window.NovaulaDeck.current());
        var p = panel("Consegna · slide " + info.n);
        p.el.classList.add("is-hand");
        if (!cl) { p.body.appendChild(h("p", { text: "La consegna funziona sul sito pubblicato di Novaula." })); return; }
        if (cl.teacher) return teacherView(cl, c, info, p);
        form(cl, c, info, p);
      });
    }

    function form(cl, c, info, p) {
      var sess = getSession(c), files = [];
      p.body.appendChild(h("p", { class: "h-what" }, [h("b", { text: info.heading || TITLE }), h("br"), h("span", { class: "q-note", text: "Classe " + c.toUpperCase() + " · " + TITLE })]));
      var status = h("div", { class: "h-status" });
      p.body.appendChild(status);
      var first = h("input", { type: "text", maxlength: "40", placeholder: "Nome", autocomplete: "given-name", autocapitalize: "words", "aria-label": "Nome" });
      var last = h("input", { type: "text", maxlength: "40", placeholder: "Cognome", autocomplete: "family-name", autocapitalize: "words", "aria-label": "Cognome" });
      var pin = h("input", { type: "password", inputmode: "numeric", pattern: "\\d{4}", maxlength: "4", autocomplete: "off", placeholder: "PIN del tuo profilo", "aria-label": "PIN" });
      var pinRow = h("label", { class: "h-pin", hidden: true }, ["Il tuo profilo ha il PIN: scrivilo", pin]);
      var who = h("div", { class: "h-who" });
      function paintWho() {
        who.textContent = "";
        if (sess) {
          who.appendChild(h("p", { class: "h-me" }, ["Consegni come ", h("b", { text: sess.first_name + " " + sess.last_name }), " · ",
            h("button", { type: "button", class: "h-link", text: "non sei tu?", onclick: function () { forget(c); sess = null; status.textContent = ""; paintWho(); } })]));
        } else {
          who.appendChild(h("div", { class: "h-names" }, [first, last]));
          who.appendChild(pinRow);
          try { var nm = (localStorage.getItem("novaula-nome-cognome") || "").split("|"); if (nm.length === 2 && !first.value) { first.value = nm[0]; last.value = nm[1]; } } catch (e) {}
          checkName();
        }
      }
      // Se il nome corrisponde a un profilo con PIN, chiede il PIN
      function match() { var k = nameKey(first.value, last.value); return (people || []).filter(function (x) { return nameKey(x.first_name, x.last_name) === k; })[0] || null; }
      function checkName() { var m = match(); pinRow.hidden = !(m && m.has_pin); }
      first.addEventListener("input", checkName); last.addEventListener("input", checkName);
      if (!people) cl.sb.rpc("class_students", { p_class: c }).then(function (r) { people = r.data || []; checkName(); });

      var pick = h("input", { type: "file", multiple: true, class: "h-file", "aria-label": "Allega file" });
      var list = h("ul", { class: "h-files" });
      var pickBtn = h("label", { class: "ia-btn h-add" }, ["📎 Allega file o foto", pick]);
      function paintFiles() {
        list.textContent = "";
        files.forEach(function (f, k) {
          list.appendChild(h("li", null, [h("span", { class: "h-fn", text: f.name }), h("span", { class: "q-note", text: size(f.size) }),
            h("button", { type: "button", class: "ia-x", "aria-label": "Togli " + f.name, text: "✕", onclick: function () { files.splice(k, 1); paintFiles(); } })]));
        });
        pickBtn.firstChild.textContent = files.length ? "📎 Aggiungi altri file" : "📎 Allega file o foto";
      }
      pick.addEventListener("change", function () {
        [].forEach.call(pick.files, function (f) {
          if (files.length >= MAX_FILES) return say2("Al massimo " + MAX_FILES + " file.");
          if (f.size > MAX_MB * 1048576) return say2("«" + f.name + "» supera " + MAX_MB + " MB.");
          files.push(f);
        });
        pick.value = ""; paintFiles();
      });
      var note = h("textarea", { maxlength: "2000", rows: "5", placeholder: "Commento, oppure scrivi qui la risposta…", "aria-label": "Commento o risposta" });
      var msg = h("p", { class: "q-msg", role: "status" });
      function say2(t, good) { msg.textContent = t; msg.classList.toggle("bad", !good); }
      var send = h("button", { type: "submit", class: "ia-btn strong", text: "Consegna al docente" });
      var f = h("form", { class: "q-form h-form" }, [who,
        h("label", { class: "h-lab" }, ["Testo", note]),
        h("div", { class: "h-lab" }, ["File (foto, PDF, codice… max " + MAX_MB + " MB l'uno)", list, pickBtn]),
        send, msg]);
      p.body.appendChild(f);
      p.body.appendChild(h("p", { class: "q-note", text: "La consegna la vede solo il docente." }));
      paintWho();
      if (sess) cl.sb.rpc("slide_status", { p_class: c, p_deck: DECK, p_student: sess.id, p_token: sess.token }).then(function (r) {
        var mine = (r.data || []).filter(function (x) { return x.slide === info.n; });
        if (!mine.length) return;
        var lastS = mine[mine.length - 1];
        status.appendChild(h("p", { class: "h-done" + (lastS.status === "da_rifare" ? " redo" : "") },
          lastS.status === "da_rifare" ? "Il docente ti chiede di rifarla. Consegna di nuovo qui sotto." : "✓ Già consegnata " + when(lastS.created_at) + (lastS.attempt > 1 ? " (tentativo " + lastS.attempt + ")" : "") + ". Puoi consegnare di nuovo."));
      });

      f.addEventListener("submit", async function (e) {
        e.preventDefault();
        if (!files.length && !note.value.trim()) return say2("Allega un file oppure scrivi la risposta.");
        if (!sess && (first.value.trim().length < 2 || last.value.trim().length < 2)) return say2("Scrivi nome e cognome.");
        send.disabled = true;
        try {
          // Profilo con PIN: si entra con il PIN prima di caricare i file
          if (!sess) {
            var m = match();
            if (m && m.has_pin) {
              if (!/^\d{4}$/.test(pin.value)) { pinRow.hidden = false; pin.focus(); throw new Error("Scrivi il PIN del tuo profilo (4 cifre)."); }
              var u = await cl.sb.rpc("student_unlock", { p_student: m.id, p_pin: pin.value });
              if (u.error) throw u.error;
              if (u.data && u.data.error) throw new Error(u.data.error);
              sess = { id: m.id, token: u.data.token, first_name: m.first_name, last_name: m.last_name };
              setSession(c, sess);
            }
            try { localStorage.setItem("novaula-nome-cognome", first.value.trim() + "|" + last.value.trim()); } catch (e2) {}
          }
          var up = [], dir = c + "/slide/" + DECK + "-" + info.n + "/";
          for (var k = 0; k < files.length; k++) {
            say2("Carico " + (files.length > 1 ? "il file " + (k + 1) + " di " + files.length : "il file") + "…", true);
            var fl = files[k], sha = null;
            try { sha = await sha256(await fl.arrayBuffer()); } catch (e3) { sha = null; }
            var path = dir + rnd() + "-" + safeName(fl.name);
            var r = await cl.sb.storage.from("consegne").upload(path, fl, { contentType: fl.type || undefined });
            if (r.error) throw r.error;
            up.push({ path: path, name: fl.name.slice(0, 200), size: fl.size, sha: sha });
          }
          say2("Invio…", true);
          var res = await cl.sb.rpc("slide_submit", { p_class: c, p_deck: DECK, p_slide: info.n, p_title: info.title, p_text: info.text,
            p_student: sess ? sess.id : null, p_token: sess ? sess.token : null, p_first: sess ? null : first.value, p_last: sess ? null : last.value,
            p_note: note.value, p_files: up, p_device: await deviceHash() });
          if (res.error) throw res.error;
          files = []; paintFiles(); note.value = "";
          status.replaceChildren(h("p", { class: "h-done" }, "✓ Consegnata adesso. Grazie, " + String(res.data.name || "").split(" ")[0] + "!" + (res.data.attempt > 1 ? " (tentativo " + res.data.attempt + ")" : "")));
          say2("", true);
        } catch (err) {
          var t = (err && err.message) || String(err);
          if (/Sessione scaduta/.test(t)) { forget(c); sess = null; paintWho(); t = "Sessione scaduta: scrivi di nuovo nome e cognome."; }
          if (/profilo con PIN/.test(t)) { people = null; cl.sb.rpc("class_students", { p_class: c }).then(function (r2) { people = r2.data || []; checkName(); }); }
          if (/Failed to fetch|NetworkError|Load failed/i.test(t)) t = "Connessione assente: riprova quando sei online.";
          say2("Non consegnata: " + t);
        }
        send.disabled = false;
      });
    }

    // Docente (LIM): chi ha già consegnato questa slide
    function teacherView(cl, c, info, p) {
      var box = h("div", { class: "q-list" }, h("p", { class: "q-note", text: "Caricamento…" }));
      p.body.appendChild(h("p", { class: "h-what" }, [h("b", { text: info.heading || TITLE }), h("br"), h("span", { class: "q-note", text: "Classe " + c.toUpperCase() }) ]));
      p.body.appendChild(box);
      p.body.appendChild(h("a", { class: "ia-btn wide", href: "../../#/c/" + c + "/compiti", target: "_blank", rel: "noopener", text: "Apri le consegne in Compiti" }));
      cl.sb.from("assignments").select("id, submissions(student_name, created_at, attempt, file_name, files, note)").eq("class_id", c).eq("deck", DECK).eq("slide", info.n).maybeSingle().then(function (r) {
        box.textContent = "";
        var subs = (r.data && r.data.submissions) || [];
        if (r.error) { box.appendChild(h("p", { class: "q-note", text: "Manca l'aggiornamento del database (2026-10-21-consegne-slide.sql)." })); return; }
        if (!subs.length) { box.appendChild(h("p", { class: "q-empty", text: "Ancora nessuna consegna per questa slide." })); return; }
        subs.sort(function (a, b) { return a.created_at < b.created_at ? 1 : -1; });
        box.appendChild(h("p", { class: "q-note", text: subs.length + (subs.length === 1 ? " consegna" : " consegne") }));
        subs.forEach(function (s) {
          var nf = (s.files && s.files.length) || (s.file_name ? 1 : 0);
          box.appendChild(h("div", { class: "q-item" }, [h("p", { class: "q-who" }, [h("b", { text: s.student_name }), " · " + when(s.created_at) + (nf ? " · " + nf + " file" : "") + (s.note ? " · testo" : "")])]));
        });
      });
    }
    // Cambiando slide il pannello si chiude (era per un'altra slide)
    document.addEventListener("slide", function () { var o = document.querySelector(".ia-panel.is-hand"); if (o) o.remove(); });
    return { open: open };
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
    [].forEach.call(document.querySelectorAll(".puzzle-categorie"), categorie);
    [].forEach.call(document.querySelectorAll(".puzzle-trascina"), trascina);
    [].forEach.call(document.querySelectorAll(".flip"), flip);
    [].forEach.call(document.querySelectorAll(".timer"), timer);
    if (PRINT) return;
    document.addEventListener("ask", Questions.open);
    document.addEventListener("hand", HandIn.open);
    document.addEventListener("keydown", function (e) {
      if ((e.key === "n" || e.key === "N") && !(e.target.closest && e.target.closest("input,textarea,select,[contenteditable]"))) Notes.toggle();
    });
    document.addEventListener("slide", Questions.badge);
    Questions.load();
  }
  window.NovaulaIA = { init: init };
})();
