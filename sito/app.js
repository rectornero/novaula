/* Piattaforma di classe: materiali, compiti con consegna e chat per classe.
   Gli studenti non hanno account; il docente accede con email e password. */
(function () {
  "use strict";

  var CFG = window.PIATTAFORMA_CONFIG || {};
  var DEMO = !CFG.SUPABASE_URL || !CFG.SUPABASE_ANON_KEY;
  var MAX_UPLOAD = 20 * 1024 * 1024;
  var app = document.getElementById("app");

  /* ---------- Piccoli aiuti ---------- */
  function h(tag, attrs) {
    var el = document.createElement(tag);
    if (attrs) for (var k in attrs) {
      var v = attrs[k];
      if (v == null || v === false) continue;
      if (k === "text") el.textContent = v;
      else if (k === "class") el.className = v;
      else if (k.slice(0, 2) === "on") el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? "" : v);
    }
    for (var i = 2; i < arguments.length; i++) {
      var c = arguments[i];
      if (c == null || c === false) continue;
      if (Array.isArray(c)) c.forEach(function (x) { if (x) el.appendChild(x); });
      else el.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    }
    return el;
  }
  function store(key, val) {
    try { if (val === undefined) return localStorage.getItem(key); localStorage.setItem(key, val); } catch (e) { return null; }
  }
  function fmtDate(iso) {
    if (!iso) return "";
    var d = new Date(iso.length === 10 ? iso + "T12:00:00" : iso);
    return d.toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" });
  }
  function fmtTime(iso) {
    var d = new Date(iso), now = new Date();
    var t = d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
    return d.toDateString() === now.toDateString() ? t : d.toLocaleDateString("it-IT", { day: "numeric", month: "short" }) + " " + t;
  }
  function safeName(name) {
    var n = (name || "file").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9._-]+/g, "_");
    return n.slice(-80) || "file";
  }
  function uid() {
    return (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
  }
  // Materiale che è un file (caricato o in /contenuti) e non un link a un sito
  function isFile(m) {
    return !!m.file_path || /^contenuti\//.test(m.url || "") || /\.(pdf|docx?|pptx?|xlsx?|odt|odp|ods|zip|txt|png|jpe?g)(\?|$)/i.test(m.url || "");
  }
  // Le lezioni del sito sanno dove tornare quando si preme Chiudi
  // I PDF si aprono nel visualizzatore del sito, che ha il pulsante Chiudi
  function openHref(url, classId, tab, m) {
    var da = encodeURIComponent("c/" + classId + "/" + tab);
    if (m && url && kindOf(m) === "PDF") return "pdf.html?f=" + encodeURIComponent(url) + "&t=" + encodeURIComponent(m.title) + "&da=" + da;
    if (!/^contenuti\/lezioni\/.*\.html?$/.test(url || "")) return url;
    return url + "?da=" + da;
  }
  function fileName(m) {
    return m.file_name || decodeURIComponent((m.url || "").split("?")[0].split("/").pop()) || "file";
  }
  function classParts(c) {
    var i = c.name.indexOf(" ");
    return i < 0 ? [c.name, ""] : [c.name.slice(0, i), c.name.slice(i + 1)];
  }
  function classColor(c) { return "var(--c" + (classes.indexOf(c) % 5 + 1) + ")"; }
  function kindOf(m) {
    var u = (m.file_name || m.url || "").toLowerCase().split("?")[0];
    if (/claude\.ai\/artifact/.test(m.url || "") || /^contenuti\/lezioni\/.*\.html?$/.test(m.url || "")) return "Presentazione";
    if (/\.pdf$/.test(u)) return "PDF";
    if (/\.html?$/.test(u)) return "Interattivo";
    if (/\.(png|jpe?g|gif|webp)$/.test(u)) return "Immagine";
    if (/\.(pptx?|odp)$/.test(u)) return "Slide";
    if (/\.(docx?|odt|txt)$/.test(u)) return "Documento";
    if (/\.(xlsx?|ods|csv)$/.test(u)) return "Foglio di calcolo";
    return isFile(m) ? "File" : "Link";
  }
  var ICONS = {
    materiali: "M5 4h9l5 5v11H5z M14 4v5h5",
    compiti: "M9 4h6v3H9z M6 6h3 M15 6h3v14H6V6 M9 12l2 2 4-4",
    chat: "M4 5h16v11H9l-5 4z",
    programma: "M9 6h11 M9 12h11 M9 18h11 M4.5 6h.01 M4.5 12h.01 M4.5 18h.01",
    verifiche: "M6 3h9l3 3v15H6z M9 9h6 M9 13l2 2 4-4",
    domande: "M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .8-1 1.5v.7 M12 17h.01 M4 5h16v11H9l-5 4z",
    aiuto: "M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18 M12 8a4 4 0 1 0 0 8a4 4 0 1 0 0-8 M5.6 5.6l3.6 3.6 M14.8 14.8l3.6 3.6 M18.4 5.6l-3.6 3.6 M9.2 14.8l-3.6 3.6"
  };
  function icon(name) {
    var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24"); svg.setAttribute("aria-hidden", "true"); svg.setAttribute("class", "ico");
    var path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", ICONS[name]); svg.appendChild(path);
    return svg;
  }
  function initials(name) {
    return (name || "?").split(/\s+/).filter(Boolean).slice(0, 2).map(function (w) { return w[0]; }).join("").toUpperCase();
  }
  function hue(name) {
    var n = 0; for (var i = 0; i < (name || "").length; i++) n = (n * 31 + name.charCodeAt(i)) >>> 0;
    return "var(--c" + (n % 5 + 1) + ")";
  }
  function isoDays(n) { var d = new Date(); d.setDate(d.getDate() + n); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
  function daysLeft(iso) {
    var d = new Date(iso + "T00:00:00"), t = new Date(); t.setHours(0, 0, 0, 0);
    return Math.round((d - t) / 86400000);
  }
  function notice(kind, text) { return h("p", { class: "notice " + kind, role: kind === "err" ? "alert" : "status", text: text }); }
  var toastEl;
  function toast(text) {
    if (!toastEl) { toastEl = h("div", { class: "toast", role: "alert" }); document.body.appendChild(toastEl); }
    toastEl.textContent = text; toastEl.hidden = false;
    clearTimeout(toast.t); toast.t = setTimeout(function () { toastEl.hidden = true; }, 5000);
  }
  // Pulsante che chiede conferma con un secondo tocco (niente finestre pop-up)
  function confirmBtn(label, cls, action) {
    var armed = false, timer;
    var b = h("button", { class: cls, type: "button", text: label });
    b.addEventListener("click", async function () {
      if (!armed) {
        armed = true; b.textContent = "Tocca di nuovo per confermare";
        timer = setTimeout(function () { armed = false; b.textContent = label; }, 4000);
        return;
      }
      clearTimeout(timer); b.disabled = true;
      try { await action(); } catch (e) { toast(errText(e)); armed = false; b.textContent = label; b.disabled = false; }
    });
    return b;
  }
  function errText(e) {
    var m = (e && (e.message || e.error_description)) || String(e);
    if (/fetch|network/i.test(m)) return "Connessione assente. Riprova tra poco.";
    return "Qualcosa non ha funzionato: " + m;
  }

  /* ---------- Dati: Supabase ---------- */
  function supabaseApi() {
    var sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY);
    function ok(res) { if (res.error) throw res.error; return res.data; }
    var teacher = false;
    return {
      client: sb,
      init: async function () {
        var s = ok(await sb.auth.getSession());
        teacher = s.session ? !!ok(await sb.rpc("current_user_is_teacher")) : false;
      },
      isTeacher: function () { return teacher; },
      signIn: async function (email, password) {
        ok(await sb.auth.signInWithPassword({ email: email, password: password }));
        teacher = !!ok(await sb.rpc("current_user_is_teacher"));
        if (!teacher) { await sb.auth.signOut(); throw new Error("questo account non è registrato come docente."); }
      },
      signOut: async function () { await sb.auth.signOut(); teacher = false; },
      classes: async function () { return ok(await sb.from("classes").select("*").order("sort")); },
      materials: async function (c) { return ok(await sb.from("materials").select("*").eq("class_id", c).order("created_at", { ascending: false })); },
      addMaterial: async function (row, file) {
        if (file) {
          var path = row.class_id + "/" + uid() + "-" + safeName(file.name);
          ok(await sb.storage.from("materiali").upload(path, file, { contentType: file.type || undefined }));
          row.file_path = path; row.file_name = file.name;
        }
        return ok(await sb.from("materials").insert(row).select().single());
      },
      deleteMaterial: async function (m) {
        if (m.file_path) await sb.storage.from("materiali").remove([m.file_path]);
        ok(await sb.from("materials").delete().eq("id", m.id));
      },
      materialUrl: function (m, download) {
        if (!m.file_path) return m.url;
        return sb.storage.from("materiali").getPublicUrl(m.file_path, download ? { download: m.file_name || true } : undefined).data.publicUrl;
      },
      topics: async function (c) { return ok(await sb.from("topics").select("*").eq("class_id", c).order("position").order("created_at")); },
      addTopic: async function (row) { ok(await sb.from("topics").insert(row)); },
      updateTopic: async function (id, patch) { ok(await sb.from("topics").update(patch).eq("id", id)); },
      deleteTopic: async function (t) { ok(await sb.from("topics").delete().eq("id", t.id)); },
      // I compiti collegati a un argomento compaiono quando l'argomento è svolto: scadenza a due settimane
      releaseAssignments: async function (topicId, due) { ok(await sb.from("assignments").update({ due_date: due }).eq("topic_id", topicId).is("due_date", null)); },
      tests: async function (c) { return ok(await sb.from("tests").select("*").eq("class_id", c).order("position").order("created_at")); },
      testFiles: async function (ids) { return ids.length ? ok(await sb.from("test_files").select("*").in("test_id", ids)) : []; },
      updateTest: async function (id, patch) { ok(await sb.from("tests").update(patch).eq("id", id)); },
      questions: async function (c) { return ok(await sb.from("slide_questions").select("*").eq("class_id", c).order("created_at", { ascending: false }).limit(500)); },
      openQuestions: async function () { return ok(await sb.from("slide_questions").select("*").is("answer", null).order("created_at", { ascending: false }).limit(200)); },
      answerQuestion: async function (id, answer) { ok(await sb.from("slide_questions").update({ answer: answer || null, answered_at: answer ? new Date().toISOString() : null }).eq("id", id)); },
      deleteQuestion: async function (q) { ok(await sb.from("slide_questions").delete().eq("id", q.id)); },
      assignments: async function (c) { return ok(await sb.from("assignments").select("*").eq("class_id", c).order("created_at", { ascending: false })); },
      addAssignment: async function (row) { ok(await sb.from("assignments").insert(row)); },
      deleteAssignment: async function (a) {
        var subs = ok(await sb.from("submissions").select("file_path").eq("assignment_id", a.id));
        var paths = subs.map(function (s) { return s.file_path; }).filter(Boolean);
        if (paths.length) await sb.storage.from("consegne").remove(paths);
        ok(await sb.from("assignments").delete().eq("id", a.id));
      },
      submit: async function (row, file, classId) {
        if (file) {
          var path = classId + "/" + row.assignment_id + "/" + uid() + "-" + safeName(file.name);
          ok(await sb.storage.from("consegne").upload(path, file, { contentType: file.type || undefined }));
          row.file_path = path; row.file_name = file.name;
        }
        ok(await sb.from("submissions").insert(row));
      },
      submissions: async function (aid) { return ok(await sb.from("submissions").select("*").eq("assignment_id", aid).order("created_at")); },
      submissionUrl: async function (s) {
        return ok(await sb.storage.from("consegne").createSignedUrl(s.file_path, 3600, { download: s.file_name || true })).signedUrl;
      },
      deleteSubmission: async function (s) {
        if (s.file_path) await sb.storage.from("consegne").remove([s.file_path]);
        ok(await sb.from("submissions").delete().eq("id", s.id));
      },
      messages: async function (c) {
        var rows = ok(await sb.from("messages").select("*").eq("class_id", c).order("created_at", { ascending: false }).limit(150));
        return rows.reverse();
      },
      send: async function (row) { ok(await sb.from("messages").insert(row)); },
      deleteMessage: async function (m) { ok(await sb.from("messages").delete().eq("id", m.id)); },
      watch: function (c, onAdd, onDel) {
        var ch = sb.channel("chat-" + c)
          .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: "class_id=eq." + c }, function (p) { onAdd(p.new); })
          .on("postgres_changes", { event: "DELETE", schema: "public", table: "messages" }, function (p) { onDel(p.old && p.old.id); })
          .subscribe();
        return function () { sb.removeChannel(ch); };
      }
    };
  }

  /* ---------- Dati: modalità demo (solo questo browser) ---------- */
  function demoApi() {
    var KEY = "piattaforma-demo-v1";
    var db;
    try { db = JSON.parse(store(KEY) || "null"); } catch (e) { db = null; }
    if (!db) db = {
      classes: [
        { id: "1d", name: "1D Informatica", sort: 1 }, { id: "1e", name: "1E Informatica", sort: 2 },
        { id: "3g", name: "3E TPSI", sort: 3 }, { id: "5f", name: "5F GPOI", sort: 4 }, { id: "5g", name: "5G TPSI", sort: 5 }
      ],
      materials: [], assignments: [], submissions: [], messages: [], seq: 1
    };
    db.topics = db.topics || [];
    var seedTime = Date.now() - 86400000;
    (window.PIATTAFORMA_SEED || []).forEach(function (m, i) {
      if (!db.materials.some(function (x) { return x.title === m.title && x.class_id === m.class_id; }))
        db.materials.push(Object.assign({ id: uid(), created_at: new Date(seedTime + i * 1000).toISOString() }, m));
    });
    // Programma di esempio: i materiali sono indicati con il loro url
    (window.PIATTAFORMA_SEED_PROGRAMMA || []).forEach(function (t) {
      if (db.topics.some(function (x) { return x.title === t.title && x.class_id === t.class_id; })) return;
      var ids = (t.urls || []).map(function (u) {
        var m = db.materials.filter(function (x) { return x.class_id === t.class_id && x.url === u; })[0];
        return m && m.id;
      }).filter(Boolean);
      db.topics.push({ id: uid(), class_id: t.class_id, position: t.position, title: t.title, description: t.description || null, done: t.done !== false, material_ids: ids, created_at: new Date().toISOString() });
    });
    (window.PIATTAFORMA_SEED_COMPITI || []).forEach(function (a) {
      if (db.assignments.some(function (x) { return x.title === a.title && x.class_id === a.class_id; })) return;
      var row = Object.assign({ id: uid(), created_at: new Date().toISOString() }, a);
      if (a.topic) {
        var t = db.topics.filter(function (x) { return x.class_id === a.class_id && x.title === a.topic; })[0];
        row.topic_id = t ? t.id : null; delete row.topic;
      }
      db.assignments.push(row);
    });
    db.tests = db.tests || []; db.test_files = db.test_files || [];
    (window.PIATTAFORMA_SEED_VERIFICHE || []).forEach(function (v) {
      if (db.tests.some(function (x) { return x.title === v.title && x.class_id === v.class_id; })) return;
      var id = uid();
      db.tests.push({ id: id, class_id: v.class_id, position: v.position, title: v.title, description: v.description, test_date: v.test_date, practice_url: v.practice_url, done: false, created_at: new Date().toISOString() });
      db.test_files.push({ test_id: id, test_url: v.test_url, solutions_url: v.solutions_url });
    });
    var QKEY = "novaula-domande-demo";
    function qload() { try { return JSON.parse(store(QKEY) || "[]"); } catch (e) { return []; } }
    function qsave(list) { store(QKEY, JSON.stringify(list)); }
    var teacher = store(KEY + "-teacher") === "1";
    var listeners = [];
    function save() { store(KEY, JSON.stringify(db)); }
    function byClass(list, c) { return list.filter(function (x) { return x.class_id === c; }).sort(function (a, b) { return a.created_at < b.created_at ? 1 : -1; }); }
    function readFile(file) {
      return new Promise(function (res) {
        if (!file) return res(null);
        if (file.size > 2 * 1024 * 1024) return res("");
        var r = new FileReader(); r.onload = function () { res(r.result); }; r.readAsDataURL(file);
      });
    }
    save();
    return {
      init: async function () {},
      isTeacher: function () { return teacher; },
      signIn: async function (email, password) {
        if (password !== "demo") throw new Error("in modalità demo la password è: demo");
        teacher = true; store(KEY + "-teacher", "1");
      },
      signOut: async function () { teacher = false; store(KEY + "-teacher", "0"); },
      classes: async function () { return db.classes; },
      materials: async function (c) { return byClass(db.materials, c); },
      addMaterial: async function (row, file) {
        if (file) { row.file_path = await readFile(file); row.file_name = file.name; }
        var m = Object.assign({ id: uid(), created_at: new Date().toISOString() }, row);
        db.materials.push(m); save(); return m;
      },
      deleteMaterial: async function (m) { db.materials = db.materials.filter(function (x) { return x.id !== m.id; }); save(); },
      materialUrl: function (m) { return m.file_path || m.url; },
      topics: async function (c) {
        return db.topics.filter(function (x) { return x.class_id === c; }).sort(function (a, b) { return a.position - b.position || (a.created_at < b.created_at ? -1 : 1); });
      },
      addTopic: async function (row) { db.topics.push(Object.assign({ id: uid(), created_at: new Date().toISOString() }, row)); save(); },
      updateTopic: async function (id, patch) { db.topics.forEach(function (x) { if (x.id === id) Object.assign(x, patch); }); save(); },
      deleteTopic: async function (t) { db.topics = db.topics.filter(function (x) { return x.id !== t.id; }); save(); },
      releaseAssignments: async function (topicId, due) { db.assignments.forEach(function (a) { if (a.topic_id === topicId && !a.due_date) a.due_date = due; }); save(); },
      tests: async function (c) { return db.tests.filter(function (x) { return x.class_id === c; }).sort(function (a, b) { return a.position - b.position; }); },
      testFiles: async function (ids) {
        return db.test_files.filter(function (f) {
          var t = db.tests.filter(function (x) { return x.id === f.test_id; })[0];
          return ids.indexOf(f.test_id) >= 0 && (teacher || (t && t.done));
        });
      },
      updateTest: async function (id, patch) { db.tests.forEach(function (x) { if (x.id === id) Object.assign(x, patch); }); save(); },
      questions: async function (c) { return qload().filter(function (q) { return q.class_id === c; }).reverse(); },
      openQuestions: async function () { return qload().filter(function (q) { return !q.answer; }).reverse(); },
      answerQuestion: async function (id, answer) { var l = qload(); l.forEach(function (q) { if (q.id === id) { q.answer = answer || null; q.answered_at = new Date().toISOString(); } }); qsave(l); },
      deleteQuestion: async function (q) { qsave(qload().filter(function (x) { return x.id !== q.id; })); },
      assignments: async function (c) {
        return byClass(db.assignments, c).filter(function (a) {
          if (teacher || !a.topic_id) return true;
          var t = db.topics.filter(function (x) { return x.id === a.topic_id; })[0];
          return t && t.done !== false;
        });
      },
      addAssignment: async function (row) { db.assignments.push(Object.assign({ id: uid(), created_at: new Date().toISOString() }, row)); save(); },
      deleteAssignment: async function (a) {
        db.assignments = db.assignments.filter(function (x) { return x.id !== a.id; });
        db.submissions = db.submissions.filter(function (x) { return x.assignment_id !== a.id; }); save();
      },
      submit: async function (row, file) {
        if (file) { row.file_path = await readFile(file); row.file_name = file.name; }
        db.submissions.push(Object.assign({ id: uid(), created_at: new Date().toISOString() }, row)); save();
      },
      submissions: async function (aid) { return db.submissions.filter(function (x) { return x.assignment_id === aid; }); },
      submissionUrl: async function (s) { return s.file_path || "#"; },
      deleteSubmission: async function (s) { db.submissions = db.submissions.filter(function (x) { return x.id !== s.id; }); save(); },
      messages: async function (c) { return db.messages.filter(function (x) { return x.class_id === c; }).slice(-150); },
      send: async function (row) {
        var m = Object.assign({ id: db.seq++, created_at: new Date().toISOString() }, row);
        db.messages.push(m); save();
        listeners.forEach(function (l) { if (l.c === m.class_id) l.add(m); });
      },
      deleteMessage: async function (m) {
        db.messages = db.messages.filter(function (x) { return x.id !== m.id; }); save();
        listeners.forEach(function (l) { l.del(m.id); });
      },
      watch: function (c, onAdd, onDel) {
        var l = { c: c, add: onAdd, del: onDel }; listeners.push(l);
        return function () { listeners = listeners.filter(function (x) { return x !== l; }); };
      }
    };
  }

  var api = DEMO ? demoApi() : supabaseApi();
  var classes = [];
  var stopChat = null;

  /* ---------- Pagine ---------- */
  function setPage(title) {
    document.title = title ? title + " · " + (CFG.TITLE || "Piattaforma di classe") : (CFG.TITLE || "Piattaforma di classe");
    if (stopChat) { stopChat(); stopChat = null; }
    app.textContent = "";
  }
  function loading() { app.appendChild(h("p", { class: "empty", text: "Caricamento…" })); }
  function findClass(id) { return classes.filter(function (c) { return c.id === id; })[0]; }

  function nowBoard() {
    if (!api.isTeacher() || !window.NovaulaOrario) return;
    var box = h("div");
    app.appendChild(box);
    stopChat = window.NovaulaOrario(box, { h: h, sb: api.client, findClass: findClass, classParts: classParts, classColor: classColor });
  }

  function homePage() {
    setPage("");
    nowBoard();
    var today = new Date().toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" });
    var last = store("last-class");
    app.appendChild(h("section", { class: "hello" },
      h("p", { class: "eyebrow", text: today }),
      h("h1", null, "Ciao! ", h("span", { class: "mark", text: "Scegli la tua classe" })),
      h("p", { class: "lede", text: "Materiali delle lezioni, compiti da consegnare e la chat della classe. Senza account, da telefono o PC." })
    ));
    app.appendChild(h("div", { class: "classes" }, classes.map(function (c) {
      var p = classParts(c);
      return h("a", { class: "class-btn", style: "--cc:" + classColor(c), href: "#/c/" + c.id + "/programma" },
        h("span", { class: "code", text: p[0] }),
        h("span", { class: "subject", text: p[1] }),
        c.id === last && h("span", { class: "tag", text: "Ultima aperta" }),
        h("span", { class: "go", "aria-hidden": "true", text: "→" })
      );
    })));
    app.appendChild(h("p", { class: "tip", text: "Consiglio: aggiungi Novaula alla schermata Home del telefono per aprirla come un'app." }));
  }

  function classPage(id, tab) {
    var c = findClass(id);
    if (!c) return homePage();
    tab = (tab || "").split("?")[0];
    tab = ["programma", "materiali", "compiti", "verifiche", "chat", "domande", "aiuto", "profilo"].indexOf(tab) >= 0 ? tab : "programma";
    setPage(c.name);
    store("last-class", id);
    var p = classParts(c);
    app.appendChild(h("header", { class: "class-head", style: "--cc:" + classColor(c) },
      h("div", { class: "class-top" },
        h("a", { class: "back", href: "#/", text: "← Tutte le classi" }),
        window.NovaulaProfili && api.client ? window.NovaulaProfili.chip(c, pctx()) : null),
      h("h1", null, h("span", { class: "code", text: p[0] }), " ", h("span", { class: "subject", text: p[1] }))
    ));
    app.appendChild(h("nav", { class: "tabs", style: "--cc:" + classColor(c), "aria-label": "Sezioni" }, [["programma", "Programma"], ["materiali", "Materiali"], ["compiti", "Compiti"], ["verifiche", "Verifiche"], ["aiuto", "Aiuto"], ["chat", "Chat"]].map(function (t) {
      return h("a", { href: "#/c/" + id + "/" + t[0], "aria-current": t[0] === tab || (tab === "domande" && t[0] === "chat") ? "page" : null }, icon(t[0]), h("span", { text: t[1] }));
    })));
    var box = h("section", { class: "list" });
    app.appendChild(box);
    if (tab === "materiali") materialsTab(c, box);
    else if (tab === "programma") programTab(c, box);
    else if (tab === "compiti") assignmentsTab(c, box);
    else if (tab === "verifiche") testsTab(c, box);
    else if (tab === "domande") questionsTab(c, box);
    else if (tab === "profilo" && window.NovaulaProfili) window.NovaulaProfili.page(c, box, pctx());
    else if (tab === "aiuto" && window.NovaulaHelpdesk) stopChat = window.NovaulaHelpdesk(c, box, { h: h, api: api, store: store, toast: toast, errText: errText, notice: notice, confirmBtn: confirmBtn, fmtTime: fmtTime, hue: hue, initials: initials, cc: classColor(c) });
    else chatTab(c, box);
  }

  /* Materiali */
  async function materialsTab(c, box) {
    box.appendChild(h("p", { class: "empty", text: "Caricamento…" }));
    var items;
    try { items = await api.materials(c.id); } catch (e) { box.textContent = ""; box.appendChild(notice("err", errText(e))); return; }
    box.textContent = "";
    if (api.isTeacher()) box.appendChild(addMaterialForm(c));
    if (!items.length) box.appendChild(h("p", { class: "empty", text: "Ancora nessun materiale per questa classe." }));
    items.forEach(function (m) {
      var url = m.url || api.materialUrl(m);
      var kind = kindOf(m);
      var dl = downloadOf(m);
      box.appendChild(h("article", { class: "card material" },
        h("div", { class: "card-top" },
          h("span", { class: "badge", "data-kind": kind, text: kind }),
          h("span", { class: "date", text: fmtDate(m.created_at) })
        ),
        h("h2", { text: m.title }),
        m.description && h("p", { class: "desc", text: m.description }),
        h("div", { class: "row actions" },
          url && h("a", { class: "btn primary", href: openHref(url, c.id, "materiali", m), target: "_blank", rel: "noopener", text: "Apri" }),
          dl && h("a", { class: "btn", href: dl.href, download: dl.name, text: kind !== "PDF" && /\.pdf$/i.test(dl.name) ? "Scarica PDF" : "Scarica" }),
          api.isTeacher() && confirmBtn("Elimina", "btn danger", async function () { await api.deleteMaterial(m); route(); })
        )
      ));
    });
  }

  // Versione da scaricare: file caricato, PDF allegato a una presentazione, o il file stesso
  function downloadOf(m) {
    if (m.file_path) return { href: api.materialUrl(m, true), name: fileName(m) };
    if (m.pdf_url) return { href: m.pdf_url, name: decodeURIComponent(m.pdf_url.split("?")[0].split("/").pop()) };
    if (isFile(m)) return { href: api.materialUrl(m, true), name: fileName(m) };
    return null;
  }

  function addMaterialForm(c) {
    var msg = h("div");
    var topicSel = h("select", { name: "topic" }, h("option", { value: "", text: "Nessuno" }));
    api.topics(c.id).then(function (ts) {
      ts.forEach(function (t, i) { topicSel.appendChild(h("option", { value: t.id, text: (i + 1) + ". " + t.title })); });
      topicSel._topics = ts;
    }).catch(function () {});
    var form = h("form", { class: "stack" },
      h("label", null, "Titolo", h("input", { type: "text", name: "title", required: true, maxlength: 200 })),
      h("label", null, "Descrizione (facoltativa)", h("textarea", { name: "description", maxlength: 2000 })),
      h("label", null, "Link (facoltativo)", h("input", { type: "url", name: "url", placeholder: "https://…" })),
      h("label", null, "File (facoltativo): PDF, slide, immagini", h("input", { type: "file", name: "file" }),
        h("span", { class: "muted small", style: "font-weight:400", text: "Con un link, il file diventa la versione da scaricare (es. il PDF di una presentazione)." })),
      h("label", null, "Argomento del programma (facoltativo)", topicSel),
      h("button", { class: "btn primary", type: "submit", text: "Pubblica il materiale" }),
      msg
    );
    form.addEventListener("submit", async function (e) {
      e.preventDefault();
      var f = form.elements, file = f.file.files[0];
      if (!f.url.value && !file) { msg.replaceChildren(notice("err", "Inserisci un link oppure scegli un file.")); return; }
      form.querySelector("button").disabled = true;
      try {
        var m = await api.addMaterial({ class_id: c.id, title: f.title.value.trim(), description: f.description.value.trim() || null, url: f.url.value.trim() || null }, file);
        var t = (topicSel._topics || []).filter(function (x) { return x.id === topicSel.value; })[0];
        if (t && m && m.id) await api.updateTopic(t.id, { material_ids: (t.material_ids || []).concat([m.id]) });
        route();
      } catch (err) { msg.replaceChildren(notice("err", errText(err))); form.querySelector("button").disabled = false; }
    });
    return h("details", { class: "teacher" }, h("summary", { text: "Docente: aggiungi materiale" }), form);
  }

  /* Programma svolto */
  async function programTab(c, box) {
    box.appendChild(h("p", { class: "empty", text: "Caricamento…" }));
    var topics, mats;
    try { var r = await Promise.all([api.topics(c.id), api.materials(c.id)]); topics = r[0]; mats = r[1]; }
    catch (e) { box.textContent = ""; box.appendChild(notice("err", errText(e))); return; }
    box.textContent = "";
    var byId = {}; mats.forEach(function (m) { byId[m.id] = m; });
    var teacher = api.isTeacher();
    if (teacher) box.appendChild(topicForm(c, mats, null, topics));
    if (!topics.length) { box.appendChild(h("p", { class: "empty", text: "Il programma di questa classe non è ancora stato pubblicato." })); return; }
    var done = topics.filter(function (t) { return t.done !== false; }).length;
    box.appendChild(h("p", { class: "program-intro" },
      h("b", { text: done + (done === 1 ? " argomento svolto" : " argomenti svolti") }),
      topics.length > done ? " · " + (topics.length - done) + " in programma" : "",
      h("span", { class: "muted", text: " Tocca un materiale per aprirlo." })));
    var ol = h("ol", { class: "program", style: "--cc:" + classColor(c) });
    topics.forEach(function (t, i) {
      var linked = (t.material_ids || []).map(function (id) { return byId[id]; }).filter(Boolean);
      var li = h("li", { class: "topic" + (t.done === false ? " todo" : "") },
        h("span", { class: "dot", "aria-hidden": "true", text: String(i + 1) }),
        h("div", { class: "topic-body" },
          h("div", { class: "topic-head" },
            h("h2", { text: t.title }),
            t.done === false && h("span", { class: "badge todo-badge", text: "In programma" })
          ),
          t.description && h("p", { class: "desc", text: t.description }),
          linked.length ? h("div", { class: "chips" }, linked.map(function (m) {
            var dl = downloadOf(m), kind = kindOf(m);
            return h("span", { class: "chip-group" },
              h("a", { class: "chip", "data-kind": kind, href: openHref(m.url || api.materialUrl(m), c.id, "programma", m), target: "_blank", rel: "noopener", title: kind + ": " + m.title }, h("span", { class: "chip-kind", text: { Presentazione: "Slide", "Foglio di calcolo": "Foglio", Interattivo: "Attività" }[kind] || kind }), h("span", { text: m.title })),
              dl && /\.pdf$/i.test(dl.name) && kind !== "PDF" ? h("a", { class: "chip chip-pdf", href: dl.href, download: dl.name, title: "Scarica il PDF di " + m.title, text: "PDF" }) : null
            );
          })) : null,
          teacher && h("div", { class: "row topic-tools" },
            h("button", { class: "btn link", type: "button", text: "↑", "aria-label": "Sposta su", disabled: i === 0 ? true : null, onclick: function () { swap(i, i - 1); } }),
            h("button", { class: "btn link", type: "button", text: "↓", "aria-label": "Sposta giù", disabled: i === topics.length - 1 ? true : null, onclick: function () { swap(i, i + 1); } }),
            h("button", { class: "btn link", type: "button", text: t.done === false ? "Segna come svolto" : "Segna da svolgere", onclick: async function () {
              try {
                await api.updateTopic(t.id, { done: t.done === false });
                if (t.done === false) await api.releaseAssignments(t.id, isoDays(14));
                route();
              } catch (e) { toast(errText(e)); }
            } }),
            h("button", { class: "btn link", type: "button", text: "Modifica", onclick: function () { li.replaceWith(h("li", { class: "topic editing" }, topicForm(c, mats, t, topics))); } }),
            confirmBtn("Elimina", "btn link danger", async function () { await api.deleteTopic(t); route(); })
          )
        )
      );
      ol.appendChild(li);
    });
    box.appendChild(ol);
    async function swap(a, b) {
      var A = topics[a], B = topics[b];
      var pa = A.position, pb = B.position;
      if (pa === pb) { pa = a * 10; pb = b * 10; }
      try { await api.updateTopic(A.id, { position: pb }); await api.updateTopic(B.id, { position: pa }); route(); } catch (e) { toast(errText(e)); }
    }
  }

  function topicForm(c, mats, t, topics) {
    var msg = h("div");
    var chosen = (t && t.material_ids) || [];
    var checks = mats.length ? h("fieldset", { class: "pick" }, h("legend", { text: "Materiali collegati" }), mats.map(function (m) {
      return h("label", { class: "check-row" }, h("input", { type: "checkbox", name: "mat", value: m.id, checked: chosen.indexOf(m.id) >= 0 ? true : null }), h("span", { text: m.title }));
    })) : h("p", { class: "muted small", text: "Pubblica prima qualche materiale per poterlo collegare." });
    var form = h("form", { class: "stack" },
      h("label", null, "Argomento", h("input", { type: "text", name: "title", required: true, maxlength: 200, value: t ? t.title : null })),
      h("label", null, "Dettagli (facoltativi)", h("textarea", { name: "description", maxlength: 2000 }, t && t.description ? t.description : null)),
      checks,
      h("label", { class: "check-row" }, h("input", { type: "checkbox", name: "done", checked: !t || t.done !== false ? true : null }), h("span", { text: "Già svolto" })),
      h("div", { class: "row" },
        h("button", { class: "btn primary", type: "submit", text: t ? "Salva" : "Aggiungi al programma" }),
        t && h("button", { class: "btn", type: "button", text: "Annulla", onclick: function () { route(); } })
      ),
      msg
    );
    form.addEventListener("submit", async function (e) {
      e.preventDefault();
      var f = form.elements;
      var ids = [].slice.call(form.querySelectorAll('input[name="mat"]:checked')).map(function (x) { return x.value; });
      var row = { title: f.title.value.trim(), description: f.description.value.trim() || null, material_ids: ids, done: f.done.checked };
      form.querySelector("button").disabled = true;
      try {
        if (t) await api.updateTopic(t.id, row);
        else {
          var max = topics.reduce(function (a, x) { return Math.max(a, x.position || 0); }, 0);
          await api.addTopic(Object.assign({ class_id: c.id, position: max + 10 }, row));
        }
        route();
      } catch (err) { msg.replaceChildren(notice("err", errText(err))); form.querySelector("button").disabled = false; }
    });
    if (t) return form;
    return h("details", { class: "teacher" }, h("summary", { text: "Docente: aggiungi un argomento" }), form);
  }

  /* Compiti */
  async function assignmentsTab(c, box) {
    box.appendChild(h("p", { class: "empty", text: "Caricamento…" }));
    var items;
    try { items = await api.assignments(c.id); } catch (e) { box.textContent = ""; box.appendChild(notice("err", errText(e))); return; }
    box.textContent = "";
    if (api.isTeacher()) box.appendChild(addAssignmentForm(c));
    // In attesa = collegati a un argomento non ancora svolto (li vede solo il docente)
    var waiting = api.isTeacher() ? items.filter(function (a) { return a.topic_id && !a.due_date; }) : [];
    items = items.filter(function (a) { return waiting.indexOf(a) < 0; });
    var todayIso = isoDays(0);
    items.sort(function (a, b) {
      var la = a.due_date && a.due_date < todayIso, lb = b.due_date && b.due_date < todayIso;
      if (la !== lb) return la ? 1 : -1;
      if (!a.due_date || !b.due_date) return a.due_date ? -1 : b.due_date ? 1 : (a.created_at < b.created_at ? 1 : -1);
      return la ? (a.due_date < b.due_date ? 1 : -1) : (a.due_date < b.due_date ? -1 : 1);
    });
    if (!items.length) box.appendChild(h("p", { class: "empty", text: "Nessun compito assegnato al momento." }));
    items.forEach(function (a) {
      var left = a.due_date ? daysLeft(a.due_date) : null;
      var status = left === null ? "" : left < 0 ? "Scaduto" : left === 0 ? "Scade oggi" : left === 1 ? "Scade domani" : "Mancano " + left + " giorni";
      var dd = a.due_date ? new Date(a.due_date + "T12:00:00") : null;
      var card = h("article", { class: "card assignment" + (left !== null && left < 0 ? " is-late" : left !== null && left <= 1 ? " is-soon" : "") },
        h("div", { class: "assign-head" },
          dd && h("div", { class: "cal", "aria-hidden": "true" },
            h("span", { class: "cal-m", text: dd.toLocaleDateString("it-IT", { month: "short" }).replace(".", "") }),
            h("span", { class: "cal-d", text: String(dd.getDate()) })),
          h("div", { class: "assign-title" },
            h("h2", { text: a.title }),
            a.due_date && h("p", { class: "due", text: "Consegna entro il " + fmtDate(a.due_date) + " · " + status }),
            (a.group_work || (a.kind && a.kind !== "compito")) && h("div", { class: "row" },
              a.kind && a.kind !== "compito" && h("span", { class: "badge", text: KINDS[a.kind] || a.kind }),
              a.group_work && h("span", { class: "badge", text: "Lavoro di gruppo" })))
        ),
        a.description && h("p", { class: "desc", text: a.description }),
        a.pdf_url && h("div", { class: "row actions" },
          h("a", { class: "btn", href: openHref(a.pdf_url, c.id, "compiti", { url: a.pdf_url, title: a.title }), target: "_blank", rel: "noopener", text: "Apri la scheda (PDF)" }),
          h("a", { class: "btn link", href: a.pdf_url, download: a.pdf_url.split("/").pop(), text: "Scarica" }))
      );
      card.appendChild(api.isTeacher() ? teacherSubmissions(a) : window.NovaulaProfili && api.client ? window.NovaulaProfili.submitForm(a, c, pctx()) : submitForm(a, c));
      box.appendChild(card);
    });
    if (waiting.length) {
      var wl = h("div", { class: "stack" });
      waiting.forEach(function (a) {
        wl.appendChild(h("div", { class: "card waiting" },
          h("h3", { text: a.title }),
          h("p", { class: "muted small", text: "Compare agli studenti quando segni come svolto l'argomento collegato, con scadenza a due settimane." + (a.planned_due ? " Data prevista: " + fmtDate(a.planned_due) + "." : "") }),
          a.pdf_url && h("a", { class: "btn link", href: openHref(a.pdf_url, c.id, "compiti", { url: a.pdf_url, title: a.title }), target: "_blank", rel: "noopener", text: "Vedi la scheda (PDF)" }),
          h("div", { class: "row" },
            h("button", { class: "btn", type: "button", text: "Pubblica ora", onclick: async function () {
              try { await api.releaseAssignments(a.topic_id, isoDays(14)); route(); } catch (e) { toast(errText(e)); }
            } }),
            confirmBtn("Elimina", "btn link danger", async function () { await api.deleteAssignment(a); route(); }))
        ));
      });
      box.appendChild(h("details", { class: "teacher" }, h("summary", { text: "Docente: compiti in attesa (" + waiting.length + ")" }), wl));
    }
  }

  /* Verifiche */
  async function testsTab(c, box) {
    box.appendChild(h("p", { class: "empty", text: "Caricamento…" }));
    var tests, files;
    try {
      tests = await api.tests(c.id);
      files = await api.testFiles(tests.map(function (t) { return t.id; }));
    } catch (e) { box.textContent = ""; box.appendChild(notice("err", errText(e))); return; }
    box.textContent = "";
    var teacher = api.isTeacher();
    var fileOf = {}; files.forEach(function (f) { fileOf[f.test_id] = f; });
    if (!tests.length) { box.appendChild(h("p", { class: "empty", text: "Nessuna verifica in programma." })); return; }
    box.appendChild(h("p", { class: "program-intro" }, h("b", { text: "Verifiche scritte in classe" }),
      h("span", { class: "muted", text: " Studia con la simulazione: testo e soluzioni della verifica compaiono qui dopo la prova." })));
    tests.forEach(function (t) {
      var f = fileOf[t.id], dd = t.test_date ? new Date(t.test_date + "T12:00:00") : null;
      var pdf = function (url, label, cls) { return url && h("a", { class: "btn " + (cls || ""), href: openHref(url, c.id, "verifiche", { url: url, title: t.title + " · " + label }), target: "_blank", rel: "noopener", text: label }); };
      var card = h("article", { class: "card assignment test" + (t.done ? " is-done" : "") },
        h("div", { class: "assign-head" },
          dd && h("div", { class: "cal", "aria-hidden": "true" },
            h("span", { class: "cal-m", text: dd.toLocaleDateString("it-IT", { month: "short" }).replace(".", "") }),
            h("span", { class: "cal-d", text: String(dd.getDate()) })),
          h("div", { class: "assign-title" },
            h("h2", { text: t.title }),
            h("p", { class: "due", text: (t.done ? "Svolta" : "In programma") + (t.test_date ? " · " + fmtDate(t.test_date) : " · data da definire") }))),
        t.description && h("p", { class: "desc", text: t.description }),
        h("div", { class: "row actions" },
          pdf(t.practice_url, "Simulazione (PDF)", "primary"),
          f && pdf(f.test_url, "Verifica (PDF)"),
          f && pdf(f.solutions_url, "Soluzioni (PDF)"))
      );
      if (teacher) {
        var date = h("input", { type: "date", value: t.test_date || "", "aria-label": "Data della verifica" });
        date.addEventListener("change", async function () { try { await api.updateTest(t.id, { test_date: date.value || null }); route(); } catch (e) { toast(errText(e)); } });
        card.appendChild(h("details", { class: "teacher" }, h("summary", { text: "Docente" }),
          h("div", { class: "stack" },
            h("p", { class: "muted small", text: t.done ? "Testo e soluzioni sono visibili agli studenti." : "Testo e soluzioni li vedi solo tu finché non segni la verifica come svolta." }),
            h("label", null, "Data della verifica", date),
            h("div", { class: "row" }, h("button", { class: "btn", type: "button", text: t.done ? "Segna da svolgere (nascondi testo e soluzioni)" : "Segna come svolta (pubblica testo e soluzioni)", onclick: async function () {
              try { await api.updateTest(t.id, { done: !t.done }); route(); } catch (e) { toast(errText(e)); }
            } })))));
      }
      box.appendChild(card);
    });
  }

  /* Domande sulle slide */
  function deckLink(q, classId) {
    return "contenuti/lezioni/" + q.deck + ".html?da=" + encodeURIComponent("c/" + classId + "/domande") + "#" + q.slide;
  }
  function questionCard(q, classId, titles, teacher) {
    var ta = teacher ? h("textarea", { rows: 2, maxlength: 2000, placeholder: "Scrivi la risposta (la vede tutta la classe)", "aria-label": "Risposta" }) : null;
    if (ta) ta.value = q.answer || "";
    return h("article", { class: "card question" + (q.answer ? " answered" : "") },
      h("p", { class: "muted small" },
        h("a", { href: deckLink(q, classId), target: "_blank", rel: "noopener", text: (titles[q.deck] || q.deck) + " · slide " + q.slide }),
        " · " + fmtTime(q.created_at)),
      q.slide_title && h("p", { class: "muted small", text: "«" + q.slide_title + "»" }),
      h("p", null, h("b", { text: q.name + ": " }), q.body),
      q.answer && !teacher && h("p", { class: "answer" }, h("b", { text: "Risposta del docente: " }), q.answer),
      teacher && h("div", { class: "stack" }, ta, h("div", { class: "row" },
        h("button", { class: "btn primary", type: "button", text: q.answer ? "Aggiorna risposta" : "Rispondi", onclick: async function () {
          try { await api.answerQuestion(q.id, ta.value.trim()); route(); } catch (e) { toast(errText(e)); }
        } }),
        confirmBtn("Elimina", "btn link danger", async function () { await api.deleteQuestion(q); route(); })))
    );
  }
  async function deckTitles(classId) {
    var titles = {};
    try {
      (await api.materials(classId)).forEach(function (m) { var r = /contenuti\/lezioni\/([^/?#]+)\.html/.exec(m.url || ""); if (r) titles[r[1]] = m.title; });
    } catch (e) {}
    return titles;
  }
  async function questionsTab(c, box) {
    box.appendChild(h("p", { class: "empty", text: "Caricamento…" }));
    var list, titles;
    try { list = await api.questions(c.id); titles = await deckTitles(c.id); } catch (e) { box.textContent = ""; box.appendChild(notice("err", errText(e))); return; }
    box.textContent = "";
    var teacher = api.isTeacher();
    box.appendChild(h("p", { class: "program-intro" }, h("b", { text: "Domande sulle slide" }),
      h("span", { class: "muted", text: " Nelle lezioni tocca «? Domande» per chiedere qualcosa su una slide: la domanda arriva al docente e la vede tutta la classe." })));
    if (!list.length) { box.appendChild(h("p", { class: "empty", text: "Ancora nessuna domanda." })); return; }
    list.sort(function (a, b) { return (!!a.answer - !!b.answer) || (a.created_at < b.created_at ? 1 : -1); });
    list.forEach(function (q) { box.appendChild(questionCard(q, c.id, titles, teacher)); });
  }

  var KINDS = { compito: "Compito a casa", classe: "Lavoro in classe", progetto: "Progetto", verifica: "Verifica" };
  function addAssignmentForm(c) {
    var msg = h("div");
    var form = h("form", { class: "stack" },
      h("label", null, "Titolo", h("input", { type: "text", name: "title", required: true, maxlength: 200 })),
      h("label", null, "Consegna", h("textarea", { name: "description", maxlength: 4000, placeholder: "Cosa devono fare gli studenti" })),
      h("label", null, "Tipo di lavoro", h("select", { name: "kind" }, Object.keys(KINDS).map(function (k) { return h("option", { value: k, text: KINDS[k] }); }))),
      h("label", { class: "check-row" }, h("input", { type: "checkbox", name: "group" }), h("span", { text: "Lavoro di gruppo: si consegna una volta per tutto il gruppo" })),
      h("label", null, "Scadenza (facoltativa)", h("input", { type: "date", name: "due" })),
      h("button", { class: "btn primary", type: "submit", text: "Assegna il compito" }),
      msg
    );
    form.addEventListener("submit", async function (e) {
      e.preventDefault();
      var f = form.elements;
      form.querySelector("button").disabled = true;
      try {
        var row = { class_id: c.id, title: f.title.value.trim(), description: f.description.value.trim() || null, due_date: f.due.value || null };
        if (!DEMO) { row.kind = f.kind.value; row.group_work = f.group.checked; }
        await api.addAssignment(row);
        route();
      } catch (err) { msg.replaceChildren(notice("err", errText(err))); form.querySelector("button").disabled = false; }
    });
    return h("details", { class: "teacher" }, h("summary", { text: "Docente: assegna un compito" }), form);
  }

  function submitForm(a, c) {
    var msg = h("div");
    var doneKey = "consegnato-" + a.id;
    var done = store(doneKey);
    var form = h("form", { class: "stack" },
      h("label", null, "Nome e cognome", h("input", { type: "text", name: "name", required: true, minlength: 2, maxlength: 80, autocomplete: "name", value: store("student-name") || "" })),
      h("label", null, "File del compito (max 20 MB)", h("input", { type: "file", name: "file" })),
      h("label", null, "Nota per il docente (facoltativa)", h("textarea", { name: "note", maxlength: 2000 })),
      h("button", { class: "btn primary", type: "submit", text: done ? "Consegna di nuovo" : "Consegna il compito" }),
      msg
    );
    if (done) msg.appendChild(notice("ok", "Hai già consegnato da questo dispositivo (" + fmtTime(done) + ")."));
    form.addEventListener("submit", async function (e) {
      e.preventDefault();
      var f = form.elements, file = f.file.files[0], name = f.name.value.trim();
      if (!file && !f.note.value.trim()) { msg.replaceChildren(notice("err", "Allega un file oppure scrivi una nota.")); return; }
      if (file && file.size > MAX_UPLOAD) { msg.replaceChildren(notice("err", "Il file supera 20 MB. Comprimilo o dividilo.")); return; }
      var btn = form.querySelector("button");
      btn.disabled = true; btn.textContent = "Invio in corso…";
      try {
        await api.submit({ assignment_id: a.id, student_name: name, note: f.note.value.trim() || null }, file, c.id);
        store("student-name", name);
        var now = new Date().toISOString();
        store(doneKey, now);
        form.reset(); f.name.value = name;
        msg.replaceChildren(notice("ok", "Compito consegnato (" + fmtTime(now) + "). Grazie, " + name + "!"));
        btn.textContent = "Consegna di nuovo";
      } catch (err) {
        msg.replaceChildren(notice("err", errText(err)));
        btn.textContent = "Consegna il compito";
      }
      btn.disabled = false;
    });
    return h("details", { open: !done }, h("summary", { class: "btn", text: done ? "Consegnato ✓" : "Consegna" }), form);
  }

  function corrCtx() {
    var x = { h: h, sb: api.client, findClass: findClass, toast: toast, errText: errText, notice: notice };
    if (window.NovaulaProfili && api.client) x.extra = function (c) { return window.NovaulaProfili.correctionExtra(c, pctx()); };
    return x;
  }
  // Aiuti per profili.js
  function pctx() {
    return { h: h, sb: api.client, teacher: api.isTeacher(), toast: toast, errText: errText, notice: notice, confirmBtn: confirmBtn,
      fmtDate: fmtDate, fmtTime: fmtTime, findClass: findClass, route: route, openHref: openHref, kindOf: kindOf, uid: uid, safeName: safeName };
  }

  function teacherSubmissions(a) {
    var list = h("div", { class: "subs" });
    var det = h("details", { class: "teacher" }, h("summary", { text: "Consegne ricevute" }), list,
      h("div", { class: "row" }, confirmBtn("Elimina compito e consegne", "btn danger", async function () { await api.deleteAssignment(a); route(); }))
    );
    det.addEventListener("toggle", async function () {
      if (!det.open) return;
      list.replaceChildren(h("p", { class: "muted", text: "Caricamento…" }));
      try {
        var subs = await api.submissions(a.id);
        var corr = window.NovaulaCorrezioni && api.client ? await window.NovaulaCorrezioni.forAssignment(a.id, corrCtx()).catch(function () { return null; }) : null;
        var prof = window.NovaulaProfili && api.client ? await window.NovaulaProfili.forAssignment(a, subs, Object.assign(pctx(), { reopen: function () { det.open = false; det.open = true; } })).catch(function () { return null; }) : null;
        list.textContent = "";
        if (!subs.length) list.appendChild(h("p", { class: "muted", text: "Nessuna consegna finora." }));
        else list.appendChild(h("p", { class: "muted small", text: subs.length + (subs.length === 1 ? " consegna" : " consegne") }));
        subs.forEach(function (s) {
          list.appendChild(h("div", { class: "sub" },
            h("div", { class: "row" }, h("b", { text: s.student_name }), h("span", { class: "muted small", text: fmtTime(s.created_at) })),
            s.note && h("p", { class: "desc small", text: s.note }),
            h("div", { class: "row" },
              s.file_path && h("button", { class: "btn", type: "button", text: "Scarica " + (s.file_name || "file"), onclick: async function () {
                try { var u = await api.submissionUrl(s); var link = h("a", { href: u, download: s.file_name || "consegna", target: "_blank", rel: "noopener" }); document.body.appendChild(link); link.click(); link.remove(); }
                catch (e) { toast(errText(e)); }
              } }),
              confirmBtn("Elimina", "btn link", async function () { await api.deleteSubmission(s); det.open = false; det.open = true; })
            ),
            corr && corr(s, a.title),
            prof && prof(s)
          ));
        });
      } catch (e) { list.replaceChildren(notice("err", errText(e))); }
    });
    return det;
  }

  /* Chat */
  async function chatTab(c, box) {
    var teacher = api.isTeacher();
    var qlink = h("a", { class: "card qlink", href: "#/c/" + c.id + "/domande" }, icon("domande"), h("span", { text: "Domande sulle slide" }), h("b", { class: "qcount" }));
    box.appendChild(qlink);
    api.questions(c.id).then(function (l) {
      var open = l.filter(function (q) { return !q.answer; }).length;
      qlink.querySelector(".qcount").textContent = l.length ? l.length + (teacher && open ? " · " + open + " senza risposta" : "") : "";
    }).catch(function () {});
    var name = teacher ? "Docente" : store("chat-name");
    var msgs = h("div", { class: "msgs", role: "log", "aria-label": "Messaggi" });
    var input = h("textarea", { "aria-label": "Scrivi un messaggio", placeholder: "Scrivi un messaggio…", maxlength: 1000, rows: 1 });
    var sendBtn = h("button", { class: "btn primary", type: "submit", text: "Invia" });
    var who = h("div", { class: "who" });
    var composer = h("form", { class: "composer" }, input, sendBtn);
    var chat = h("div", { class: "chat" }, msgs, who, composer);
    var seen = {};
    var lastSent = 0;

    function setWho() {
      who.replaceChildren(teacher ? "Scrivi come Docente." : "Scrivi come ", teacher ? null : h("b", { text: name }), teacher ? null : " · ",
        teacher ? null : h("button", { class: "btn link", type: "button", text: "cambia nome", onclick: askName }));
    }
    function askName() {
      var field = h("input", { type: "text", id: "chatName", maxlength: 40, value: name || "", autocomplete: "nickname", "aria-label": "Il tuo nome" });
      var f = h("form", { class: "name-form" }, h("label", { for: "chatName", text: "Come ti chiami? Nome e iniziale del cognome" }),
        h("div", { class: "row" }, field, h("button", { class: "btn primary", type: "submit", text: "Salva" })));
      f.addEventListener("submit", function (e) {
        e.preventDefault();
        var n = field.value.trim().slice(0, 40);
        if (n.length < 2) { toast("Il nome deve avere almeno 2 caratteri."); return; }
        name = n; store("chat-name", n); setWho(); composer.hidden = false; input.focus();
      });
      composer.hidden = true;
      who.replaceChildren(f); field.focus();
      return false;
    }
    function nearBottom() { return msgs.scrollHeight - msgs.scrollTop - msgs.clientHeight < 80; }
    function add(m) {
      if (!m || seen[m.id]) return;
      seen[m.id] = true;
      var stick = nearBottom();
      var mine = !teacher && !m.is_teacher && m.author === name;
      var who = m.is_teacher ? "Docente" : m.author;
      var el = h("div", { class: "msg" + (m.is_teacher ? " teacher" : "") + (mine || (teacher && m.is_teacher) ? " mine" : ""), "data-id": m.id },
        h("span", { class: "avatar", style: "--av:" + (m.is_teacher ? "var(--hl)" : hue(who)), "aria-hidden": "true", text: m.is_teacher ? "★" : initials(who) }),
        h("div", { class: "bubble" },
        h("div", { class: "meta" }, h("b", { text: who }), h("span", { text: fmtTime(m.created_at) }),
          teacher && confirmBtn("elimina", "btn link small", async function () { await api.deleteMessage(m); remove(m.id); })),
        h("div", { class: "body", text: m.body }))
      );
      var empty = msgs.querySelector(".empty"); if (empty) empty.remove();
      msgs.appendChild(el);
      if (stick) msgs.scrollTop = msgs.scrollHeight;
    }
    function remove(id) { var el = msgs.querySelector('[data-id="' + id + '"]'); if (el) el.remove(); }

    composer.addEventListener("submit", async function (e) {
      e.preventDefault();
      var body = input.value.trim();
      if (!body) return;
      if (!teacher && !name) { askName(); return; }
      if (Date.now() - lastSent < 2000) return;
      lastSent = Date.now();
      sendBtn.disabled = true;
      try {
        await api.send({ class_id: c.id, author: teacher ? "Docente" : name, body: body, is_teacher: teacher });
        input.value = "";
        if (DEMO) msgs.scrollTop = msgs.scrollHeight;
      } catch (err) { toast(errText(err)); }
      sendBtn.disabled = false;
      input.focus();
    });
    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); composer.requestSubmit(); }
    });

    box.appendChild(chat);
    if (teacher || name) setWho(); else askName();
    msgs.appendChild(h("p", { class: "empty", text: "Caricamento…" }));
    async function load() {
      try {
        var rows = await api.messages(c.id);
        msgs.textContent = ""; seen = {};
        if (!rows.length) msgs.appendChild(h("p", { class: "empty", text: "Nessun messaggio. Scrivi tu il primo!" }));
        rows.forEach(add);
        msgs.scrollTop = msgs.scrollHeight;
      } catch (e) { msgs.replaceChildren(notice("err", errText(e))); }
    }
    await load();
    var unwatch = api.watch(c.id, add, remove);
    function onVisible() { if (document.visibilityState === "visible") load(); }
    document.addEventListener("visibilitychange", onVisible);
    stopChat = function () { unwatch(); document.removeEventListener("visibilitychange", onVisible); };
  }

  /* Area docente */
  function teacherPage() {
    setPage("Area docente");
    app.appendChild(h("a", { class: "back", href: "#/", text: "← Tutte le classi" }));
    app.appendChild(h("h1", { text: "Area docente" }));
    if (api.isTeacher()) {
      nowBoard();
      app.appendChild(h("div", { class: "card" },
        h("p", { text: "Hai effettuato l'accesso come docente. Nelle pagine delle classi trovi i pannelli gialli per pubblicare materiali, assegnare compiti, scaricare le consegne e moderare la chat. Il pulsante «Studenti e voti» in ogni classe apre profili, voti e controlli." }),
        h("div", { class: "row" },
          h("a", { class: "btn primary", href: "#/", text: "Vai alle classi" }),
          h("button", { class: "btn", type: "button", text: "Esci", onclick: async function () { await api.signOut(); route(); } })
        )
      ));
      if (window.NovaulaCorrezioni && api.client) window.NovaulaCorrezioni.board(app, corrCtx());
      if (window.NovaulaProfili && api.client) window.NovaulaProfili.board(app, pctx());
      var qbox = h("section", { class: "list" }, h("p", { class: "empty", text: "Caricamento delle domande…" }));
      app.appendChild(h("h2", { text: "Domande senza risposta" }));
      app.appendChild(qbox);
      api.openQuestions().then(async function (list) {
        qbox.textContent = "";
        if (!list.length) { qbox.appendChild(h("p", { class: "empty", text: "Nessuna domanda in attesa." })); return; }
        var byClass = {};
        list.forEach(function (q) { (byClass[q.class_id] = byClass[q.class_id] || []).push(q); });
        for (var cid in byClass) {
          var titles = await deckTitles(cid), cl = findClass(cid);
          qbox.appendChild(h("h3", { text: (cl ? cl.name : cid) + " · " + byClass[cid].length }));
          byClass[cid].forEach(function (q) { qbox.appendChild(questionCard(q, cid, titles, true)); });
        }
      }).catch(function (e) { qbox.replaceChildren(notice("err", errText(e))); });
      return;
    }
    var msg = h("div");
    var form = h("form", { class: "card stack" },
      h("p", { class: "muted", text: DEMO ? "Modalità demo: usa un'email qualsiasi e la password demo." : "Riservata al docente. Gli studenti non devono accedere." }),
      h("label", null, "Email", h("input", { type: "email", name: "email", required: true, autocomplete: "username" })),
      h("label", null, "Password", h("input", { type: "password", name: "password", required: true, autocomplete: "current-password" })),
      h("button", { class: "btn primary", type: "submit", text: "Accedi" }),
      msg
    );
    form.addEventListener("submit", async function (e) {
      e.preventDefault();
      var btn = form.querySelector("button"); btn.disabled = true;
      try { await api.signIn(form.elements.email.value.trim(), form.elements.password.value); location.hash = "#/"; }
      catch (err) { msg.replaceChildren(notice("err", "Accesso non riuscito: " + (err.message === "Invalid login credentials" ? "email o password errate." : err.message))); btn.disabled = false; }
    });
    app.appendChild(form);
  }

  /* ---------- Avvio ---------- */
  function route() {
    var parts = (location.hash || "#/").slice(2).split("/");
    if (parts[0] === "c") classPage(parts[1], parts[2]);
    else if (parts[0] === "docente") teacherPage();
    else homePage();
    document.getElementById("teacherLink").textContent = api.isTeacher() ? "Docente ✓" : "Area docente";
    window.scrollTo(0, 0);
  }

  async function start() {
    document.getElementById("brand").textContent = CFG.TITLE || "Piattaforma di classe";
    document.getElementById("demoBanner").hidden = !DEMO;
    loading();
    try {
      await api.init();
      classes = await api.classes();
    } catch (e) {
      app.replaceChildren(notice("err", errText(e)), h("button", { class: "btn", type: "button", text: "Riprova", onclick: start }));
      return;
    }
    window.addEventListener("hashchange", route);
    route();
  }

  if ("serviceWorker" in navigator && location.protocol === "https:") {
    navigator.serviceWorker.register("sw.js").catch(function () {});
  }
  start();
})();
