/* Novaula · Piano delle verifiche, solo per il docente. Senza dati personali (3.0.0): niente studenti né voti,
   i voti stanno sul registro elettronico. Per ogni classe: quanto manca alla fine del periodo, verifiche scritte
   da fissare sui giorni di lezione (si confermano con un tocco), date da spostare, verifiche da segnare come svolte
   (così gli studenti vedono testo e soluzioni), stampa delle copie (tutte uguali, senza nomi) ed email alla cartoleria.
   Nessun timer e nessun lavoro pianificato: i dati si leggono solo quando si apre la pagina.
   app.js chiama:
     NovaulaValutazioni.page(contenitore, aiuti)   #/docente/valutazioni
     NovaulaValutazioni.week(contenitore, aiuti)   riquadro «Verifiche della settimana» in Area docente
   agenda.js usa NovaulaValutazioni.data(sb) e .plan(D, classe). */
(function () {
  "use strict";

  var DEF_TERMS = [{ name: "Trimestre", from: "09-01", to: "12-31" }, { name: "Pentamestre", from: "01-01", to: "06-30" }];
  var DEF_PLAN = { min_verifica: 1, print_email: "", print_notes: "A4, bianco e nero, fronte/retro", signature: "" };
  var DAYS = ["dom", "lun", "mar", "mer", "gio", "ven", "sab"];
  var PREF = "novaula-valutazioni";

  function ok(res) { if (res.error) throw res.error; return res.data; }
  function iso(d) { return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
  function todayIso() { return iso(new Date()); }
  function dateOf(s) { return new Date(s + "T12:00:00"); }
  function addDays(s, n) { var d = dateOf(s); d.setDate(d.getDate() + n); return iso(d); }
  function diffDays(a, b) { return Math.round((dateOf(b) - dateOf(a)) / 86400000); }
  function wd(s) { var g = dateOf(s).getDay(); return g === 0 ? 7 : g; }
  function day(s) { var d = dateOf(s); return DAYS[d.getDay()] + " " + d.getDate() + "/" + (d.getMonth() + 1); }
  function dmy(s) { var d = dateOf(s); return String(d.getDate()).padStart(2, "0") + "/" + String(d.getMonth() + 1).padStart(2, "0") + "/" + d.getFullYear(); }
  function schoolYear(s) { var y = +s.slice(0, 4), m = +s.slice(5, 7); return m >= 9 ? y : y - 1; }
  function md(year, s) { return (+s.slice(0, 2) >= 9 ? year : year + 1) + "-" + s; }
  function safeName(n) { return (n || "file").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Za-z0-9._-]+/g, "_").slice(-80) || "file"; }
  function uid() { return crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2); }
  function pref(v) {
    try { if (v === undefined) return JSON.parse(localStorage.getItem(PREF) || "{}"); localStorage.setItem(PREF, JSON.stringify(v)); } catch (e) { return {}; }
  }

  /* ---------- Calendario: festività, periodi, giorni di lezione ---------- */
  function easter(y) {
    var a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25),
      g = Math.floor((b - f + 1) / 3), hh = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4,
      l = (32 + 2 * e + 2 * i - hh - k) % 7, m = Math.floor((a + 11 * hh + 22 * l) / 451),
      mo = Math.floor((hh + l - 7 * m + 114) / 31), da = ((hh + l - 7 * m + 114) % 31) + 1;
    return iso(new Date(y, mo - 1, da));
  }
  // Festività nazionali, vacanze di Natale (23/12 – 6/1) e di Pasqua (dal giovedì al martedì dopo)
  function holiday(s) {
    var m = s.slice(5);
    if (["11-01", "12-08", "04-25", "05-01", "06-02"].indexOf(m) >= 0 || m >= "12-23" || m <= "01-06") return true;
    var e = easter(+s.slice(0, 4));
    return s >= addDays(e, -3) && s <= addDays(e, 2);
  }
  function currentTerm(terms, today) {
    var y = schoolYear(today), list = (terms && terms.length ? terms : DEF_TERMS).map(function (t) { return { name: t.name, from: md(y, t.from), to: md(y, t.to) }; });
    var cur = list.filter(function (t) { return today >= t.from && today <= t.to; })[0];
    // fuori periodo (estate o buco tra i periodi): il prossimo
    return cur || list.filter(function (t) { return t.from > today; }).sort(function (a, b) { return a.from < b.from ? -1 : 1; })[0] || null;
  }
  function lessonDays(slots, from, to) {
    var out = [], byWd = {};
    slots.forEach(function (r) { (byWd[r.weekday] = byWd[r.weekday] || []).push(r); });
    for (var s = from; s <= to; s = addDays(s, 1)) {
      var rs = byWd[wd(s)];
      if (rs && !holiday(s)) out.push({ date: s, slots: rs, minutes: rs.reduce(function (n, r) { return n + minutes(r); }, 0) });
    }
    return out;
  }
  function minutes(r) { var a = r.starts.split(":"), b = r.ends.split(":"); return (+b[0] * 60 + +b[1]) - (+a[0] * 60 + +a[1]); }

  /* ---------- Dati ---------- */
  async function loadAll(sb) {
    var today = todayIso();
    var r = await Promise.all([
      sb.from("timetable").select("weekday, starts, ends, class_id, room"),
      sb.from("tests").select("*").order("test_date"),
      sb.from("test_files").select("test_id, test_url, solutions_url"),
      sb.from("grade_settings").select("*").in("scope", ["tutte", "piano"])
    ]);
    var settings = {};
    (ok(r[3]) || []).forEach(function (g) { settings[g.scope] = g; });
    var files = {};
    (ok(r[2]) || []).forEach(function (f) { files[f.test_id] = f; });
    var terms = settings.tutte && settings.tutte.terms && settings.tutte.terms.length ? settings.tutte.terms : DEF_TERMS;
    var plan = Object.assign({}, DEF_PLAN, (settings.piano && settings.piano.weights) || {});
    return {
      // l'orario è facoltativo: senza (permessi o tabella vuota) mancano solo i giorni di lezione
      today: today, slots: r[0].error ? [] : r[0].data || [], tests: ok(r[1]) || [], files: files,
      plan: plan, terms: terms, term: currentTerm(terms, today)
    };
  }

  // Tutto quello che serve per una classe nel periodo in corso
  function classPlan(D, cid) {
    var T = D.term, today = D.today, P = D.plan;
    var slots = D.slots.filter(function (r) { return r.class_id === cid; });
    var tests = D.tests.filter(function (t) { return t.class_id === cid; });
    var from = T ? (T.from > today ? T.from : today) : today, to = T ? T.to : today;
    var lessons = T ? lessonDays(slots, from, to) : [];
    var inTerm = function (d) { return T && d && d >= T.from && d <= T.to; };
    var termTests = tests.filter(function (t) { return inTerm(t.test_date); });
    var upcoming = termTests.filter(function (t) { return t.test_date >= today; });
    var testDays = {};
    tests.forEach(function (t) { if (t.test_date) testDays[t.test_date] = t; });

    // Cose da fare
    var todo = [];
    tests.forEach(function (t) {
      if (t.test_date && t.test_date < today && t.test_date >= schoolYear(today) + "-09-01" && !t.done) todo.push({ kind: "done", test: t });
    });
    upcoming.forEach(function (t) {
      if (slots.length && !lessons.some(function (l) { return l.date === t.test_date; })) {
        var near = nearestLesson(lessonDays(slots, addDays(t.test_date, -10), addDays(t.test_date, 10)).filter(function (l) { return l.date >= addDays(today, 2) && !testDays[l.date]; }), t.test_date);
        todo.push({ kind: "move", test: t, to: near });
      }
    });
    var missing = Math.max(0, P.min_verifica - termTests.length);
    proposeTests(D, cid, lessons, testDays, missing).forEach(function (p) { todo.push({ kind: "new", proposal: p }); });

    return { cid: cid, slots: slots, tests: tests, termTests: termTests, lessons: lessons, todo: todo, testDays: testDays, upcoming: upcoming };
  }
  function nearestLesson(list, target) {
    var best = null;
    list.forEach(function (l) { var d = Math.abs(diffDays(target, l.date)); if (!best || d < best.d || (d === best.d && l.date < best.l.date)) best = { l: l, d: d }; });
    return best ? best.l.date : null;
  }
  // Verifiche scritte che mancano nel periodo: date distribuite verso la fine, sui giorni con più ore,
  // ad almeno 7 giorni da altre verifiche della classe ed evitando i giorni con verifiche di altre classi
  function proposeTests(D, cid, lessons, testDays, n) {
    if (!n || !D.term) return [];
    var otherDays = {};
    D.tests.forEach(function (t) { if (t.class_id !== cid && t.test_date) otherDays[t.test_date] = true; });
    var taken = Object.keys(testDays), out = [];
    var pool = lessons.filter(function (l) { return l.date >= addDays(D.today, 7); });
    var end = pool.length ? pool[pool.length - 1].date : null;
    for (var i = 0; i < n && end; i++) {
      var target = addDays(end, -7 - i * 21), best = null;
      pool.forEach(function (l) {
        if (taken.some(function (d) { return Math.abs(diffDays(d, l.date)) < 7; })) return;
        var score = Math.abs(diffDays(target, l.date)) + (otherDays[l.date] ? 4 : 0) - Math.min(l.minutes, 120) / 30;
        if (!best || score < best.score) best = { l: l, score: score };
      });
      if (!best) break;
      taken.push(best.l.date);
      out.push({ date: best.l.date, slot: best.l.slots[0] });
    }
    return out.sort(function (a, b) { return a.date < b.date ? -1 : 1; });
  }

  /* ---------- Pagina ---------- */
  async function page(root, x) {
    var h = x.h;
    root.appendChild(h("a", { class: "back", href: "#/docente", text: "← Area docente" }));
    root.appendChild(h("h1", { text: "Piano valutazioni" }));
    if (!x.sb) { root.appendChild(x.notice("err", "Il piano funziona solo con il database collegato.")); return; }
    var classes = x.classes || [];
    if (!classes.length) { root.appendChild(h("p", { class: "empty", text: "Nessuna classe." })); return; }
    var body = h("div", { class: "vl" }, h("p", { class: "empty", text: "Caricamento…" }));
    root.appendChild(body);
    var D;
    try { D = await loadAll(x.sb); } catch (e) { body.replaceChildren(x.notice("err", x.errText(e))); return; }
    var p = pref(), want = (location.hash.split("/")[3] || "").split("?")[0];
    var state = { cid: classes.some(function (c) { return c.id === want; }) ? want : classes.some(function (c) { return c.id === p.cid; }) ? p.cid : classes[0].id };
    async function reload() { try { D = await loadAll(x.sb); } catch (e) { x.toast(x.errText(e)); } render(); }
    var ctx = { x: x, h: h, reload: reload, D: function () { return D; } };

    function render() {
      var T = D.term, c = x.findClass(state.cid), cp = classPlan(D, state.cid);
      var weeks = T ? Math.max(0, Math.ceil(diffDays(D.today, T.to) / 7)) : 0;
      body.textContent = "";
      body.appendChild(h("p", { class: "vl-term" },
        T ? h("b", { text: T.name }) : h("b", { text: "Nessun periodo in corso" }),
        T ? " · fino al " + dmy(T.to) + " · " + (weeks === 1 ? "ultima settimana" : "mancano " + weeks + " settimane") : "",
        h("span", { class: "muted", text: " · almeno " + D.plan.min_verifica + (D.plan.min_verifica === 1 ? " verifica scritta" : " verifiche scritte") + " per periodo · i voti vanno sul registro elettronico" })));
      body.appendChild(h("nav", { class: "vl-classes", "aria-label": "Classe" }, classes.map(function (k) {
        var n = classPlan(D, k.id).todo.length;
        return h("button", { type: "button", class: "vl-cls", style: "--cc:" + x.classColor(k), "aria-pressed": k.id === state.cid ? "true" : "false",
          onclick: function () { state.cid = k.id; pref({ cid: k.id }); render(); } },
          h("span", { text: k.name.split(" ")[0] }), n ? h("span", { class: "vl-dot", text: String(n) }) : null);
      })));
      var wrap = h("div", { class: "vl-body", style: "--cc:" + x.classColor(c) });
      body.appendChild(wrap);
      wrap.appendChild(todoCard(ctx, c, cp));
      wrap.appendChild(testsCard(ctx, c, cp));
      wrap.appendChild(settingsCard(ctx));
    }
    render();
  }

  function section(h, title, sub) {
    return h("section", { class: "card vl-card" }, h("h2", { class: "vl-h" }, title, sub ? h("span", { class: "vl-sub", text: sub }) : null));
  }

  // «Da fare»: verifiche da segnare come svolte, date da sistemare, verifiche da fissare
  function todoCard(ctx, c, cp) {
    var h = ctx.h, x = ctx.x, card = section(h, "Da fare", cp.todo.length ? String(cp.todo.length) : "tutto in ordine");
    if (!cp.todo.length) { card.appendChild(h("p", { class: "small muted", text: "Niente da sistemare in questa classe per ora." })); return card; }
    var topics = null;
    cp.todo.forEach(function (t) {
      if (t.kind === "done") {
        card.appendChild(h("div", { class: "vl-todo warn" },
          h("p", null, h("b", { text: "Segna come svolta: " }), t.test.title, h("span", { class: "muted", text: " · " + day(t.test.test_date) + " · così gli studenti vedono testo e soluzioni" })),
          h("div", { class: "row" }, h("button", { class: "btn primary", type: "button", text: "✓ Svolta", onclick: function (e) { markDone(ctx, t.test, e.target); } }))));
      } else if (t.kind === "move") {
        card.appendChild(h("div", { class: "vl-todo" },
          h("p", null, h("b", { text: "Data senza lezione: " }), t.test.title + " è fissata " + day(t.test.test_date) + ", ma quel giorno non hai " + c.name.split(" ")[0] + "."),
          t.to ? h("div", { class: "row" },
            h("button", { class: "btn primary", type: "button", text: "Sposta a " + day(t.to), onclick: async function (e) {
              e.target.disabled = true;
              try { ok(await x.sb.from("tests").update({ test_date: t.to }).eq("id", t.test.id)); x.toast("Verifica spostata a " + day(t.to) + "."); ctx.reload(); }
              catch (err) { e.target.disabled = false; x.toast(x.errText(err)); }
            } }),
            h("a", { class: "btn", href: "#vl-test-" + t.test.id, text: "Scegli un'altra data" })) : null));
      } else if (t.kind === "new") {
        var box = h("div", { class: "vl-todo new" });
        card.appendChild(box);
        topics = topics || x.sb.from("topics").select("id, position, title, done").eq("class_id", c.id).order("position").then(ok);
        newTestForm(ctx, c, cp, t.proposal, box, topics);
      }
    });
    return card;
  }

  function newTestForm(ctx, c, cp, prop, box, topicsP) {
    var h = ctx.h, x = ctx.x;
    var n = cp.termTests.length + 1;
    var title = h("input", { type: "text", maxlength: 200, value: "Verifica scritta n. " + n, "aria-label": "Titolo" });
    var date = h("input", { type: "date", value: prop.date, "aria-label": "Data" });
    var desc = h("textarea", { rows: 3, maxlength: 2000, placeholder: "Argomenti", "aria-label": "Argomenti" });
    var lessonsBefore = cp.lessons.filter(function (l) { return l.date < prop.date; }).length;
    topicsP.then(function (ts) {
      // stima: un argomento per lezione da oggi alla verifica, più gli ultimi due già fatti
      var done = ts.filter(function (t) { return t.done !== false; }), next = ts.filter(function (t) { return t.done === false; });
      var list = done.slice(-2).concat(next.slice(0, lessonsBefore));
      if (list.length) desc.value = list.map(function (t) { return t.title; }).join("; ");
      if (next[0] && list.length) title.value = "Verifica: " + list[0].title.split(/[:(]/)[0].trim() + (list.length > 1 ? " e altro" : "");
    }).catch(function () {});
    box.appendChild(h("p", null, h("b", { text: "Serve una verifica scritta nel periodo. " }), "Proposta: " + day(prop.date) + (prop.slot ? " alle " + prop.slot.starts.slice(0, 5) + (prop.slot.room ? " in " + prop.slot.room : "") : "") + " (giorno di lezione, lontano da altre verifiche)."));
    box.appendChild(h("div", { class: "stack" }, h("label", null, "Titolo", title), h("label", null, "Data", date),
      h("label", null, "Argomenti (stima dal Programma, modificabile)", desc)));
    box.appendChild(h("div", { class: "row" }, h("button", { class: "btn primary", type: "button", text: "✓ Conferma la verifica", onclick: async function (e) {
      if (!title.value.trim() || !date.value) { x.toast("Servono titolo e data."); return; }
      e.target.disabled = true;
      var max = cp.tests.reduce(function (a, t) { return Math.max(a, t.position || 0); }, 0);
      try {
        ok(await x.sb.from("tests").insert({ class_id: c.id, position: max + 10, title: title.value.trim(), description: desc.value.trim() || null, test_date: date.value, done: false }));
        x.toast("Verifica fissata: " + day(date.value) + ". La vedono anche gli studenti nella scheda Verifiche.");
        ctx.reload();
      } catch (err) { e.target.disabled = false; x.toast(x.errText(err)); }
    } })));
  }

  async function markDone(ctx, t, btn) {
    var x = ctx.x;
    btn.disabled = true;
    try { ok(await x.sb.from("tests").update({ done: true }).eq("id", t.id)); x.toast("«" + t.title + "» segnata come svolta."); ctx.reload(); }
    catch (err) { btn.disabled = false; x.toast(x.errText(err)); }
  }

  // Verifiche dell'anno: date, svolta, stampa
  function testsCard(ctx, c, cp) {
    var h = ctx.h, x = ctx.x, D = ctx.D(), card = section(h, "Verifiche", cp.termTests.length + " nel periodo");
    var list = cp.tests.filter(function (t) { return !t.test_date || t.test_date >= schoolYear(D.today) + "-09-01"; });
    if (!list.length) { card.appendChild(h("p", { class: "small muted", text: "Nessuna verifica per questa classe. Le proposte compaiono in «Da fare»." })); return card; }
    var lessonSet = {};
    lessonDays(cp.slots, schoolYear(D.today) + "-09-01", (schoolYear(D.today) + 1) + "-06-30").forEach(function (l) { lessonSet[l.date] = true; });
    list.forEach(function (t) {
      var past = t.test_date && t.test_date < D.today;
      var date = h("input", { type: "date", value: t.test_date || "", "aria-label": "Data di " + t.title });
      date.addEventListener("change", async function () {
        try { ok(await x.sb.from("tests").update({ test_date: date.value || null }).eq("id", t.id)); x.toast(date.value ? "Data salvata: " + day(date.value) + (lessonSet[date.value] || !cp.slots.length ? "." : " (attenzione: quel giorno non hai lezione con la classe)") : "Data tolta."); ctx.reload(); }
        catch (e) { x.toast(x.errText(e)); }
      });
      var tools = h("div", { class: "vl-tools" });
      var item = h("article", { class: "vl-test" + (past ? " past" : ""), id: "vl-test-" + t.id },
        h("div", { class: "vl-test-head" },
          h("span", { class: "vl-date", text: t.test_date ? day(t.test_date) : "senza data" }),
          h("b", { text: t.title }),
          h("span", { class: "vl-state", text: t.done ? "✓ svolta" : past ? "da segnare come svolta" : t.test_date && !lessonSet[t.test_date] && cp.slots.length ? "⚠ giorno senza lezione" : "" })),
        h("div", { class: "row" },
          h("label", { class: "vl-inline" }, "Data ", date),
          h("button", { class: "btn", type: "button", text: "🖨 Stampa", onclick: function () { printPanel(ctx, c, t, tools); } }),
          past && !t.done ? h("button", { class: "btn", type: "button", text: "✓ Svolta", onclick: function (e) { markDone(ctx, t, e.target); } }) : null),
        tools);
      card.appendChild(item);
    });
    return card;
  }

  /* ---------- Stampa ---------- */
  var libP = null;
  function pdfLib() {
    if (window.PDFLib) return Promise.resolve(window.PDFLib);
    if (!libP) libP = new Promise(function (res, rej) {
      var s = document.createElement("script");
      s.src = "vendor/pdf-lib.min.js";
      s.onload = function () { res(window.PDFLib); };
      s.onerror = function () { libP = null; rej(new Error("libreria PDF non caricata")); };
      document.head.appendChild(s);
    });
    return libP;
  }
  // Toglie caratteri che i font standard dei PDF non sanno scrivere
  function latin(s) { return String(s || "").normalize("NFC").replace(/[‘’]/g, "'").replace(/[“”«»]/g, '"').replace(/[–—]/g, "-").replace(/[^\x20-\x7E\xA0-\xFF]/g, ""); }

  async function buildPrint(o) {
    var L = await pdfLib();
    var out = await L.PDFDocument.create();
    out.setTitle(latin(o.title)); out.setCreator("Novaula");
    var font = await out.embedFont(L.StandardFonts.Helvetica), bold = await out.embedFont(L.StandardFonts.HelveticaBold);
    var src = await L.PDFDocument.load(o.bytes, { ignoreEncryption: true });
    var n = src.getPageCount();
    var emb = await out.embedPdf(o.bytes, Array.from({ length: n }, function (_, i) { return i; }));
    var copies = [];
    for (var k = 0; k < o.copies; k++) copies.push({ code: String(k + 1) });
    var ink = L.rgb(0.1, 0.13, 0.25), grey = L.rgb(0.35, 0.37, 0.45);
    copies.forEach(function (cp) {
      for (var i = 0; i < n; i++) {
        var e = emb[i], w = e.width, ht = e.height;
        var pg = out.addPage([w, ht]);
        pg.drawPage(e, { x: 0, y: 0, width: w, height: ht });
        // fascia in alto: chi, classe, verifica, data, pagina, codice
        var band = 20, y = ht - band;
        pg.drawRectangle({ x: 0, y: y, width: w, height: band, color: L.rgb(1, 1, 1) });
        pg.drawLine({ start: { x: 24, y: y }, end: { x: w - 24, y: y }, thickness: 0.6, color: grey });
        var left = "Nome e cognome: ______________________";
        var right = latin(o.classCode + " · " + dmy(o.date) + " · pag. " + (i + 1) + "/" + n);
        var size = 9, rw = font.widthOfTextAtSize(right, size);
        var room = w - 48 - rw - 12, mid = latin(o.short);
        while (mid.length > 3 && bold.widthOfTextAtSize(left, size + 1) + font.widthOfTextAtSize("  " + mid, size) > room) mid = mid.slice(0, -2);
        if (mid !== latin(o.short)) mid = mid.replace(/\s*\S?$/, "") + "...";
        pg.drawText(left, { x: 24, y: y + 6, size: size + 1, font: bold, color: ink });
        if (bold.widthOfTextAtSize(left, size + 1) + 20 < room) pg.drawText(mid, { x: 24 + bold.widthOfTextAtSize(left, size + 1) + 10, y: y + 6, size: size, font: font, color: grey });
        pg.drawText(right, { x: w - 24 - rw, y: y + 6, size: size, font: font, color: ink });
      }
      // fronte/retro: ogni copia comincia su un foglio nuovo
      if (o.duplex && n % 2 === 1) { var last = emb[n - 1]; out.addPage([last.width, last.height]); }
    });
    var bytes = await out.save();
    return { bytes: bytes, copies: copies.length, pages: out.getPageCount(), sheets: Math.ceil(out.getPageCount() / (o.duplex ? 2 : 1)) };
  }

  function printPanel(ctx, c, t, tools) {
    var h = ctx.h, x = ctx.x, D = ctx.D();
    if (tools.querySelector(".vl-print")) { tools.replaceChildren(); return; }
    tools.replaceChildren();
    var f = D.files[t.id];
    var srcSel = h("select", { "aria-label": "Testo da stampare" },
      f && f.test_url ? h("option", { value: "site", text: "Testo della verifica già sul sito" }) : null,
      h("option", { value: "file", text: "Un PDF dal telefono o dal PC" }));
    var file = h("input", { type: "file", accept: "application/pdf", "aria-label": "PDF della verifica" });
    var fileRow = h("label", null, "PDF della verifica", file);
    function sync() { fileRow.hidden = srcSel.value !== "file"; }
    srcSel.addEventListener("change", sync); sync();
    var count = h("input", { type: "number", min: 1, max: 40, value: pref()["copie-" + c.id] || 25, inputmode: "numeric", "aria-label": "Numero di copie" });
    var duplex = h("input", { type: "checkbox", checked: /fronte\/retro/i.test(D.plan.print_notes) ? true : null });
    var msg = h("div"), result = h("div", { class: "stack" });
    var go = h("button", { class: "btn primary", type: "button", text: "Prepara il PDF" });
    var panel = h("div", { class: "vl-print stack" },
      h("p", { class: "small muted", text: "Copie tutte uguali, con la riga «Nome e cognome» da compilare a mano e classe, data e pagina in alto. Novaula non stampa nomi." }),
      h("label", null, "Testo", srcSel), fileRow,
      h("div", { class: "vl-two" }, h("label", null, "Numero di copie", count), h("label", { class: "check-row" }, duplex, h("span", { text: "Fronte/retro (ogni copia su fogli suoi)" }))),
      h("div", { class: "row" }, go), msg, result);
    tools.appendChild(panel);
    go.addEventListener("click", async function () {
      msg.replaceChildren(); result.replaceChildren();
      go.disabled = true; go.textContent = "Preparo…";
      try {
        var bytes;
        if (srcSel.value === "site") {
          var url = /^https?:/.test(f.test_url) ? f.test_url : new URL(f.test_url, location.href).href;
          var r = await fetch(url); if (!r.ok) throw new Error("testo della verifica non trovato (" + r.status + ")");
          bytes = new Uint8Array(await r.arrayBuffer());
        } else {
          if (!file.files[0]) throw new Error("scegli il PDF della verifica.");
          bytes = new Uint8Array(await file.files[0].arrayBuffer());
        }
        var n = Math.max(1, Math.min(40, +count.value || 1)), pp = pref(); pp["copie-" + c.id] = n; pref(pp);
        var res = await buildPrint({ bytes: bytes, copies: n, duplex: duplex.checked,
          title: c.name + " - " + t.title, short: t.title, classCode: c.name.split(" ")[0], date: t.test_date || todayIso() });
        var name = safeName(c.name.split(" ")[0] + "-" + t.title).slice(0, 60) + "-stampa.pdf";
        var blob = new Blob([res.bytes], { type: "application/pdf" });
        var href = URL.createObjectURL(blob);
        result.appendChild(x.notice("ok", "Pronto: " + res.copies + " copie, " + res.pages + " pagine" + (duplex.checked ? " (" + res.sheets + " fogli fronte/retro)" : "") + "."));
        result.appendChild(h("div", { class: "row" },
          h("a", { class: "btn", href: href, download: name, text: "⬇ Scarica" }),
          canShare(blob, name) ? h("button", { class: "btn", type: "button", text: "Condividi (allegato)", onclick: function () {
            navigator.share({ files: [new File([blob], name, { type: "application/pdf" })], title: name, text: mailSubject(c, t, res) }).catch(function () {});
          } }) : null,
          h("button", { class: "btn primary", type: "button", text: "✉ Email alla cartoleria", onclick: function (e) { mailShop(ctx, c, t, res, blob, name, e.target); } })));
      } catch (e) { msg.replaceChildren(x.notice("err", x.errText(e))); }
      go.disabled = false; go.textContent = "Prepara il PDF";
    });
  }
  function canShare(blob, name) {
    try { return !!(navigator.canShare && navigator.canShare({ files: [new File([blob], name, { type: "application/pdf" })] })); } catch (e) { return false; }
  }
  function mailSubject(c, t, res) { return "Stampa: " + c.name.split(" ")[0] + " - " + t.title + " (" + res.copies + " copie)"; }
  async function mailShop(ctx, c, t, res, blob, name, btn) {
    var x = ctx.x, P = ctx.D().plan;
    btn.disabled = true;
    try {
      // il PDF va nello spazio privato «stampe»: la cartoleria lo scarica da un link che dura 7 giorni
      var path = c.id + "/" + todayIso() + "-" + uid().slice(0, 8) + "-" + name;
      ok(await x.sb.storage.from("stampe").upload(path, blob, { contentType: "application/pdf" }));
      var link = ok(await x.sb.storage.from("stampe").createSignedUrl(path, 7 * 86400, { download: name })).signedUrl;
      var pick = t.test_date ? addDays(t.test_date, -1) : null;
      while (pick && (wd(pick) > 6 || holiday(pick))) pick = addDays(pick, -1);
      var bodyText = ["Buongiorno,", "",
        "vi chiedo per favore di stampare il PDF a questo link:", link, "",
        "- Il file contiene già tutte le copie: " + res.copies + " verifiche, " + res.pages + " pagine" + (/fronte\/retro/i.test(P.print_notes) ? " (" + res.sheets + " fogli)" : "") + ". Basta stamparlo una volta.",
        P.print_notes ? "- " + P.print_notes : null,
        pick ? "- Mi servirebbe entro " + fmtLong(pick) + "." : null,
        "", "Il link resta attivo 7 giorni.", "", "Grazie mille,", P.signature || ""].filter(function (l) { return l !== null; }).join("\n");
      var href = "mailto:" + encodeURIComponent(P.print_email || "").replace(/%40/g, "@") + "?subject=" + encodeURIComponent(mailSubject(c, t, res)) + "&body=" + encodeURIComponent(bodyText);
      if (!P.print_email) x.toast("Suggerimento: salva l'indirizzo della cartoleria in «Impostazioni» in fondo alla pagina.");
      location.href = href;
    } catch (e) { x.toast(x.errText(e)); }
    btn.disabled = false;
  }
  function fmtLong(s) { return dateOf(s).toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" }); }

  /* ---------- Impostazioni ---------- */
  function settingsCard(ctx) {
    var h = ctx.h, x = ctx.x, D = ctx.D(), P = D.plan;
    var terms = (D.terms || DEF_TERMS).slice(0, 3);
    while (terms.length < 2) terms.push({ name: "", from: "", to: "" });
    function mmdd(v) { return /^\d{2}-\d{2}$/.test(v) ? v : ""; }
    var termRows = terms.map(function (t, i) {
      return h("div", { class: "vl-three" },
        h("label", null, "Periodo " + (i + 1), h("input", { type: "text", name: "tn" + i, value: t.name || "", maxlength: 40, placeholder: i ? "Pentamestre" : "Trimestre" })),
        h("label", null, "Dal (MM-GG)", h("input", { type: "text", name: "tf" + i, value: t.from || "", maxlength: 5, placeholder: "09-01", inputmode: "numeric" })),
        h("label", null, "Al (MM-GG)", h("input", { type: "text", name: "tt" + i, value: t.to || "", maxlength: 5, placeholder: "12-31", inputmode: "numeric" })));
    });
    var form = h("form", { class: "stack" },
      h("p", { class: "small muted", text: "Valgono per tutte le classi. Le date dei periodi le decide il collegio docenti." }),
      termRows,
      h("label", null, "Verifiche scritte per periodo (minimo)", h("input", { type: "number", min: 0, max: 12, value: P.min_verifica, name: "min_verifica", inputmode: "numeric" })),
      h("label", null, "Email della cartoleria", h("input", { type: "email", name: "print_email", value: P.print_email, placeholder: "cartoleria@esempio.it", autocomplete: "off" })),
      h("label", null, "Istruzioni di stampa", h("input", { type: "text", name: "print_notes", value: P.print_notes, maxlength: 200 })),
      h("label", null, "Firma dell'email", h("input", { type: "text", name: "signature", value: P.signature, maxlength: 100, placeholder: "Prof. …" })),
      h("div", { class: "row" }, h("button", { class: "btn primary", type: "submit", text: "Salva" })));
    form.addEventListener("submit", async function (e) {
      e.preventDefault();
      var f = form.elements, list = [];
      terms.forEach(function (t, i) {
        var n = f["tn" + i].value.trim(), a = mmdd(f["tf" + i].value.trim()), b = mmdd(f["tt" + i].value.trim());
        if (n && a && b) list.push({ name: n, from: a, to: b });
      });
      if (!list.length) { x.toast("Serve almeno un periodo con nome e date (MM-GG)."); return; }
      var w = { min_verifica: Math.max(0, +f.min_verifica.value || 0), print_email: f.print_email.value.trim(), print_notes: f.print_notes.value.trim(), signature: f.signature.value.trim() };
      var now = new Date().toISOString();
      try {
        ok(await x.sb.from("grade_settings").upsert([{ scope: "piano", weights: w, updated_at: now }, { scope: "tutte", terms: list, updated_at: now }]));
        x.toast("Impostazioni salvate."); ctx.reload();
      } catch (err) { x.toast(x.errText(err)); }
    });
    return h("details", { class: "card vl-card" }, h("summary", { class: "vl-h" }, "Impostazioni", h("span", { class: "vl-sub", text: "periodi e cartoleria" })), form);
  }

  /* ---------- «Verifiche della settimana» (Area docente) ---------- */
  function week(box, x) {
    if (!x.sb) return;
    var h = x.h, card = h("section", { class: "card vl-week" }, h("p", { class: "small muted", text: "Caricamento delle verifiche…" }));
    box.appendChild(card);
    loadAll(x.sb).then(function (D) {
      var classes = x.classes || [], end = addDays(D.today, 6), lines = {}, alerts = [];
      classes.forEach(function (c) {
        var cp = classPlan(D, c.id), tag = c.name.split(" ")[0];
        cp.tests.forEach(function (t) { if (t.test_date >= D.today && t.test_date <= end) (lines[t.test_date] = lines[t.test_date] || []).push({ c: c, text: "✍ Verifica: " + t.title }); });
        var dn = cp.todo.filter(function (t) { return t.kind === "done"; }).length, mv = cp.todo.filter(function (t) { return t.kind === "move" || t.kind === "new"; }).length;
        if (dn) alerts.push(tag + ": " + dn + (dn === 1 ? " verifica da segnare come svolta" : " verifiche da segnare come svolte"));
        if (mv) alerts.push(tag + ": " + mv + (mv === 1 ? " data da confermare" : " date da confermare"));
      });
      var days = Object.keys(lines).sort();
      card.replaceChildren(
        h("div", { class: "vl-week-head" }, h("h2", { text: "Verifiche della settimana" }), h("a", { class: "btn", href: "#/docente/valutazioni", text: "Apri il piano →" })),
        alerts.length ? h("ul", { class: "vl-alerts" }, alerts.slice(0, 6).map(function (a) { return h("li", { text: a }); })) : null,
        days.length ? h("ul", { class: "vl-days" }, days.map(function (d) {
          return h("li", null, h("span", { class: "vl-date", text: d === D.today ? "oggi" : day(d) }),
            h("div", null, lines[d].map(function (l) { return h("a", { class: "vl-line", href: "#/docente/valutazioni/" + l.c.id, style: "--cc:" + x.classColor(l.c) }, h("b", { text: l.c.name.split(" ")[0] + " " }), l.text); })));
        })) : h("p", { class: "small muted", text: alerts.length ? "Nessuna verifica nei prossimi 7 giorni." : "Niente in programma nei prossimi 7 giorni: tutto in ordine." }));
    }).catch(function (e) { card.replaceChildren(x.notice("err", x.errText(e))); });
  }

  window.NovaulaValutazioni = { page: page, week: week, data: loadAll, plan: classPlan, _test: { holiday: holiday, easter: easter, classPlan: classPlan, proposeTests: proposeTests } };
})();
