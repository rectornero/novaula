/* Novaula · Agenda: cosa fare oggi (docente), la settimana della classe (studenti), calendario dell'anno e Google Classroom.
   Mette insieme dati che l'app ha già: orario (orario.js), piano valutazioni (valutazioni.js), riunioni, compiti, verifiche,
   più il calendario dell'anno qui sotto (Lazio 2026/27 e scadenze nazionali) e le date aggiunte dal docente
   (tabella calendar_events, aggiornamenti/2026-10-29-agenda.sql). Niente timer e niente cron: legge solo quando si apre la pagina.
   app.js chiama:
     window.NovaulaAgenda.today(contenitore, aiuti)        home del docente: «La tua giornata», con le spunte del giorno
     window.NovaulaAgenda.page(contenitore, aiuti)         pagina #/docente/agenda: giornata, calendario dell'anno, link Classroom
     window.NovaulaAgenda.student(contenitore, aiuti, c)   pagina della classe: «La tua settimana» per gli studenti
     window.NovaulaAgenda.share(aiuti, url, titolo, testo) pulsante «Condividi su Classroom» (solo link, nessun accesso a Google)
     window.NovaulaAgenda.scrutinio(righe, periodo, aiuti, classe) Pagella: voti proposti e bozze di giudizio da copiare sul registro
   Studenti con PDP/PEI: colonne students.learning_plan e plan_note (solo docente). Ore di ricevimento: grade_settings scope 'agenda'.
   Assenze (absences), argomento dell'ora (lesson_log) e suggerimenti degli studenti (feedback): aggiornamenti/2026-10-29-registro.sql. */
