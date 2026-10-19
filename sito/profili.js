/* Novaula · Profili degli studenti, voti, consegne a nome del profilo, lavori di gruppo,
   materiali personali e controlli di coerenza (vedi aggiornamenti/2026-10-19-profili.sql).
   Lo studente crea da solo il suo profilo nella classe; il PIN (4 cifre) è facoltativo e protegge
   la parte privata. Il dispositivo riceve un codice di sessione (solo l'hash resta nel database).
   I voti proposti da Claude restano nascosti agli studenti finché il docente non li conferma.
   app.js chiama:
     NovaulaProfili.chip(classe, aiuti)                     pulsante nel titolo della classe
     NovaulaProfili.page(classe, contenitore, aiuti)        #/c/<id>/profilo (studente) o elenco studenti (docente)
     NovaulaProfili.submitForm(compito, classe, aiuti)      consegna a nome del profilo (e del gruppo)
     NovaulaProfili.forAssignment(compito, consegne, aiuti) -> funzione consegna -> elemento (docente)
     NovaulaProfili.correctionExtra(correzione, aiuti)      voti sotto una correzione di Claude (docente)
     NovaulaProfili.board(contenitore, aiuti)               Area docente: voti da confermare e richieste */
(function () {
  "use strict";

  var CATS = [["compito", "Compito a casa"], ["classe", "Lavoro in classe"], ["verifica", "Verifica"], ["orale", "Interrogazione"], ["progetto", "Progetto"], ["altro", "Altro"]];
  var CAT = {}; CATS.forEach(function (c) { CAT[c[0]] = c[1]; });
  var HOME = { compito: 1, progetto: 1 }, SCHOOL = { verifica: 1, orale: 1, classe: 1 };

  /* ---------- Sessione sul dispositivo ---------- */
  function skey(cid) { return "novaula-profilo-" + cid; }
  function getSession(cid) {
    var raw = null;
    try { raw = sessionStorage.getItem(skey(cid)) || localStorage.getItem(skey(cid)); } catch (e) {}
    try { return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
  }
  function setSession(cid, s, remember) {
    try {
      localStorage.removeItem(skey(cid)); sessionStorage.removeItem(skey(cid));
      if (s) (remember ? localStorage : sessionStorage).setItem(skey(cid), JSON.stringify(s));
    } catch (e) {}
    cache = {};
  }
  var cache = {};
  async function privateData(x, cid, fresh) {
    var s = getSession(cid);
    if (!s) return null;
    if (!fresh && cache[cid] && Date.now() - cache[cid].t < 30000) return cache[cid].d;
    var res = await x.sb.rpc("student_private", { p_student: s.id, p_token: s.token });
    if (res.error) {
      if (/Sessione scaduta/.test(res.error.message)) { setSession(cid, null); return null; }
      throw res.error;
    }
    cache[cid] = { t: Date.now(), d: res.data };
    return res.data;
  }
  function ok(res) { if (res.error) throw res.error; return res.data; }

  /* ---------- Piccoli aiuti ---------- */
  function fullName(s) { return (s.first_name || "") + " " + (s.last_name || ""); }
  function initials(s) { return ((s.first_name || "?")[0] + (s.last_name || "")[0]).toUpperCase(); }
  // "7+", "6½", "6,5", "8-" -> numero
  function markValue(label) {
    var m = /^(\d{1,2})(?:[.,](\d{1,2}))?\s*(\+|-|½|1\/2|e mezzo)?/.exec(String(label || "").trim());
    if (!m) return null;
    var v = +m[1] + (m[2] ? +("0." + m[2]) : 0);
    if (m[3] === "+") v += 0.25; else if (m[3] === "-") v -= 0.25; else if (m[3]) v += 0.5;
    return v >= 0 && v <= 10 ? v : null;
  }
  function fmtAvg(v) { return v == null ? "–" : (Math.round(v * 100) / 100).toLocaleString("it-IT"); }
  function avg(list) {
    var v = list.filter(function (m) { return m.status === "confermato" && m.value != null; }).map(function (m) { return +m.value; });
    return v.length ? v.reduce(function (a, b) { return a + b; }, 0) / v.length : null;
  }
  function tone(v) { return v == null ? "" : v >= 6 ? "good" : v >= 5 ? "mid" : "bad"; }
  function todayIso() { var d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
  async function sha256(buf) {
    var d = await crypto.subtle.digest("SHA-256", buf);
    return Array.prototype.map.call(new Uint8Array(d), function (b) { return ("0" + b.toString(16)).slice(-2); }).join("");
  }
  async function deviceHash() {
    var id;
    try { id = localStorage.getItem("novaula-dispositivo"); } catch (e) {}
    if (!id) { id = Math.random().toString(36).slice(2) + Date.now().toString(36); try { localStorage.setItem("novaula-dispositivo", id); } catch (e) {} }
    try { return (await sha256(new TextEncoder().encode("novaula:" + id))).slice(0, 32); } catch (e) { return null; }
  }
  function pinInput(x, attrs) {
    return x.h("input", Object.assign({ type: "password", inputmode: "numeric", pattern: "\\d{4}", maxlength: 4, autocomplete: "off", class: "pin-in", placeholder: "••••" }, attrs || {}));
  }
  function markBadge(x, m, proposed) {
    var label = proposed ? m.proposed_label : m.status === "da_rifare" ? "Da rifare" : (m.label || fmtAvg(m.value));
    var v = proposed ? m.proposed_value : m.value;
    return x.h("span", { class: "mk " + (m.status === "da_rifare" && !proposed ? "redo" : tone(v == null ? null : +v)) + (proposed ? " proposed" : ""), text: label || "?" });
  }

  /* ---------- Pulsante nel titolo della classe ---------- */
  function chip(c, x) {
    if (x.teacher) return x.h("a", { class: "profile-chip", href: "#/c/" + c.id + "/profilo" }, x.h("span", { class: "pc-av", text: "★" }), x.h("span", { text: "Studenti e voti" }));
    var s = getSession(c.id);
    return x.h("a", { class: "profile-chip" + (s ? " in" : ""), href: "#/c/" + c.id + "/profilo" },
      x.h("span", { class: "pc-av", text: s ? initials({ first_name: s.first_name, last_name: s.last_name }) : "?" }),
      x.h("span", { text: s ? s.first_name : "Il mio profilo" }));
  }

  /* ---------- Pagina profilo (studente) ---------- */
  async function page(c, box, x) {
    if (!x.sb) { box.appendChild(x.notice("err", "I profili non sono disponibili in modalità demo.")); return; }
    if (x.teacher) return teacherPage(c, box, x);
    box.appendChild(x.h("p", { class: "empty", text: "Caricamento…" }));
    var data;
    try { data = await privateData(x, c.id, true); } catch (e) { box.replaceChildren(x.notice("err", x.errText(e))); return; }
    box.textContent = "";
    if (!data) return loginView(c, box, x);
    profileView(c, box, x, data);
  }

  async function loginView(c, box, x) {
    var h = x.h;
    var list = h("div", { class: "who-list" }, h("p", { class: "muted", text: "Caricamento dei nomi…" }));
    var search = h("input", { type: "search", placeholder: "Cerca il tuo cognome", "aria-label": "Cerca il tuo nome", autocomplete: "off", enterkeyhint: "search" });
    var pinBox = h("div");
    box.appendChild(h("section", { class: "card pf-login" },
      h("div", { class: "pf-login-head" },
        h("h2", { text: "Chi sei?" }),
        h("p", { class: "muted", text: "Tocca il tuo nome. Se non c'è ancora, crea il tuo profilo qui sotto: basta farlo una volta." })),
      search, list, pinBox));
    box.appendChild(createForm(c, x));
    var people = [];
    try { people = ok(await x.sb.rpc("class_students", { p_class: c.id })); } catch (e) { list.replaceChildren(x.notice("err", x.errText(e))); return; }
    function paint() {
      var q = search.value.trim().toLowerCase();
      var shown = people.filter(function (p) { return !q || fullName(p).toLowerCase().indexOf(q) >= 0; });
      list.textContent = "";
      if (!people.length) { list.appendChild(h("p", { class: "muted", text: "Nessun profilo in questa classe: sii il primo a crearlo." })); return; }
      if (!shown.length) { list.appendChild(h("p", { class: "muted", text: "Nessun nome trovato." })); return; }
      shown.forEach(function (p) {
        list.appendChild(h("button", { class: "who-btn", type: "button", onclick: function () { pick(p); } },
          h("span", { class: "pc-av", text: initials(p) }),
          h("span", { class: "who-name" }, h("b", { text: p.last_name }), " " + p.first_name),
          h("span", { class: "who-lock", title: p.has_pin ? "Protetto da PIN" : "Senza PIN", text: p.has_pin ? "🔒" : "" })));
      });
    }
    search.addEventListener("input", paint);
    paint();

    function pick(p) {
      if (!p.has_pin) return enter(p, null, true);
      var msg = h("div");
      var pin = pinInput(x, { "aria-label": "PIN di 4 cifre", autofocus: true });
      var remember = h("input", { type: "checkbox", checked: true });
      var f = h("form", { class: "card stack pin-form" },
        h("p", null, "Ciao ", h("b", { text: p.first_name }), ", inserisci il tuo PIN."),
        pin,
        h("label", { class: "check-row" }, remember, h("span", { text: "Ricorda su questo dispositivo (togli la spunta sui PC della scuola)" })),
        h("div", { class: "row" }, h("button", { class: "btn primary", type: "submit", text: "Entra" }),
          h("button", { class: "btn", type: "button", text: "Annulla", onclick: function () { pinBox.textContent = ""; } })),
        h("p", { class: "muted small", text: "Hai dimenticato il PIN? Chiedi al docente di azzerarlo." }),
        msg);
      pin.addEventListener("input", function () { pin.value = pin.value.replace(/\D/g, "").slice(0, 4); if (pin.value.length === 4) f.requestSubmit(); });
      f.addEventListener("submit", async function (e) {
        e.preventDefault();
        if (!/^\d{4}$/.test(pin.value)) { msg.replaceChildren(x.notice("err", "Il PIN ha 4 cifre.")); return; }
        f.querySelector("button").disabled = true;
        await enter(p, pin.value, remember.checked, msg);
        f.querySelector("button").disabled = false; pin.value = ""; pin.focus();
      });
      pinBox.replaceChildren(f);
      f.scrollIntoView({ block: "center", behavior: "smooth" });
      pin.focus();
    }
    async function enter(p, pinValue, remember, msg) {
      try {
        var r = ok(await x.sb.rpc("student_unlock", { p_student: p.id, p_pin: pinValue }));
        if (r.error) { if (msg) msg.replaceChildren(x.notice("err", r.error)); else x.toast(r.error); return; }
        setSession(c.id, { id: p.id, token: r.token, first_name: p.first_name, last_name: p.last_name }, remember);
        afterLogin(c, x);
      } catch (e) { if (msg) msg.replaceChildren(x.notice("err", x.errText(e))); else x.toast(x.errText(e)); }
    }
  }

  // Dopo l'accesso torna dove lo studente voleva consegnare, altrimenti resta sul profilo
  function afterLogin(c, x) {
    var back = null;
    try { back = sessionStorage.getItem("novaula-dopo-accesso"); sessionStorage.removeItem("novaula-dopo-accesso"); } catch (e) {}
    if (back && back !== location.hash) location.hash = back; else x.route();
  }

  function createForm(c, x) {
    var h = x.h, msg = h("div");
    var pin = pinInput(x, { name: "pin", "aria-label": "PIN (facoltativo)", autocomplete: "new-password" });
    var pin2 = pinInput(x, { name: "pin2", "aria-label": "Ripeti il PIN", autocomplete: "new-password" });
    [pin, pin2].forEach(function (p) { p.addEventListener("input", function () { p.value = p.value.replace(/\D/g, "").slice(0, 4); }); });
    var remember = h("input", { type: "checkbox", name: "remember", checked: true });
    var form = h("form", { class: "stack" },
      h("div", { class: "pf-two" },
        h("label", null, "Nome", h("input", { type: "text", name: "first", required: true, minlength: 2, maxlength: 40, autocomplete: "given-name", autocapitalize: "words" })),
        h("label", null, "Cognome", h("input", { type: "text", name: "last", required: true, minlength: 2, maxlength: 40, autocomplete: "family-name", autocapitalize: "words" }))),
      h("fieldset", { class: "pf-pin" },
        h("legend", { text: "PIN di 4 cifre (facoltativo, consigliato)" }),
        h("p", { class: "muted small", text: "Protegge i tuoi voti e le tue consegne. Senza PIN chiunque scelga il tuo nome può vederli. Puoi metterlo anche dopo." }),
        h("div", { class: "pf-two" }, h("label", null, "PIN", pin), h("label", null, "Ripeti il PIN", pin2))),
      h("label", { class: "check-row" }, remember, h("span", { text: "Ricorda su questo dispositivo" })),
      h("button", { class: "btn primary", type: "submit", text: "Crea il mio profilo" }),
      msg);
    form.addEventListener("submit", async function (e) {
      e.preventDefault();
      var f = form.elements;
      if (pin.value || pin2.value) {
        if (!/^\d{4}$/.test(pin.value)) { msg.replaceChildren(x.notice("err", "Il PIN deve avere esattamente 4 cifre.")); return; }
        if (pin.value !== pin2.value) { msg.replaceChildren(x.notice("err", "I due PIN non coincidono.")); return; }
      }
      var btn = form.querySelector('button[type="submit"]'); btn.disabled = true;
      try {
        var r = ok(await x.sb.rpc("student_create", { p_class: c.id, p_first: f.first.value, p_last: f.last.value, p_pin: pin.value || null }));
        var first = f.first.value.trim(), last = f.last.value.trim();
        setSession(c.id, { id: r.id, token: r.token, first_name: cap(first), last_name: cap(last) }, remember.checked);
        afterLogin(c, x);
      } catch (err) { msg.replaceChildren(x.notice("err", x.errText(err).replace("Qualcosa non ha funzionato: ", ""))); btn.disabled = false; }
    });
    return h("details", { class: "card pf-create" }, h("summary", { class: "pf-sum", text: "Non trovi il tuo nome? Crea il tuo profilo" }), form);
  }
  function cap(s) { return s.toLowerCase().replace(/(^|[\s'-])(\S)/g, function (m, a, b) { return a + b.toUpperCase(); }); }

  function profileView(c, box, x, d) {
    var h = x.h, st = d.student, sess = getSession(c.id);
    // Aggiorna il nome salvato (il docente potrebbe averlo corretto)
    if (sess && (sess.first_name !== st.first_name || sess.last_name !== st.last_name)) {
      var remembered = false; try { remembered = !!localStorage.getItem(skey(c.id)); } catch (e) {}
      setSession(c.id, Object.assign(sess, { first_name: st.first_name, last_name: st.last_name }), remembered);
    }
    var marks = d.marks || [], vis = marks.filter(function (m) { return m.status === "confermato"; });
    var overall = avg(marks);
    box.appendChild(h("section", { class: "card pf-head" },
      h("div", { class: "pf-id" },
        h("span", { class: "pc-av big", text: initials(st) }),
        h("div", null, h("h2", { text: fullName(st) }),
          h("p", { class: "muted small", text: st.has_pin ? "🔒 Protetto da PIN" : "Senza PIN: chiunque scelga il tuo nome può vedere questa pagina." }))),
      h("div", { class: "pf-stats" },
        h("div", { class: "pf-stat" }, h("span", { class: "mk big " + tone(overall), text: fmtAvg(overall) }), h("span", { class: "small muted", text: "Media" })),
        h("div", { class: "pf-stat" }, h("b", { text: String(vis.length) }), h("span", { class: "small muted", text: vis.length === 1 ? "voto" : "voti" })),
        h("div", { class: "pf-stat" }, h("b", { text: String((d.submissions || []).length) }), h("span", { class: "small muted", text: "consegne" }))),
      pinTools(c, x, st)));

    // Voti per tipo
    var sec = h("section", { class: "pf-sec" }, h("h2", { text: "I miei voti" }));
    if (!marks.length) sec.appendChild(h("p", { class: "empty", text: "Ancora nessun voto." }));
    else {
      var byCat = {};
      marks.forEach(function (m) { (byCat[m.category] = byCat[m.category] || []).push(m); });
      sec.appendChild(h("div", { class: "pf-cats" }, CATS.filter(function (k) { return byCat[k[0]]; }).map(function (k) {
        var a = avg(byCat[k[0]]);
        return h("div", { class: "pf-cat" }, h("span", { class: "small muted", text: k[1] }), h("b", { class: tone(a), text: fmtAvg(a) }));
      })));
      var ul = h("div", { class: "mk-list" });
      marks.forEach(function (m) {
        ul.appendChild(h("div", { class: "mk-row" + (m.status === "da_rifare" ? " is-redo" : "") },
          markBadge(x, m),
          h("div", { class: "mk-body" },
            h("b", { text: m.title }),
            h("span", { class: "small muted", text: CAT[m.category] + " · " + x.fmtDate(m.mark_date) }),
            m.status === "da_rifare" && h("span", { class: "small redo-t", text: "Il docente ti chiede di rifare questo lavoro: consegnalo di nuovo nella sezione Compiti." }),
            m.note && h("p", { class: "small desc", text: m.note }))));
      });
      sec.appendChild(ul);
    }
    box.appendChild(sec);

    // Consegne
    var subs = d.submissions || [];
    var s2 = h("section", { class: "pf-sec" }, h("h2", { text: "Le mie consegne" }));
    if (!subs.length) s2.appendChild(h("p", { class: "empty", text: "Non hai ancora consegnato niente con questo profilo." }));
    subs.forEach(function (s) {
      s2.appendChild(h("div", { class: "card pf-sub" + (s.status === "da_rifare" ? " is-redo" : "") },
        h("div", { class: "row" }, h("b", { text: s.title }),
          s.attempt > 1 && h("span", { class: "badge", text: "Tentativo " + s.attempt }),
          s.status === "da_rifare" ? h("span", { class: "badge redo-badge", text: "Da rifare" }) : h("span", { class: "badge ok-badge", text: "Consegnato" })),
        h("span", { class: "small muted", text: x.fmtTime(s.created_at) + (s.file_name ? " · " + s.file_name : "") }),
        s.members && s.members.length > 1 && h("span", { class: "small", text: "Gruppo: " + s.members.join(", ") }),
        s.status === "da_rifare" && s.teacher_note && h("p", { class: "small desc redo-t", text: s.teacher_note })));
    });
    box.appendChild(s2);

    // Materiali personali
    var mats = d.materials || [];
    var s3 = h("section", { class: "pf-sec" }, h("h2", { text: "Materiali per te" }));
    if (!mats.length) s3.appendChild(h("p", { class: "muted small", text: "Qui trovi slide, PDF e file che il docente ti manda personalmente." }));
    mats.forEach(function (m) { s3.appendChild(materialCard(c, x, m, null)); });
    box.appendChild(s3);

    // Richieste di materiale
    var reqMsg = h("div");
    var ta = h("textarea", { maxlength: 600, rows: 2, placeholder: "Es. «Mi manderebbe le slide sui database? Ero assente il 12.»", "aria-label": "La tua richiesta" });
    var rf = h("form", { class: "stack" }, ta, h("button", { class: "btn", type: "submit", text: "Invia la richiesta" }), reqMsg);
    rf.addEventListener("submit", async function (e) {
      e.preventDefault();
      if (ta.value.trim().length < 3) return;
      try { ok(await x.sb.rpc("student_request", { p_student: sess.id, p_token: sess.token, p_body: ta.value })); x.route(); }
      catch (err) { reqMsg.replaceChildren(x.notice("err", x.errText(err))); }
    });
    box.appendChild(h("section", { class: "pf-sec" }, h("h2", { text: "Chiedi materiale al docente" }),
      (d.requests || []).map(function (q) {
        return h("p", { class: "small pf-req" + (q.done ? " done" : "") }, h("span", { text: q.done ? "✓ " : "⏳ " }), q.body, h("span", { class: "muted", text: " · " + x.fmtTime(q.created_at) }));
      }), rf));
  }

  function pinTools(c, x, st) {
    var h = x.h, sess = getSession(c.id), area = h("div");
    function form(remove) {
      var msg = h("div"), p1 = pinInput(x, { "aria-label": "Nuovo PIN", autocomplete: "new-password" }), p2 = pinInput(x, { "aria-label": "Ripeti il PIN", autocomplete: "new-password" });
      [p1, p2].forEach(function (p) { p.addEventListener("input", function () { p.value = p.value.replace(/\D/g, "").slice(0, 4); }); });
      var f = h("form", { class: "stack" },
        remove ? h("p", { class: "small", text: "Senza PIN chiunque scelga il tuo nome vede i tuoi voti. Vuoi davvero toglierlo?" })
          : h("div", { class: "pf-two" }, h("label", null, "Nuovo PIN", p1), h("label", null, "Ripeti", p2)),
        h("div", { class: "row" }, h("button", { class: "btn primary", type: "submit", text: remove ? "Togli il PIN" : "Salva il PIN" }),
          h("button", { class: "btn", type: "button", text: "Annulla", onclick: function () { area.textContent = ""; } })),
        msg);
      f.addEventListener("submit", async function (e) {
        e.preventDefault();
        if (!remove && (!/^\d{4}$/.test(p1.value) || p1.value !== p2.value)) { msg.replaceChildren(x.notice("err", "Scrivi due volte lo stesso PIN di 4 cifre.")); return; }
        try {
          ok(await x.sb.rpc("student_set_pin", { p_student: sess.id, p_token: sess.token, p_pin: remove ? null : p1.value }));
          x.toast(remove ? "PIN tolto." : "PIN salvato. Gli altri dispositivi dovranno inserirlo.");
          x.route();
        } catch (err) { msg.replaceChildren(x.notice("err", x.errText(err))); }
      });
      area.replaceChildren(f);
      if (!remove) p1.focus();
    }
    return h("div", { class: "pf-tools" },
      h("div", { class: "row" },
        h("button", { class: "btn" + (st.has_pin ? "" : " primary"), type: "button", text: st.has_pin ? "Cambia PIN" : "🔒 Metti un PIN", onclick: function () { form(false); } }),
        st.has_pin && h("button", { class: "btn link", type: "button", text: "Togli il PIN", onclick: function () { form(true); } }),
        h("button", { class: "btn link", type: "button", text: "Esci da questo dispositivo", onclick: async function () {
          try { await x.sb.rpc("student_logout", { p_student: sess.id, p_token: sess.token }); } catch (e) {}
          setSession(c.id, null); x.route();
        } })),
      area);
  }

  function materialCard(c, x, m, teacherTools) {
    var h = x.h;
    var href = m.file_path ? x.sb.storage.from("personali").getPublicUrl(m.file_path).data.publicUrl : m.url;
    var dl = m.file_path ? x.sb.storage.from("personali").getPublicUrl(m.file_path, { download: m.file_name || true }).data.publicUrl : null;
    var kind = x.kindOf({ url: href, file_name: m.file_name, file_path: m.file_path });
    return h("article", { class: "card material pf-mat" },
      h("div", { class: "card-top" }, h("span", { class: "badge", "data-kind": kind, text: kind }), h("span", { class: "date", text: x.fmtDate(m.created_at) })),
      h("h3", { text: m.title }),
      m.description && h("p", { class: "desc small", text: m.description }),
      h("div", { class: "row actions" },
        href && h("a", { class: "btn primary", href: x.openHref(href, c.id, "profilo", { url: href, title: m.title, file_name: m.file_name }), target: "_blank", rel: "noopener", text: "Apri" }),
        dl && h("a", { class: "btn", href: dl, download: m.file_name || "", text: "Scarica" }),
        teacherTools));
  }

  /* ---------- Consegna a nome del profilo ---------- */
  function submitForm(a, c, x) {
    var h = x.h, sess = getSession(c.id), wrap = h("div", { class: "pf-submit" });
    if (!sess) {
      wrap.appendChild(h("div", { class: "row" },
        h("a", { class: "btn primary", href: "#/c/" + c.id + "/profilo", text: "Entra nel tuo profilo per consegnare", onclick: function () {
          try { sessionStorage.setItem("novaula-dopo-accesso", location.hash); } catch (e) {}
        } })));
      return wrap;
    }
    var status = h("div");
    var msg = h("div");
    var file = h("input", { type: "file", name: "file" });
    var note = h("textarea", { name: "note", maxlength: 2000, placeholder: "Facoltativa" });
    var mates = h("div");
    var form = h("form", { class: "stack" },
      h("p", { class: "small muted" }, "Consegni come ", h("b", { text: sess.first_name + " " + sess.last_name }), " · ", h("a", { href: "#/c/" + c.id + "/profilo", text: "non sei tu?" })),
      a.group_work && mates,
      h("label", null, "File (max 20 MB)", file),
      h("label", null, "Nota per il docente", note),
      h("button", { class: "btn primary", type: "submit", text: "Consegna" }),
      msg);
    var det = h("details", null, h("summary", { class: "btn", text: "Consegna" }), form);
    wrap.append(status, det);

    var people = [];
    if (a.group_work) {
      mates.appendChild(h("p", { class: "muted small", text: "Lavoro di gruppo: caricamento dei compagni…" }));
      x.sb.rpc("class_students", { p_class: c.id }).then(function (r) {
        people = (r.data || []).filter(function (p) { return p.id !== sess.id; });
        mates.replaceChildren(h("fieldset", { class: "pick" }, h("legend", { text: "Lavoro di gruppo: chi ha lavorato con te?" }),
          people.length ? people.map(function (p) { return h("label", { class: "check-row" }, h("input", { type: "checkbox", name: "mate", value: p.id }), h("span", { text: fullName(p) })); })
            : h("p", { class: "muted small", text: "I tuoi compagni non hanno ancora creato il profilo: chiedi loro di farlo." })));
      });
    }
    // Stato della consegna e voto (se già confermato dal docente)
    privateData(x, c.id).then(function (d) {
      if (!d) return;
      var mine = (d.submissions || []).filter(function (s) { return s.assignment_id === a.id; });
      var mk = (d.marks || []).filter(function (m) { return m.assignment_id === a.id; })[0];
      if (!mine.length) { det.open = true; return; }
      var last = mine[0];
      if (last.status === "da_rifare") {
        status.appendChild(h("div", { class: "notice err" }, h("b", { text: "Da rifare. " }), last.teacher_note || "Il docente ti chiede di consegnare di nuovo.", h("span", { class: "small", text: " (tentativo " + last.attempt + ")" })));
        det.open = true;
        form.querySelector('button[type="submit"]').textContent = "Consegna di nuovo";
      } else {
        status.appendChild(h("div", { class: "notice ok" }, "Consegnato " + x.fmtTime(last.created_at) + (last.attempt > 1 ? " (tentativo " + last.attempt + ")" : ""),
          mk && mk.status === "confermato" ? h("span", null, " · Voto: ", h("b", { text: mk.label || fmtAvg(mk.value) })) : null));
        det.querySelector("summary").textContent = "Consegna di nuovo";
      }
    }).catch(function () {});

    form.addEventListener("submit", async function (e) {
      e.preventDefault();
      var f = file.files[0];
      if (!f && !note.value.trim()) { msg.replaceChildren(x.notice("err", "Allega un file oppure scrivi una nota.")); return; }
      if (f && f.size > 20 * 1024 * 1024) { msg.replaceChildren(x.notice("err", "Il file supera 20 MB. Comprimilo o dividilo.")); return; }
      var btn = form.querySelector('button[type="submit"]'); btn.disabled = true; btn.textContent = "Invio in corso…";
      try {
        var path = null, sha = null;
        if (f) {
          try { sha = await sha256(await f.arrayBuffer()); } catch (er) { sha = null; }
          path = c.id + "/" + a.id + "/" + x.uid() + "-" + x.safeName(f.name);
          ok(await x.sb.storage.from("consegne").upload(path, f, { contentType: f.type || undefined }));
        }
        var ids = [].slice.call(form.querySelectorAll('input[name="mate"]:checked')).map(function (i) { return i.value; });
        ok(await x.sb.rpc("student_submit", { p_student: sess.id, p_token: sess.token, p_assignment: a.id, p_note: note.value, p_file_path: path, p_file_name: f ? f.name : null, p_sha: sha, p_device: await deviceHash(), p_members: ids }));
        cache = {};
        form.reset();
        status.replaceChildren(x.notice("ok", "Consegnato adesso. Grazie, " + sess.first_name + "!" + (ids.length ? " Il lavoro compare anche nei profili dei compagni del gruppo." : "")));
        det.open = false; det.querySelector("summary").textContent = "Consegna di nuovo";
        msg.textContent = "";
      } catch (err) {
        if (/Sessione scaduta/.test(err.message || "")) { setSession(c.id, null); x.toast("Rientra nel tuo profilo e riprova."); x.route(); return; }
        msg.replaceChildren(x.notice("err", x.errText(err)));
      }
      btn.disabled = false; btn.textContent = "Consegna";
    });
    return wrap;
  }

  /* ---------- Docente: voti ---------- */
  async function markCorrectionReviewed(x, submissionId) {
    if (submissionId) await x.sb.from("corrections").update({ reviewed: true }).eq("submission_id", submissionId);
  }
  // Conferma un voto (anche diverso dalla proposta di Claude)
  async function confirmMark(x, m, label, note) {
    var v = markValue(label);
    if (v == null) throw new Error("voto non valido: scrivi ad esempio 7, 7+, 6½ o 6,5.");
    var patch = { label: String(label).trim().slice(0, 12), value: v, status: "confermato" };
    if (note !== undefined) patch.note = note || null;
    ok(await x.sb.from("marks").update(patch).eq("id", m.id));
    if (m.submission_id) {
      await x.sb.from("submissions").update({ status: "consegnata" }).eq("id", m.submission_id).eq("status", "da_rifare");
      await markCorrectionReviewed(x, m.submission_id);
    }
    Object.assign(m, patch);
  }
  // "Da rifare": la consegna resta come tentativo non riuscito, lo studente la vede e consegna di nuovo
  async function redoSubmission(x, sub, memberIds, ctx, note) {
    ok(await x.sb.from("submissions").update({ status: "da_rifare", teacher_note: note || null }).eq("id", sub.id));
    var existing = ok(await x.sb.from("marks").select("id, student_id").eq("submission_id", sub.id));
    var have = {}; existing.forEach(function (m) { have[m.student_id] = m.id; });
    if (existing.length) ok(await x.sb.from("marks").update({ status: "da_rifare", label: null, value: null, note: note || null }).eq("submission_id", sub.id));
    var rows = memberIds.filter(function (id) { return !have[id]; }).map(function (id) {
      return { student_id: id, class_id: ctx.class_id, category: ctx.category || "compito", title: ctx.title, status: "da_rifare", source: "docente", note: note || null, assignment_id: sub.assignment_id, submission_id: sub.id };
    });
    if (rows.length) ok(await x.sb.from("marks").insert(rows));
    await markCorrectionReviewed(x, sub.id);
  }
  // Voto del docente su una consegna senza proposta di Claude
  async function newSubmissionMark(x, sub, memberIds, ctx, label, note) {
    var v = markValue(label);
    if (v == null) throw new Error("voto non valido: scrivi ad esempio 7, 7+, 6½ o 6,5.");
    var existing = ok(await x.sb.from("marks").select("*").eq("submission_id", sub.id));
    for (var i = 0; i < existing.length; i++) await confirmMark(x, existing[i], label, note);
    var have = {}; existing.forEach(function (m) { have[m.student_id] = 1; });
    var rows = memberIds.filter(function (id) { return !have[id]; }).map(function (id) {
      return { student_id: id, class_id: ctx.class_id, category: ctx.category || "compito", title: ctx.title, label: String(label).trim().slice(0, 12), value: v, status: "confermato", source: "docente", note: note || null, assignment_id: sub.assignment_id, submission_id: sub.id };
    });
    if (rows.length) ok(await x.sb.from("marks").insert(rows));
    await x.sb.from("submissions").update({ status: "consegnata" }).eq("id", sub.id).eq("status", "da_rifare");
    await markCorrectionReviewed(x, sub.id);
  }

  // Pannello voto per una consegna: proposta di Claude (Accetta / Altro voto / Da rifare) o voto del docente
  function gradePanel(x, sub, members, marks, ctx, onDone) {
    var h = x.h, box = h("div", { class: "gp" });
    var names = {}; members.forEach(function (s) { names[s.id] = s.first_name + " " + s.last_name; });
    function paint() {
      box.textContent = "";
      if (!members.length) {
        box.appendChild(h("p", { class: "small muted", text: "Consegna senza profilo: collegala a uno studente per poter dare il voto." }));
        return;
      }
      var prop = marks.filter(function (m) { return m.status === "proposto"; });
      var conf = marks.filter(function (m) { return m.status !== "proposto"; });
      conf.forEach(function (m) {
        box.appendChild(h("div", { class: "gp-row" }, markBadge(x, m),
          h("span", { class: "small" }, members.length > 1 ? h("b", { text: names[m.student_id] + " · " }) : null,
            m.status === "da_rifare" ? "Da rifare (visibile allo studente)" : "Voto confermato, visibile allo studente",
            m.source === "claude" && m.proposed_label && m.proposed_label !== m.label ? h("span", { class: "muted", text: " · Claude aveva proposto " + m.proposed_label }) : null)));
      });
      var p = prop[0];
      var input = h("input", { type: "text", class: "gp-in", maxlength: 12, placeholder: "es. 7+", "aria-label": "Voto", value: p && p.proposed_value != null ? (p.proposed_label || "").slice(0, 12) : "" });
      var noteIn = h("input", { type: "text", maxlength: 300, placeholder: "Commento per lo studente (facoltativo)", "aria-label": "Commento" });
      var actions = h("div", { class: "row" });
      if (p && p.proposed_label) actions.appendChild(h("button", { class: "btn primary", type: "button", text: "Accetta " + p.proposed_label, disabled: p.proposed_value == null ? true : null, onclick: run(async function () {
        for (var i = 0; i < prop.length; i++) await confirmMark(x, prop[i], prop[i].proposed_label, noteIn.value.trim() || undefined);
      }) }));
      actions.appendChild(h("button", { class: "btn" + (p ? "" : " primary"), type: "button", text: p ? "Metti questo voto" : (conf.length ? "Cambia voto" : "Metti il voto"), onclick: run(async function () {
        await newSubmissionMark(x, sub, members.map(function (s) { return s.id; }), ctx, input.value, noteIn.value.trim());
      }) }));
      actions.appendChild(h("button", { class: "btn danger", type: "button", text: "Da rifare", onclick: run(async function () {
        await redoSubmission(x, sub, members.map(function (s) { return s.id; }), ctx, noteIn.value.trim() || "Lavoro da rifare: rileggi la consegna e riprova.");
      }) }));
      var allDone = !prop.length && conf.length === members.length;
      var editor = h("div", { class: "gp-edit" },
        p ? h("p", { class: "small" }, h("b", { text: "Claude propone " + (p.proposed_label || "?") }), h("span", { class: "muted", text: " · nascosto allo studente finché non decidi" })) : null,
        h("div", { class: "gp-fields" }, input, noteIn),
        actions);
      if (allDone) box.appendChild(h("details", { class: "gp-more" }, h("summary", { class: "small", text: "Cambia" }), editor));
      else box.appendChild(editor);
    }
    function run(fn) {
      return async function (e) {
        var b = e.currentTarget; b.disabled = true;
        try { await fn(); var fresh = ok(await x.sb.from("marks").select("*").eq("submission_id", sub.id)); marks = fresh; paint(); if (onDone) onDone(); }
        catch (err) { x.toast(x.errText(err)); b.disabled = false; }
      };
    }
    paint();
    return box;
  }

  /* ---------- Docente: sotto "Consegne ricevute" ---------- */
  async function forAssignment(a, subs, x) {
    if (!x.sb || !subs.length) return function () { return null; };
    var ids = subs.map(function (s) { return s.id; });
    var r = await Promise.all([
      x.sb.from("submission_members").select("submission_id, student_id").in("submission_id", ids),
      x.sb.from("marks").select("*").in("submission_id", ids),
      x.sb.from("students").select("id, first_name, last_name").eq("class_id", a.class_id).order("last_name"),
      x.sb.from("submissions").select("id, assignment_id, file_sha256, device_hash, student_id, submission_members(student_id)").not("file_sha256", "is", null)
    ]);
    if (r[0].error || r[2].error) return function () { return null; };
    var students = r[2].data, byId = {}; students.forEach(function (s) { byId[s.id] = s; });
    var mem = {}; r[0].data.forEach(function (m) { (mem[m.submission_id] = mem[m.submission_id] || []).push(byId[m.student_id]); });
    var mk = {}; (r[1].data || []).forEach(function (m) { (mk[m.submission_id] = mk[m.submission_id] || []).push(m); });
    var all = r[3].data || [];
    var ctx = { class_id: a.class_id, title: a.title, category: { verifica: "verifica", classe: "classe", progetto: "progetto" }[a.kind] || "compito" };
    return function (s) {
      var h = x.h, members = (mem[s.id] || []).filter(Boolean);
      var flags = [];
      if (a.due_date && s.created_at.slice(0, 10) > a.due_date) flags.push("In ritardo");
      var memIds = members.map(function (m) { return m.id; });
      all.forEach(function (o) {
        if (o.id === s.id) return;
        var oMem = (o.submission_members || []).map(function (m) { return m.student_id; });
        var overlap = oMem.some(function (id) { return memIds.indexOf(id) >= 0; });
        if (overlap) return;
        var who = oMem.map(function (id) { return byId[id] ? fullName(byId[id]) : null; }).filter(Boolean).join(", ") || "un altro studente";
        if (s.file_sha256 && o.file_sha256 === s.file_sha256) flags.push("File identico a quello di " + who);
        else if (s.device_hash && o.device_hash === s.device_hash && o.assignment_id === s.assignment_id) flags.push("Stesso dispositivo di " + who);
      });
      var el = h("div", { class: "pf-subx" },
        h("div", { class: "row" },
          members.length > 1 && h("span", { class: "badge", text: "Gruppo: " + members.map(fullName).join(", ") }),
          s.attempt > 1 && h("span", { class: "badge", text: "Tentativo " + s.attempt }),
          s.status === "da_rifare" && h("span", { class: "badge redo-badge", text: "Da rifare" }),
          flags.map(function (f) { return h("span", { class: "badge flag-badge", text: "⚠ " + f }); })),
        members.length ? gradePanel(x, s, members, mk[s.id] || [], ctx) : linkControl(x, s, students));
      return el;
    };
  }

  // Collega una consegna senza profilo (vecchio modulo) a uno studente
  function linkControl(x, s, students) {
    var h = x.h;
    if (!students.length) return h("p", { class: "small muted", text: "Consegna senza profilo. Quando gli studenti creeranno il profilo potrai collegarla." });
    var guess = students.filter(function (p) { return (s.student_name || "").toLowerCase().indexOf(p.last_name.toLowerCase()) >= 0; })[0];
    var sel = h("select", { "aria-label": "Studente" }, h("option", { value: "", text: "Scegli lo studente…" }),
      students.map(function (p) { return h("option", { value: p.id, text: fullName(p), selected: guess && guess.id === p.id ? true : null }); }));
    return h("div", { class: "row pf-link" }, h("span", { class: "small muted", text: "Senza profilo:" }), sel,
      h("button", { class: "btn", type: "button", text: "Collega", onclick: async function (e) {
        if (!sel.value) return;
        e.currentTarget.disabled = true;
        try {
          ok(await x.sb.from("submissions").update({ student_id: sel.value }).eq("id", s.id));
          ok(await x.sb.from("submission_members").insert({ submission_id: s.id, student_id: sel.value }));
          x.toast("Consegna collegata.");
          x.reopen && x.reopen();
        } catch (err) { x.toast(x.errText(err)); e.currentTarget.disabled = false; }
      } }));
  }

  /* ---------- Docente: sotto una correzione di Claude ---------- */
  function correctionExtra(c, x) {
    var h = x.h, box = h("div", { class: "pf-corrx" });
    (async function () {
      var r = await Promise.all([
        x.sb.from("submissions").select("id, assignment_id, student_name, status, assignments(title, class_id, kind)").eq("id", c.submission_id).single(),
        x.sb.from("submission_members").select("students(id, first_name, last_name)").eq("submission_id", c.submission_id),
        x.sb.from("marks").select("*").eq("submission_id", c.submission_id)
      ]);
      if (r[0].error || r[1].error) return;
      var s = r[0].data, a = s.assignments || {};
      var members = r[1].data.map(function (m) { return m.students; }).filter(Boolean);
      if (!members.length) {
        var st = await x.sb.from("students").select("id, first_name, last_name").eq("class_id", a.class_id).order("last_name");
        box.appendChild(linkControl(Object.assign({}, x, { reopen: function () { box.replaceWith(correctionExtra(c, x)); } }), s, st.data || []));
        return;
      }
      box.appendChild(gradePanel(x, s, members, r[2].data || [], { class_id: a.class_id, title: a.title, category: { verifica: "verifica", classe: "classe", progetto: "progetto" }[a.kind] || "compito" }));
    })().catch(function () {});
    return box;
  }

  /* ---------- Area docente: voti da confermare e richieste ---------- */
  function board(root, x) {
    if (!x.sb) return;
    var h = x.h;
    var reqBox = h("section", { class: "list" });
    var head = h("h2", { text: "Richieste di materiale" });
    root.appendChild(head); root.appendChild(reqBox);
    (async function () {
      var res = await x.sb.from("student_requests").select("*, students(id, first_name, last_name, class_id)").eq("done", false).order("created_at");
      if (res.error) { head.remove(); reqBox.remove(); return; }
      if (!res.data.length) { reqBox.appendChild(h("p", { class: "empty", text: "Nessuna richiesta aperta." })); return; }
      res.data.forEach(function (q) {
        var s = q.students || {}, cl = x.findClass(s.class_id);
        reqBox.appendChild(h("div", { class: "card pf-reqcard" },
          h("p", { class: "small muted" }, (cl ? cl.name : "") + " · " + x.fmtTime(q.created_at)),
          h("p", null, h("b", { text: fullName(s) + ": " }), q.body),
          h("div", { class: "row" },
            h("a", { class: "btn", href: "#/c/" + s.class_id + "/profilo?s=" + s.id, text: "Manda un materiale" }),
            h("button", { class: "btn link", type: "button", text: "Segna come fatta", onclick: async function (e) {
              try { ok(await x.sb.from("student_requests").update({ done: true }).eq("id", q.id)); e.currentTarget.closest(".card").remove(); } catch (err) { x.toast(x.errText(err)); }
            } }))));
      });
    })().catch(function (e) { reqBox.replaceChildren(x.notice("err", x.errText(e))); });
  }

  /* ---------- Docente: studenti della classe ---------- */
  async function teacherPage(c, box, x) {
    var h = x.h;
    box.appendChild(h("p", { class: "empty", text: "Caricamento…" }));
    var focus = (/[?&]s=([0-9a-f-]+)/.exec(location.hash) || [])[1];
    var r = await Promise.all([
      x.sb.from("students").select("id, first_name, last_name, failed_pins, locked_until, created_at, last_seen").eq("class_id", c.id).order("last_name").order("first_name"),
      x.sb.rpc("class_students", { p_class: c.id }),
      x.sb.from("marks").select("*").eq("class_id", c.id).order("mark_date", { ascending: false }),
      x.sb.from("submissions").select("id, assignment_id, student_name, student_id, status, attempt, file_sha256, device_hash, created_at, file_name, assignments!inner(class_id, title, due_date, group_work), submission_members(student_id)").eq("assignments.class_id", c.id).order("created_at", { ascending: false }),
      x.sb.from("assignments").select("id, title, kind").eq("class_id", c.id).order("created_at", { ascending: false })
    ]).catch(function (e) { return [{ error: e }]; });
    var err = r.filter(function (q) { return q && q.error; })[0];
    box.textContent = "";
    if (err) { box.appendChild(x.notice("err", /students|relation|schema cache/i.test(err.error.message || "") ? "Manca l'aggiornamento del database dei profili." : x.errText(err.error))); return; }
    var students = r[0].data, pins = {}, marks = r[2].data, subs = r[3].data, assignments = r[4].data;
    r[1].data.forEach(function (p) { pins[p.id] = p.has_pin; });
    var ids = students.map(function (s) { return s.id; });
    var extra = ids.length ? await Promise.all([
      x.sb.from("student_materials").select("*").in("student_id", ids).order("created_at", { ascending: false }),
      x.sb.from("student_requests").select("*").in("student_id", ids).order("created_at", { ascending: false })
    ]) : [{ data: [] }, { data: [] }];
    var mats = extra[0].data || [], reqs = extra[1].data || [];
    var byStudent = function (list, key) { var o = {}; list.forEach(function (x2) { (o[x2[key || "student_id"]] = o[x2[key || "student_id"]] || []).push(x2); }); return o; };
    var mBy = byStudent(marks), matBy = byStudent(mats), reqBy = byStudent(reqs);
    var subBy = {};
    subs.forEach(function (s) { (s.submission_members || []).forEach(function (m) { (subBy[m.student_id] = subBy[m.student_id] || []).push(s); }); });

    var pending = marks.filter(function (m) { return m.status === "proposto"; });
    box.appendChild(h("p", { class: "program-intro" },
      h("b", { text: students.length + (students.length === 1 ? " studente" : " studenti") + " con il profilo" }),
      pending.length ? h("span", null, " · ", h("b", { class: "redo-t", text: pending.length + " voti di Claude da confermare" })) : null,
      h("span", { class: "muted", text: " Gli studenti creano il profilo dalla pagina della classe (pulsante «Il mio profilo»)." })));

    if (!students.length) { box.appendChild(h("p", { class: "empty", text: "Nessuno studente ha ancora creato il profilo in questa classe." })); return; }

    box.appendChild(checksPanel(x, students, marks, subs));
    box.appendChild(bulkMarks(c, x, students, assignments));

    var list = h("div", { class: "stack pf-students" });
    students.forEach(function (s) {
      var card = studentCard(c, x, s, { has_pin: pins[s.id], marks: mBy[s.id] || [], subs: subBy[s.id] || [], mats: matBy[s.id] || [], reqs: reqBy[s.id] || [] });
      if (focus === s.id) { card.open = true; setTimeout(function () { card.scrollIntoView({ block: "start", behavior: "smooth" }); }, 50); }
      list.appendChild(card);
    });
    box.appendChild(list);
  }

  // Controlli di coerenza e possibili copiature
  function checksPanel(x, students, marks, subs) {
    var h = x.h, byId = {}; students.forEach(function (s) { byId[s.id] = s; });
    var items = [];
    function nm(id) { return byId[id] ? fullName(byId[id]) : "?"; }
    // File identici e stesso dispositivo tra studenti diversi
    var seenPair = {};
    subs.forEach(function (a, i) {
      var am = (a.submission_members || []).map(function (m) { return m.student_id; });
      subs.slice(i + 1).forEach(function (b) {
        var bm = (b.submission_members || []).map(function (m) { return m.student_id; });
        if (!am.length || !bm.length || am.some(function (id) { return bm.indexOf(id) >= 0; })) return;
        var who = am.map(nm).join(", ") + " e " + bm.map(nm).join(", ");
        if (a.file_sha256 && a.file_sha256 === b.file_sha256) {
          var k = "f" + a.file_sha256 + who; if (seenPair[k]) return; seenPair[k] = 1;
          items.push({ lv: "high", t: "File identico", d: who + " · " + a.assignments.title + (a.assignment_id !== b.assignment_id ? " / " + b.assignments.title : "") });
        } else if (a.device_hash && a.device_hash === b.device_hash && a.assignment_id === b.assignment_id) {
          var k2 = "d" + a.device_hash + who + a.assignment_id; if (seenPair[k2]) return; seenPair[k2] = 1;
          items.push({ lv: "mid", t: "Stesso dispositivo", d: who + " · " + a.assignments.title + " (può essere un telefono prestato: da verificare)" });
        }
      });
    });
    // Consegne in ritardo
    var late = subs.filter(function (s) { return s.assignments.due_date && s.created_at.slice(0, 10) > s.assignments.due_date; });
    if (late.length) items.push({ lv: "low", t: late.length + (late.length === 1 ? " consegna in ritardo" : " consegne in ritardo"), d: late.slice(0, 6).map(function (s) { return (s.student_name || "?") + " (" + s.assignments.title + ")"; }).join(", ") + (late.length > 6 ? "…" : "") });
    // Coerenza tra compiti a casa e prove in classe, e salti improvvisi
    students.forEach(function (s) {
      var ms = marks.filter(function (m) { return m.student_id === s.id && m.status === "confermato" && m.value != null; });
      var home = ms.filter(function (m) { return HOME[m.category]; }), school = ms.filter(function (m) { return SCHOOL[m.category]; });
      var ah = avg(home), as = avg(school);
      if (ah != null && as != null && ((home.length >= 2 && school.length >= 2 && ah - as >= 2) || ah - as >= 3))
        items.push({ lv: "mid", t: "A casa molto meglio che in classe", d: fullName(s) + ": compiti " + fmtAvg(ah) + ", verifiche e lavori in classe " + fmtAvg(as) });
      if (ms.length >= 3) ms.forEach(function (m) {
        var others = ms.filter(function (o) { return o !== m; }), oa = avg(others);
        if (oa != null && +m.value - oa >= 3) items.push({ lv: "low", t: "Voto molto sopra la sua media", d: fullName(s) + ": " + (m.label || m.value) + " in «" + m.title + "» (media degli altri " + fmtAvg(oa) + ")" });
      });
    });
    // Dove il docente e Claude non sono d'accordo (serve a tarare le correzioni)
    var dis = marks.filter(function (m) { return m.source === "claude" && m.status === "confermato" && m.proposed_value != null && m.value != null && Math.abs(m.value - m.proposed_value) >= 1.5; });
    if (dis.length) items.push({ lv: "info", t: "Voti di Claude cambiati di 1,5 o più", d: dis.slice(0, 8).map(function (m) { return nm(m.student_id) + " «" + m.title + "»: Claude " + m.proposed_label + " → tu " + m.label; }).join("; ") });
    var LV = { high: "Da controllare", mid: "Sospetto", low: "Da notare", info: "Info" };
    return h("details", { class: "card pf-checks", open: items.some(function (i) { return i.lv === "high"; }) ? true : null },
      h("summary", { class: "pf-sum" }, "Controlli di coerenza e copiature ", h("span", { class: "hd-count", text: String(items.length) })),
      items.length ? h("ul", { class: "pf-flags" }, items.map(function (i) {
        return h("li", { class: "lv-" + i.lv }, h("span", { class: "badge", text: LV[i.lv] }), h("div", null, h("b", { text: i.t }), h("p", { class: "small", text: i.d })));
      })) : h("p", { class: "small muted", text: "Nessun segnale strano. Controllo file identici, stesso dispositivo per studenti diversi, ritardi, compiti a casa molto migliori delle prove in classe e voti fuori media." }));
  }

  // Inserimento rapido di voti per tutta la classe (es. una verifica su carta)
  function bulkMarks(c, x, students, assignments) {
    var h = x.h, msg = h("div");
    var cat = h("select", { name: "cat", "aria-label": "Tipo" }, CATS.map(function (k) { return h("option", { value: k[0], text: k[1], selected: k[0] === "verifica" ? true : null }); }));
    var title = h("input", { type: "text", name: "title", required: true, maxlength: 200, placeholder: "Es. Verifica sui database" });
    var date = h("input", { type: "date", name: "date", value: todayIso() });
    var rows = students.map(function (s) {
      var inp = h("input", { type: "text", maxlength: 12, class: "gp-in", placeholder: "–", "aria-label": "Voto di " + fullName(s), "data-id": s.id, enterkeyhint: "next" });
      var redo = h("input", { type: "checkbox", "aria-label": "Da rifare per " + fullName(s), "data-redo": s.id });
      return h("div", { class: "bulk-row" }, h("span", { text: s.last_name + " " + s.first_name }), inp, h("label", { class: "check-row small" }, redo, h("span", { text: "Da rifare" })));
    });
    var form = h("form", { class: "stack" },
      h("div", { class: "pf-two" }, h("label", null, "Tipo", cat), h("label", null, "Data", date)),
      h("label", null, "Titolo", title),
      h("div", { class: "bulk" }, rows),
      h("p", { class: "muted small", text: "Lascia vuoto chi non ha il voto. Formati: 7, 7+, 7-, 6½, 6,5." }),
      h("button", { class: "btn primary", type: "submit", text: "Salva i voti" }), msg);
    form.addEventListener("submit", async function (e) {
      e.preventDefault();
      var out = [], bad = [];
      students.forEach(function (s) {
        var v = form.querySelector('[data-id="' + s.id + '"]').value.trim();
        var rd = form.querySelector('[data-redo="' + s.id + '"]').checked;
        if (!v && !rd) return;
        if (rd) { out.push({ student_id: s.id, class_id: c.id, category: cat.value, title: title.value.trim(), status: "da_rifare", source: "docente", mark_date: date.value || todayIso() }); return; }
        var n = markValue(v);
        if (n == null) { bad.push(fullName(s)); return; }
        out.push({ student_id: s.id, class_id: c.id, category: cat.value, title: title.value.trim(), label: v.slice(0, 12), value: n, status: "confermato", source: "docente", mark_date: date.value || todayIso() });
      });
      if (bad.length) { msg.replaceChildren(x.notice("err", "Voto non valido per: " + bad.join(", "))); return; }
      if (!out.length) { msg.replaceChildren(x.notice("err", "Nessun voto da salvare.")); return; }
      var btn = form.querySelector('button[type="submit"]'); btn.disabled = true;
      try { ok(await x.sb.from("marks").insert(out)); x.toast(out.length + " voti salvati."); x.route(); }
      catch (err) { msg.replaceChildren(x.notice("err", x.errText(err))); btn.disabled = false; }
    });
    return h("details", { class: "teacher" }, h("summary", { text: "Docente: registra voti per la classe" }), form);
  }

  function studentCard(c, x, s, d) {
    var h = x.h;
    var a = avg(d.marks), pend = d.marks.filter(function (m) { return m.status === "proposto"; }).length;
    var openReq = d.reqs.filter(function (q) { return !q.done; }).length;
    var body = h("div", { class: "stack pf-sbody" });
    var card = h("details", { class: "card pf-student" },
      h("summary", { class: "pf-ssum" },
        h("span", { class: "pc-av", text: initials(s) }),
        h("span", { class: "pf-sname" }, h("b", { text: s.last_name + " " + s.first_name }),
          h("span", { class: "small muted", text: (d.has_pin ? "🔒 PIN" : "senza PIN") + " · " + (s.last_seen ? "visto " + x.fmtTime(s.last_seen) : "mai entrato") })),
        pend ? h("span", { class: "badge redo-badge", text: pend + " da confermare" }) : null,
        openReq ? h("span", { class: "badge", text: openReq + (openReq === 1 ? " richiesta" : " richieste") }) : null,
        h("span", { class: "mk " + tone(a), text: fmtAvg(a) })),
      body);
    card.addEventListener("toggle", function () { if (card.open && !body.childNodes.length) fill(); });
    function fill() {
      // Voti
      var ml = h("div", { class: "mk-list" });
      if (!d.marks.length) ml.appendChild(h("p", { class: "small muted", text: "Nessun voto." }));
      d.marks.forEach(function (m) { ml.appendChild(markRow(x, m)); });
      body.appendChild(h("h3", { text: "Voti" }));
      body.appendChild(ml);
      body.appendChild(addMarkForm(c, x, s));
      // Consegne
      body.appendChild(h("h3", { text: "Consegne" }));
      if (!d.subs.length) body.appendChild(h("p", { class: "small muted", text: "Nessuna consegna." }));
      d.subs.forEach(function (sub) {
        var late = sub.assignments.due_date && sub.created_at.slice(0, 10) > sub.assignments.due_date;
        body.appendChild(h("p", { class: "small pf-subline" },
          h("b", { text: sub.assignments.title }), " · " + x.fmtTime(sub.created_at),
          sub.attempt > 1 ? " · tentativo " + sub.attempt : "",
          (sub.submission_members || []).length > 1 ? " · gruppo di " + sub.submission_members.length : "",
          sub.status === "da_rifare" ? h("span", { class: "redo-t", text: " · da rifare" }) : null,
          late ? h("span", { class: "redo-t", text: " · in ritardo" }) : null));
      });
      // Materiali personali
      body.appendChild(h("h3", { text: "Materiali personali" }));
      d.mats.forEach(function (m) {
        body.appendChild(materialCard(c, x, m, x.confirmBtn("Elimina", "btn link danger", async function () {
          if (m.file_path) await x.sb.storage.from("personali").remove([m.file_path]);
          ok(await x.sb.from("student_materials").delete().eq("id", m.id)); x.route();
        })));
      });
      body.appendChild(materialForm(c, x, s));
      // Richieste
      if (d.reqs.length) {
        body.appendChild(h("h3", { text: "Richieste" }));
        d.reqs.forEach(function (q) {
          body.appendChild(h("div", { class: "row small pf-req" + (q.done ? " done" : "") }, h("span", { text: (q.done ? "✓ " : "⏳ ") + q.body + " · " + x.fmtTime(q.created_at) }),
            !q.done && h("button", { class: "btn link", type: "button", text: "Fatta", onclick: async function (e) {
              try { ok(await x.sb.from("student_requests").update({ done: true }).eq("id", q.id)); e.currentTarget.parentNode.classList.add("done"); e.currentTarget.remove(); } catch (err) { x.toast(x.errText(err)); }
            } })));
        });
      }
      // Profilo
      var fn = h("input", { type: "text", maxlength: 40, value: s.first_name, "aria-label": "Nome" }), ln = h("input", { type: "text", maxlength: 40, value: s.last_name, "aria-label": "Cognome" });
      body.appendChild(h("h3", { text: "Profilo" }));
      body.appendChild(h("div", { class: "stack" },
        h("div", { class: "pf-two" }, fn, ln),
        h("div", { class: "row" },
          h("button", { class: "btn", type: "button", text: "Correggi il nome", onclick: async function () {
            try {
              ok(await x.sb.from("students").update({ first_name: fn.value.trim(), last_name: ln.value.trim(), name_key: (fn.value.trim() + " " + ln.value.trim()).toLowerCase().replace(/\s+/g, " ") }).eq("id", s.id));
              x.toast("Nome aggiornato."); x.route();
            } catch (err) { x.toast(x.errText(err)); }
          } }),
          d.has_pin || s.locked_until ? x.confirmBtn("Azzera il PIN", "btn", async function () { ok(await x.sb.rpc("teacher_reset_pin", { p_student: s.id })); x.toast("PIN azzerato: lo studente entra senza PIN e può sceglierne uno nuovo."); x.route(); }) : null,
          x.confirmBtn("Elimina profilo e voti", "btn danger", async function () { ok(await x.sb.from("students").delete().eq("id", s.id)); x.route(); }))));
    }
    return card;
  }

  function markRow(x, m) {
    var h = x.h;
    var row = h("div", { class: "mk-row" + (m.status === "da_rifare" ? " is-redo" : "") + (m.status === "proposto" ? " is-prop" : "") },
      markBadge(x, m, m.status === "proposto"),
      h("div", { class: "mk-body" },
        h("b", { text: m.title }),
        h("span", { class: "small muted", text: CAT[m.category] + " · " + x.fmtDate(m.mark_date) + (m.source === "claude" ? " · proposto da Claude" + (m.status !== "proposto" && m.proposed_label ? " (" + m.proposed_label + ")" : "") : "") + (m.status === "proposto" ? " · nascosto allo studente" : "") }),
        m.note && h("p", { class: "small desc", text: m.note })),
      h("div", { class: "mk-tools" }));
    var tools = row.querySelector(".mk-tools");
    var input = h("input", { type: "text", class: "gp-in", maxlength: 12, value: m.status === "proposto" ? (m.proposed_label || "").slice(0, 12) : (m.label || ""), "aria-label": "Voto" });
    if (m.status === "proposto" && m.proposed_value != null) tools.appendChild(h("button", { class: "btn primary small-btn", type: "button", text: "Accetta", onclick: async function () {
      try { await confirmMark(x, m, m.proposed_label); x.route(); } catch (err) { x.toast(x.errText(err)); }
    } }));
    tools.appendChild(input);
    tools.appendChild(h("button", { class: "btn small-btn", type: "button", text: m.status === "proposto" ? "Metti" : "Cambia", onclick: async function () {
      try { await confirmMark(x, m, input.value); x.route(); } catch (err) { x.toast(x.errText(err)); }
    } }));
    tools.appendChild(x.confirmBtn("Elimina", "btn link danger", async function () { ok(await x.sb.from("marks").delete().eq("id", m.id)); x.route(); }));
    return row;
  }

  function addMarkForm(c, x, s) {
    var h = x.h, msg = h("div");
    var f = h("form", { class: "stack" },
      h("div", { class: "pf-two" },
        h("label", null, "Tipo", h("select", { name: "cat" }, CATS.map(function (k) { return h("option", { value: k[0], text: k[1] }); }))),
        h("label", null, "Voto", h("input", { type: "text", name: "label", maxlength: 12, placeholder: "es. 7+" }))),
      h("label", null, "Titolo", h("input", { type: "text", name: "title", required: true, maxlength: 200, placeholder: "Es. Interrogazione sulle reti" })),
      h("div", { class: "pf-two" },
        h("label", null, "Data", h("input", { type: "date", name: "date", value: todayIso() })),
        h("label", null, "Commento (facoltativo)", h("input", { type: "text", name: "note", maxlength: 300 }))),
      h("label", { class: "check-row" }, h("input", { type: "checkbox", name: "redo" }), h("span", { text: "Da rifare (senza voto)" })),
      h("button", { class: "btn primary", type: "submit", text: "Aggiungi il voto" }), msg);
    f.addEventListener("submit", async function (e) {
      e.preventDefault();
      var el = f.elements, redo = el.redo.checked, v = markValue(el.label.value);
      if (!redo && v == null) { msg.replaceChildren(x.notice("err", "Scrivi un voto valido (es. 7, 7+, 6½) oppure spunta «Da rifare».")); return; }
      try {
        ok(await x.sb.from("marks").insert({ student_id: s.id, class_id: c.id, category: el.cat.value, title: el.title.value.trim(), label: redo ? null : el.label.value.trim().slice(0, 12), value: redo ? null : v, status: redo ? "da_rifare" : "confermato", source: "docente", note: el.note.value.trim() || null, mark_date: el.date.value || todayIso() }));
        x.route();
      } catch (err) { msg.replaceChildren(x.notice("err", x.errText(err))); }
    });
    return h("details", { class: "teacher" }, h("summary", { text: "Aggiungi un voto" }), f);
  }

  function materialForm(c, x, s) {
    var h = x.h, msg = h("div");
    var f = h("form", { class: "stack" },
      h("label", null, "Titolo", h("input", { type: "text", name: "title", required: true, maxlength: 200 })),
      h("label", null, "Descrizione (facoltativa)", h("input", { type: "text", name: "description", maxlength: 2000 })),
      h("label", null, "Link (facoltativo)", h("input", { type: "url", name: "url", placeholder: "https://… oppure contenuti/…" })),
      h("label", null, "File: PDF, slide, immagini (max 50 MB)", h("input", { type: "file", name: "file" })),
      h("button", { class: "btn primary", type: "submit", text: "Manda a " + s.first_name }), msg);
    f.addEventListener("submit", async function (e) {
      e.preventDefault();
      var el = f.elements, file = el.file.files[0];
      if (!file && !el.url.value.trim()) { msg.replaceChildren(x.notice("err", "Scegli un file oppure inserisci un link.")); return; }
      var btn = f.querySelector('button[type="submit"]'); btn.disabled = true; btn.textContent = "Invio…";
      try {
        var row = { student_id: s.id, title: el.title.value.trim(), description: el.description.value.trim() || null, url: el.url.value.trim() || null };
        if (file) {
          row.file_path = s.id + "/" + x.uid() + "-" + x.safeName(file.name); row.file_name = file.name;
          ok(await x.sb.storage.from("personali").upload(row.file_path, file, { contentType: file.type || undefined }));
        }
        ok(await x.sb.from("student_materials").insert(row));
        x.toast("Materiale mandato a " + s.first_name + ".");
        x.route();
      } catch (err) { msg.replaceChildren(x.notice("err", x.errText(err))); btn.disabled = false; btn.textContent = "Manda a " + s.first_name; }
    });
    return h("details", { class: "teacher" }, h("summary", { text: "Manda un materiale a " + s.first_name }), f);
  }

  window.NovaulaProfili = {
    chip: chip, page: page, submitForm: submitForm, forAssignment: forAssignment,
    correctionExtra: correctionExtra, board: board, session: getSession
  };
})();
