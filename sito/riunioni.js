/* Novaula · Riunioni del docente (consigli di classe, GLO).
   Tabella meetings (aggiornamenti/2026-10-23-riunioni.sql), visibile solo al docente.
   Qualche minuto prima arriva una notifica "sveglia" sul telefono (funzione Edge "notifiche", tipo 'riunione'):
   toccandola si apre il link Meet. Se Novaula è aperto, suona anche una sveglia a tutto schermo.
   app.js chiama:
     window.NovaulaRiunioni.strip(contenitore, aiuti)  home del docente: riunioni dei prossimi 7 giorni
     window.NovaulaRiunioni.board(contenitore, aiuti)  riquadro «🎥 Riunioni» in Area docente (prossime + pulsante)
     window.NovaulaRiunioni.page(contenitore, aiuti)   pagina #/docente/riunioni: elenco, aggiungi, modifica, elimina
     window.NovaulaRiunioni.alarm(aiuti)               sveglia in pagina (una volta sola, dopo l'accesso del docente) */
(function () {
  "use strict";

  var KINDS = { cdc: "Consiglio di classe", glo: "GLO", altro: "Riunione" };
  var SHORT = { cdc: "CdC", glo: "GLO", altro: "Riunione" };
  var TIMES = ["14:00", "14:30", "15:00", "15:30", "16:00", "16:30", "17:00", "17:30", "18:00", "18:30", "19:00", "19:30"];
  var DAYS = ["dom", "lun", "mar", "mer", "gio", "ven", "sab"];
  var COLS = "id, kind, title, class_id, starts_at, ends_at, link, note, remind_min";

  function pad(n) { return String(n).padStart(2, "0"); }
  function ymd(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
  function hm(iso) { var d = new Date(iso); return pad(d.getHours()) + ":" + pad(d.getMinutes()); }
  function plus(n) { var d = new Date(); d.setDate(d.getDate() + n); return d; }
  function dayLabel(iso) {
    var d = new Date(iso), t = ymd(d);
    if (t === ymd(plus(0))) return "Oggi";
    if (t === ymd(plus(1))) return "Domani";
    if (t === ymd(plus(-1))) return "Ieri";
    return d.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" }).replace(/^./, function (c) { return c.toUpperCase(); });
  }
  function endOf(m) { return m.ends_at ? new Date(m.ends_at).getTime() : new Date(m.starts_at).getTime() + 3600000; }
  function label(m, x) {
    var cl = m.class_id && x.findClass(m.class_id);
    return (SHORT[m.kind] || m.title) + (cl ? " " + cl.name.split(" ")[0] : m.class_id ? " " + m.class_id.toUpperCase() : "");
  }

  async function load(sb, from) {
    var q = sb.from("meetings").select(COLS).order("starts_at");
    if (from) q = q.gte("starts_at", from);
    var r = await q;
    if (r.error) throw r.error;
    return r.data || [];
  }
  async function save(sb, row, id) {
    var r = id ? await sb.from("meetings").update(row).eq("id", id) : await sb.from("meetings").insert(row);
    if (r.error) throw r.error;
  }
  async function remove(sb, id) {
    var r = await sb.from("meetings").delete().eq("id", id);
    if (r.error) throw r.error;
  }

  // Link per aggiungerla a Google Calendar (il calendario del telefono può suonare come una sveglia)
  function gcal(m, x) {
    var z = function (t) { return new Date(t).toISOString().replace(/[-:]/g, "").replace(/\.\d+/, ""); };
    return "https://calendar.google.com/calendar/render?action=TEMPLATE&text=" + encodeURIComponent(label(m, x)) +
      "&dates=" + z(m.starts_at) + "/" + z(endOf(m)) +
      "&details=" + encodeURIComponent([m.link, m.note].filter(Boolean).join("\n")) +
      (m.link ? "&location=" + encodeURIComponent(m.link) : "");
  }

  /* ---------- Modulo: tipo, classe, giorno e ora a tocchi ---------- */
  function form(x, m, done) {
    var h = x.h, msg = h("div");
    var start = m ? new Date(m.starts_at) : null;
    var state = {
      kind: m ? m.kind : "cdc",
      date: start ? ymd(start) : ymd(plus(0)),
      time: start ? hm(m.starts_at) : "",
      dur: m ? Math.round((endOf(m) - start.getTime()) / 60000) : 60
    };

    function choice(name, opts, cur, onPick) {
      var box = h("div", { class: "rn-choice", role: "radiogroup", "aria-label": name });
      opts.forEach(function (o) {
        var b = h("button", { type: "button", class: "rn-opt" + (o[0] === cur ? " on" : ""), role: "radio", "aria-checked": String(o[0] === cur), text: o[1] });
        b.addEventListener("click", function () {
          [].forEach.call(box.children, function (c) { c.classList.remove("on"); c.setAttribute("aria-checked", "false"); });
          b.classList.add("on"); b.setAttribute("aria-checked", "true");
          onPick(o[0]);
        });
        box.appendChild(b);
      });
      return box;
    }

    var kind = h("select", { name: "kind" },
      h("option", { value: "cdc", text: "CdC · Consiglio di classe" }),
      h("option", { value: "glo", text: "GLO" }),
      m && m.kind === "altro" ? h("option", { value: "altro", text: m.title }) : null);
    kind.value = state.kind;

    var cls = h("select", { name: "class" }, h("option", { value: "", text: "—" }),
      (x.classes || []).map(function (c) { return h("option", { value: c.id, text: c.name }); }));
    cls.value = m ? m.class_id || "" : (x.classes && x.classes[0] ? x.classes[0].id : "");

    // giorno: oggi + i prossimi 13 giorni a tocchi, oppure una data qualsiasi
    var dateIn = h("input", { type: "date", name: "date", value: state.date });
    var dayOpts = [];
    for (var i = 0; i < 14; i++) {
      var d = plus(i);
      if (d.getDay() === 0) continue;
      dayOpts.push([ymd(d), i === 0 ? "Oggi" : i === 1 ? "Domani" : DAYS[d.getDay()] + " " + d.getDate()]);
    }
    var dayBox = choice("Giorno", dayOpts, state.date, function (v) { state.date = v; dateIn.value = v; });
    dateIn.addEventListener("change", function () {
      state.date = dateIn.value;
      [].forEach.call(dayBox.children, function (c, j) { c.classList.toggle("on", dayOpts[j][0] === state.date); });
    });

    var timeIn = h("input", { type: "time", name: "time", value: state.time, step: 300 });
    var timeBox = choice("Ora", TIMES.map(function (t) { return [t, t.replace(":", ".")]; }), state.time, function (v) { state.time = v; timeIn.value = v; });
    timeIn.addEventListener("change", function () {
      state.time = timeIn.value;
      [].forEach.call(timeBox.children, function (c, j) { c.classList.toggle("on", TIMES[j] === state.time); });
    });

    var durBox = choice("Durata", [[30, "30 min"], [45, "45 min"], [60, "1 ora"], [90, "1 h 30"], [120, "2 ore"]], state.dur, function (v) { state.dur = v; });
    var link = h("input", { type: "url", name: "link", inputmode: "url", placeholder: "https://meet.google.com/…", value: m && m.link || "" });
    var remind = h("select", { name: "remind" },
      [[5, "5 minuti prima"], [10, "10 minuti prima"], [15, "15 minuti prima"], [30, "30 minuti prima"], [60, "1 ora prima"]].map(function (o) { return h("option", { value: o[0], text: o[1] }); }));
    remind.value = String(m ? m.remind_min : 10);
    var note = h("input", { type: "text", name: "note", maxlength: 500, placeholder: "Facoltativa", value: m && m.note || "" });

    var f = h("form", { class: "stack rn-form" },
      h("div", { class: "rn-two" }, h("label", null, "Tipo", kind), h("label", null, "Classe", cls)),
      h("div", { class: "rn-field" }, h("span", { class: "rn-lab", text: "Giorno" }), dayBox, h("label", { class: "small muted rn-other" }, "Altra data ", dateIn)),
      h("div", { class: "rn-field" }, h("span", { class: "rn-lab", text: "Ora d'inizio" }), timeBox, h("label", { class: "small muted rn-other" }, "Altra ora ", timeIn)),
      h("div", { class: "rn-field" }, h("span", { class: "rn-lab", text: "Durata" }), durBox),
      h("label", null, "Link della riunione", link),
      h("div", { class: "rn-two" }, h("label", null, "Sveglia", remind), h("label", null, "Nota", note)),
      h("div", { class: "row" },
        h("button", { class: "btn primary", type: "submit", text: m ? "Salva le modifiche" : "Aggiungi la riunione" }),
        m ? h("button", { class: "btn", type: "button", text: "Annulla", onclick: function () { done(false); } }) : null),
      msg);

    f.addEventListener("submit", async function (e) {
      e.preventDefault();
      if (!state.date || !state.time) { msg.replaceChildren(x.notice("err", "Scegli il giorno e l'ora.")); return; }
      var s = new Date(state.date + "T" + state.time + ":00");
      var k = kind.value;
      var row = {
        kind: k, title: k === "altro" && m ? m.title : KINDS[k], class_id: cls.value || null,
        starts_at: s.toISOString(), ends_at: new Date(s.getTime() + state.dur * 60000).toISOString(),
        link: link.value.trim() || null, note: note.value.trim() || null, remind_min: Number(remind.value)
      };
      var btn = f.querySelector('button[type="submit"]');
      btn.disabled = true;
      try {
        await save(x.sb, row, m && m.id);
        x.toast(m ? "Riunione aggiornata." : "Riunione aggiunta: la sveglia suona " + remind.selectedOptions[0].text + ".");
        done(true);
      } catch (err) { msg.replaceChildren(x.notice("err", x.errText(err))); btn.disabled = false; }
    });
    return f;
  }

  /* ---------- Una riunione nell'elenco ---------- */
  function item(x, m, refresh, compact) {
    var h = x.h, now = Date.now(), s = new Date(m.starts_at).getTime(), past = endOf(m) < now, live = s <= now && !past;
    var cl = m.class_id && x.findClass(m.class_id);
    var el = h("article", { class: "rn-item" + (past ? " past" : "") + (live ? " live" : "") },
      h("div", { class: "rn-when" }, h("b", { text: hm(m.starts_at).replace(":", ".") }), m.ends_at ? h("span", { text: hm(m.ends_at).replace(":", ".") }) : null),
      h("div", { class: "rn-main" },
        h("p", { class: "rn-title" }, h("span", { class: "rn-kind rn-" + m.kind, text: SHORT[m.kind] || "Riunione" }), " ",
          cl ? h("a", { href: "#/c/" + cl.id, text: cl.name }) : m.kind === "altro" ? m.title : null,
          live ? h("span", { class: "tag rn-now", text: "In corso" }) : null),
        m.note ? h("p", { class: "small muted", text: m.note }) : null,
        !past ? h("p", { class: "small muted", text: "⏰ Sveglia " + (m.remind_min ? m.remind_min + " min prima" : "all'inizio") }) : null),
      h("div", { class: "rn-act" },
        m.link && !past ? h("a", { class: "btn primary", href: m.link, target: "_blank", rel: "noopener", text: "Entra" }) : null,
        m.link && past ? h("a", { class: "btn link small", href: m.link, target: "_blank", rel: "noopener", text: "Link" }) : null));
    if (!compact) {
      var tools = h("div", { class: "rn-tools" },
        h("button", { class: "btn link small", type: "button", text: "Modifica", onclick: function () {
          el.replaceWith(h("div", { class: "rn-edit" }, form(x, m, refresh)));
        } }),
        !past ? h("a", { class: "btn link small", href: gcal(m, x), target: "_blank", rel: "noopener", text: "📅 Aggiungi al calendario" }) : null,
        x.confirmBtn("Elimina", "btn link small danger", async function () { await remove(x.sb, m.id); refresh(); }));
      el.querySelector(".rn-main").appendChild(tools);
    }
    return el;
  }

  function byDay(x, list, box, refresh, compact) {
    var last = "";
    list.forEach(function (m) {
      var d = dayLabel(m.starts_at);
      if (d !== last) { box.appendChild(x.h("h3", { class: "rn-day", text: d })); last = d; }
      box.appendChild(item(x, m, refresh, compact));
    });
  }

  /* ---------- Sveglia in pagina ---------- */
  var alarmOn = false, ringing = {}, ctx = null;
  // il browser lascia suonare solo dopo un tocco sulla pagina: l'audio si sblocca al primo tocco
  function unlock() {
    try {
      ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
      if (ctx.state === "suspended") ctx.resume();
    } catch (e) {}
  }
  function ring(x, m) {
    var h = x.h, timer = null, key = "novaula-sveglia:" + m.id + ":" + m.starts_at;
    try { if (localStorage.getItem(key)) return; } catch (e) {}
    if (ringing[m.id]) return;
    ringing[m.id] = true;
    function beep() {
      try {
        unlock();
        [0, 0.25, 0.5].forEach(function (t) {
          var o = ctx.createOscillator(), g = ctx.createGain();
          o.type = "square"; o.frequency.value = 880;
          g.gain.setValueAtTime(0.0001, ctx.currentTime + t);
          g.gain.exponentialRampToValueAtTime(0.35, ctx.currentTime + t + 0.02);
          g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t + 0.2);
          o.connect(g).connect(ctx.destination);
          o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + 0.22);
        });
      } catch (e) {}
      try { navigator.vibrate && navigator.vibrate([400, 150, 400, 150, 400]); } catch (e) {}
    }
    function stop() {
      clearInterval(timer);
      try { localStorage.setItem(key, "1"); } catch (e) {}
      try { navigator.vibrate && navigator.vibrate(0); } catch (e) {}
      ov.remove();
      delete ringing[m.id];
    }
    var min = Math.round((new Date(m.starts_at).getTime() - Date.now()) / 60000);
    var ov = h("div", { class: "rn-alarm", role: "alertdialog", "aria-label": "Sveglia riunione" },
      h("div", { class: "rn-alarm-box" },
        h("p", { class: "rn-alarm-ico", "aria-hidden": "true", text: "⏰" }),
        h("p", { class: "rn-alarm-when", text: min > 0 ? "Tra " + min + " min" : "Inizia ora" }),
        h("p", { class: "rn-alarm-what", text: label(m, x) }),
        h("p", { class: "rn-alarm-time", text: hm(m.starts_at).replace(":", ".") + (m.ends_at ? "–" + hm(m.ends_at).replace(":", ".") : "") }),
        h("div", { class: "row" },
          m.link ? h("a", { class: "btn primary", href: m.link, target: "_blank", rel: "noopener", text: "Apri Meet", onclick: stop }) : null,
          h("button", { class: "btn", type: "button", text: "Silenzia", onclick: stop }))));
    document.body.appendChild(ov);
    beep();
    timer = setInterval(beep, 1500);
  }

  function check(x) {
    var now = Date.now();
    load(x.sb, new Date(now - 10 * 60000).toISOString()).then(function (list) {
      list.forEach(function (m) {
        var s = new Date(m.starts_at).getTime();
        if (now >= s - m.remind_min * 60000 && now < s + 10 * 60000) ring(x, m);
      });
    }).catch(function () {});
  }

  window.NovaulaRiunioni = {
    alarm: function (x) {
      if (alarmOn) return;
      alarmOn = true;
      document.addEventListener("pointerdown", unlock, { once: true, capture: true });
      check(x);
      setInterval(function () { if (document.visibilityState === "visible" && x.isTeacher()) check(x); }, 60000);
      document.addEventListener("visibilitychange", function () { if (document.visibilityState === "visible" && x.isTeacher()) check(x); });
    },

    board: function (box, x) {
      var h = x.h, list = h("div", { class: "rn-list" });
      var sec = h("section", { class: "card rn-board" }, list,
        h("div", { class: "row" }, h("a", { class: "btn", href: "#/docente/riunioni", text: "Tutte le riunioni · aggiungi" })));
      box.appendChild(h("h2", { text: "🎥 Riunioni" }));
      box.appendChild(sec);
      load(x.sb, new Date(Date.now() - 3 * 3600000).toISOString()).then(function (l) {
        l = l.filter(function (m) { return endOf(m) > Date.now(); }).slice(0, 3);
        if (!l.length) { list.appendChild(h("p", { class: "muted small", text: "Nessuna riunione in programma." })); return; }
        byDay(x, l, list, function () {}, true);
      }).catch(function (e) {
        if (/meetings|schema cache/i.test(e.message || "")) { sec.previousSibling.remove(); sec.remove(); return; }
        list.replaceChildren(x.notice("err", x.errText(e)));
      });
    },

    // home del docente, sotto le lezioni: le riunioni dei prossimi 7 giorni (o solo il link alla pagina)
    strip: function (box, x) {
      var h = x.h, list = h("div", { class: "rn-list" });
      var sec = h("section", { class: "rn-strip" }, h("p", { class: "rn-strip-head" }, h("span", { text: "🎥 Prossime riunioni" }),
        h("a", { href: "#/docente/riunioni", text: "Tutte · aggiungi →" })), list);
      box.appendChild(sec);
      load(x.sb, new Date(Date.now() - 3 * 3600000).toISOString()).then(function (l) {
        var week = Date.now() + 7 * 86400000;
        l = l.filter(function (m) { return endOf(m) > Date.now() && new Date(m.starts_at).getTime() < week; }).slice(0, 3);
        if (!l.length) { list.appendChild(h("p", { class: "muted small", text: "Nessuna riunione nei prossimi 7 giorni." })); return; }
        byDay(x, l, list, function () {}, true);
      }).catch(function () { sec.remove(); });
    },

    page: function (box, x) {
      var h = x.h;
      var up = h("div", { class: "rn-list" }), old = h("div", { class: "rn-list" });
      var pastDet = h("details", { class: "rn-past" }, h("summary", { text: "Riunioni passate" }), old);
      var add = h("details", { class: "teacher" }, h("summary", { text: "Nuova riunione" }));
      box.appendChild(h("a", { class: "back", href: "#/docente", text: "← Area docente" }));
      box.appendChild(h("h1", { text: "🎥 Riunioni" }));
      box.appendChild(h("p", { class: "muted", text: "Consigli di classe e GLO con il loro link. Prima di ognuna suona una sveglia sul telefono (se hai attivato le notifiche in Area docente): toccala e sei dentro." }));
      box.appendChild(add);
      box.appendChild(h("h2", { text: "In programma" }));
      box.appendChild(up);
      box.appendChild(pastDet);
      function refresh() {
        add.replaceChildren(add.firstChild, form(x, null, function () { add.open = false; refresh(); }));
        load(x.sb).then(function (l) {
          var now = Date.now();
          var next = l.filter(function (m) { return endOf(m) > now; });
          var prev = l.filter(function (m) { return endOf(m) <= now; }).reverse();
          up.textContent = ""; old.textContent = "";
          if (!next.length) up.appendChild(h("p", { class: "muted", text: "Nessuna riunione in programma. Aggiungine una qui sopra." }));
          byDay(x, next, up, refresh);
          pastDet.hidden = !prev.length;
          pastDet.firstChild.textContent = "Riunioni passate (" + prev.length + ")";
          byDay(x, prev, old, refresh);
        }).catch(function (e) { up.replaceChildren(x.notice("err", x.errText(e))); });
      }
      refresh();
    }
  };
})();