(function () {
  "use strict";

  // Calendario 2026/27. src: "regione" = calendario della Regione Lazio; "norma" = scadenza nazionale;
  // "prassi" = data abituale da confermare con la circolare della scuola (non conta come giorno di vacanza).
  // student: true = la vedono anche gli studenti. Da aggiornare ogni anno.
  var FIXED = [
    { day: "2026-09-15", title: "Inizio delle lezioni", kind: "evento", src: "regione", student: true },
    { day: "2026-10-31", title: "PEI approvati dal GLO", kind: "scadenza", src: "norma", note: "D.I. 182/2020: entro il 31 ottobre (proroga solo per motivi documentati)" },
    { day: "2026-11-01", title: "Ognissanti", kind: "vacanza", src: "norma", student: true },
    { day: "2026-11-30", title: "PDP (DSA e BES) firmati e consegnati", kind: "scadenza", src: "prassi", note: "Di solito entro novembre: la data esatta è nella circolare" },
    { day: "2026-12-07", title: "Ponte dell'Immacolata", kind: "vacanza", src: "prassi", student: true, note: "Molte scuole del Lazio chiudono: verifica la delibera del Consiglio d'istituto" },
    { day: "2026-12-08", title: "Immacolata", kind: "vacanza", src: "norma", student: true },
    { day: "2026-12-23", until: "2027-01-06", title: "Vacanze di Natale", kind: "vacanza", src: "regione", student: true },
    { day: "2027-03-25", until: "2027-03-30", title: "Vacanze di Pasqua", kind: "vacanza", src: "regione", student: true },
    { day: "2027-04-25", title: "Festa della Liberazione", kind: "vacanza", src: "norma", student: true },
    { day: "2027-05-01", title: "Festa del lavoro", kind: "vacanza", src: "norma", student: true },
    { day: "2027-05-15", title: "Documento del 15 maggio", kind: "scadenza", src: "norma", cls: ["5f", "5g"], note: "D.Lgs. 62/2017, art. 17: il consiglio di classe delle quinte lo approva entro il 15 maggio" },
    { day: "2027-06-02", title: "Festa della Repubblica", kind: "vacanza", src: "norma", student: true },
    { day: "2027-06-08", title: "Ultimo giorno di lezione", kind: "evento", src: "regione", student: true },
    { day: "2027-06-12", title: "Programma svolto e relazione finale", kind: "scadenza", src: "prassi", note: "Di solito subito dopo la fine delle lezioni, prima degli scrutini finali" }
  ];
  var FIRST = "2026-09-15", LAST = "2027-06-08";
  var KINDS = { scadenza: "Scadenza", scrutinio: "Scrutinio", vacanza: "Vacanza", evento: "Evento" };
  var ICON = { scadenza: "📌", scrutinio: "🗂️", vacanza: "🌴", evento: "🔔" };
  var SRC = { regione: "Regione Lazio", norma: "Norma nazionale", prassi: "Da confermare", scuola: "Della scuola" };
  var DAYS = ["dom", "lun", "mar", "mer", "gio", "ven", "sab"];
  var MONTHS = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];
  var TICKS = "novaula-agenda-";

  function pad(n) { return String(n).padStart(2, "0"); }
  function iso(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
  function todayIso() { return iso(new Date()); }
  function dateOf(s) { return new Date(s + "T12:00:00"); }
  function addDays(s, n) { var d = dateOf(s); d.setDate(d.getDate() + n); return iso(d); }
  function diffDays(a, b) { return Math.round((dateOf(b) - dateOf(a)) / 86400000); }
  function wd(s) { var g = dateOf(s).getDay(); return g === 0 ? 7 : g; }
  function short(s) { var d = dateOf(s); return DAYS[d.getDay()] + " " + d.getDate() + "/" + (d.getMonth() + 1); }
  function dm(s) { var d = dateOf(s); return d.getDate() + "/" + (d.getMonth() + 1); }
  function hhmm(t) { return String(t).slice(0, 5).replace(":", "."); }
  function tag(c, id) { return c ? c.name.split(" ")[0] : String(id || "").toUpperCase(); }
  function inDays(n) { return n === 0 ? "oggi" : n === 1 ? "domani" : "tra " + n + " giorni"; }
  function ticks(day, v) {
    try {
      if (v === undefined) return JSON.parse(localStorage.getItem(TICKS + day) || "{}");
      localStorage.setItem(TICKS + day, JSON.stringify(v));
      // tiene solo l'ultima settimana di spunte
      for (var i = localStorage.length - 1; i >= 0; i--) {
        var k = localStorage.key(i);
        if (k && k.indexOf(TICKS) === 0 && k.slice(TICKS.length) < addDays(day, -7)) localStorage.removeItem(k);
      }
    } catch (e) { return {}; }
  }

  // Date dell'anno: fisse + aggiunte dal docente (src "scuola")
  function allEvents(custom) {
    return FIXED.concat((custom || []).map(function (e) {
      return { id: e.id, day: e.day, until: e.until, title: e.title, kind: e.kind, src: "scuola", cls: e.class_id ? [e.class_id] : null, student: e.public };
    })).sort(function (a, b) { return a.day < b.day ? -1 : a.day > b.day ? 1 : 0; });
  }
  function covers(e, s) { return s >= e.day && s <= (e.until || e.day); }
  // Giorno senza lezioni: fine settimana, fuori dall'anno, festività e vacanze certe (non quelle "da confermare")
  function offDay(s, events) {
    if (wd(s) > 5 || s < FIRST || s > LAST) return true;
    return events.some(function (e) { return e.kind === "vacanza" && e.src !== "prassi" && !e.cls && covers(e, s); });
  }
  function offReason(s, events) {
    if (wd(s) > 5) return "fine settimana";
    if (s < FIRST) return "le lezioni iniziano il " + dm(FIRST);
    if (s > LAST) return "le lezioni sono finite";
    var e = events.filter(function (x) { return x.kind === "vacanza" && x.src !== "prassi" && !x.cls && covers(x, s); })[0];
    return e ? e.title : "";
  }
  function lastSchoolDay(to, events) {
    for (var s = to, i = 0; i < 40 && offDay(s, events); i++) s = addDays(s, -1);
    return s;
  }
  // come replaceChildren, ma accetta liste annidate e salta i null
  function put(el) {
    var items = [].slice.call(arguments, 1);
    el.textContent = "";
    (function add(list) { list.forEach(function (n) { if (n == null || n === false) return; if (Array.isArray(n)) add(n); else el.appendChild(typeof n === "string" ? document.createTextNode(n) : n); }); })(items);
  }
  // festa che cade di sabato o domenica: non cambia nulla, non la segnaliamo
  function weekendOnly(e) { return e.kind === "vacanza" && !e.until && wd(e.day) > 5; }
  function forClass(e, cid) { return !e.cls || e.cls.indexOf(cid) >= 0; }

  /* ---------- Dati del docente ---------- */
  async function loadTeacher(x) {
    var sb = x.sb, t = todayIso(), y = +t.slice(0, 4) - (+t.slice(5, 7) >= 9 ? 0 : 1);
    var start = new Date(); start.setHours(0, 0, 0, 0);
    var end = new Date(start); end.setDate(end.getDate() + 1);
    var r = await Promise.all([
      window.NovaulaOrarioData ? window.NovaulaOrarioData.load(sb) : [],
      window.NovaulaValutazioni && window.NovaulaValutazioni.data ? window.NovaulaValutazioni.data(sb).catch(function () { return null; }) : null,
      sb.from("meetings").select("id, kind, title, class_id, starts_at, link").gte("starts_at", start.toISOString()).lt("starts_at", end.toISOString()).order("starts_at"),
      sb.from("assignments").select("id, class_id, title, due_date, deck, test_id").gte("due_date", addDays(t, -3)).lte("due_date", t),
      sb.from("calendar_events").select("*").gte("day", y + "-09-01").order("day"),
      sb.from("students").select("id, class_id, first_name, last_name, learning_plan, plan_note").not("learning_plan", "is", null),
      sb.from("grade_settings").select("weights").eq("scope", "agenda").maybeSingle(),
      sb.from("absences").select("id, class_id, student_id, day").gte("day", addDays(t, -45)),
      sb.from("lesson_log").select("*").eq("day", t),
      sb.from("feedback").select("id", { count: "exact", head: true }).eq("status", "nuovo")
    ]);
    var D = r[1];
    return {
      today: t, slots: r[0] || [], D: D,
      meetings: r[2].error ? [] : r[2].data || [],
      due: r[3].error ? [] : (r[3].data || []).filter(function (a) { return !a.deck && !a.test_id; }),
      custom: r[4].error ? [] : r[4].data || [], customReady: !r[4].error,
      plans: r[5].error ? [] : r[5].data || [], plansReady: !r[5].error,
      settings: (!r[6].error && r[6].data && r[6].data.weights) || {},
      absences: r[7].error ? [] : r[7].data || [], absReady: !r[7].error,
      logs: r[8].error ? [] : r[8].data || [], logReady: !r[8].error,
      newFeedback: r[9].error ? 0 : r[9].count || 0
    };
  }

  // Le voci della giornata, in tre gruppi: prima, in classe, dopo
  function buildDay(T, x) {
    var t = T.today, events = allEvents(T.custom), D = T.D, classes = x.classes || [];
    var off = offDay(t, events), plans = {};
    if (D && window.NovaulaValutazioni.plan) classes.forEach(function (c) { try { plans[c.id] = window.NovaulaValutazioni.plan(D, c.id); } catch (e) { /* classe senza dati */ } });
    var before = [], lessons = [], after = [], ahead = [];

    T.meetings.forEach(function (m) {
      var c = m.class_id && x.findClass(m.class_id), d = new Date(m.starts_at);
      before.push({ id: "m-" + m.id, time: pad(d.getHours()) + "." + pad(d.getMinutes()), text: (m.kind === "cdc" ? "Consiglio di classe" : m.kind === "glo" ? "GLO" : m.title) + (c ? " " + tag(c) : ""),
        sub: "Prepara la situazione della classe (voti e assenze) prima della riunione", href: m.link || "#/docente/riunioni", ext: !!m.link, cls: c });
    });
    if (!off) (T.settings.colloqui || []).filter(function (k) { return +k.weekday === wd(t); }).forEach(function (k, i) {
      before.push({ id: "ric-" + i, time: hhmm(k.starts), text: "Ricevimento genitori " + hhmm(k.starts) + "–" + hhmm(k.ends) + (k.note ? " · " + k.note : ""),
        sub: "Controlla le prenotazioni sul registro elettronico e tieni aperta la Pagella" });
    });
    before.sort(function (a, b) { return (a.time || "") < (b.time || "") ? -1 : 1; });
    if (!off) {
      before.unshift({ id: "circ", text: "Leggi circolari e avvisi sul registro elettronico", sub: "Prima della prima ora: sostituzioni, uscite, comunicazioni" });
      T.slots.filter(function (r) { return r.weekday === wd(t); }).sort(function (a, b) { return a.starts < b.starts ? -1 : 1; }).forEach(function (r) {
        var c = x.findClass(r.class_id), P = plans[r.class_id], extra = [];
        var test = P && P.tests.filter(function (k) { return k.test_date === t; })[0];
        if (test) extra.push("✍ Verifica «" + test.title + "»: porta le copie");
        if (test) extra = extra.concat(planLines(T, r.class_id));
        if (P && P.orals[t]) extra.push("🗣 Interroga " + P.orals[t].map(function (o) { return o.s.last_name; }).join(", "));
        lessons.push({ id: "l-" + r.starts, time: hhmm(r.starts), text: tag(c, r.class_id) + " · " + (r.subject || "") + (r.room ? " · aula " + r.room : ""),
          sub: "Registro: firma, assenze, argomento e compiti per casa", extra: extra, href: "#/c/" + r.class_id + "/programma", cls: c, lesson: r });
      });
    }
    classes.forEach(function (c) {
      var P = plans[c.id];
      if (!P) return;
      P.todo.filter(function (k) { return k.kind === "mark"; }).forEach(function (k) {
        var ago = diffDays(k.test.test_date, t);
        after.push({ id: "v-" + k.test.id, text: "Correggi e registra la verifica «" + k.test.title + "» (" + tag(c) + ")",
          sub: "Fatta " + (ago === 1 ? "ieri" : ago + " giorni fa") + (ago >= 10 ? ": di solito va riconsegnata entro 15 giorni" : ""), warn: ago >= 10, href: "#/docente/valutazioni/" + c.id, cls: c });
      });
      var tomorrow = nextSchoolDay(t, events);
      P.tests.filter(function (k) { return k.test_date === tomorrow; }).forEach(function (k) {
        after.push({ id: "p-" + k.id, text: "Stampa le copie per la verifica di " + short(tomorrow) + " in " + tag(c) + ": «" + k.title + "»", href: "#/docente/valutazioni/" + c.id, cls: c,
          extra: planLines(T, c.id) });
      });
    });
    // Recuperi: assenti nel giorno di una verifica degli ultimi 45 giorni, senza voto per quella verifica
    if (D) classes.forEach(function (c) {
      var P = plans[c.id];
      if (!P) return;
      P.tests.filter(function (k) { return k.test_date && k.test_date < t && k.test_date >= addDays(t, -45); }).forEach(function (k) {
        var marked = {};
        D.marks.forEach(function (m) { if (m.test_id === k.id) marked[m.student_id] = true; });
        var who = T.absences.filter(function (a) { return a.class_id === c.id && a.day === k.test_date && !marked[a.student_id]; })
          .map(function (a) { var st = D.students.filter(function (z) { return z.id === a.student_id; })[0]; return st ? st.last_name : null; }).filter(Boolean);
        if (who.length) after.push({ id: "r-" + k.id, text: "Recupero della verifica «" + k.title + "» (" + tag(c) + ")", sub: "Assenti il " + dm(k.test_date) + ": " + who.join(", "),
          warn: diffDays(k.test_date, t) >= 14, href: "#/docente/valutazioni/" + c.id, cls: c });
      });
    });
    if (T.newFeedback) after.push({ id: "f-" + T.newFeedback, text: "Leggi " + (T.newFeedback === 1 ? "il nuovo suggerimento" : "i " + T.newFeedback + " nuovi suggerimenti") + " degli studenti", href: "#/docente/agenda" });
    T.due.forEach(function (a) {
      var c = x.findClass(a.class_id);
      after.push({ id: "c-" + a.id, text: "Guarda le consegne di «" + a.title + "» (" + tag(c, a.class_id) + ")",
        sub: a.due_date === t ? "Scadono oggi" : "Scadute " + (diffDays(a.due_date, t) === 1 ? "ieri" : short(a.due_date)), href: "#/c/" + a.class_id + "/compiti", cls: c });
    });
    if (!off && wd(t) === 5) after.push({ id: "w-fri", text: "Riporta sul registro elettronico i voti della settimana", sub: "E guarda cosa c'è in programma la prossima" });
    if (!off && wd(t) === 1) after.push({ id: "w-mon", text: "Controlla il piano valutazioni della settimana", href: "#/docente/valutazioni" });

    // In arrivo (senza spunta): fine del periodo e date dei prossimi 21 giorni
    var term = D && D.term;
    if (term && term.to >= t && term.from <= t) {
      var lastDay = lastSchoolDay(term.to, events), left = diffDays(t, lastDay);
      var behind = [];
      if (left <= 30) classes.forEach(function (c) {
        var P = plans[c.id], n = P ? P.rows.filter(function (row) { return row.status === "behind"; }).length : 0;
        if (n) behind.push(tag(c) + " " + n);
      });
      ahead.push({ day: lastDay, icon: "🏁", text: "Fine del " + term.name.toLowerCase() + ": ultime lezioni " + inDays(left) + " (" + short(lastDay) + ")",
        sub: behind.length ? "Studenti sotto il minimo di voti: " + behind.join(", ") : left <= 30 ? "Tutti hanno i voti minimi" : null, warn: behind.length > 0, href: "#/docente/valutazioni" });
    }
    events.forEach(function (e) {
      var to = e.until || e.day;
      if (to < t || e.day > addDays(t, 21)) return;
      if (weekendOnly(e)) return;
      var n = Math.max(0, diffDays(t, e.day)), c = e.cls && e.cls.length === 1 ? x.findClass(e.cls[0]) : null;
      ahead.push({ day: e.day, icon: ICON[e.kind], text: e.title + (e.cls ? " (" + e.cls.map(function (id) { return tag(x.findClass(id), id); }).join(", ") + ")" : "") + " · " + (e.day <= t ? "oggi" : inDays(n) + ", " + short(e.day)),
        sub: e.note || (e.src === "prassi" ? "Data da confermare con la circolare" : null), warn: e.kind === "scadenza" && n <= 3, cls: c });
    });
    ahead.sort(function (a, b) { return a.day < b.day ? -1 : 1; });
    return { off: off, reason: offReason(t, events), next: nextSchoolDay(t, events), before: before, lessons: lessons, after: after, ahead: ahead };
  }
  /* ---------- Registro di quest'ora: assenti e argomento in una riga ---------- */
  function lessonPanel(T, x, r) {
    var h = x.h, t = T.today, cid = r.class_id, starts = String(r.starts).slice(0, 5);
    var log = T.logs.filter(function (l) { return l.class_id === cid && l.starts === starts; })[0];
    var sum = h("summary", { text: log ? "📋 Registro di quest'ora ✓" : "📋 Registro di quest'ora" });
    var body = h("div", { class: "ag-reg" });
    var det = h("details", { class: "ag-reg-det" }, sum, body);
    var built = false;
    det.addEventListener("toggle", async function () {
      if (!det.open || built) return;
      built = true;
      put(body, h("p", { class: "small muted", text: "Caricamento…" }));
      var q = await Promise.all([
        x.sb.from("students").select("id, first_name, last_name").eq("class_id", cid).order("last_name").order("first_name"),
        x.sb.from("topics").select("id, title, done, position").eq("class_id", cid).order("position")
      ]);
      if (q[0].error || q[1].error) { put(body, x.notice("err", x.errText(q[0].error || q[1].error))); built = false; return; }
      var students = q[0].data || [], topics = q[1].data || [], chosen = null;
      function absent() { return students.filter(function (s) { return T.absences.some(function (a) { return a.student_id === s.id && a.day === t; }); }); }
      var line = h("p", { class: "ag-line" });
      var text = h("input", { type: "text", maxlength: 300, value: log ? log.text : "", placeholder: "Che cosa avete fatto in quest'ora", "aria-label": "Argomento svolto" });
      var markDone = h("input", { type: "checkbox", checked: true });
      var markRow = h("label", { class: "ag-inline", hidden: true }, markDone, "Segna l'argomento come svolto nel programma");
      function paintLine() {
        var a = absent().map(function (s) { return s.last_name + " " + s.first_name; });
        line.textContent = (text.value.trim() ? "Argomento: " + text.value.trim().replace(/\.$/, "") + "." : "Argomento: …") + (a.length ? " Assenti: " + a.join(", ") + "." : " Nessun assente.");
      }
      text.addEventListener("input", function () { chosen = null; markRow.hidden = true; paintLine(); });
      var chips = students.map(function (s) {
        var b = h("button", { class: "ag-chip", type: "button", text: s.last_name + " " + s.first_name.charAt(0) + "." });
        function mark() { b.setAttribute("aria-pressed", String(absent().indexOf(s) >= 0)); }
        b.addEventListener("click", async function () {
          b.disabled = true;
          var cur = T.absences.filter(function (a) { return a.student_id === s.id && a.day === t; })[0], res;
          if (cur) { res = await x.sb.from("absences").delete().eq("id", cur.id); if (!res.error) T.absences = T.absences.filter(function (a) { return a !== cur; }); }
          else { res = await x.sb.from("absences").insert({ class_id: cid, student_id: s.id, day: t }).select("id, class_id, student_id, day").single(); if (!res.error) T.absences.push(res.data); }
          b.disabled = false;
          if (res.error) x.toast(x.errText(res.error));
          mark(); paintLine();
        });
        mark();
        return b;
      });
      var next = topics.filter(function (tp) { return tp.done === false; }).slice(0, 2), prev = topics.filter(function (tp) { return tp.done !== false; }).slice(-2);
      var topicChips = prev.concat(next).map(function (tp) {
        return h("button", { class: "ag-chip topic" + (tp.done === false ? " next" : ""), type: "button", text: tp.title, onclick: function () {
          text.value = tp.title; chosen = tp; markRow.hidden = tp.done !== false; paintLine();
        } });
      });
      var save = h("button", { class: "btn primary", type: "button", text: "Salva e copia" });
      save.addEventListener("click", async function () {
        var v = text.value.trim();
        if (!v) { x.toast("Scrivi o tocca l'argomento."); return; }
        save.disabled = true;
        var res = await x.sb.from("lesson_log").upsert({ class_id: cid, day: t, starts: starts, text: v, topic_id: chosen ? chosen.id : null }, { onConflict: "class_id,day,starts" }).select("*").single();
        if (!res.error && chosen && chosen.done === false && markDone.checked) {
          var u = await x.sb.from("topics").update({ done: true }).eq("id", chosen.id);
          if (!u.error) { chosen.done = true; markRow.hidden = true; }
        }
        save.disabled = false;
        if (res.error) { x.toast(x.errText(res.error)); return; }
        T.logs = T.logs.filter(function (l) { return l !== log; }).concat([res.data]); log = res.data;
        sum.textContent = "📋 Registro di quest'ora ✓";
        copy(x, line.textContent);
      });
      put(body,
        h("p", { class: "ag-sub", text: "Assenti oggi (tocca per segnare):" }),
        students.length ? h("div", { class: "ag-chips" }, chips) : h("p", { class: "small muted", text: "Manca l'elenco della classe." }),
        h("p", { class: "ag-sub", text: "Argomento:" }),
        topicChips.length ? h("div", { class: "ag-chips" }, topicChips) : null,
        text, markRow, line,
        h("div", { class: "row" }, save, h("button", { class: "btn link", type: "button", text: "Copia", onclick: function () { copy(x, line.textContent); } })));
      paintLine();
    });
    return det;
  }

  // Misure di PDP/PEI da preparare per una verifica
  function planLines(T, cid) {
    return T.plans.filter(function (p) { return p.class_id === cid && p.learning_plan; }).map(function (p) {
      return "♿ " + p.last_name + " " + p.first_name + " (" + String(p.learning_plan).toUpperCase() + "): " + (p.plan_note || "prepara le misure compensative e dispensative previste");
    });
  }
  function nextSchoolDay(s, events) {
    for (var d = addDays(s, 1), i = 0; i < 60; i++, d = addDays(d, 1)) if (!offDay(d, events)) return d;
    return null;
  }

  /* ---------- «La tua giornata» ---------- */
  function today(box, x) {
    if (!x.sb) return;
    var h = x.h, card = h("section", { class: "card ag" }, h("p", { class: "small muted", text: "Preparo la giornata…" }));
    box.appendChild(card);
    loadTeacher(x).then(function (T) { renderDay(card, T, x); })
      .catch(function (e) { card.replaceChildren(x.notice("err", x.errText(e))); });
    return card;
  }
  function renderDay(card, T, x) {
    var h = x.h, B = buildDay(T, x), done = ticks(T.today);
    var all = B.before.concat(B.lessons, B.after), count = h("span", { class: "ag-count" });
    function upd() { var n = all.filter(function (i) { return done[i.id]; }).length; count.textContent = all.length ? n + "/" + all.length + " fatte" : ""; card.classList.toggle("all-done", all.length > 0 && n === all.length); }
    function item(i) {
      var cb = h("input", { type: "checkbox", "aria-label": "Fatto: " + i.text });
      cb.checked = !!done[i.id];
      var li = h("li", { class: "ag-item" + (i.warn ? " warn" : "") + (cb.checked ? " done" : ""), style: i.cls ? "--cc:" + x.classColor(i.cls) : null },
        h("label", { class: "ag-check" }, cb),
        h("div", { class: "ag-body" },
          h("p", { class: "ag-text" }, i.time ? h("b", { class: "ag-time", text: i.time + " " }) : null,
            i.href ? h("a", { href: i.href, target: i.ext ? "_blank" : null, rel: i.ext ? "noopener" : null, text: i.text }) : i.text),
          i.sub ? h("p", { class: "ag-sub", text: i.sub }) : null,
          (i.extra || []).map(function (e) { return h("p", { class: "ag-extra", text: e }); }),
          i.lesson && T.logReady && T.absReady ? lessonPanel(T, x, i.lesson) : null));
      cb.addEventListener("change", function () {
        if (cb.checked) done[i.id] = true; else delete done[i.id];
        li.classList.toggle("done", cb.checked); ticks(T.today, done); upd();
      });
      return li;
    }
    function group(title, list) { return list.length ? [h("h3", { class: "ag-h", text: title }), h("ul", { class: "ag-list" }, list.map(item))] : []; }
    var d = new Date();
    put(card, 
      h("div", { class: "ag-head" },
        h("div", null, h("p", { class: "eyebrow", text: d.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" }) }), h("h2", { text: "La tua giornata" })),
        count),
      B.off ? h("p", { class: "ag-off", text: "Oggi niente lezioni" + (B.reason ? " (" + B.reason + ")" : "") + "." + (B.next ? " Si riprende " + short(B.next) + "." : "") }) : null,
      group("Prima delle lezioni", B.before),
      group("In classe", B.lessons),
      group("Dopo le lezioni", B.after),
      !B.off && !all.length ? h("p", { class: "small muted", text: "Niente da fare oggi." }) : null,
      B.ahead.length ? h("h3", { class: "ag-h", text: "In arrivo" }) : null,
      B.ahead.length ? h("ul", { class: "ag-ahead" }, B.ahead.slice(0, 6).map(function (a) {
        return h("li", { class: a.warn ? "warn" : null, style: a.cls ? "--cc:" + x.classColor(a.cls) : null },
          h("span", { class: "ag-ic", "aria-hidden": "true", text: a.icon || "•" }),
          h("div", null, a.href ? h("a", { href: a.href, text: a.text }) : h("p", { text: a.text }), a.sub ? h("p", { class: "ag-sub", text: a.sub }) : null));
      })) : null,
      h("div", { class: "row" }, h("a", { class: "btn", href: "#/docente/agenda", text: "🗓️ Calendario dell'anno →" })));
    upd();
  }

  /* ---------- Pagina #/docente/agenda ---------- */
  function page(root, x) {
    var h = x.h;
    root.appendChild(h("a", { class: "back", href: "#/docente", text: "← Area docente" }));
    root.appendChild(h("h1", { text: "Agenda e calendario" }));
    var dayBox = h("div"), calBox = h("section", { class: "card ag-cal" }, h("p", { class: "small muted", text: "Caricamento del calendario…" }));
    root.appendChild(dayBox);
    root.appendChild(calBox);
    var ricBox = h("div"), pdpBox = h("div"), fbBox = h("div");
    root.appendChild(fbBox);
    root.appendChild(ricBox);
    root.appendChild(classroomCard(x));
    root.appendChild(pdpBox);
    root.appendChild(rulesCard(h));
    async function reload() {
      var T;
      try { T = await loadTeacher(x); } catch (e) { calBox.replaceChildren(x.notice("err", x.errText(e))); return; }
      var dc = h("section", { class: "card ag" });
      dayBox.replaceChildren(dc);
      renderDay(dc, T, x);
      renderCalendar(calBox, T, x, reload);
      ricBox.replaceChildren(colloquiCard(T, x, reload));
      pdpBox.replaceChildren(pdpCard(T, x));
      fbBox.replaceChildren(feedbackCard(x));
    }
    reload();
  }

  function renderCalendar(card, T, x, reload) {
    var h = x.h, t = T.today, events = allEvents(T.custom), byMonth = {}, order = [];
    events.forEach(function (e) { var k = e.day.slice(0, 7); if (!byMonth[k]) { byMonth[k] = []; order.push(k); } byMonth[k].push(e); });
    var missing = ["scrutinio"].filter(function (k) { return !T.custom.some(function (e) { return e.kind === k; }); });
    put(card, 
      h("h2", { text: "Calendario 2026/27" }),
      h("p", { class: "small muted", text: "Lazio: lezioni dal 15 settembre all'8 giugno. Le date «da confermare» non bloccano le lezioni finché non le confermi aggiungendole qui." }),
      missing.length ? h("p", { class: "notice warn", text: "Mancano le date degli scrutini e del pagellino: le decide la scuola. Aggiungile qui sotto quando escono le circolari." }) : null,
      !T.customReady ? h("p", { class: "notice warn", text: "Per aggiungere date serve l'aggiornamento del database 2026-10-29-agenda.sql." }) : null,
      order.map(function (k) {
        var m = +k.slice(5, 7) - 1;
        return h("div", { class: "ag-month" }, h("h3", { class: "ag-h", text: MONTHS[m] + " " + k.slice(0, 4) }),
          h("ul", { class: "ag-events" }, byMonth[k].map(function (e) {
            var past = (e.until || e.day) < t, c = e.cls && e.cls.length === 1 ? x.findClass(e.cls[0]) : null;
            return h("li", { class: "ag-ev" + (past ? " past" : "") + (covers(e, t) ? " now" : ""), style: c ? "--cc:" + x.classColor(c) : null },
              h("span", { class: "ag-date", text: dm(e.day) + (e.until ? "–" + dm(e.until) : "") }),
              h("div", null,
                h("p", null, h("span", { "aria-hidden": "true", text: ICON[e.kind] + " " }), e.title,
                  e.cls ? h("b", { text: " · " + e.cls.map(function (id) { return tag(x.findClass(id), id); }).join(", ") }) : null),
                h("p", { class: "ag-sub" }, h("span", { class: "ag-src " + e.src, text: SRC[e.src] }), e.student ? " · visibile agli studenti" : "", e.note ? " · " + e.note : "")),
              e.src === "scuola" ? x.confirmBtn("Elimina", "btn link danger", async function () {
                var r = await x.sb.from("calendar_events").delete().eq("id", e.id);
                if (r.error) x.toast(x.errText(r.error)); else reload();
              }) : null);
          })));
      }),
      T.customReady ? addForm(x, reload) : null);
  }

  function addForm(x, reload) {
    var h = x.h;
    var f = h("form", { class: "ag-form" },
      h("h3", { class: "ag-h", text: "Aggiungi una data della scuola" }),
      h("div", { class: "ag-two" },
        h("label", null, "Giorno", h("input", { type: "date", name: "day", required: true, min: FIRST.slice(0, 4) + "-09-01", max: LAST.slice(0, 4) + "-08-31" })),
        h("label", null, "Fino al (facoltativo)", h("input", { type: "date", name: "until" }))),
      h("label", null, "Che cosa", h("input", { type: "text", name: "title", required: true, maxlength: 120, placeholder: "Es. Scrutini del trimestre, pagellino, ponte, uscita didattica" })),
      h("div", { class: "ag-two" },
        h("label", null, "Tipo", h("select", { name: "kind" }, Object.keys(KINDS).map(function (k) { return h("option", { value: k, text: KINDS[k] }); }))),
        h("label", null, "Classe", h("select", { name: "class_id" }, [h("option", { value: "", text: "Tutte" })].concat((x.classes || []).map(function (c) { return h("option", { value: c.id, text: c.name }); }))))),
      h("label", { class: "ag-inline" }, h("input", { type: "checkbox", name: "public" }), "Visibile agli studenti (solo date senza dati personali)"),
      h("button", { class: "btn primary", type: "submit", text: "Aggiungi" }));
    f.addEventListener("submit", async function (e) {
      e.preventDefault();
      var el = f.elements, btn = f.querySelector("button[type=submit]");
      var row = { day: el.day.value, until: el.until.value && el.until.value > el.day.value ? el.until.value : null, title: el.title.value.trim(),
        kind: el.kind.value, class_id: el.class_id.value || null, public: el.public.checked };
      if (!row.day || !row.title) return;
      btn.disabled = true;
      var r = await x.sb.from("calendar_events").insert(row);
      btn.disabled = false;
      if (r.error) { x.toast(x.errText(r.error)); return; }
      x.toast("Data aggiunta.");
      reload();
    });
    return f;
  }

  // Suggerimenti degli studenti (anonimi): nuovi in cima, «Visto» e «Fatto»
  function feedbackCard(x) {
    var h = x.h, card = h("section", { class: "card ag-fb", id: "suggerimenti" }, h("p", { class: "small muted", text: "Caricamento dei suggerimenti…" }));
    async function load() {
      var r = await x.sb.from("feedback").select("*").neq("status", "fatto").order("created_at", { ascending: false }).limit(50);
      if (r.error) { put(card, h("h2", { text: "Suggerimenti degli studenti" }), h("p", { class: "notice warn", text: "Serve l'aggiornamento del database 2026-10-29-registro.sql." })); return; }
      var list = r.data || [];
      put(card, h("h2", { text: "Suggerimenti degli studenti" }),
        h("p", { class: "small muted", text: "Arrivano dal pulsante «💡 Suggerisci» nelle pagine delle classi, senza nome. «Fatto» li toglie dall'elenco." }),
        list.length ? h("ul", { class: "ag-events" }, list.map(function (f) {
          var c = f.class_id && x.findClass(f.class_id);
          function set(st) { return async function () { var q = await x.sb.from("feedback").update({ status: st }).eq("id", f.id); if (q.error) x.toast(x.errText(q.error)); else load(); }; }
          return h("li", { class: "ag-ev" + (f.status === "nuovo" ? " now" : ""), style: c ? "--cc:" + x.classColor(c) : null },
            h("span", { class: "ag-date", text: (f.kind === "problema" ? "🐞 " : "💡 ") + dm(f.created_at.slice(0, 10)) }),
            h("div", null, h("p", { text: f.text }), h("p", { class: "ag-sub", text: (c ? tag(c) + " · " : "") + (f.status === "nuovo" ? "nuovo" : "visto") })),
            h("div", { class: "row" },
              f.status === "nuovo" ? h("button", { class: "btn link", type: "button", text: "Visto", onclick: set("visto") }) : null,
              h("button", { class: "btn link", type: "button", text: "Fatto", onclick: set("fatto") })));
        })) : h("p", { class: "small muted", text: "Nessun suggerimento in attesa." }));
    }
    load();
    return card;
  }

  function colloquiCard(T, x, reload) {
    var h = x.h, list = (T.settings.colloqui || []).slice();
    async function save(next) {
      var r = await x.sb.from("grade_settings").upsert({ scope: "agenda", weights: Object.assign({}, T.settings, { colloqui: next }) });
      if (r.error) { x.toast(x.errText(r.error)); return; }
      reload();
    }
    var f = h("form", { class: "ag-ric-form" },
      h("label", null, "Giorno", h("select", { name: "weekday" }, [1, 2, 3, 4, 5].map(function (d) { return h("option", { value: d, text: ["", "lunedì", "martedì", "mercoledì", "giovedì", "venerdì"][d] }); }))),
      h("label", null, "Dalle", h("input", { type: "time", name: "starts", required: true, value: "10:50" })),
      h("label", null, "Alle", h("input", { type: "time", name: "ends", required: true, value: "11:50" })),
      h("label", { class: "ag-wide" }, "Nota (facoltativa)", h("input", { type: "text", name: "note", maxlength: 80, placeholder: "Es. su prenotazione, su Meet" })),
      h("button", { class: "btn primary", type: "submit", text: "Aggiungi" }));
    f.addEventListener("submit", function (e) {
      e.preventDefault();
      var el = f.elements;
      if (el.ends.value <= el.starts.value) { x.toast("L'ora di fine deve venire dopo l'inizio."); return; }
      save(list.concat([{ weekday: +el.weekday.value, starts: el.starts.value, ends: el.ends.value, note: el.note.value.trim() }]));
    });
    return h("section", { class: "card ag-ric" },
      h("h2", { text: "Ricevimento genitori" }),
      h("p", { class: "small muted", text: "La tua ora settimanale di colloqui: compare nella giornata di quel giorno, tranne nei giorni di vacanza." }),
      list.length ? h("ul", { class: "ag-events" }, list.map(function (k, i) {
        return h("li", { class: "ag-ev" }, h("span", { class: "ag-date", text: ["", "lun", "mar", "mer", "gio", "ven"][k.weekday] }),
          h("p", { text: hhmm(k.starts) + "–" + hhmm(k.ends) + (k.note ? " · " + k.note : "") }),
          x.confirmBtn("Elimina", "btn link danger", function () { return save(list.filter(function (z, j) { return j !== i; })); }));
      })) : h("p", { class: "small muted", text: "Nessuna ora di ricevimento impostata." }),
      f);
  }

  function pdpCard(T, x) {
    var h = x.h, classes = x.classes || [], body = h("div", { class: "ag-pdp-body" });
    if (!T.plansReady) return h("section", { class: "card" }, h("h2", { text: "PDP e PEI" }), h("p", { class: "notice warn", text: "Serve l'aggiornamento del database 2026-10-29-agenda.sql." }));
    var sel = h("select", { "aria-label": "Classe" }, classes.map(function (c) { return h("option", { value: c.id, text: c.name }); }));
    async function show() {
      body.replaceChildren(h("p", { class: "small muted", text: "Caricamento…" }));
      var r = await x.sb.from("students").select("id, first_name, last_name, learning_plan, plan_note").eq("class_id", sel.value).order("last_name").order("first_name");
      if (r.error) { body.replaceChildren(x.notice("err", x.errText(r.error))); return; }
      if (!r.data.length) { body.replaceChildren(h("p", { class: "small muted", text: "Nessuno studente in questa classe." })); return; }
      body.replaceChildren(h("ul", { class: "ag-pdp" }, r.data.map(function (s) {
        var kind = h("select", { "aria-label": "Piano di " + s.first_name + " " + s.last_name }, [["", "—"], ["pdp", "PDP"], ["pei", "PEI"]].map(function (o) { return h("option", { value: o[0], text: o[1], selected: (s.learning_plan || "") === o[0] ? true : null }); }));
        var note = h("input", { type: "text", maxlength: 200, value: s.plan_note || "", placeholder: "Misure: tempo in più, mappe, prova ridotta…", hidden: !s.learning_plan ? true : null });
        var btn = h("button", { class: "btn", type: "button", text: "Salva" });
        kind.addEventListener("change", function () { note.hidden = !kind.value; });
        btn.addEventListener("click", async function () {
          btn.disabled = true;
          var q = await x.sb.from("students").update({ learning_plan: kind.value || null, plan_note: kind.value ? note.value.trim() || null : null }).eq("id", s.id);
          btn.disabled = false;
          x.toast(q.error ? x.errText(q.error) : "Salvato.");
        });
        return h("li", null, h("b", { text: s.last_name + " " + s.first_name }), kind, note, btn);
      })));
    }
    sel.addEventListener("change", show);
    show();
    return h("section", { class: "card ag-pdp-card" },
      h("h2", { text: "PDP e PEI" }),
      h("p", { class: "small muted", text: "Segna chi ha un piano personalizzato e le misure da preparare: la giornata te le ricorda il giorno prima e il giorno della verifica. Resta solo qui, visibile a te." }),
      sel, body);
  }

  function classroomCard(x) {
    var h = x.h;
    return h("section", { class: "card ag-gc" },
      h("h2", { text: "Google Classroom" }),
      h("p", { class: "small muted", text: "Incolla il link del corso Classroom di ogni classe (si copia dalla barra del browser, inizia con https://classroom.google.com/c/). Gli studenti vedranno il pulsante «Classroom» nella pagina della classe; nei compiti e nelle verifiche trovi «Condividi su Classroom»." }),
      (x.classes || []).map(function (c) {
        var inp = h("input", { type: "url", value: c.classroom_url || "", placeholder: "https://classroom.google.com/c/…", "aria-label": "Link Classroom di " + c.name });
        var btn = h("button", { class: "btn", type: "button", text: "Salva" });
        btn.addEventListener("click", async function () {
          var v = inp.value.trim() || null;
          if (v && !/^https:\/\/classroom\.google\.com\//.test(v)) { x.toast("Il link deve iniziare con https://classroom.google.com/"); return; }
          btn.disabled = true;
          var r = await x.sb.from("classes").update({ classroom_url: v }).eq("id", c.id).select("id");
          btn.disabled = false;
          if (r.error || !r.data || !r.data.length) { x.toast(r.error ? x.errText(r.error) : "Non salvato: serve l'aggiornamento del database 2026-10-29-agenda.sql."); return; }
          c.classroom_url = v;
          x.toast("Link salvato per " + c.name + ".");
        });
        return h("div", { class: "ag-gc-row", style: "--cc:" + x.classColor(c) }, h("b", { text: tag(c) }), inp, btn);
      }));
  }

  function rulesCard(h) {
    var rules = [
      ["Voti", "Il voto di fine periodo nasce da un congruo numero di prove scritte, orali e pratiche (DPR 122/2009). Il minimo per periodo lo fissa il collegio docenti: Novaula usa i minimi del Piano valutazioni."],
      ["Periodi", "Novaula divide l'anno in trimestre e pentamestre (lo stesso della Pagella). Le ultime lezioni del trimestre sono il 22 dicembre, perché le vacanze iniziano il 23."],
      ["Registro", "Ogni ora: firma, assenze e ritardi, argomento svolto e compiti assegnati. I voti vanno riportati sul registro elettronico, che resta il documento ufficiale."],
      ["Riconsegna", "Le verifiche si riconsegnano corrette in tempi brevi, di solito entro 15 giorni e prima della prova successiva (regolamento d'istituto)."],
      ["Inclusione", "PEI approvato dal GLO entro il 31 ottobre; PDP per DSA e BES di solito entro novembre, secondo la circolare."],
      ["Quinte", "Il documento del consiglio di classe (5F, 5G) si approva entro il 15 maggio."]
    ];
    return h("details", { class: "card ag-rules" }, h("summary", { class: "ag-h", text: "Da dove vengono queste date" }),
      h("dl", null, rules.map(function (r) { return [h("dt", { text: r[0] }), h("dd", { text: r[1] })]; })));
  }

  /* ---------- «La tua settimana» (studenti, pagina della classe) ---------- */
  function student(box, x, c) {
    var h = x.h, card = h("section", { class: "card ag-st", style: "--cc:" + x.classColor(c) });
    box.appendChild(card);
    var t = todayIso(), y = +t.slice(0, 4) - (+t.slice(5, 7) >= 9 ? 0 : 1);
    Promise.all([
      x.tests(c.id).catch(function () { return []; }),
      x.assignments(c.id).catch(function () { return []; }),
      window.NovaulaOrarioData ? window.NovaulaOrarioData.load(x.sb).catch(function () { return []; }) : [],
      x.topics ? x.topics(c.id).catch(function () { return []; }) : [],
      x.materials ? x.materials(c.id).catch(function () { return []; }) : [],
      x.sb ? x.sb.from("calendar_events").select("day, until, title, kind, class_id, public").eq("public", true).gte("day", y + "-09-01").then(function (r) { return r.error ? [] : r.data || []; }, function () { return []; }) : []
    ]).then(function (r) {
      var topics = r[3], mats = {}; r[4].forEach(function (m) { mats[m.id] = m; });
      r = [r[0], r[1], r[2], r[5]];
      var events = allEvents(r[3].filter(function (e) { return !e.class_id || e.class_id === c.id; }));
      var lines = [];
      var next = nextLesson(r[2].filter(function (l) { return l.class_id === c.id; }), events);
      if (next) lines.push(h("li", null, h("span", { class: "ag-ic", "aria-hidden": "true", text: "📍" }),
        h("p", null, "Prossima lezione: ", h("b", { text: (next.day === t ? "oggi" : next.day === addDays(t, 1) ? "domani" : short(next.day)) + " alle " + hhmm(next.r.starts) }), next.r.room ? " · aula " + next.r.room : "")));
      r[0].filter(function (k) { return k.test_date && k.test_date >= t && k.test_date <= addDays(t, 21) && !k.done; })
        .sort(function (a, b) { return a.test_date < b.test_date ? -1 : 1; }).forEach(function (k) {
          var n = diffDays(t, k.test_date);
          lines.push(h("li", { class: n <= 3 ? "warn" : null }, h("span", { class: "ag-ic", "aria-hidden": "true", text: "✍" }),
            h("div", null, h("a", { href: "#/c/" + c.id + "/verifiche", text: "Verifica «" + k.title + "» " + inDays(n) + " (" + short(k.test_date) + ")" }),
              n <= 7 ? revision(h, c, k, n, topics, mats, x) : null)));
        });
      r[1].filter(function (a) { return a.due_date && a.due_date >= t && a.due_date <= addDays(t, 7) && !a.deck && !a.test_id; })
        .sort(function (a, b) { return a.due_date < b.due_date ? -1 : 1; }).forEach(function (a) {
          var n = diffDays(t, a.due_date);
          lines.push(h("li", { class: n <= 1 ? "warn" : null }, h("span", { class: "ag-ic", "aria-hidden": "true", text: "📝" }),
            h("a", { href: "#/c/" + c.id + "/compiti", text: "Consegna «" + a.title + "» " + (n === 0 ? "entro oggi" : inDays(n)) })));
        });
      var ev = events.filter(function (e) { return e.student && (e.until || e.day) >= t && forClass(e, c.id) && !weekendOnly(e); })[0];
      if (ev) lines.push(h("li", null, h("span", { class: "ag-ic", "aria-hidden": "true", text: ICON[ev.kind] }),
        h("p", null, ev.title + (covers(ev, t) ? " · oggi" : " " + inDays(diffDays(t, ev.day))) + " (" + dm(ev.day) + (ev.until ? "–" + dm(ev.until) : "") + ")" + (ev.src === "prassi" ? " · da confermare" : ""))));
      put(card, 
        h("div", { class: "ag-head" }, h("h2", { text: "La tua settimana" }),
          c.classroom_url ? h("a", { class: "btn ag-gc-btn", href: c.classroom_url, target: "_blank", rel: "noopener", text: "Google Classroom ↗" }) : null),
        lines.length > (next ? 1 : 0) || ev ? h("ul", { class: "ag-ahead" }, lines) : h("p", { class: "small muted", text: "Niente verifiche o consegne nei prossimi giorni." }),
        x.sb && !x.teacher ? feedbackForm(x, c) : null,
        x.teacher ? h("p", { class: "small muted", text: "Così la vedono gli studenti." }) : null);
    });
    return card;
  }
  // Piano di ripasso: gli ultimi argomenti svolti, uno per sera fino alla vigilia, poi l'esercitazione
  function revision(h, c, k, n, topics, mats, x) {
    var done = topics.filter(function (tp) { return tp.done !== false; }).slice(-3);
    var t = todayIso(), evenings = [];
    for (var i = 0; i < n; i++) evenings.push(addDays(t, i));
    if (!done.length || !evenings.length) return h("p", { class: "ag-sub", text: n <= 1 ? "Ripassa gli appunti e prova l'esercitazione nella scheda Verifiche." : "Ripassa un argomento per sera: " + n + " sere bastano se inizi oggi." });
    var steps = [];
    var last = evenings.length > 1 && k.practice_url ? evenings.pop() : null;
    var use = done.slice(-evenings.length);
    use.forEach(function (tp, j) {
      var deck = (tp.material_ids || []).map(function (id) { return mats[id]; }).filter(Boolean)[0];
      steps.push(h("li", null, h("b", { text: (evenings[j] === t ? "Oggi" : short(evenings[j])) + ": " }),
        deck ? h("a", { href: x.openHref ? x.openHref(deck.url || deck.file_path, c.id, "programma", deck) : deck.url, target: "_blank", rel: "noopener", text: tp.title }) : tp.title));
    });
    if (last) steps.push(h("li", null, h("b", { text: short(last) + ": " }), h("a", { href: x.openHref ? x.openHref(k.practice_url, c.id, "verifiche", { url: k.practice_url, title: k.title }) : k.practice_url, target: "_blank", rel: "noopener", text: "esercitazione di prova" })));
    return h("div", { class: "ag-rev" }, h("p", { class: "ag-sub", text: "Piano di ripasso:" }), h("ol", null, steps));
  }

  /* ---------- Pacchetto scrutinio (Pagella) ---------- */
  function band(v) { return v >= 9 ? "ottimo" : v >= 8 ? "buono" : v >= 7 ? "discreto" : v >= 6 ? "sufficiente" : v >= 5 ? "non ancora sufficiente" : "insufficiente"; }
  function nf(v) { return (Math.round(v * 10) / 10).toLocaleString("it-IT"); }
  function comment(row, plan, minMarks) {
    var r = row.r, out = [];
    if (r.weighted == null) return "Non classificabile: nessuna valutazione confermata nel periodo.";
    out.push("Ha raggiunto un livello " + band(r.weighted) + " negli obiettivi della disciplina (" + r.n + (r.n === 1 ? " valutazione" : " valutazioni") + ", media " + nf(r.weighted) + ").");
    var conf = row.marks.filter(function (m) { return m.status === "confermato" && m.value != null; }).sort(function (a, b) { return a.mark_date < b.mark_date ? -1 : 1; });
    if (conf.length >= 4) {
      var half = Math.floor(conf.length / 2), a = conf.slice(0, half), b = conf.slice(half);
      var ma = a.reduce(function (s, m) { return s + +m.value; }, 0) / a.length, mb = b.reduce(function (s, m) { return s + +m.value; }, 0) / b.length;
      if (mb - ma >= 1) out.push("Il rendimento è in miglioramento nel corso del periodo.");
      else if (ma - mb >= 1) out.push("Il rendimento è calato nelle ultime prove.");
    }
    var ver = r.cats.verifica, ora = r.cats.orale, com = r.cats.compito;
    if (ver && ora && ver.n && ora.n && Math.abs(ver.avg - ora.avg) >= 1.5) out.push(ver.avg > ora.avg ? "Le prove scritte sono migliori dell'esposizione orale, da curare." : "L'esposizione orale è migliore delle prove scritte, da consolidare.");
    if (com && com.n && com.avg < 6) out.push("Il lavoro a casa va svolto con più regolarità.");
    if (r.n < minMarks) out.push("Le valutazioni sono ancora poche: serve almeno un'altra prova.");
    if (r.proposal < 6) out.push("Si consiglia un recupero degli argomenti del periodo con studio individuale guidato.");
    if (plan) out.push("Valutazione svolta secondo le misure previste dal " + plan.toUpperCase() + ".");
    return out.join(" ");
  }
  function scrutinio(rows, period, x, cid) {
    var h = x.h, key = "novaula-scrutinio-" + cid + "-" + period.from, saved = {};
    try { saved = JSON.parse(localStorage.getItem(key) || "{}"); } catch (e) { saved = {}; }
    function keep() { try { localStorage.setItem(key, JSON.stringify(saved)); } catch (e) { /* solo comodità */ } }
    var body = h("div", { class: "ag-scr-body" }, h("p", { class: "small muted", text: "Preparo voti e giudizi…" }));
    var det = h("details", { class: "card ag-scr" },
      h("summary", { class: "ag-h", text: "📋 Pacchetto scrutinio · " + period.name }),
      h("p", { class: "small muted", text: "Voto proposto (media ponderata arrotondata) e una bozza di giudizio per ogni studente, da rileggere e copiare nel registro elettronico. Le modifiche restano su questo dispositivo." }),
      body);
    var built = false;
    det.addEventListener("toggle", async function () {
      if (!det.open || built) return;
      built = true;
      var plans = {}, minMarks = 3;
      if (x.sb) {
        var q = await Promise.all([
          x.sb.from("students").select("id, learning_plan").eq("class_id", cid).not("learning_plan", "is", null),
          x.sb.from("grade_settings").select("weights").eq("scope", "piano").maybeSingle()
        ]);
        if (!q[0].error) (q[0].data || []).forEach(function (s) { plans[s.id] = s.learning_plan; });
        if (!q[1].error && q[1].data && q[1].data.weights && q[1].data.weights.min_marks) minMarks = +q[1].data.weights.min_marks;
      }
      var areas = [];
      var list = rows.map(function (row) {
        var name = (row.s.last_name || "") + " " + (row.s.first_name || "");
        var ta = h("textarea", { rows: 3, "aria-label": "Giudizio di " + name });
        ta.value = saved[row.s.id] != null ? saved[row.s.id] : comment(row, plans[row.s.id], minMarks);
        ta.addEventListener("input", function () { saved[row.s.id] = ta.value; keep(); });
        areas.push({ name: name, mark: row.r.proposal, ta: ta });
        return h("li", null,
          h("div", { class: "ag-scr-head" }, h("b", { text: name }), plans[row.s.id] ? h("span", { class: "badge", text: plans[row.s.id].toUpperCase() }) : null,
            h("span", { class: "mk big", text: row.r.proposal == null ? "NC" : String(row.r.proposal) })),
          ta,
          h("div", { class: "row" },
            h("button", { class: "btn link", type: "button", text: "Copia", onclick: function () { copy(x, ta.value); } }),
            h("button", { class: "btn link", type: "button", text: "Rigenera", onclick: function () { delete saved[row.s.id]; keep(); ta.value = comment(row, plans[row.s.id], minMarks); } })));
      });
      put(body, 
        h("div", { class: "row" }, h("button", { class: "btn primary", type: "button", text: "Copia tutto (per Excel)", onclick: function () {
          copy(x, ["Studente\tVoto proposto\tGiudizio"].concat(areas.map(function (a) { return a.name + "\t" + (a.mark == null ? "NC" : a.mark) + "\t" + a.ta.value.replace(/\s+/g, " "); })).join("\n"));
        } })),
        h("ol", { class: "ag-scr-list" }, list));
    });
    return det;
  }
  function copy(x, text) {
    var done = function () { x.toast("Copiato."); };
    if (navigator.clipboard) navigator.clipboard.writeText(text).then(done, function () { x.toast("Non riesco a copiare: seleziona il testo a mano."); });
    else x.toast("Non riesco a copiare: seleziona il testo a mano.");
  }

  // Pulsante «Suggerisci»: un'idea o un problema, senza nome, lo legge solo il docente
  function feedbackForm(x, c) {
    var h = x.h;
    var kind = h("select", { "aria-label": "Tipo" }, h("option", { value: "idea", text: "💡 Un'idea per Novaula" }), h("option", { value: "problema", text: "🐞 Qualcosa non funziona" }));
    var ta = h("textarea", { rows: 3, maxlength: 500, required: true, placeholder: "Scrivi qui. Non serve il nome: il messaggio arriva solo al prof." });
    var f = h("form", { class: "ag-fb-form" }, kind, ta, h("button", { class: "btn primary", type: "submit", text: "Invia" }));
    var det = h("details", { class: "ag-fb-det" }, h("summary", { text: "💡 Suggerisci un'idea o segnala un problema" }), f);
    f.addEventListener("submit", async function (e) {
      e.preventDefault();
      var v = ta.value.trim();
      if (v.length < 3) return;
      var btn = f.querySelector("button"); btn.disabled = true;
      var r = await x.sb.from("feedback").insert({ class_id: c.id, kind: kind.value, text: v });
      btn.disabled = false;
      if (r.error) { x.toast(/Troppi/.test(r.error.message || "") ? r.error.message : "Non inviato, riprova più tardi."); return; }
      put(det, h("p", { class: "notice ok", text: "Grazie! Il prof lo legge nella sua agenda." }));
    });
    return det;
  }

  function nextLesson(rows, events) {
    if (!rows.length) return null;
    var now = new Date(), t = iso(now), mins = now.getHours() * 60 + now.getMinutes();
    for (var i = 0, d = t; i < 30; i++, d = addDays(d, 1)) {
      if (offDay(d, events)) continue;
      var list = rows.filter(function (r) { return r.weekday === wd(d); }).sort(function (a, b) { return a.starts < b.starts ? -1 : 1; });
      if (d === t) list = list.filter(function (r) { var p = String(r.ends).split(":"); return +p[0] * 60 + +p[1] > mins; });
      if (list.length) return { day: d, r: list[0] };
    }
    return null;
  }

  /* ---------- Condividi su Classroom ---------- */
  // Pulsante ufficiale di condivisione: apre Classroom con il link già pronto, il docente sceglie corso e tipo di post.
  function share(x, url, title, body) {
    var q = "url=" + encodeURIComponent(url) + (title ? "&title=" + encodeURIComponent(title) : "") + (body ? "&body=" + encodeURIComponent(body.slice(0, 500)) : "");
    return x.h("a", { class: "btn link ag-share", href: "https://classroom.google.com/share?" + q, target: "_blank", rel: "noopener", text: "Condividi su Classroom" });
  }

  window.NovaulaAgenda = { today: today, page: page, student: student, share: share, scrutinio: scrutinio,
    _test: { allEvents: allEvents, offDay: offDay, buildDay: buildDay, nextLesson: nextLesson, lastSchoolDay: lastSchoolDay, comment: comment } };
})();
