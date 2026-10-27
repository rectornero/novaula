/* Novaula · Avvisi di classe.
   Il docente scrive un avviso breve a una o più classi: resta fisso in cima alla pagina della classe fino a fine
   giornata (o fino a domani sera), poi sparisce da solo. Ogni nuovo avviso manda una notifica sul telefono agli
   studenti iscritti della classe e al docente (funzione Edge "notifiche", vedi aggiornamenti/2026-10-23-avvisi.sql).
   app.js chiama:
     window.NovaulaAvvisi.bar(classe, aiuti)        -> { el, stop } avvisi fissati sotto il titolo della classe
     window.NovaulaAvvisi.badges(contenitore, aiuti) segna «📌 Avviso» sui pulsanti delle classi in home
     window.NovaulaAvvisi.board(contenitore, aiuti)  riquadro "Avvisi di classe" in Area docente
     window.NovaulaAvvisi.broadcast(contenitore, aiuti) riquadro "Notifica a tutti" in Area docente
       (solo notifica sul telefono, non resta in pagina: aggiornamenti/2026-10-27-notifica-tutti.sql) */
(function () {
  "use strict";

  var DAYS = ["domenica", "lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato"];

  // mezzanotte locale tra n giorni (il docente è in Italia, come il database che usa Europe/Rome)
  function endOfDay(n) { var d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + 1 + n); return d; }
  function hm(iso) { var d = new Date(iso); return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0"); }
  function until(iso) {
    var t = new Date(iso).getTime();
    if (t <= endOfDay(0).getTime()) return "fino a stasera";
    if (t <= endOfDay(1).getTime()) return "fino a domani sera";
    var d = new Date(t - 1);
    return "fino a " + DAYS[d.getDay()] + " " + d.getDate() + "/" + (d.getMonth() + 1);
  }
  function active(list) { var now = Date.now(); return list.filter(function (a) { return new Date(a.expires_at).getTime() > now; }); }

  // testo semplice, con i link cliccabili
  function rich(h, text) {
    var out = [], re = /https?:\/\/[^\s<>"]+[^\s<>".,;:!?)\]]/g, last = 0, m;
    while ((m = re.exec(text))) {
      if (m.index > last) out.push(document.createTextNode(text.slice(last, m.index)));
      out.push(h("a", { href: m[0], target: "_blank", rel: "noopener", text: m[0] }));
      last = m.index + m[0].length;
    }
    if (last < text.length) out.push(document.createTextNode(text.slice(last)));
    return out;
  }

  async function load(sb, classId) {
    var q = sb.from("announcements").select("id, class_id, body, created_at, expires_at").gt("expires_at", new Date().toISOString()).order("created_at", { ascending: false });
    if (classId) q = q.eq("class_id", classId);
    var res = await q;
    if (res.error) throw res.error;
    return res.data || [];
  }

  async function publish(sb, classIds, body, days) {
    var exp = endOfDay(days).toISOString();
    var res = await sb.from("announcements").insert(classIds.map(function (id) { return { class_id: id, body: body, expires_at: exp }; }));
    if (res.error) throw res.error;
  }

  async function remove(sb, id) {
    var res = await sb.from("announcements").delete().eq("id", id);
    if (res.error) throw res.error;
  }

  function card(h, a, x, extra, onGone) {
    return h("div", { class: "av-item", role: "note" },
      h("span", { class: "av-pin", "aria-hidden": "true", text: "📌" }),
      h("div", { class: "av-main" },
        h("p", { class: "av-meta" }, h("b", { text: "Avviso del docente" }), extra ? " · " : null, extra || null, " · " + hm(a.created_at) + ", " + until(a.expires_at)),
        h("p", { class: "av-body" }, rich(h, a.body))),
      x.teacher ? x.confirmBtn("Togli", "btn link small", async function () { await remove(x.sb, a.id); onGone(); }) : null);
  }

  function form(h, x, classes, done) {
    var msg = h("div");
    var text = h("textarea", { name: "body", required: true, maxlength: 500, rows: 3, placeholder: "Es. Domani portate il libro di testo. La verifica è spostata a giovedì." });
    var count = h("span", { class: "small muted", text: "0/500" });
    text.addEventListener("input", function () { count.textContent = text.value.length + "/500"; });
    var picks = classes.length > 1 ? h("fieldset", { class: "pick av-classes" }, h("legend", { text: "Classi" }),
      classes.map(function (c) { return h("label", { class: "check-row" }, h("input", { type: "checkbox", name: "cls", value: c.id }), h("span", { text: c.name })); })) : null;
    var f = h("form", { class: "stack" },
      h("label", null, "Testo dell'avviso", text), count,
      picks,
      h("label", null, "Resta in alto", h("select", { name: "days" },
        h("option", { value: "0", text: "fino a stasera" }), h("option", { value: "1", text: "fino a domani sera" }))),
      h("p", { class: "small muted", text: "Arriva subito come notifica agli studenti della classe che le hanno attivate, e anche a te come prova." }),
      h("button", { class: "btn primary", type: "submit", text: "Pubblica l'avviso" }),
      msg);
    f.addEventListener("submit", async function (e) {
      e.preventDefault();
      var body = text.value.trim();
      var ids = picks ? [].slice.call(f.querySelectorAll('input[name="cls"]:checked')).map(function (i) { return i.value; }) : [classes[0].id];
      if (!body) return;
      if (!ids.length) { msg.replaceChildren(x.notice("err", "Scegli almeno una classe.")); return; }
      var btn = f.querySelector('button[type="submit"]');
      btn.disabled = true;
      try {
        await publish(x.sb, ids, body, Number(f.elements.days.value));
        f.reset(); count.textContent = "0/500";
        x.toast(ids.length > 1 ? "Avviso pubblicato in " + ids.length + " classi." : "Avviso pubblicato.");
        msg.textContent = "";
        done();
      } catch (err) { msg.replaceChildren(x.notice("err", x.errText(err))); }
      btn.disabled = false;
    });
    return f;
  }

  window.NovaulaAvvisi = {
    bar: function (c, x) {
      var h = x.h, el = h("section", { class: "av-bar", style: "--cc:" + x.cc, "aria-label": "Avvisi" }), list = h("div", { class: "av-list" });
      var timer = null, ch = null, stopped = false;
      el.appendChild(list);
      if (x.teacher) {
        var det = h("details", { class: "teacher av-new" }, h("summary", { text: "Docente: nuovo avviso per " + c.name }));
        det.appendChild(form(h, x, [c], function () { det.open = false; refresh(); }));
        el.appendChild(det);
      }
      function render(items) {
        list.textContent = "";
        items.forEach(function (a) { list.appendChild(card(h, a, x, null, refresh)); });
        el.classList.toggle("av-empty", !items.length);
        // sparisce da solo alla scadenza, anche se la pagina resta aperta sulla LIM
        clearTimeout(timer);
        var next = items.reduce(function (m, a) { return Math.min(m, new Date(a.expires_at).getTime()); }, Infinity);
        if (next < Infinity) timer = setTimeout(refresh, Math.min(next - Date.now() + 1000, 6 * 3600 * 1000));
      }
      function refresh() {
        if (stopped) return;
        load(x.sb, c.id).then(function (l) { if (!stopped) render(active(l)); }).catch(function () {});
      }
      function onVisible() { if (document.visibilityState === "visible") refresh(); }
      el.classList.add("av-empty");
      refresh();
      document.addEventListener("visibilitychange", onVisible);
      try {
        ch = x.sb.channel("avvisi-" + c.id + "-" + Math.random().toString(36).slice(2, 8))
          .on("postgres_changes", { event: "INSERT", schema: "public", table: "announcements", filter: "class_id=eq." + c.id }, refresh)
          .on("postgres_changes", { event: "DELETE", schema: "public", table: "announcements" }, refresh)
          .subscribe();
      } catch (e) { ch = null; }
      return { el: el, stop: function () {
        stopped = true; clearTimeout(timer);
        document.removeEventListener("visibilitychange", onVisible);
        if (ch) x.sb.removeChannel(ch);
      } };
    },

    badges: function (box, x) {
      load(x.sb).then(function (l) {
        var by = {};
        active(l).forEach(function (a) { by[a.class_id] = true; });
        [].forEach.call(box.querySelectorAll("[data-class]"), function (b) {
          if (by[b.getAttribute("data-class")]) b.appendChild(x.h("span", { class: "tag av-tag", text: "📌 Avviso" }));
        });
      }).catch(function () {});
    },

    broadcast: function (box, x) {
      var h = x.h, classes = x.classes || [], msg = h("div");
      var text = h("textarea", { name: "body", required: true, maxlength: 300, rows: 3, placeholder: "Es. Domani niente lezione alla prima ora: entrate alle 8.55." });
      var count = h("span", { class: "small muted", text: "0/300" });
      text.addEventListener("input", function () { count.textContent = text.value.length + "/300"; });
      var who = h("select", { name: "cls" }, h("option", { value: "", text: "Tutte le classi" }),
        classes.map(function (c) { return h("option", { value: c.id, text: c.name }); }));
      var f = h("form", { class: "stack" },
        h("label", null, "Messaggio", text), count,
        h("label", null, "A chi", who),
        h("p", { class: "small muted", text: "Arriva subito sul telefono degli studenti che hanno attivato le notifiche (e a te una copia). Non resta nella pagina della classe: per quello usa un avviso di classe." }),
        h("button", { class: "btn primary", type: "submit", text: "📣 Invia la notifica" }),
        msg);
      var armed = false, timer;
      var btn = f.querySelector('button[type="submit"]');
      function disarm() { armed = false; clearTimeout(timer); btn.textContent = "📣 Invia la notifica"; }
      f.addEventListener("submit", async function (e) {
        e.preventDefault();
        var body = text.value.trim();
        if (!body) return;
        // secondo tocco per confermare: una notifica inviata non si può ritirare
        if (!armed) {
          armed = true; btn.textContent = "Tocca di nuovo per inviare a " + (who.value ? who.selectedOptions[0].textContent : "tutte le classi");
          timer = setTimeout(disarm, 5000);
          return;
        }
        disarm(); btn.disabled = true;
        try {
          var res = await x.sb.rpc("teacher_push_broadcast", { p_body: body, p_class: who.value || null });
          if (res.error) throw res.error;
          var n = res.data || 0;
          if (n) { f.reset(); count.textContent = "0/300"; msg.textContent = ""; x.toast("Notifica inviata a " + n + (n === 1 ? " telefono." : " telefoni.")); }
          else msg.replaceChildren(x.notice("err", "Nessuno studente " + (who.value ? "di questa classe " : "") + "ha ancora attivato le notifiche: il messaggio non è partito."));
        } catch (err) { msg.replaceChildren(x.notice("err", x.errText(err))); }
        btn.disabled = false;
      });
      [text, who].forEach(function (el) { el.addEventListener("input", disarm); });
      box.appendChild(h("h2", { text: "📣 Notifica a tutti" }));
      box.appendChild(h("section", { class: "card av-board" }, h("details", { class: "teacher av-new" }, h("summary", { text: "Scrivi una notifica" }), f)));
    },

    board: function (box, x) {
      var h = x.h, classes = x.classes || [];
      var list = h("div", { class: "av-list" });
      var det = h("details", { class: "teacher av-new" }, h("summary", { text: "Nuovo avviso" }));
      var sec = h("section", { class: "card av-board" },
        h("p", { class: "small muted", text: "Un avviso resta fisso in cima alla pagina della classe (in tutte le schede, chat compresa) e sparisce da solo a fine giornata. Gli studenti con le notifiche attive lo ricevono subito sul telefono." }),
        list, det);
      det.appendChild(form(h, x, classes, function () { det.open = false; refresh(); }));
      box.appendChild(h("h2", { text: "📌 Avvisi di classe" }));
      box.appendChild(sec);
      function refresh() {
        load(x.sb).then(function (l) {
          l = active(l);
          list.textContent = "";
          if (!l.length) { list.appendChild(h("p", { class: "muted small", text: "Nessun avviso attivo in questo momento." })); return; }
          l.forEach(function (a) {
            var cl = x.findClass(a.class_id);
            list.appendChild(card(h, a, x, h("a", { href: "#/c/" + a.class_id, text: cl ? cl.name : a.class_id }), refresh));
          });
        }).catch(function (e) {
          // tabella non ancora creata: il riquadro non serve
          if (/announcements|schema cache/i.test(e.message || "")) { sec.previousSibling.remove(); sec.remove(); return; }
          list.replaceChildren(x.notice("err", x.errText(e)));
        });
      }
      refresh();
    }
  };
})();
