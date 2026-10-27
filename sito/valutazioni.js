/* Novaula · Piano delle valutazioni, solo per il docente (vedi aggiornamenti/2026-10-27-valutazioni.sql).
   Per ogni classe: quanto manca alla fine del periodo, quanti voti ha ogni studente e quanti ne servono,
   date di verifica suggerite sui giorni di lezione (si confermano con un tocco), chi interrogare nelle
   prossime lezioni, voto rapido, elenco della classe da incollare.
   Stampa: un PDF con una copia della verifica per ogni studente, con nome, classe, data, pagina e codice
   su ogni pagina (così Claude riconosce di chi è ogni foglio scansionato); si scarica, si condivide o si
   manda alla cartoleria con l'email già compilata.
   Posta in arrivo: le verifiche scansionate aspettano Claude, che su richiesta le divide per studente e le
   corregge (strumenti/SCANSIONI.md); i voti proposti restano nascosti finché il docente non li accetta.
   Nessun timer e nessun lavoro pianificato: i dati si leggono solo quando si apre la pagina.
   app.js chiama:
     NovaulaValutazioni.page(contenitore, aiuti)   #/docente/valutazioni
     NovaulaValutazioni.week(contenitore, aiuti)   riquadro «Questa settimana» nella home e in Area docente */
