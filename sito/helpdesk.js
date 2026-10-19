/* Novaula · Aiuto: sportello per le domande veloci in classe e bacheca FAQ.
   Lo studente scrive il dubbio senza alzare la mano; il docente ha la bacheca di tutte
   le domande e risponde o cambia stato con un tocco. app.js chiama
   window.NovaulaHelpdesk(classe, contenitore, aiuti) e riceve una funzione di chiusura. */
(function () {
  "use strict";

  var STATUS = {
    nuova:   { label: "In attesa", long: "In attesa del docente", icon: "⏳" },
    arrivo:  { label: "Arrivo!", long: "Il docente sta arrivando", icon: "🏃" },
    sospesa: { label: "In sospeso", long: "In sospeso: ne parliamo dopo", icon: "⏸" },
    risolta: { label: "Risolta", long: "Risolta", icon: "✓" }
  };
  var TAGS = [
    ["esercizio", "Esercizio", "✏️"], ["pc", "Computer", "💻"], ["teoria", "Teoria", "📘"],
    ["compiti", "Compiti", "📎"], ["altro", "Altro", "💬"]
  ];
  var TAG = {}; TAGS.forEach(function (t) { TAG[t[0]] = t; });
  var QUICK = [
    "Rileggi con calma la consegna: la risposta è lì.",
    "Prova a chiedere al compagno vicino.",
    "Guarda le slide della lezione di oggi.",
    "Ne parliamo alla fine dell'ora.",
    "Ottima domanda: la spiego a tutta la classe."
  ];
  var COLS = [
    ["aperte", "Da gestire", function (t) { return t.status === "nuova" || t.status === "arrivo"; }],
    ["sospese", "In sospeso", function (t) { return t.status === "sospesa"; }],
    ["risolte", "Risolte", function (t) { return t.status === "risolta"; }]
  ];

  /* ---------- Dati ---------- */
  function supabaseData(sb) {
    function ok(res) { if (res.error) throw res.error; return res.data; }
    return {
      list: async function (c) { return ok(await sb.from("helpdesk").select("*").eq("class_id", c).order("created_at", { ascending: false }).limit(300)); },
      ask: async function (row, key) {
        return ok(await sb.rpc("helpdesk_ask", { p_class: row.class_id, p_author: row.author, p_body: row.body, p_tag: row.tag, p_stuck: row.stuck, p_seat: row.seat, p_key: key }));
      },
      resolveOwn: async function (id, key) { ok(await sb.rpc("helpdesk_resolve_own", { p_id: id, p_key: key })); },
      withdraw: async function (id, key) { ok(await sb.rpc("helpdesk_withdraw", { p_id: id, p_key: key })); },
      metoo: async function (id, delta) { ok(await sb.rpc("helpdesk_metoo", { p_id: id, p_delta: delta })); },
      update: async function (id, patch) { ok(await sb.from("helpdesk").update(patch).eq("id", id)); },
      remove: async function (id) { ok(await sb.from("helpdesk").delete().eq("id", id)); },
      addFaq: async function (row) { ok(await sb.from("helpdesk").insert(row)); },
      clearResolved: async function (c) { ok(await sb.from("helpdesk").delete().eq("class_id", c).eq("status", "risolta").eq("pinned", false)); },
      watch: function (c, cb) {
        var ch = sb.channel("helpdesk-" + c)
          .on("postgres_changes", { event: "*", schema: "public", table: "helpdesk", filter: "class_id=eq." + c }, cb)
          .on("postgres_changes", { event: "DELETE", schema: "public", table: "helpdesk" }, cb)
          .subscribe();
        return function () { sb.removeChannel(ch); };
      }
    };
  }

  // Modalità demo: i dati restano nel browser; due schede si aggiornano a vicenda
  function demoData(store) {
    var KEY = "novaula-helpdesk-demo";
    var listeners = [];
    function load() { try { return JSON.parse(store(KEY) || "[]"); } catch (e) { return []; } }
    function save(l) { store(KEY, JSON.stringify(l)); listeners.forEach(function (f) { f(); }); }
    function edit(id, fn) { var l = load(); l.forEach(function (t) { if (t.id === id) { fn(t); t.updated_at = new Date().toISOString(); } }); save(l); }
    function newId() { return crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2); }
    window.addEventListener("storage", function (e) { if (e.key === KEY) listeners.forEach(function (f) { f(); }); });
    return {
      list: async function (c) { return load().filter(function (t) { return t.class_id === c; }).sort(function (a, b) { return a.created_at < b.created_at ? 1 : -1; }); },
      ask: async function (row, key) {
        var l = load();
        var mine = l.filter(function (t) { return t.class_id === row.class_id && t.author === row.author; });
        if (mine.some(function (t) { return Date.now() - new Date(t.created_at) < 15000; })) throw new Error("Aspetta qualche secondo prima di fare un'altra domanda.");
        if (mine.filter(function (t) { return t.status !== "risolta"; }).length >= 5) throw new Error("Hai già 5 domande aperte: segna come risolte quelle che non ti servono più.");
        var now = new Date().toISOString();
        var t = Object.assign({ id: newId(), status: "nuova", answer: null, pinned: false, metoo: 0, created_at: now, updated_at: now, _key: key }, row);
        l.push(t); save(l); return t.id;
      },
      resolveOwn: async function (id, key) { edit(id, function (t) { if (t._key === key) t.status = "risolta"; }); },
      withdraw: async function (id, key) { save(load().filter(function (t) { return !(t.id === id && t._key === key && !t.answer && !t.pinned); })); },
      metoo: async function (id, delta) { edit(id, function (t) { if (t.status !== "risolta") t.metoo = Math.max(0, (t.metoo || 0) + (delta > 0 ? 1 : -1)); }); },
      update: async function (id, patch) { edit(id, function (t) { Object.assign(t, patch); }); },
      remove: async function (id) { save(load().filter(function (t) { return t.id !== id; })); },
      addFaq: async function (row) { var l = load(), now = new Date().toISOString(); l.push(Object.assign({ id: newId(), metoo: 0, created_at: now, updated_at: now }, row)); save(l); },
      clearResolved: async function (c) { save(load().filter(function (t) { return !(t.class_id === c && t.status === "risolta" && !t.pinned); })); },
      watch: function (c, cb) { listeners.push(cb); return function () { listeners = listeners.filter(function (f) { return f !== cb; }); }; }
    };
  }

  var data;
  function getData(ctx) {
    if (!data) data = ctx.api.client ? supabaseData(ctx.api.client) : demoData(ctx.store);
    return data;
  }

  /* ---------- Piccoli aiuti ---------- */
  function ago(iso) {
    var s = Math.max(0, (Date.now() - new Date(iso)) / 1000);
    if (s < 60) return "adesso";
    if (s < 3600) return Math.floor(s / 60) + " min fa";
    if (s < 6 * 3600) return Math.floor(s / 3600) + " h fa";
    return null;
  }
  function words(s) {
    return (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").split(/[^a-z0-9]+/).filter(function (w) { return w.length >= 4; });
  }
  function randKey() {
    var a = new Uint8Array(16); crypto.getRandomValues(a);
    return Array.prototype.map.call(a, function (b) { return ("0" + b.toString(16)).slice(-2); }).join("");
  }
  function buzz(ms) { try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) {} }
  var audio;
  function ding() {
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      if (audio.state === "suspended") audio.resume();
      var o = audio.createOscillator(), g = audio.createGain(), t = audio.currentTime;
      o.type = "sine"; o.frequency.setValueAtTime(880, t); o.frequency.setValueAtTime(1320, t + 0.12);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.25, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
      o.connect(g); g.connect(audio.destination); o.start(t); o.stop(t + 0.42);
    } catch (e) {}
  }

  /* ---------- Pagina ---------- */
  window.NovaulaHelpdesk = function (c, box, ctx) {
    var h = ctx.h, store = ctx.store, toast = ctx.toast, errText = ctx.errText;
    var db = getData(ctx);
    var teacher = ctx.api.isTeacher();
    var MINE_KEY = "hd-mine-" + c.id, VOTE_KEY = "hd-metoo-" + c.id;
    var mine = {}, votes = {};
    try { mine = JSON.parse(store(MINE_KEY) || "{}"); } catch (e) {}
    try { votes = JSON.parse(store(VOTE_KEY) || "{}"); } catch (e) {}
    var tickets = [], known = null, stopped = false, pending = false;
    var col = store("hd-col") || "aperte";
    var drafts = {}, openReply = null;

    var root = h("div", { class: "hd" + (teacher ? " hd-teacher" : ""), style: "--cc:" + ctx.cc });
    var main = h("div", { class: "hd-main" });
    box.appendChild(root);

    if (teacher) teacherShell(); else studentShell();
    root.appendChild(main);
    main.appendChild(h("p", { class: "empty", text: "Caricamento…" }));

    /* Aggiornamento dati: tempo reale + controllo ogni 15 secondi come riserva */
    var timer;
    async function refresh() {
      if (stopped) return;
      try { tickets = await db.list(c.id); }
      catch (e) { main.replaceChildren(ctx.notice("err", errText(e))); return; }
      notifyChanges();
      // Non ridisegnare mentre il docente scrive una risposta
      if (typing()) { pending = true; return; }
      pending = false;
      render();
    }
    function soon() { clearTimeout(timer); timer = setTimeout(refresh, 250); }
    function typing() { var a = document.activeElement; return !!(a && root.contains(a) && a.matches("textarea, input") && a.closest(".hd-card")); }
    root.addEventListener("focusout", function () { setTimeout(function () { if (pending && !typing()) refresh(); }, 50); });
    var unwatch = db.watch(c.id, soon);
    var poll = setInterval(function () { if (document.visibilityState === "visible") refresh(); }, 15000);
    var tick = setInterval(function () { [].forEach.call(root.querySelectorAll("[data-ago]"), function (el) { el.textContent = ago(el.getAttribute("data-ago")) || ctx.fmtTime(el.getAttribute("data-ago")); }); }, 30000);
    function onVisible() { if (document.visibilityState === "visible") refresh(); }
    document.addEventListener("visibilitychange", onVisible);
    refresh();

    // Avvisi: allo studente quando cambia lo stato della sua domanda, al docente quando ne arriva una nuova
    function notifyChanges() {
      var now = {};
      tickets.forEach(function (t) { now[t.id] = t.status + "|" + (t.answer || ""); });
      if (known) {
        tickets.forEach(function (t) {
          var before = known[t.id];
          if (teacher) {
            if (!before && t.status === "nuova") { if (store("hd-sound") !== "0") ding(); buzz(120); }
          } else if (mine[t.id] && before && before !== now[t.id]) {
            var msg = t.status === "arrivo" ? "Il docente sta arrivando da te!" : t.status === "risolta" ? (t.answer ? "Il docente ha risposto alla tua domanda." : "La tua domanda è segnata come risolta.") : t.status === "sospesa" ? "La tua domanda è in sospeso: il docente ne parlerà dopo." : "Il docente ha risposto alla tua domanda.";
            toast(msg); buzz([80, 60, 80]);
          }
        });
      }
      known = now;
    }

    function render() {
      main.textContent = "";
      if (teacher) renderBoard(); else renderStudent();
    }

    /* ---------- Pezzi comuni ---------- */
    function tagChip(t) {
      var g = TAG[t.tag] || TAG.altro;
      return h("span", { class: "hd-tag", "data-tag": g[0] }, h("span", { "aria-hidden": "true", text: g[2] }), g[1]);
    }
    function statusPill(t) {
      var s = STATUS[t.status] || STATUS.nuova;
      return h("span", { class: "hd-status", "data-st": t.status }, h("span", { "aria-hidden": "true", text: s.icon }), s.label);
    }
    function when(t) {
      return h("span", { class: "hd-when", "data-ago": t.created_at, text: ago(t.created_at) || ctx.fmtTime(t.created_at) });
    }
    function faqs() { return tickets.filter(function (t) { return t.pinned && t.answer; }); }
    function queue() {
      return tickets.filter(function (t) { return t.status === "nuova" || t.status === "arrivo"; }).sort(byPriority);
    }
    function byPriority(a, b) {
      return (b.status === "arrivo") - (a.status === "arrivo") || (b.stuck - a.stuck) || ((b.metoo || 0) - (a.metoo || 0)) || (a.created_at < b.created_at ? -1 : 1);
    }

    function faqWall(list, title) {
      if (!list.length) return null;
      return h("section", { class: "hd-faq", "aria-label": "Domande frequenti" },
        h("div", { class: "hd-sec-head" }, h("h2", null, h("span", { "aria-hidden": "true", text: "📌 " }), title || "Domande frequenti"),
          h("span", { class: "muted small", text: "Le risposte fissate dal docente" })),
        h("div", { class: "hd-notes" }, list.map(function (t, i) {
          return h("article", { class: "hd-note", style: "--tilt:" + ((i % 3) - 1) * 0.7 + "deg" },
            h("div", { class: "row" }, tagChip(t)),
            h("p", { class: "hd-q", text: t.body }),
            h("p", { class: "hd-a" }, h("mark", { text: t.answer })),
            teacher && h("div", { class: "row hd-note-tools" },
              h("button", { class: "btn link", type: "button", text: "Togli dalle FAQ", onclick: function () { act(db.update(t.id, { pinned: false })); } }),
              h("button", { class: "btn link", type: "button", text: "Modifica", onclick: function () { col = "risolte"; store("hd-col", col); openReply = t.id; render(); } }))
          );
        })));
    }

    async function act(p, okMsg) {
      try { await p; if (okMsg) toast(okMsg); refresh(); } catch (e) { toast(errText(e)); }
    }

    /* ---------- Studente ---------- */
    var form, nameLine, hint;
    function studentShell() {
      var name = store("chat-name") || "";
      var input = h("textarea", { name: "body", required: true, minlength: 3, maxlength: 1000, rows: 3, enterkeyhint: "send",
        placeholder: "Es. Nell'esercizio 3 non capisco cosa vuol dire «media pesata»", "aria-label": "La tua domanda" });
      var tagBox = h("div", { class: "hd-tags", role: "radiogroup", "aria-label": "Argomento" }, TAGS.map(function (t, i) {
        return h("label", { class: "hd-tagpick" },
          h("input", { type: "radio", name: "tag", value: t[0], checked: i === 0 ? true : null }),
          h("span", null, h("span", { "aria-hidden": "true", text: t[2] }), t[1]));
      }));
      var stuck = h("label", { class: "hd-stuck" }, h("input", { type: "checkbox", name: "stuck" }),
        h("span", { class: "hd-switch", "aria-hidden": "true" }),
        h("span", null, h("b", { text: "Sono bloccato" }), h("span", { class: "muted small", text: "non riesco ad andare avanti" })));
      var seat = h("input", { type: "text", name: "seat", maxlength: 20, placeholder: "Es. PC 12, 2ª fila", value: store("hd-seat") || "", autocomplete: "off", enterkeyhint: "done" });
      var nameIn = h("input", { type: "text", name: "author", required: true, minlength: 2, maxlength: 40, value: name, autocomplete: "nickname", placeholder: "Nome e iniziale del cognome", enterkeyhint: "next" });
      var send = h("button", { class: "btn primary hd-send", type: "submit" }, h("span", { "aria-hidden": "true", text: "✋" }), "Invia la domanda");
      var msg = h("div", { "aria-live": "polite" });
      hint = h("div", { class: "hd-hint", hidden: true });
      nameLine = h("div", { class: "hd-name" });

      form = h("form", { class: "card hd-ask", novalidate: true },
        h("div", { class: "hd-ask-head" },
          h("h2", null, "Hai un dubbio? ", h("span", { class: "mark", text: "Scrivilo qui" })),
          h("p", { class: "muted", text: "Niente mano alzata: il docente vede la tua domanda e ti risponde appena può. Intanto vai avanti col lavoro." })),
        input, hint, tagBox, stuck,
        h("div", { class: "hd-fields" },
          h("label", { class: "hd-name-field" }, "Il tuo nome", nameIn),
          h("label", null, h("span", null, "Dove sei ", h("span", { class: "muted small", text: "(facoltativo)" })), seat)),
        send, msg);
      if (name) { form.querySelector(".hd-name-field").hidden = true; nameLine.append("Domandi come ", h("b", { text: name }), " · ", h("button", { class: "btn link", type: "button", text: "cambia", onclick: function () { form.querySelector(".hd-name-field").hidden = false; nameLine.hidden = true; nameIn.focus(); } })); form.insertBefore(nameLine, send); }

      input.addEventListener("input", function () { suggest(input.value); });
      form.addEventListener("submit", async function (e) {
        e.preventDefault();
        var body = input.value.trim(), author = nameIn.value.trim().slice(0, 40);
        if (body.length < 3) { msg.replaceChildren(ctx.notice("err", "Scrivi la domanda (almeno qualche parola).")); input.focus(); return; }
        if (author.length < 2) { form.querySelector(".hd-name-field").hidden = false; msg.replaceChildren(ctx.notice("err", "Scrivi il tuo nome, così il docente sa chi aiutare.")); nameIn.focus(); return; }
        send.disabled = true;
        try {
          var key = randKey();
          var id = await db.ask({ class_id: c.id, author: author, body: body, tag: (form.querySelector('input[name="tag"]:checked') || {}).value || "altro", stuck: form.elements.stuck.checked, seat: seat.value.trim() || null }, key);
          mine[id] = key; store(MINE_KEY, JSON.stringify(mine));
          store("chat-name", author); store("hd-seat", seat.value.trim());
          input.value = ""; form.elements.stuck.checked = false; hint.hidden = true;
          msg.replaceChildren(ctx.notice("ok", "Domanda inviata! Continua a lavorare: qui sotto vedi quando il docente risponde."));
          setTimeout(function () { msg.textContent = ""; }, 6000);
          buzz(40);
          if (!nameLine.parentNode || nameLine.hidden) { nameLine.hidden = false; nameLine.replaceChildren("Domandi come ", h("b", { text: author })); form.insertBefore(nameLine, send); form.querySelector(".hd-name-field").hidden = true; }
          await refresh();
        } catch (err) { msg.replaceChildren(ctx.notice("err", err && err.message && !/fetch|network/i.test(err.message) ? err.message : errText(err))); }
        send.disabled = false;
      });
      input.addEventListener("keydown", function (e) {
        // Su PC Invio manda la domanda; sul telefono Invio va a capo
        if (e.key === "Enter" && !e.shiftKey && !e.isComposing && matchMedia("(pointer:fine)").matches) { e.preventDefault(); form.requestSubmit(); }
      });
      root.appendChild(form);
    }

    // Mentre lo studente scrive, mostra le FAQ e le risposte che sembrano simili
    function suggest(text) {
      var w = words(text);
      if (w.length < 2) { hint.hidden = true; return; }
      var scored = tickets.filter(function (t) { return t.answer && (t.pinned || t.status === "risolta"); }).map(function (t) {
        var tw = words(t.body + " " + t.answer), s = 0;
        w.forEach(function (x) { if (tw.some(function (y) { return y.slice(0, 5) === x.slice(0, 5); })) s++; });
        return { t: t, s: s / w.length + (t.pinned ? 0.15 : 0) };
      }).filter(function (x) { return x.s >= 0.5; }).sort(function (a, b) { return b.s - a.s; }).slice(0, 2);
      if (!scored.length) { hint.hidden = true; return; }
      hint.hidden = false;
      hint.replaceChildren.apply(hint, [h("b", { text: "Forse la risposta c'è già:" })].concat(scored.map(function (x) {
        return h("div", { class: "hd-hint-item" }, h("p", { class: "small", text: x.t.body }), h("p", null, h("mark", { text: x.t.answer })));
      })));
    }

    function renderStudent() {
      var q = queue();
      var mineList = tickets.filter(function (t) { return mine[t.id]; });
      var mineOpen = mineList.filter(function (t) { return t.status !== "risolta"; });
      var mineDone = mineList.filter(function (t) { return t.status === "risolta"; }).slice(0, 5);

      if (mineList.length) {
        main.appendChild(h("section", { class: "hd-sec" },
          h("div", { class: "hd-sec-head" }, h("h2", { text: "Le tue domande" })),
          mineOpen.concat(mineDone).map(function (t) { return mineCard(t, q); })));
      }
      main.appendChild(faqWall(faqs()) || h("span"));

      var others = q.filter(function (t) { return !mine[t.id]; });
      main.appendChild(h("section", { class: "hd-sec" },
        h("div", { class: "hd-sec-head" }, h("h2", { text: "In coda nella classe" }),
          h("span", { class: "hd-count", text: q.length ? q.length + (q.length === 1 ? " domanda" : " domande") : "nessuna" })),
        others.length ? h("p", { class: "muted small", text: "Hai lo stesso dubbio? Tocca «Anch'io» invece di scriverlo di nuovo: il docente vede quante persone hanno quella domanda." }) : null,
        others.length ? others.map(otherCard) : h("p", { class: "empty", text: q.length ? "In coda ci sono solo le tue domande." : "Nessuno sta aspettando: è il momento giusto per chiedere!" })));

      var answered = tickets.filter(function (t) { return t.status === "risolta" && t.answer && !t.pinned && !mine[t.id]; }).slice(0, 15);
      if (answered.length) {
        main.appendChild(h("details", { class: "hd-sec hd-more" },
          h("summary", null, "Risposte di oggi ", h("span", { class: "hd-count", text: String(answered.length) })),
          answered.map(function (t) {
            return h("article", { class: "card hd-card is-done" },
              h("div", { class: "hd-meta" }, tagChip(t), h("b", { text: t.author }), when(t)),
              h("p", { class: "hd-q", text: t.body }), h("p", { class: "hd-answer" }, h("span", { class: "hd-answer-who", text: "Docente" }), t.answer));
          })));
      }
    }

    function steps(t) {
      var order = ["nuova", "arrivo", "risolta"];
      var at = t.status === "sospesa" ? 1 : order.indexOf(t.status);
      return h("ol", { class: "hd-steps", "aria-label": "Stato: " + STATUS[t.status].long },
        [["Inviata", 0], [t.status === "sospesa" ? "In sospeso" : "Il docente arriva", 1], ["Risolta", 2]].map(function (s) {
          return h("li", { class: (s[1] <= at ? "on" : "") + (t.status === "sospesa" && s[1] === 1 ? " paused" : "") }, s[0]);
        }));
    }

    function mineCard(t, q) {
      var pos = q.indexOf(t) + 1;
      var done = t.status === "risolta";
      var line = t.status === "nuova" ? (pos === 1 ? "Sei il primo in coda." : "Sei il " + pos + "° in coda.") + " Intanto prova ad andare avanti."
        : t.status === "arrivo" ? "Il docente sta venendo da te." : t.status === "sospesa" ? "Il docente ne parlerà più tardi: continua pure con il resto." : "";
      return h("article", { class: "card hd-card is-mine", "data-st": t.status },
        h("div", { class: "hd-meta" }, statusPill(t), tagChip(t), t.stuck && !done ? h("span", { class: "hd-flag", text: "Bloccato" }) : null, when(t)),
        h("p", { class: "hd-q", text: t.body }),
        !done && steps(t),
        line && h("p", { class: "hd-line", text: line }),
        t.answer && h("p", { class: "hd-answer" }, h("span", { class: "hd-answer-who", text: "Docente" }), t.answer),
        !done && h("div", { class: "row" },
          h("button", { class: "btn hd-ok", type: "button", text: "✓ Ho risolto", onclick: function () { act(db.resolveOwn(t.id, mine[t.id]), "Bene! Domanda segnata come risolta."); } }),
          !t.answer && ctx.confirmBtn("Ritira", "btn link", async function () { await db.withdraw(t.id, mine[t.id]); delete mine[t.id]; store(MINE_KEY, JSON.stringify(mine)); refresh(); })));
    }

    function otherCard(t) {
      var voted = !!votes[t.id];
      return h("article", { class: "card hd-card hd-other", "data-st": t.status },
        h("div", { class: "hd-meta" }, tagChip(t), h("b", { text: t.author }), when(t), t.status === "arrivo" ? statusPill(t) : null),
        h("p", { class: "hd-q", text: t.body }),
        h("div", { class: "row" },
          h("button", { class: "btn hd-metoo" + (voted ? " on" : ""), type: "button", "aria-pressed": voted ? "true" : "false", onclick: function () {
            if (voted) delete votes[t.id]; else votes[t.id] = 1;
            store(VOTE_KEY, JSON.stringify(votes));
            act(db.metoo(t.id, voted ? -1 : 1));
          } }, h("span", { "aria-hidden": "true", text: "🙋" }), voted ? "Anch'io ✓" : "Anch'io"),
          t.metoo ? h("span", { class: "muted small", text: t.metoo + (t.metoo === 1 ? " compagno ha" : " compagni hanno") + " lo stesso dubbio" }) : null));
    }

    /* ---------- Docente ---------- */
    var counters, seg;
    function teacherShell() {
      counters = h("div", { class: "hd-stats" });
      seg = h("div", { class: "hd-seg", role: "tablist", "aria-label": "Colonne" });
      var sound = h("button", { class: "btn link small", type: "button", onclick: function () {
        var on = store("hd-sound") === "0"; store("hd-sound", on ? "1" : "0"); if (on) ding(); setSound();
      } });
      function setSound() { sound.textContent = store("hd-sound") === "0" ? "🔕 Avviso sonoro spento" : "🔔 Avviso sonoro acceso"; }
      setSound();
      var clear = ctx.confirmBtn("Svuota le risolte", "btn link small", async function () { await db.clearResolved(c.id); refresh(); });
      root.appendChild(h("div", { class: "card hd-desk" },
        h("div", { class: "hd-desk-head" },
          h("h2", null, "Sportello domande"),
          h("div", { class: "row" }, sound, clear)),
        counters, seg));
      root.appendChild(faqForm());
    }

    function faqForm() {
      var msg = h("div");
      var f = h("form", { class: "stack" },
        h("label", null, "Domanda", h("input", { type: "text", name: "q", required: true, maxlength: 1000, placeholder: "Es. Come si salva il file in PDF?" })),
        h("label", null, "Risposta", h("textarea", { name: "a", required: true, maxlength: 2000 })),
        h("label", null, "Argomento", h("select", { name: "tag" }, TAGS.map(function (t) { return h("option", { value: t[0], text: t[2] + " " + t[1] }); }))),
        h("button", { class: "btn primary", type: "submit", text: "Fissa nelle FAQ" }), msg);
      f.addEventListener("submit", async function (e) {
        e.preventDefault();
        var el = f.elements;
        if (el.q.value.trim().length < 3 || !el.a.value.trim()) { msg.replaceChildren(ctx.notice("err", "Scrivi domanda e risposta.")); return; }
        try {
          await db.addFaq({ class_id: c.id, author: "Docente", body: el.q.value.trim(), answer: el.a.value.trim(), tag: el.tag.value, status: "risolta", pinned: true, stuck: false });
          f.reset(); det.open = false; refresh();
        } catch (err) { msg.replaceChildren(ctx.notice("err", errText(err))); }
      });
      var det = h("details", { class: "teacher" }, h("summary", { text: "Docente: aggiungi una FAQ" }), f);
      return det;
    }

    function renderBoard() {
      var stuckN = tickets.filter(function (t) { return t.stuck && (t.status === "nuova" || t.status === "arrivo"); }).length;
      var today = new Date().toDateString();
      var solvedToday = tickets.filter(function (t) { return t.status === "risolta" && !t.pinned && new Date(t.updated_at || t.created_at).toDateString() === today; }).length;
      var per = COLS.map(function (k) { return tickets.filter(function (t) { return k[2](t) && !(k[0] === "risolte" && t.pinned); }); });
      counters.replaceChildren(
        stat(per[0].length, "da gestire", "new"), stat(stuckN, "bloccati", "stuck"),
        stat(per[1].length, "in sospeso", "hold"), stat(solvedToday, "risolte oggi", "done"));
      seg.replaceChildren.apply(seg, COLS.map(function (k, i) {
        return h("button", { type: "button", role: "tab", "aria-selected": col === k[0] ? "true" : "false", onclick: function () { col = k[0]; store("hd-col", col); render(); } },
          k[1], h("span", { class: "hd-count", text: String(per[i].length) }));
      }));

      var board = h("div", { class: "hd-board", "data-col": col });
      COLS.forEach(function (k, i) {
        var list = per[i].slice();
        if (k[0] === "risolte") list.sort(function (a, b) { return a.updated_at < b.updated_at ? 1 : -1; });
        else list.sort(byPriority);
        board.appendChild(h("section", { class: "hd-col" + (col === k[0] ? " is-active" : ""), "aria-label": k[1] },
          h("h3", null, k[1], h("span", { class: "hd-count", text: String(list.length) })),
          list.length ? list.map(boardCard) : h("p", { class: "hd-col-empty", text: k[0] === "aperte" ? "Nessuna domanda in attesa. 🎉" : "Vuoto." })));
      });
      main.appendChild(board);
      main.appendChild(faqWall(faqs(), "FAQ fissate") || h("p", { class: "muted small hd-faq-tip", text: "Suggerimento: rispondi a una domanda e tocca «📌 FAQ» per fissarla in alto, evidenziata, per tutta la classe." }));
    }

    function stat(n, label, kind) {
      return h("div", { class: "hd-stat", "data-kind": kind }, h("b", { text: String(n) }), h("span", { text: label }));
    }

    function boardCard(t) {
      var editing = openReply === t.id;
      var ta = h("textarea", { class: "hd-reply-in", rows: 2, maxlength: 2000, placeholder: "Scrivi una risposta breve…", "aria-label": "Risposta" });
      ta.value = drafts[t.id] != null ? drafts[t.id] : (t.answer || "");
      ta.addEventListener("input", function () { drafts[t.id] = ta.value; });
      var pin = h("label", { class: "hd-pin" }, h("input", { type: "checkbox", checked: t.pinned ? true : null }), "📌 FAQ");
      async function answer(resolve) {
        var a = ta.value.trim();
        var patch = { answer: a || null, pinned: !!(a && pin.querySelector("input").checked) };
        if (resolve) patch.status = "risolta";
        delete drafts[t.id]; openReply = null;
        document.activeElement && document.activeElement.blur && document.activeElement.blur();
        act(db.update(t.id, patch));
      }
      var reply = h("div", { class: "hd-reply", hidden: editing ? null : true },
        h("div", { class: "hd-quick" }, QUICK.map(function (q) {
          return h("button", { class: "chip", type: "button", text: q, onclick: function () { ta.value = q; drafts[t.id] = q; ta.focus(); } });
        })),
        ta,
        h("div", { class: "row" },
          h("button", { class: "btn primary", type: "button", text: "Rispondi e risolvi", onclick: function () { answer(true); } }),
          h("button", { class: "btn", type: "button", text: "Solo rispondi", onclick: function () { answer(false); } }),
          pin));
      var done = t.status === "risolta";
      var card = h("article", { class: "card hd-card" + (t.stuck && !done ? " is-stuck" : "") + (done ? " is-done" : ""), "data-st": t.status },
        h("div", { class: "hd-meta" }, statusPill(t), tagChip(t), t.stuck && !done ? h("span", { class: "hd-flag", text: "Bloccato" }) : null,
          t.pinned ? h("span", { class: "hd-flag pin", text: "📌 FAQ" }) : null),
        h("div", { class: "hd-who" },
          h("span", { class: "avatar", style: "--av:" + ctx.hue(t.author), "aria-hidden": "true", text: ctx.initials(t.author) }),
          h("b", { text: t.author }), t.seat ? h("span", { class: "hd-seat", text: "📍 " + t.seat }) : null, when(t)),
        h("p", { class: "hd-q", text: t.body }),
        t.metoo ? h("p", { class: "hd-metoo-n", text: "🙋 +" + t.metoo + (t.metoo === 1 ? " compagno ha" : " compagni hanno") + " lo stesso dubbio" }) : null,
        t.answer && !editing ? h("p", { class: "hd-answer" }, h("span", { class: "hd-answer-who", text: "Risposta" }), t.answer) : null,
        h("div", { class: "hd-actions" },
          t.status !== "arrivo" && !done ? h("button", { class: "btn hd-go", type: "button", onclick: function () { act(db.update(t.id, { status: "arrivo" })); } }, "🏃 Arrivo") : null,
          t.status !== "sospesa" && !done ? h("button", { class: "btn hd-hold", type: "button", onclick: function () { act(db.update(t.id, { status: "sospesa" })); } }, "⏸ Dopo") : null,
          !done ? h("button", { class: "btn hd-ok", type: "button", onclick: function () { act(db.update(t.id, { status: "risolta" })); } }, "✓ Risolta") : null,
          done ? h("button", { class: "btn", type: "button", onclick: function () { act(db.update(t.id, { status: "nuova", pinned: false })); } }, "↺ Riapri") : null,
          h("button", { class: "btn hd-answer-btn", type: "button", "aria-expanded": editing ? "true" : "false", onclick: function () {
            openReply = editing ? null : t.id; render();
            if (!editing) { var x = main.querySelector('[data-id="' + t.id + '"] .hd-reply-in'); if (x) x.focus(); }
          } }, "💬 " + (t.answer ? "Modifica" : "Rispondi")),
          ctx.confirmBtn("Elimina", "btn link danger small", async function () { await db.remove(t.id); refresh(); })),
        reply);
      card.setAttribute("data-id", t.id);
      return card;
    }

    return function stop() {
      stopped = true; unwatch(); clearInterval(poll); clearInterval(tick); clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  };
})();
