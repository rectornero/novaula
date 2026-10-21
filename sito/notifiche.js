/* Novaula · Notifiche sul telefono (Web Push, vedi aggiornamenti/2026-10-20-notifiche.sql e
   supabase/functions/notifiche). Lo studente le attiva nel suo profilo, il docente in Area docente.
   Su iPhone funzionano solo dopo «Aggiungi alla schermata Home» (iOS 16.4 o successivo).
   Chiamato da profili.js e app.js:
     NovaulaNotifiche.panel({ h, sb, toast, errText, owner, subscribe(endpoint, p256dh, auth) }) -> elemento */
(function () {
  "use strict";

  var cfg = window.PIATTAFORMA_CONFIG || {};
  var FN = (cfg.SUPABASE_URL || "") + "/functions/v1/notifiche";

  function isIOS() { return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1); }
  function standalone() { return navigator.standalone === true || (window.matchMedia && matchMedia("(display-mode: standalone)").matches); }
  function supported() { return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window && location.protocol === "https:"; }
  function skey(owner) { return "novaula-notifiche-" + owner; }
  function saved(owner) { try { return localStorage.getItem(skey(owner)); } catch (e) { return null; } }
  function save(owner, endpoint) { try { endpoint ? localStorage.setItem(skey(owner), endpoint) : localStorage.removeItem(skey(owner)); } catch (e) {} }

  function keyBytes(b64) {
    var s = (b64 + "===".slice((b64.length + 3) % 4)).replace(/-/g, "+").replace(/_/g, "/");
    var raw = atob(s), out = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
  }

  async function currentSub() {
    var reg = await navigator.serviceWorker.ready;
    return reg.pushManager.getSubscription();
  }

  async function enable(o) {
    var perm = await Notification.requestPermission();
    if (perm !== "granted") throw new Error(perm === "denied" ? "Hai bloccato le notifiche: riattivale dalle impostazioni del browser per questo sito." : "Permesso non concesso.");
    var reg = await navigator.serviceWorker.ready;
    var sub = await reg.pushManager.getSubscription();
    if (!sub) {
      var res = await fetch(FN);
      var key = (await res.json()).key;
      if (!key) throw new Error("Il server delle notifiche non risponde. Riprova tra poco.");
      sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key) });
    }
    var j = sub.toJSON();
    await o.subscribe(j.endpoint, j.keys.p256dh, j.keys.auth);
    save(o.owner, j.endpoint);
  }

  async function disable(o) {
    var sub = await currentSub();
    var ep = (sub && sub.endpoint) || saved(o.owner);
    if (ep) { var r = await o.sb.rpc("push_unsubscribe", { p_endpoint: ep, p_owner: o.owner }); if (r.error) throw r.error; }
    save(o.owner, null);
  }

  function panel(o) {
    var h = o.h, box = h("div", { class: "push-box" });
    if (!o.sb) return box;

    async function draw() {
      var title = h("b", { text: "🔔 Notifiche sul telefono" });
      var what = o.owner === "docente" ? "Un avviso per ogni nuova domanda nella scheda Aiuto e all'inizio di ogni lezione." : "Un avviso all'inizio di ogni lezione e per nuovi voti, lavori da rifare e nuovi materiali.";
      if (isIOS() && !standalone()) {
        box.replaceChildren(title, h("p", { class: "small", text: what }),
          h("p", { class: "small push-hint" }, "Su iPhone funzionano solo dall'app: tocca ", h("b", { text: "Condividi" }), " (il quadrato con la freccia ⬆️), poi ",
            h("b", { text: "«Aggiungi alla schermata Home»" }), ". Apri Novaula dalla nuova icona, rientra qui e tocca «Attiva le notifiche»."));
        return;
      }
      if (!supported()) { box.replaceChildren(title, h("p", { class: "small muted", text: "Questo browser non supporta le notifiche. Prova con Chrome, Firefox o Safari aggiornati." })); return; }
      if (Notification.permission === "denied") { box.replaceChildren(title, h("p", { class: "small", text: "Hai bloccato le notifiche per Novaula. Per riattivarle apri le impostazioni del browser per questo sito e consenti le notifiche." })); return; }
      var sub = null;
      try { sub = await currentSub(); } catch (e) {}
      var on = !!sub && Notification.permission === "granted" && saved(o.owner) === sub.endpoint;
      var btn = h("button", { class: "btn" + (on ? " link" : " primary"), type: "button", text: on ? "Disattiva" : "Attiva le notifiche" });
      btn.addEventListener("click", async function () {
        btn.disabled = true;
        try {
          if (on) { await disable(o); o.toast("Notifiche disattivate su questo dispositivo."); }
          else { await enable(o); o.toast("Notifiche attive: tra poco arriva un avviso di prova."); }
        } catch (err) { o.toast(o.errText ? o.errText(err) : String(err.message || err)); }
        draw();
      });
      box.replaceChildren(title, h("p", { class: "small", text: on ? "Attive su questo dispositivo. " + what : what }), h("div", { class: "row" }, btn));
    }
    draw();
    return box;
  }

  window.NovaulaNotifiche = { panel: panel };
})();