(function () {
  "use strict";

  var DEF_TERMS = [{ name: "Trimestre", from: "09-01", to: "12-31" }, { name: "Pentamestre", from: "01-01", to: "06-30" }];
  var DEF_PLAN = { min_marks: 3, min_verifica: 1, min_orale: 1, print_email: "", print_notes: "A4, bianco e nero, fronte/retro", signature: "" };
  var CATS = [["orale", "Interrogazione"], ["verifica", "Verifica"], ["classe", "Lavoro in classe"], ["compito", "Compito a casa"], ["progetto", "Progetto"], ["altro", "Altro"]];
  var QUICK = ["4", "5", "5½", "6-", "6", "6½", "7", "7½", "8", "8½", "9", "10"];
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
  function fullName(s) { return s.last_name + " " + s.first_name; }
  // Codice stampato su ogni pagina della copia di uno studente (uguale a strumenti/correggi.py)
  function code(id) { return id.replace(/-/g, "").slice(0, 4).toUpperCase(); }
  function markValue(label) {
    var m = /^(\d{1,2})(?:[.,](\d{1,2}))?\s*(\+|-|½|1\/2|e mezzo)?/.exec(String(label || "").trim());
    if (!m) return null;
    var v = +m[1] + (m[2] ? +("0." + m[2]) : 0);
    if (m[3] === "+") v += 0.25; else if (m[3] === "-") v -= 0.25; else if (m[3]) v += 0.5;
    return v >= 0 && v <= 10 ? v : null;
  }
  function safeName(n) { return (n || "file").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9._-]+/g, "_").slice(-80) || "file"; }
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
    var today = todayIso(), y = schoolYear(today);
    var r = await Promise.all([
      sb.from("timetable").select("weekday, starts, ends, class_id, room"),
      sb.from("tests").select("*").order("test_date"),
      sb.from("test_files").select("test_id, test_url, solutions_url"),
      sb.from("students").select("id, class_id, first_name, last_name").order("last_name").order("first_name"),
      sb.from("marks").select("id, student_id, class_id, category, status, value, label, title, mark_date, test_id").gte("mark_date", y + "-09-01"),
      sb.from("grade_settings").select("*"),
      sb.from("test_scans").select("*").order("created_at", { ascending: false }).limit(60)
    ]);
    var settings = {};
    (ok(r[5]) || []).forEach(function (g) { settings[g.scope] = g; });
    var files = {};
    (ok(r[2]) || []).forEach(function (f) { files[f.test_id] = f; });
    var scans = r[6].error ? [] : r[6].data; // tabella non ancora creata: niente posta in arrivo
    return {
      today: today, slots: ok(r[0]) || [], tests: ok(r[1]) || [], files: files, students: ok(r[3]) || [], marks: ok(r[4]) || [],
      plan: Object.assign({}, DEF_PLAN, (settings.piano && settings.piano.weights) || {}),
      term: currentTerm(settings.tutte && settings.tutte.terms, today), scans: scans || [], scansReady: !r[6].error
    };
  }

  // Tutto quello che serve per una classe nel periodo in corso
  function classPlan(D, cid) {
    var T = D.term, today = D.today, P = D.plan;
    var slots = D.slots.filter(function (r) { return r.class_id === cid; });
    var tests = D.tests.filter(function (t) { return t.class_id === cid; });
    var students = D.students.filter(function (s) { return s.class_id === cid; });
    var marks = D.marks.filter(function (m) { return m.class_id === cid; });
    var from = T ? (T.from > today ? T.from : today) : today, to = T ? T.to : today;
    var lessons = T ? lessonDays(slots, from, to) : [];
    var markedTests = {};
    marks.forEach(function (m) { if (m.test_id) markedTests[m.test_id] = (markedTests[m.test_id] || 0) + 1; });
    var inTerm = function (d) { return T && d && d >= T.from && d <= T.to; };
    var termTests = tests.filter(function (t) { return inTerm(t.test_date); });
    var upcoming = termTests.filter(function (t) { return t.test_date >= today && !markedTests[t.id]; });
    var testDays = {};
    tests.forEach(function (t) { if (t.test_date) testDays[t.test_date] = t; });

    // Voti di ogni studente nel periodo (contano solo quelli confermati)
    var rows = students.map(function (s) {
      var ms = marks.filter(function (m) { return m.student_id === s.id && inTerm(m.mark_date); });
      var conf = ms.filter(function (m) { return m.status === "confermato" && m.value != null; });
      var n = conf.length, ver = conf.filter(function (m) { return m.category === "verifica"; }).length, ora = conf.filter(function (m) { return m.category === "orale"; }).length;
      var pending = ms.filter(function (m) { return m.status === "proposto"; }).length;
      var expect = n + pending + upcoming.length, expVer = ver + pending + upcoming.length;
      var needOral = ora < P.min_orale, needMore = expect < P.min_marks;
      var status = n >= P.min_marks && ver >= P.min_verifica && ora >= P.min_orale ? "ok" : (!needOral && !needMore && expVer >= P.min_verifica ? "track" : "behind");
      return { s: s, n: n, ver: ver, ora: ora, pending: pending, status: status, needOral: needOral || needMore, last: conf.reduce(function (a, m) { return m.mark_date > a ? m.mark_date : a; }, "") };
    });
    rows.sort(function (a, b) { return (a.status === "behind" ? 0 : a.status === "track" ? 1 : 2) - (b.status === "behind" ? 0 : b.status === "track" ? 1 : 2) || a.n - b.n || a.ora - b.ora || (a.last < b.last ? -1 : a.last > b.last ? 1 : 0) || (fullName(a.s) < fullName(b.s) ? -1 : 1); });

    // Interrogazioni: chi ne ha bisogno, distribuito sulle lezioni rimaste (non nei giorni di verifica)
    var oralLessons = lessons.filter(function (l) { return !testDays[l.date]; });
    var queue = rows.filter(function (r) { return r.needOral; });
    var perLesson = queue.length ? Math.max(1, Math.min(4, Math.ceil(queue.length / Math.max(1, oralLessons.length)))) : 0;
    var orals = {};
    oralLessons.forEach(function (l, i) { var g = queue.slice(i * perLesson, (i + 1) * perLesson); if (g.length) orals[l.date] = g; });

    // Cose da fare
    var todo = [];
    tests.forEach(function (t) {
      if (t.test_date && t.test_date < today && t.test_date >= schoolYear(today) + "-09-01" && !markedTests[t.id] && students.length)
        todo.push({ kind: "mark", test: t });
    });
    upcoming.forEach(function (t) {
      if (slots.length && !lessons.some(function (l) { return l.date === t.test_date; })) {
        var near = nearestLesson(lessonDays(slots, addDays(t.test_date, -10), addDays(t.test_date, 10)).filter(function (l) { return l.date >= addDays(today, 2) && !testDays[l.date]; }), t.test_date);
        todo.push({ kind: "move", test: t, to: near });
      }
    });
    var missing = Math.max(0, P.min_verifica - termTests.length);
    var proposals = proposeTests(D, cid, lessons, testDays, missing);
    proposals.forEach(function (p) { todo.push({ kind: "new", proposal: p }); });
    if (!students.length) todo.push({ kind: "roster" });

    return { cid: cid, slots: slots, tests: tests, termTests: termTests, students: students, rows: rows, lessons: lessons, orals: orals,
      todo: todo, markedTests: markedTests, testDays: testDays, upcoming: upcoming };
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
        h("span", { class: "muted", text: " · obiettivo per studente: " + D.plan.min_marks + " voti, di cui almeno " + D.plan.min_verifica + " verifica e " + D.plan.min_orale + " interrogazione" })));
      body.appendChild(h("nav", { class: "vl-classes", "aria-label": "Classe" }, classes.map(function (k) {
        var n = classPlan(D, k.id).todo.length;
        return h("button", { type: "button", class: "vl-cls", style: "--cc:" + x.classColor(k), "aria-pressed": k.id === state.cid ? "true" : "false",
          onclick: function () { state.cid = k.id; pref({ cid: k.id }); render(); } },
          h("span", { text: k.name.split(" ")[0] }), n ? h("span", { class: "vl-dot", text: String(n) }) : null);
      })));
      var wrap = h("div", { class: "vl-body", style: "--cc:" + x.classColor(c) });
      body.appendChild(wrap);
      wrap.appendChild(todoCard(ctx, c, cp));
      wrap.appendChild(oralsCard(ctx, c, cp));
      wrap.appendChild(studentsCard(ctx, c, cp));
      wrap.appendChild(testsCard(ctx, c, cp));
      wrap.appendChild(inboxCard(ctx));
      wrap.appendChild(rosterCard(ctx, c, cp));
      wrap.appendChild(settingsCard(ctx));
    }
    render();
  }

  function section(h, title, sub) {
    return h("section", { class: "card vl-card" }, h("h2", { class: "vl-h" }, title, sub ? h("span", { class: "vl-sub", text: sub }) : null));
  }

  // «Da fare»: voti da registrare, date da sistemare, verifiche da fissare, elenco mancante
  function todoCard(ctx, c, cp) {
    var h = ctx.h, x = ctx.x, card = section(h, "Da fare", cp.todo.length ? String(cp.todo.length) : "tutto in ordine");
    if (!cp.todo.length) { card.appendChild(h("p", { class: "small muted", text: "Niente da sistemare in questa classe per ora." })); return card; }
    var topics = null;
    cp.todo.forEach(function (t) {
      if (t.kind === "mark") {
        card.appendChild(h("div", { class: "vl-todo warn" },
          h("p", null, h("b", { text: "Registra i voti: " }), t.test.title, h("span", { class: "muted", text: " · " + day(t.test.test_date) })),
          h("div", { class: "row" },
            h("button", { class: "btn primary", type: "button", text: "Inserisci i voti", onclick: function (e) { openTestMarks(ctx, c, cp, t.test, e.target.closest(".vl-todo")); } }),
            ctx.D().scansReady ? h("a", { class: "btn", href: "#vl-test-" + t.test.id, text: "📥 Carica le scansioni" }) : null)));
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
      } else if (t.kind === "roster") {
        card.appendChild(h("div", { class: "vl-todo" },
          h("p", null, h("b", { text: "Manca l'elenco della classe. " }), "Incollalo una volta: poi gli studenti scelgono il proprio nome e i voti si contano qui."),
          h("div", { class: "row" }, h("a", { class: "btn primary", href: "#vl-roster", text: "Incolla l'elenco" }))));
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

  // Interrogazioni suggerite nelle prossime lezioni
  function oralsCard(ctx, c, cp) {
    var h = ctx.h, card = section(h, "Da interrogare");
    var dates = Object.keys(cp.orals).sort().slice(0, 4);
    if (!cp.students.length) { card.appendChild(h("p", { class: "small muted", text: "Appena c'è l'elenco della classe, qui trovi chi interrogare a ogni lezione." })); return card; }
    if (!dates.length) { card.appendChild(h("p", { class: "small muted", text: "Tutti hanno (o avranno con le verifiche fissate) i voti che servono." })); return card; }
    card.appendChild(h("p", { class: "small muted", text: "Chi ha meno voti o nessuna interrogazione, distribuito sulle lezioni che restano. Tocca un nome per mettere il voto." }));
    dates.forEach(function (d) {
      card.appendChild(h("div", { class: "vl-oral" }, h("span", { class: "vl-date", text: day(d) + (d === ctx.D().today ? " · oggi" : "") }),
        h("div", { class: "chips" }, cp.orals[d].map(function (r) {
          return h("button", { type: "button", class: "chip vl-name", onclick: function (e) { quickMark(ctx, c, r.s, e.target.closest(".vl-oral"), "orale"); } }, r.s.last_name + " " + r.s.first_name[0] + ".");
        }))));
    });
    return card;
  }

  // Studenti: voti nel periodo e stato
  function studentsCard(ctx, c, cp) {
    var h = ctx.h, P = ctx.D().plan, card = section(h, "Studenti", cp.students.length ? cp.rows.filter(function (r) { return r.status === "behind"; }).length + " indietro" : "");
    if (!cp.students.length) { card.appendChild(h("p", { class: "small muted", text: "Nessuno studente in questa classe." })); return card; }
    var LBL = { ok: "a posto", track: "in arrivo", behind: "indietro" };
    card.appendChild(h("ul", { class: "vl-list" }, cp.rows.map(function (r) {
      var li = h("li", { class: "vl-st " + r.status },
        h("button", { type: "button", class: "vl-st-btn", onclick: function () { quickMark(ctx, c, r.s, li); } },
          h("span", { class: "vl-st-name", text: fullName(r.s) }),
          h("span", { class: "vl-st-n", title: "voti confermati nel periodo" }, h("b", { text: r.n + "/" + P.min_marks }), " voti"),
          h("span", { class: "vl-st-cats" }, h("span", { class: r.ver >= P.min_verifica ? "on" : "", text: "✍ " + r.ver }), h("span", { class: r.ora >= P.min_orale ? "on" : "", text: "🗣 " + r.ora }),
            r.pending ? h("span", { class: "on", text: "⏳ " + r.pending }) : null),
          h("span", { class: "vl-st-badge", text: LBL[r.status] })));
      return li;
    })));
    card.appendChild(h("p", { class: "small muted", text: "✍ verifiche · 🗣 interrogazioni · ⏳ voti proposti da Claude da confermare (in «Studenti e voti» della classe). «In arrivo» = arriva all'obiettivo con le verifiche già fissate." }));
    return card;
  }

  function quickMark(ctx, c, s, host, cat) {
    var h = ctx.h, x = ctx.x;
    var old = host.querySelector(".vl-quick");
    if (old) { old.remove(); return; }
    var sel = h("select", { "aria-label": "Tipo" }, CATS.map(function (k) { return h("option", { value: k[0], text: k[1], selected: k[0] === (cat || "orale") ? true : null }); }));
    var label = h("input", { type: "text", maxlength: 12, inputmode: "decimal", placeholder: "7½", "aria-label": "Voto" });
    var title = h("input", { type: "text", maxlength: 200, value: "Interrogazione", "aria-label": "Titolo" });
    var date = h("input", { type: "date", value: todayIso(), "aria-label": "Data" });
    sel.addEventListener("change", function () { var k = CATS.filter(function (z) { return z[0] === sel.value; })[0]; if (k) title.value = k[1]; });
    var form = h("form", { class: "vl-quick stack" },
      h("p", { class: "small" }, h("b", { text: fullName(s) })),
      h("div", { class: "vl-grades" }, QUICK.map(function (q) {
        return h("button", { type: "button", class: "vl-g", text: q, onclick: function () { label.value = q; form.querySelectorAll(".vl-g").forEach(function (b) { b.classList.toggle("sel", b.textContent === q); }); } });
      })),
      h("div", { class: "vl-two" }, h("label", null, "Voto", label), h("label", null, "Tipo", sel)),
      h("div", { class: "vl-two" }, h("label", null, "Titolo", title), h("label", null, "Data", date)),
      h("div", { class: "row" }, h("button", { class: "btn primary", type: "submit", text: "Salva il voto" }), h("button", { class: "btn link", type: "button", text: "Chiudi", onclick: function () { form.remove(); } })));
    form.addEventListener("submit", async function (e) {
      e.preventDefault();
      var v = markValue(label.value);
      if (v == null) { x.toast("Voto non valido: scrivi per esempio 7, 7+, 6½, 6,5."); return; }
      form.querySelector('button[type="submit"]').disabled = true;
      try {
        ok(await x.sb.from("marks").insert({ student_id: s.id, class_id: c.id, category: sel.value, title: title.value.trim() || "Voto", label: label.value.trim().slice(0, 12), value: v, status: "confermato", source: "docente", mark_date: date.value || todayIso() }));
        x.toast("Voto salvato: " + fullName(s) + " " + label.value.trim() + ".");
        ctx.reload();
      } catch (err) { form.querySelector('button[type="submit"]').disabled = false; x.toast(x.errText(err)); }
    });
    host.appendChild(form);
    label.focus();
  }

  // Voti di una verifica per tutta la classe
  function openTestMarks(ctx, c, cp, t, host) {
    var h = ctx.h, x = ctx.x;
    var old = host.querySelector(".vl-bulk");
    if (old) { old.remove(); return; }
    var rows = cp.students.map(function (s) {
      return h("label", { class: "vl-bulk-row" }, h("span", { text: fullName(s) }), h("input", { type: "text", maxlength: 12, inputmode: "decimal", placeholder: "–", "data-id": s.id, enterkeyhint: "next" }));
    });
    var form = h("form", { class: "vl-bulk stack" }, h("p", { class: "small muted", text: "Lascia vuoto chi era assente. Formati: 7, 7+, 7-, 6½, 6,5." }), h("div", { class: "vl-bulk-grid" }, rows),
      h("div", { class: "row" }, h("button", { class: "btn primary", type: "submit", text: "Salva i voti" })));
    form.addEventListener("submit", async function (e) {
      e.preventDefault();
      var out = [], bad = [];
      cp.students.forEach(function (s) {
        var v = form.querySelector('[data-id="' + s.id + '"]').value.trim();
        if (!v) return;
        var n = markValue(v);
        if (n == null) bad.push(fullName(s));
        else out.push({ student_id: s.id, class_id: c.id, category: "verifica", title: t.title, label: v.slice(0, 12), value: n, status: "confermato", source: "docente", test_id: t.id, mark_date: t.test_date || todayIso() });
      });
      if (bad.length) { x.toast("Voto non valido per: " + bad.join(", ")); return; }
      if (!out.length) { x.toast("Nessun voto da salvare."); return; }
      form.querySelector('button[type="submit"]').disabled = true;
      try { ok(await x.sb.from("marks").insert(out)); x.toast(out.length + " voti salvati."); ctx.reload(); }
      catch (err) { form.querySelector('button[type="submit"]').disabled = false; x.toast(x.errText(err)); }
    });
    host.appendChild(form);
  }

  // Verifiche dell'anno: date, stampa, scansioni
  function testsCard(ctx, c, cp) {
    var h = ctx.h, x = ctx.x, D = ctx.D(), card = section(h, "Verifiche", cp.termTests.length + " nel periodo");
    var list = cp.tests.filter(function (t) { return !t.test_date || t.test_date >= schoolYear(D.today) + "-09-01"; });
    if (!list.length) { card.appendChild(h("p", { class: "small muted", text: "Nessuna verifica per questa classe. Le proposte compaiono in «Da fare»." })); return card; }
    var lessonSet = {};
    lessonDays(cp.slots, schoolYear(D.today) + "-09-01", (schoolYear(D.today) + 1) + "-06-30").forEach(function (l) { lessonSet[l.date] = true; });
    list.forEach(function (t) {
      var past = t.test_date && t.test_date < D.today, marked = cp.markedTests[t.id];
      var scans = D.scans.filter(function (s) { return s.test_id === t.id; });
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
          h("span", { class: "vl-state", text: marked ? "✓ " + marked + " voti" : past ? "voti da registrare" : t.test_date && !lessonSet[t.test_date] && cp.slots.length ? "⚠ giorno senza lezione" : "" })),
        h("div", { class: "row" },
          h("label", { class: "vl-inline" }, "Data ", date),
          h("button", { class: "btn", type: "button", text: "🖨 Stampa", onclick: function () { printPanel(ctx, c, cp, t, tools); } }),
          D.scansReady ? h("button", { class: "btn", type: "button", text: "📥 Scansioni" + (scans.length ? " (" + scans.length + ")" : ""), onclick: function () { scanPanel(ctx, c, t, tools, scans); } }) : null,
          past && !marked && cp.students.length ? h("button", { class: "btn", type: "button", text: "Voti", onclick: function () { openTestMarks(ctx, c, cp, t, tools); } }) : null),
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
    var copies = o.students.map(function (s) { return { name: fullName(s), code: code(s.id) }; });
    for (var k = 0; k < o.blank; k++) copies.push({ name: null, code: "X" + (k + 1) });
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
        var left = cp.name ? latin(cp.name) : "Nome e cognome: ______________________";
        var right = latin(o.classCode + " · " + dmy(o.date) + " · pag. " + (i + 1) + "/" + n + " · cod. " + cp.code);
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

  function printPanel(ctx, c, cp, t, tools) {
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
    var checks = cp.students.map(function (s) { return h("input", { type: "checkbox", checked: true, "data-id": s.id, "aria-label": fullName(s) }); });
    var blank = h("input", { type: "number", min: 0, max: 30, value: cp.students.length ? 2 : 25, inputmode: "numeric", "aria-label": "Copie senza nome" });
    var duplex = h("input", { type: "checkbox", checked: /fronte\/retro/i.test(D.plan.print_notes) ? true : null });
    var msg = h("div"), result = h("div", { class: "stack" });
    var go = h("button", { class: "btn primary", type: "button", text: "Prepara il PDF" });
    var panel = h("div", { class: "vl-print stack" },
      h("p", { class: "small muted", text: "Una copia per studente con nome, classe, data della verifica, pagina e un codice in alto su ogni pagina: Claude riconosce così di chi è ogni foglio scansionato." }),
      h("label", null, "Testo", srcSel), fileRow,
      cp.students.length ? h("details", { class: "vl-who" }, h("summary", { text: "Copie con il nome: " + cp.students.length + " studenti (tocca per togliere gli assenti)" }),
        h("div", { class: "vl-checks" }, cp.students.map(function (s, i) { return h("label", { class: "check-row" }, checks[i], h("span", { text: fullName(s) })); })))
        : h("p", { class: "small muted", text: "Non c'è ancora l'elenco della classe: le copie avranno la riga «Nome e cognome» da compilare." }),
      h("div", { class: "vl-two" }, h("label", null, "Copie in più senza nome", blank), h("label", { class: "check-row" }, duplex, h("span", { text: "Fronte/retro (ogni copia su fogli suoi)" }))),
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
        var who = cp.students.filter(function (s, i) { return checks[i].checked; });
        var res = await buildPrint({ bytes: bytes, students: who, blank: Math.max(0, Math.min(30, +blank.value || 0)), duplex: duplex.checked,
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

  /* ---------- Posta in arrivo delle scansioni ---------- */
  var SCAN_STATE = { nuova: "in attesa di Claude", fatta: "divisa per studente: correzioni in Area docente", errore: "da rivedere" };
  function scanPanel(ctx, c, t, tools, scans) {
    var h = ctx.h, x = ctx.x;
    if (tools.querySelector(".vl-scan")) { tools.replaceChildren(); return; }
    tools.replaceChildren();
    var file = h("input", { type: "file", accept: "application/pdf,image/*", multiple: true, "aria-label": "Scansioni" });
    var msg = h("div");
    var panel = h("div", { class: "vl-scan stack" },
      h("p", { class: "small muted", text: "Carica il PDF della scansione (anche tutta la classe in un file solo, in qualsiasi ordine) o le foto dei fogli. Claude legge nome e codice in alto su ogni pagina, divide le copie per studente e propone un voto, che resta nascosto finché non lo accetti." }),
      h("label", null, "File", file),
      h("div", { class: "row" }, h("button", { class: "btn primary", type: "button", text: "📥 Carica", onclick: async function (e) {
        if (!file.files.length) { x.toast("Scegli prima il file."); return; }
        e.target.disabled = true;
        try {
          for (var i = 0; i < file.files.length; i++) {
            var f = file.files[i], path = c.id + "/" + t.id + "/" + uid() + "-" + safeName(f.name);
            if (f.size > 100 * 1024 * 1024) throw new Error(f.name + " è più grande di 100 MB.");
            ok(await x.sb.storage.from("scansioni").upload(path, f, { contentType: f.type || undefined }));
            ok(await x.sb.from("test_scans").insert({ test_id: t.id, class_id: c.id, file_path: path, file_name: f.name.slice(0, 200) }));
          }
          msg.replaceChildren(askClaude(h, x));
          ctx.reload();
        } catch (err) { msg.replaceChildren(x.notice("err", x.errText(err))); }
        e.target.disabled = false;
      } })), msg,
      scans.length ? h("ul", { class: "vl-scans" }, scans.map(function (s) { return scanLine(h, s); })) : null);
    tools.appendChild(panel);
  }
  function askClaude(h, x) {
    var phrase = "Correggi le scansioni delle verifiche";
    return h("div", { class: "notice ok stack" }, h("span", { text: "Caricata. Quando vuoi la prima correzione, scrivi a Claude nel progetto Novaula:" }),
      h("div", { class: "row" }, h("code", { text: "«" + phrase + "»" }), h("button", { class: "btn link", type: "button", text: "Copia", onclick: function () {
        (navigator.clipboard ? navigator.clipboard.writeText(phrase) : Promise.reject()).then(function () { x.toast("Copiato."); }, function () {});
      } })));
  }
  function scanLine(h, s) {
    return h("li", { class: "vl-scan-line " + s.status },
      h("span", { text: (s.file_name || "scansione") + " · " + day(s.created_at.slice(0, 10)) }),
      h("span", { class: "vl-scan-st", text: SCAN_STATE[s.status] + (s.status === "fatta" && s.students ? " (" + s.students + " copie)" : "") }),
      s.note ? h("span", { class: "small muted", text: s.note }) : null);
  }
  function inboxCard(ctx) {
    var h = ctx.h, D = ctx.D(), x = ctx.x;
    var card = section(h, "Posta in arrivo", "scansioni");
    if (!D.scansReady) { card.appendChild(h("p", { class: "small muted", text: "La posta in arrivo si attiva con l'aggiornamento del database di questa versione." })); return card; }
    var waiting = D.scans.filter(function (s) { return s.status === "nuova"; });
    var recent = D.scans.slice(0, 8);
    if (!recent.length) { card.appendChild(h("p", { class: "small muted", text: "Nessuna scansione. Dopo una verifica su carta, tocca «📥 Scansioni» accanto alla verifica." })); return card; }
    if (waiting.length) card.appendChild(askClaude(h, x));
    var testOf = {}; D.tests.forEach(function (t) { testOf[t.id] = t; });
    card.appendChild(h("ul", { class: "vl-scans" }, recent.map(function (s) {
      var t = testOf[s.test_id], cl = x.findClass(s.class_id);
      var li = scanLine(h, s);
      li.insertBefore(h("b", { text: (cl ? cl.name.split(" ")[0] : s.class_id) + " · " + (t ? t.title : "verifica") }), li.firstChild);
      return li;
    })));
    return card;
  }

  /* ---------- Elenco della classe ---------- */
  var PARTICLES = /^(de|di|del|della|dello|dei|degli|da|dal|dalla|la|lo|li|le|van|von|mc|mac|d'|dell'|de')$/i;
  function parseRoster(text, firstFirst) {
    return text.split(/\r?\n/).map(function (l) { return l.replace(/^\s*\d+\s*[.)\-]?\s+/, "").replace(/\s+/g, " ").trim(); }).filter(Boolean).map(function (l) {
      var cells = l.split(/\t|;|,/).map(function (s) { return s.trim(); }).filter(Boolean);
      if (cells.length >= 2) return firstFirst ? { first: cells[0], last: cells.slice(1).join(" ") } : { last: cells[0], first: cells.slice(1).join(" ") };
      var w = l.split(" ");
      if (w.length < 2) return { last: l, first: "" };
      if (firstFirst) { var j = w.length - 1; while (j > 1 && PARTICLES.test(w[j - 1])) j--; return { first: w.slice(0, j).join(" "), last: w.slice(j).join(" ") }; }
      var k = 1; while (k < w.length - 1 && PARTICLES.test(w[k - 1])) k++;
      // cognomi tutti maiuscoli (come nei registri): "DE LUCA Marco Antonio"
      if (w[0] === w[0].toUpperCase() && /[A-Z]/.test(w[0])) { k = 0; while (k < w.length - 1 && w[k] === w[k].toUpperCase()) k++; k = Math.max(1, k); }
      return { last: w.slice(0, k).join(" "), first: w.slice(k).join(" ") };
    });
  }
  function rosterCard(ctx, c, cp) {
    var h = ctx.h, x = ctx.x;
    var ta = h("textarea", { rows: 6, placeholder: "Un nome per riga, per esempio:\nRossi Mario\nDE LUCA Anna Maria\nBianchi, Luca", "aria-label": "Elenco della classe" });
    var order = h("select", { "aria-label": "Ordine" }, h("option", { value: "last", text: "Cognome e poi nome" }), h("option", { value: "first", text: "Nome e poi cognome" }));
    var preview = h("div", { class: "stack" });
    var card = h("details", { class: "card vl-card", id: "vl-roster", open: cp.students.length ? null : true },
      h("summary", { class: "vl-h" }, "Elenco della classe", h("span", { class: "vl-sub", text: cp.students.length + " studenti" })),
      h("p", { class: "small muted", text: "Incolla l'elenco dal registro (anche da Excel). Chi c'è già viene saltato; gli studenti poi scelgono il proprio nome in «Il mio profilo» e mettono il PIN." }),
      ta, h("label", null, "Ordine dei nomi", order),
      h("div", { class: "row" }, h("button", { class: "btn", type: "button", text: "Controlla i nomi", onclick: show })), preview);
    var have = {};
    cp.students.forEach(function (s) { have[(s.first_name + " " + s.last_name).toLowerCase().replace(/\s+/g, " ")] = true; });
    function show() {
      var rows = parseRoster(ta.value, order.value === "first");
      if (!rows.length) { preview.replaceChildren(x.notice("err", "Incolla almeno un nome.")); return; }
      var items = rows.map(function (r) {
        var last = h("input", { type: "text", value: r.last, maxlength: 40, "aria-label": "Cognome" }), first = h("input", { type: "text", value: r.first, maxlength: 40, "aria-label": "Nome" });
        var row = h("div", { class: "vl-ros" }, last, first,
          h("button", { class: "btn link", type: "button", text: "⇄", "aria-label": "Scambia nome e cognome", onclick: function () { var v = last.value; last.value = first.value; first.value = v; } }),
          h("button", { class: "btn link danger", type: "button", text: "✕", "aria-label": "Togli", onclick: function () { row.remove(); } }));
        if (have[(r.first + " " + r.last).toLowerCase().replace(/\s+/g, " ")]) row.appendChild(h("span", { class: "small muted", text: "c'è già" }));
        return row;
      });
      var save = h("button", { class: "btn primary", type: "button", text: "Aggiungi " + rows.length + " studenti" });
      save.addEventListener("click", async function () {
        var list = Array.prototype.map.call(preview.querySelectorAll(".vl-ros"), function (r) { var i = r.querySelectorAll("input"); return { last: i[0].value.trim(), first: i[1].value.trim() }; })
          .filter(function (r) { return r.last && r.first; });
        if (!list.length) return;
        save.disabled = true;
        try {
          var out = ok(await x.sb.rpc("teacher_add_students", { p_class: c.id, p_rows: list }));
          x.toast(out.added + " studenti aggiunti" + (out.skipped ? ", " + out.skipped + " saltati (già presenti o incompleti)" : "") + ".");
          ctx.reload();
        } catch (e) { save.disabled = false; x.toast(x.errText(e)); }
      });
      preview.replaceChildren(h("p", { class: "small muted", text: "Controlla: a sinistra il cognome, a destra il nome. ⇄ li scambia." }), h("div", { class: "vl-ros-list" }, items), h("div", { class: "row" }, save));
    }
    return card;
  }

  /* ---------- Impostazioni ---------- */
  function settingsCard(ctx) {
    var h = ctx.h, x = ctx.x, P = ctx.D().plan;
    function num(k, label) { return h("label", null, label, h("input", { type: "number", min: 0, max: 12, value: P[k], name: k, inputmode: "numeric" })); }
    var form = h("form", { class: "stack" },
      h("p", { class: "small muted", text: "Valgono per tutte le classi e per ogni periodo (i periodi si cambiano nella Pagella)." }),
      h("div", { class: "vl-three" }, num("min_marks", "Voti minimi"), num("min_verifica", "di cui verifiche"), num("min_orale", "di cui interrogazioni")),
      h("label", null, "Email della cartoleria", h("input", { type: "email", name: "print_email", value: P.print_email, placeholder: "cartoleria@esempio.it", autocomplete: "off" })),
      h("label", null, "Istruzioni di stampa", h("input", { type: "text", name: "print_notes", value: P.print_notes, maxlength: 200 })),
      h("label", null, "Firma dell'email", h("input", { type: "text", name: "signature", value: P.signature, maxlength: 100, placeholder: "Prof. …" })),
      h("div", { class: "row" }, h("button", { class: "btn primary", type: "submit", text: "Salva" })));
    form.addEventListener("submit", async function (e) {
      e.preventDefault();
      var f = form.elements, w = {
        min_marks: Math.max(0, +f.min_marks.value || 0), min_verifica: Math.max(0, +f.min_verifica.value || 0), min_orale: Math.max(0, +f.min_orale.value || 0),
        print_email: f.print_email.value.trim(), print_notes: f.print_notes.value.trim(), signature: f.signature.value.trim() };
      try { ok(await x.sb.from("grade_settings").upsert({ scope: "piano", weights: w, updated_at: new Date().toISOString() })); x.toast("Impostazioni salvate."); ctx.reload(); }
      catch (err) { x.toast(x.errText(err)); }
    });
    return h("details", { class: "card vl-card" }, h("summary", { class: "vl-h" }, "Impostazioni", h("span", { class: "vl-sub", text: "obiettivi e cartoleria" })), form);
  }

  /* ---------- «Questa settimana» (home e Area docente) ---------- */
  function week(box, x) {
    if (!x.sb) return;
    var h = x.h, card = h("section", { class: "card vl-week" }, h("p", { class: "small muted", text: "Caricamento delle valutazioni…" }));
    box.appendChild(card);
    loadAll(x.sb).then(function (D) {
      var classes = x.classes || [], end = addDays(D.today, 6), lines = {}, alerts = [];
      classes.forEach(function (c) {
        var cp = classPlan(D, c.id), tag = c.name.split(" ")[0];
        cp.tests.forEach(function (t) { if (t.test_date >= D.today && t.test_date <= end) (lines[t.test_date] = lines[t.test_date] || []).push({ c: c, text: "✍ Verifica: " + t.title }); });
        Object.keys(cp.orals).forEach(function (d) { if (d <= end) (lines[d] = lines[d] || []).push({ c: c, text: "🗣 Interroga " + cp.orals[d].map(function (r) { return r.s.last_name; }).join(", ") }); });
        var mk = cp.todo.filter(function (t) { return t.kind === "mark"; }).length, mv = cp.todo.filter(function (t) { return t.kind === "move" || t.kind === "new"; }).length;
        if (mk) alerts.push(tag + ": " + mk + (mk === 1 ? " verifica da registrare" : " verifiche da registrare"));
        if (mv) alerts.push(tag + ": " + mv + (mv === 1 ? " data da confermare" : " date da confermare"));
        if (!cp.students.length) alerts.push(tag + ": manca l'elenco");
      });
      var waiting = D.scans.filter(function (s) { return s.status === "nuova"; }).length;
      if (waiting) alerts.unshift(waiting + (waiting === 1 ? " scansione aspetta" : " scansioni aspettano") + " Claude");
      var days = Object.keys(lines).sort();
      card.replaceChildren(
        h("div", { class: "vl-week-head" }, h("h2", { text: "Valutazioni della settimana" }), h("a", { class: "btn", href: "#/docente/valutazioni", text: "Apri il piano →" })),
        alerts.length ? h("ul", { class: "vl-alerts" }, alerts.slice(0, 6).map(function (a) { return h("li", { text: a }); })) : null,
        days.length ? h("ul", { class: "vl-days" }, days.map(function (d) {
          return h("li", null, h("span", { class: "vl-date", text: d === D.today ? "oggi" : day(d) }),
            h("div", null, lines[d].map(function (l) { return h("a", { class: "vl-line", href: "#/docente/valutazioni/" + l.c.id, style: "--cc:" + x.classColor(l.c) }, h("b", { text: l.c.name.split(" ")[0] + " " }), l.text); })));
        })) : h("p", { class: "small muted", text: alerts.length ? "Nessuna verifica o interrogazione in programma nei prossimi 7 giorni." : "Niente in programma nei prossimi 7 giorni: tutto in ordine." }));
    }).catch(function (e) { card.replaceChildren(x.notice("err", x.errText(e))); });
  }

  window.NovaulaValutazioni = { page: page, week: week, _test: { parseRoster: parseRoster, holiday: holiday, easter: easter, classPlan: classPlan, proposeTests: proposeTests, code: code } };
})();
