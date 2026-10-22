/* Novaula · lezioni: visualizzatore delle slide (frecce, swipe, schermo intero, PDF, segnalibro).
   Con ?pdf nell'indirizzo mostra tutte le slide una sotto l'altra per la stampa. */
(function () {
  "use strict";
  var slides = [].slice.call(document.querySelectorAll("section.slide"));
  var title = document.title.replace(/\s*·\s*Novaula$/, "");
  slides.forEach(function (s, i) {
    var f = document.createElement("div");
    f.className = "foot";
    f.innerHTML = "<span></span><span></span>";
    f.firstChild.textContent = title;
    f.lastChild.textContent = (i + 1) + " / " + slides.length;
    s.appendChild(f);
  });
  var printMode = /[?&](pdf|print)\b/.test(location.search);
  // Parti interattive (sondaggi, quiz, puzzle, domande): interattivo.js
  var ia = document.createElement("script");
  ia.src = "interattivo.js";
  ia.onload = function () { if (window.NovaulaIA) window.NovaulaIA.init({ print: printMode, slides: slides, title: title }); };
  document.head.appendChild(ia);
  if (printMode) { document.body.classList.add("print"); return; }

  var pdf = document.body.getAttribute("data-pdf") || location.pathname.split("/").pop().replace(/\.html?$/, ".pdf");
  var viewer = el("div", "viewer"), stage = el("div", "stage"), bar = el("div", "bar");
  slides.forEach(function (s) { stage.appendChild(s); });
  bar.innerHTML =
    '<div class="prog"></div>' +
    '<button type="button" class="close" data-a="close" aria-label="Chiudi la lezione">✕ <span class="hide-s">Chiudi</span></button>' +
    '<button type="button" data-a="prev" aria-label="Slide precedente">←</button>' +
    '<span class="n"></span>' +
    '<button type="button" data-a="next" aria-label="Slide successiva">→</button>' +
    '<button type="button" class="mark" data-a="mark" aria-pressed="false" aria-label="Metti un segnalibro su questa slide">🔖<b class="mark-n" hidden></b></button>' +
    '<span class="t"></span>' +
    '<a download aria-label="Scarica il PDF">PDF</a>' +
    '<button type="button" class="hand" data-a="hand" hidden aria-label="Consegna l\'esercizio di questa slide">📎 Consegna</button>' +
    '<button type="button" class="ask" data-a="ask" aria-label="Domande su questa slide">? <span class="hide-s">Domande</span><b class="badge" hidden></b></button>' +
    '<button type="button" data-a="full" aria-label="Schermo intero">⛶</button>';
  bar.querySelector(".t").textContent = title;
  bar.querySelector("a").href = pdf;
  viewer.appendChild(stage); viewer.appendChild(bar);
  document.body.appendChild(viewer);

  var cur = Math.min(Math.max(parseInt(location.hash.slice(1), 10) || 1, 1), slides.length) - 1;
  var fromHash = /^#\d+$/.test(location.hash);
  // Segnalibro: una slide per lezione, salvata su questo dispositivo (tasto B o 🔖 nella barra)
  var markKey = "novaula-segnalibro:" + location.pathname;
  var mark = readMark();
  function readMark() {
    var v = null;
    try { v = parseInt(localStorage.getItem(markKey), 10); } catch (e) {}
    return v >= 1 && v <= slides.length ? v - 1 : null;
  }
  function setMark(i) {
    mark = i;
    try { if (i === null) localStorage.removeItem(markKey); else localStorage.setItem(markKey, String(i + 1)); } catch (e) {}
    drawMark();
  }
  function toggleMark() {
    if (mark === cur) { setMark(null); toast("Segnalibro tolto"); }
    else { setMark(cur); toast("🔖 Segnalibro sulla slide " + (cur + 1) + ": la prossima volta riparti da qui"); }
  }
  function drawMark() {
    var b = bar.querySelector(".mark"), n = b.querySelector(".mark-n"), here = mark === cur;
    b.classList.toggle("on", here);
    b.setAttribute("aria-pressed", here ? "true" : "false");
    b.setAttribute("aria-label", here ? "Togli il segnalibro da questa slide" : "Metti un segnalibro su questa slide");
    b.title = here ? "Segnalibro su questa slide (B per toglierlo)" : mark === null ? "Metti un segnalibro (B)" : "Sposta qui il segnalibro (ora è sulla slide " + (mark + 1) + ")";
    n.hidden = mark === null || here;
    n.textContent = mark === null ? "" : String(mark + 1);
    slides.forEach(function (s, j) { s.classList.toggle("marked", j === mark); });
  }
  function toast(text, actions) {
    var old = document.querySelector(".mark-toast");
    if (old) old.remove();
    var t = el("div", "mark-toast");
    t.setAttribute("role", "status");
    var p = el("span", ""); p.textContent = text; t.appendChild(p);
    (actions || []).forEach(function (a) {
      var b = el("button", a.cls || ""); b.type = "button"; b.textContent = a.label;
      b.addEventListener("click", function (e) { e.stopPropagation(); t.remove(); if (a.fn) a.fn(); });
      t.appendChild(b);
    });
    viewer.appendChild(t);
    setTimeout(function () { if (t.parentNode) t.remove(); }, actions ? 10000 : 2500);
  }
  function el(tag, cls) { var e = document.createElement(tag); e.className = cls; return e; }
  function fit() {
    var w = stage.clientWidth, h = stage.clientHeight, k = Math.min(w / 1920, h / 1080) * (w > 700 ? 0.97 : 1);
    slides.forEach(function (s) { s.style.transform = "translate(-50%,-50%) scale(" + k + ")"; });
  }
  function show(i) {
    cur = Math.min(Math.max(i, 0), slides.length - 1);
    slides.forEach(function (s, j) { s.classList.toggle("on", j === cur); });
    bar.querySelector(".n").textContent = (cur + 1) + " / " + slides.length;
    bar.querySelector(".prog").style.width = ((cur + 1) / slides.length * 100) + "%";
    history.replaceState(null, "", "#" + (cur + 1));
    drawMark();
    var hand = canHandIn(slides[cur]);
    bar.querySelector(".hand").hidden = !hand; bar.classList.toggle("can-hand", hand);
    document.dispatchEvent(new CustomEvent("slide", { detail: { index: cur, slide: slides[cur] } }));
  }
  // Consegna: sulle slide di laboratorio ("Al computer") e su quelle con data-consegna; data-consegna="no" la toglie
  function canHandIn(s) { var d = s.getAttribute("data-consegna"); return d === "no" ? false : d !== null || s.classList.contains("lab"); }
  window.NovaulaDeck = { current: function () { return cur; }, go: function (i) { show(i); }, bar: bar, canHandIn: canHandIn, mark: function () { return mark; } };
  // Chiudi: la scheda aperta dal sito si chiude; altrimenti si torna alla pagina della classe
  function close() {
    var d = document, m = /[?&]da=([^&#]+)/.exec(location.search);
    var back = "../../" + (m ? "#/" + decodeURIComponent(m[1]).replace(/[^a-z0-9/]/gi, "") : "");
    if (d.fullscreenElement || d.webkitFullscreenElement) (d.exitFullscreen || d.webkitExitFullscreen).call(d);
    try { window.close(); } catch (e) {}
    setTimeout(function () {
      var sameSite = d.referrer && d.referrer.indexOf(location.origin) === 0;
      if (sameSite && history.length > 1) history.back(); else location.href = back;
    }, 150);
  }
  function full() {
    var d = document, r = d.documentElement;
    if (d.fullscreenElement || d.webkitFullscreenElement) (d.exitFullscreen || d.webkitExitFullscreen).call(d);
    else if (r.requestFullscreen || r.webkitRequestFullscreen) (r.requestFullscreen || r.webkitRequestFullscreen).call(r);
  }
  bar.addEventListener("click", function (e) {
    var t = e.target.closest("[data-a]"), a = t && t.getAttribute("data-a");
    if (a === "prev") show(cur - 1);
    if (a === "next") show(cur + 1);
    if (a === "full") full();
    if (a === "close") close();
    if (a === "mark") toggleMark();
    if (a === "ask") document.dispatchEvent(new CustomEvent("ask"));
    if (a === "hand") document.dispatchEvent(new CustomEvent("hand"));
  });
  stage.addEventListener("click", function (e) {
    if (e.target.closest("a,button,input,textarea,select,label,.ia")) return;
    show(e.clientX > stage.clientWidth / 3 ? cur + 1 : cur - 1);
  });
  document.addEventListener("keydown", function (e) {
    var k = e.key;
    if (e.target.closest && e.target.closest("input,textarea,select,[contenteditable],.ia-panel")) return;
    if (k === "ArrowRight" || k === "PageDown" || k === " " || k === "Enter") { show(cur + 1); e.preventDefault(); }
    else if (k === "ArrowLeft" || k === "PageUp" || k === "Backspace") { show(cur - 1); e.preventDefault(); }
    else if (k === "Home") show(0);
    else if (k === "End") show(slides.length - 1);
    else if (k === "f" || k === "F") full();
    else if (k === "b" || k === "B") toggleMark();
    else if (k === "Escape" && !(document.fullscreenElement || document.webkitFullscreenElement)) close();
  });
  var x0 = null, y0 = 0;
  stage.addEventListener("touchstart", function (e) { if (e.target.closest(".ia")) { x0 = null; return; } x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; }, { passive: true });
  stage.addEventListener("touchend", function (e) {
    if (x0 === null) return;
    var dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) { show(dx < 0 ? cur + 1 : cur - 1); e.preventDefault(); }
    x0 = null;
  });
  window.addEventListener("resize", fit);
  fit(); show(cur);
  // Aprendo la lezione senza un numero di slide nell'indirizzo, propone di riprendere dal segnalibro
  if (!fromHash && mark !== null && mark !== cur) {
    toast("🔖 Segnalibro alla slide " + (mark + 1), [
      { label: "Riprendi da lì", cls: "go", fn: function () { show(mark); } },
      { label: "Dall'inizio" }
    ]);
  }
})();
