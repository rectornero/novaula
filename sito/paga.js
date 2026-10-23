/* Novaula · Paga del giorno, solo per il docente (testi in inglese, su richiesta del docente).
   Quando finisce l'ultima lezione del giorno compare sopra le lezioni un riquadro dorato con la paga di oggi e il
   salvadanaio del mese (una moneta per ogni giorno lun–ven), e resta fino a mezzanotte. Al primo sguardo della
   giornata piove qualche moneta. Conti nel database: teacher_wage_today(), vedi aggiornamenti/2026-10-23-paga-card.sql.
   app.js chiama window.NovaulaPaga(contenitore, aiuti) -> funzione di chiusura. */
(function () {
  "use strict";

  var MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  var DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  var CHEERS = ["Day done, well earned!", "School's out. Wallet's in.", "Another day in the piggy bank.", "Bell rang, coins sang.", "Lesson plans: paid."];

  function eur(n) { return "€" + Number(n).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function todayKey() { var d = new Date(); return d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate(); }
  function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } }

  function rain(card) {
    if (window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    var box = document.createElement("div");
    box.className = "pg-rain"; box.setAttribute("aria-hidden", "true");
    for (var i = 0; i < 18; i++) {
      var c = document.createElement("span");
      c.textContent = i % 3 ? "🪙" : "✨";
      c.style.left = (4 + Math.random() * 92) + "%";
      c.style.animationDelay = (Math.random() * 1.2).toFixed(2) + "s";
      c.style.fontSize = (16 + Math.random() * 14).toFixed(0) + "px";
      box.appendChild(c);
    }
    card.appendChild(box);
    setTimeout(function () { box.remove(); }, 4200);
  }

  function render(h, w) {
    var now = new Date();
    var left = w.giorni - w.fatti;
    var cheer = CHEERS[now.getDate() % CHEERS.length];
    var coins = [];
    for (var i = 1; i <= w.giorni; i++) {
      coins.push(h("span", { class: "pg-coin" + (i < w.fatti ? " in" : i === w.fatti ? " in today" : ""), title: i === w.fatti ? "Today" : null }));
    }
    var pct = Math.min(100, Math.round(w.mese / w.stipendio * 100));
    var card = h("section", { class: "pg-card", "aria-label": "Today's wage" },
      h("div", { class: "pg-top" },
        h("div", { class: "pg-jar", "aria-hidden": "true" }, h("span", { class: "pg-drop", text: "🪙" }), h("span", { class: "pg-pig", text: "🐷" })),
        h("div", { class: "pg-head" },
          h("p", { class: "pg-eyebrow", text: DAYS[now.getDay()] + " " + now.getDate() + " " + MONTHS[now.getMonth()] + " · school's out since " + w.ends }),
          h("p", { class: "pg-title", text: cheer }),
          h("p", { class: "pg-amount" }, h("span", { class: "pg-plus", text: "+" }), eur(w.oggi)))),
      h("div", { class: "pg-month" },
        h("div", { class: "pg-row" },
          h("span", null, h("b", { text: MONTHS[w.mese_n - 1] + " so far " }), eur(w.mese), h("span", { class: "pg-of", text: " of " + eur(w.stipendio) })),
          h("span", { class: "pg-left", text: left ? left + (left === 1 ? " working day to go" : " working days to go") : "Full month earned! 🎉" })),
        h("div", { class: "pg-bar", role: "progressbar", "aria-valuemin": "0", "aria-valuemax": "100", "aria-valuenow": String(pct) }, h("i", { style: "width:" + pct + "%" })),
        h("div", { class: "pg-coins", "aria-label": w.fatti + " of " + w.giorni + " working days" }, coins)));
    return card;
  }

  window.NovaulaPaga = function (box, x) {
    var h = x.h, timer = null, stopped = false, holder = h("div", { class: "pg-holder" });
    box.appendChild(holder);
    function at(ms, fn) { clearTimeout(timer); timer = setTimeout(fn, Math.max(1000, Math.min(ms, 6 * 3600 * 1000))); }
    function midnight() { var d = new Date(); d.setHours(24, 0, 5, 0); return d - Date.now(); }
    async function check() {
      if (stopped) return;
      var res = await x.sb.rpc("teacher_wage_today");
      if (stopped || res.error || !res.data || !res.data.workday) { holder.textContent = ""; if (!stopped) at(midnight(), check); return; }
      var w = res.data;
      if (!w.done) {
        holder.textContent = "";
        var p = w.ends.split(":"), end = new Date(); end.setHours(+p[0], +p[1], 2, 0);
        at(end - Date.now(), check);
        return;
      }
      var card = render(h, w);
      holder.replaceChildren(card);
      var key = "novaula-paga-vista-" + todayKey();
      if (!store(key)) { store(key, "1"); rain(card); }
      at(midnight(), check); // a mezzanotte sparisce
    }
    check().catch(function () {});
    return function () { stopped = true; clearTimeout(timer); };
  };
})();
