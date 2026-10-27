// Novaula · funzione Edge "notifiche" (Web Push)
// Pubblica, senza JWT: fa da sola i controlli.
//   GET  (o POST {op:"chiave"})       -> {key} chiave VAPID pubblica per l'iscrizione nel browser
//                                       (la coppia di chiavi nasce qui al primo uso e resta in private_settings)
//   POST {tipo, ids|endpoint,owner}   -> solo dai trigger del database, con header x-novaula-push = private_settings.push_token
//        tipo: voti | materiali | personali | aiuto | lezione | avviso | paga | riunione | messaggio | prova
// I voti con status 'proposto' (proposte di Claude non ancora viste dal docente) non vengono mai inviati.
import { createClient } from "jsr:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const SITE = "https://novaula.netlify.app/";
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "content-type, apikey, authorization, x-client-info", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" };

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

async function setting(key: string) {
  const { data } = await sb.from("private_settings").select("value").eq("key", key).maybeSingle();
  return data?.value as string | undefined;
}

let vapid: { publicKey: string; privateKey: string } | null = null;
async function keys() {
  if (vapid) return vapid;
  let pub = await setting("vapid_public"), priv = await setting("vapid_private");
  if (!pub || !priv) {
    const k = webpush.generateVAPIDKeys();
    // se due richieste arrivano insieme vince la prima: si rilegge quello che è rimasto salvato
    const { error } = await sb.from("private_settings").upsert([{ key: "vapid_private", value: k.privateKey }, { key: "vapid_public", value: k.publicKey }], { onConflict: "key", ignoreDuplicates: true });
    if (error) throw error;
    pub = await setting("vapid_public"); priv = await setting("vapid_private");
  }
  vapid = { publicKey: pub!, privateKey: priv! };
  webpush.setVapidDetails(SITE, vapid.publicKey, vapid.privateKey);
  return vapid;
}

// alarm: resta sullo schermo finché non viene toccata, vibrazione lunga, suona di nuovo anche con lo stesso tag
type Msg = { title: string; body: string; url: string; tag: string; ttl?: number; alarm?: boolean };
type Sub = { endpoint: string; owner: string; p256dh: string; auth: string };

const cut = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s);
function group<T>(rows: T[], key: (r: T) => string) {
  const m = new Map<string, T[]>();
  for (const r of rows) { const k = key(r); if (!m.has(k)) m.set(k, []); m.get(k)!.push(r); }
  return m;
}
async function classNames() {
  const { data } = await sb.from("classes").select("id, name");
  return new Map((data || []).map((c) => [c.id as string, c.name as string]));
}
async function subsFor(column: "owner" | "student_id", values: string[]) {
  if (!values.length) return [] as (Sub & { student_id: string | null })[];
  const { data, error } = await sb.from("push_subscriptions").select("endpoint, owner, p256dh, auth, student_id").in(column, values).is("disabled_at", null);
  if (error) throw error;
  return data || [];
}

// Restituisce coppie (iscrizioni, messaggio)
async function build(body: Record<string, unknown>): Promise<[Sub[], Msg][]> {
  const ids = (Array.isArray(body.ids) ? body.ids : []).map(String).slice(0, 2000);
  const out: [Sub[], Msg][] = [];

  if (body.tipo === "prova") {
    const { data } = await sb.from("push_subscriptions").select("endpoint, owner, p256dh, auth").eq("endpoint", String(body.endpoint)).eq("owner", String(body.owner)).is("disabled_at", null);
    const teacher = body.owner === "docente";
    out.push([data || [], { title: "Notifiche attive ✓", body: teacher ? "Ti avviserò per le nuove domande nella scheda Aiuto, all'inizio di ogni lezione, prima delle tue riunioni e quando pubblichi un avviso." : "Ti avviserò per gli avvisi del docente, all'inizio delle lezioni e per nuovi voti, lavori da rifare e nuovi materiali.", url: SITE, tag: "prova" }]);
  }

  if (body.tipo === "voti" && ids.length) {
    const { data: marks } = await sb.from("marks").select("id, student_id, class_id, title, label, value, status").in("id", ids).neq("status", "proposto");
    const byStudent = group(marks || [], (m) => m.student_id);
    const { data: studs } = await sb.from("students").select("id, pin_hash").in("id", [...byStudent.keys()]);
    const pin = new Set((studs || []).filter((s) => s.pin_hash).map((s) => s.id));
    const subs = group(await subsFor("student_id", [...byStudent.keys()]), (s) => s.student_id!);
    for (const [sid, ms] of byStudent) {
      if (!subs.has(sid)) continue;
      const url = `${SITE}#/c/${ms[0].class_id}/profilo`;
      let msg: Msg;
      if (ms.length > 1) {
        msg = { title: `Hai ${ms.length} novità nei voti`, body: cut(ms.map((m) => m.title).join(" · "), 150), url, tag: "voti" };
      } else {
        const m = ms[0];
        const val = m.label || (m.value != null ? String(m.value).replace(".", ",") : "");
        // con il PIN il voto non compare sulla schermata di blocco
        msg = m.status === "da_rifare"
          ? { title: "Da rifare: " + cut(m.title || "lavoro", 60), body: "Il docente ti chiede di consegnarlo di nuovo. Apri il tuo profilo.", url, tag: "voto-" + m.id }
          : { title: pin.has(sid) || !val ? "Nuovo voto" : "Nuovo voto: " + val, body: cut(m.title || "", 150), url, tag: "voto-" + m.id };
      }
      out.push([subs.get(sid)!, msg]);
    }
  }

  if (body.tipo === "materiali" && ids.length) {
    const { data: mats } = await sb.from("materials").select("id, class_id, title").in("id", ids);
    const names = await classNames();
    for (const [cid, ms] of group(mats || [], (m) => m.class_id)) {
      const { data: studs } = await sb.from("students").select("id").eq("class_id", cid);
      const subs = await subsFor("student_id", (studs || []).map((s) => s.id));
      if (!subs.length) continue;
      out.push([subs, {
        title: ms.length > 1 ? `${ms.length} nuovi materiali` : "Nuovo materiale: " + cut(ms[0].title, 60),
        body: (names.get(cid) || cid.toUpperCase()) + (ms.length > 1 ? " · " + cut(ms.map((m) => m.title).join(" · "), 120) : ""),
        url: `${SITE}#/c/${cid}/materiali`, tag: "materiali-" + cid,
      }]);
    }
  }

  if (body.tipo === "personali" && ids.length) {
    const { data: mats } = await sb.from("student_materials").select("id, student_id, title").in("id", ids);
    const byStudent = group(mats || [], (m) => m.student_id);
    const subs = group(await subsFor("student_id", [...byStudent.keys()]), (s) => s.student_id!);
    const { data: studs } = await sb.from("students").select("id, class_id").in("id", [...byStudent.keys()]);
    const cls = new Map((studs || []).map((s) => [s.id, s.class_id]));
    for (const [sid, ms] of byStudent) {
      if (!subs.has(sid)) continue;
      out.push([subs.get(sid)!, { title: "Nuovo materiale per te", body: cut(ms.map((m) => m.title).join(" · "), 150), url: `${SITE}#/c/${cls.get(sid)}/profilo`, tag: "personali" }]);
    }
  }

  if (body.tipo === "aiuto" && ids.length) {
    const { data: qs } = await sb.from("helpdesk").select("id, class_id, author, body, stuck").in("id", ids);
    const subs = await subsFor("owner", ["docente"]);
    const names = await classNames();
    for (const q of qs || []) {
      out.push([subs, {
        title: `${q.stuck ? "🔴 " : ""}Aiuto ${names.get(q.class_id) || q.class_id.toUpperCase()}: ${cut(q.author, 30)}`,
        body: cut(q.body || "", 150), url: `${SITE}#/c/${q.class_id}/aiuto`, tag: "aiuto-" + q.id,
      }]);
    }
  }
  // inizio lezione (pg_cron ogni minuto): gli studenti della classe e il docente
  if (body.tipo === "lezione" && ids.length) {
    const { data: rows } = await sb.from("timetable").select("id, class_id, subject, room, starts, ends").in("id", ids.map(Number));
    const names = await classNames();
    const teacher = await subsFor("owner", ["docente"]);
    for (const l of rows || []) {
      const { data: studs } = await sb.from("students").select("id").eq("class_id", l.class_id);
      const subs = [...(await subsFor("student_id", (studs || []).map((s) => s.id))), ...teacher];
      if (!subs.length) continue;
      const hm = (t: string) => t.slice(0, 5).replace(":", ".");
      out.push([subs, {
        title: `Inizia la lezione: ${names.get(l.class_id) || l.class_id.toUpperCase()}`,
        body: [l.subject, l.room && "aula " + l.room, hm(l.starts) + "–" + hm(l.ends)].filter(Boolean).join(" · "),
        url: `${SITE}#/c/${l.class_id}`, tag: "lezione-" + l.class_id, ttl: 900, // in ritardo non serve più
      }]);
    }
  }
  // avviso del docente: gli studenti della classe e il docente (come prova); resta valido fino a fine giornata
  if (body.tipo === "avviso" && ids.length) {
    const { data: rows } = await sb.from("announcements").select("id, class_id, body, expires_at").in("id", ids);
    const names = await classNames();
    const teacher = await subsFor("owner", ["docente"]);
    const ttl = (iso: string) => Math.max(60, Math.min(8 * 86400, Math.round((Date.parse(iso) - Date.now()) / 1000)));
    for (const a of rows || []) {
      const { data: studs } = await sb.from("students").select("id").eq("class_id", a.class_id);
      const subs = await subsFor("student_id", (studs || []).map((s) => s.id));
      if (!subs.length) continue;
      out.push([subs, {
        title: "📌 Avviso · " + (names.get(a.class_id) || a.class_id.toUpperCase()),
        body: cut(a.body, 180), url: `${SITE}#/c/${a.class_id}`, tag: "avviso-" + a.id, ttl: ttl(a.expires_at),
      }]);
    }
    // il docente riceve un solo avviso per testo, con l'elenco delle classi
    for (const [text, as] of group(rows || [], (a) => a.body)) {
      if (!teacher.length) break;
      const cls = as.map((a) => names.get(a.class_id) || a.class_id.toUpperCase());
      out.push([teacher, {
        title: "📌 Avviso inviato · " + cut(cls.join(", "), 60),
        body: cut(text, 180), url: `${SITE}#/c/${as[0].class_id}`, tag: "avviso-" + as[0].id, ttl: ttl(as[0].expires_at),
      }]);
    }
  }
  // fine giornata, solo per il docente: paga del giorno (pg_cron, importi calcolati da wage_push())
  if (body.tipo === "paga") {
    const subs = await subsFor("owner", ["docente"]);
    const eur = (n: unknown) => "€" + Number(n).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    const full = Number(body.fatti) >= Number(body.giorni);
    if (subs.length) out.push([subs, {
      title: "💶 Daily wage earned: " + eur(body.oggi),
      body: `${MONTHS[Number(body.mese_n) - 1] || "This month"} so far: ${eur(body.mese)} (${body.fatti} of ${body.giorni} working days)` +
        (full ? `. That's the full ${eur(body.stipendio)}!` : ". Day done, well earned!"),
      url: SITE + "#/docente", tag: "paga", ttl: 6 * 3600,
    }]);
  }
  // riunione del docente (pg_cron, meetings_push): "prima" = qualche minuto prima, "ora" = all'inizio.
  // Toccandola si apre direttamente il link (Meet); senza link, la sezione Riunioni.
  if (body.tipo === "riunione" && ids.length) {
    const { data: rows } = await sb.from("meetings").select("id, title, class_id, starts_at, ends_at, link, note").in("id", ids);
    const subs = await subsFor("owner", ["docente"]);
    const names = await classNames();
    const hm = (iso: string) => new Date(iso).toLocaleTimeString("it-IT", { timeZone: "Europe/Rome", hour: "2-digit", minute: "2-digit" }).replace(":", ".");
    for (const m of rows || []) {
      if (!subs.length) break;
      const start = Date.parse(m.starts_at), end = m.ends_at ? Date.parse(m.ends_at) : start + 3600_000;
      const min = Math.round((start - Date.now()) / 60000);
      const quando = body.fase === "ora" || min <= 0 ? "Inizia ora" : `Tra ${min} min`;
      const cls = m.class_id ? " " + (names.get(m.class_id)?.split(" ")[0] || m.class_id.toUpperCase()) : "";
      out.push([subs, {
        title: `⏰ ${quando}: ${cut(m.title, 50)}${cls}`,
        body: [hm(m.starts_at) + (m.ends_at ? "–" + hm(m.ends_at) : ""), m.link ? "Tocca per entrare" : "", m.note ? cut(m.note, 80) : ""].filter(Boolean).join(" · "),
        url: m.link || SITE + "#/docente/riunioni", tag: "riunione-" + m.id, alarm: true,
        ttl: Math.max(60, Math.round((end - Date.now()) / 1000)),
      }]);
    }
  }
  // messaggio del docente (teacher_push_broadcast): a tutti gli studenti iscritti, o a quelli di una classe; al docente una copia
  if (body.tipo === "messaggio" && typeof body.body === "string" && body.body.trim()) {
    const cid = typeof body.class_id === "string" ? body.class_id : null;
    let q = sb.from("push_subscriptions").select("endpoint, owner, p256dh, auth, student_id").not("student_id", "is", null).is("disabled_at", null);
    if (cid) {
      const { data: studs } = await sb.from("students").select("id").eq("class_id", cid);
      q = q.in("student_id", (studs || []).map((s) => s.id));
    }
    const { data: subs, error } = await q;
    if (error) throw error;
    const names = await classNames();
    const where = cid ? names.get(cid) || cid.toUpperCase() : "";
    const text = cut(body.body, 300), tag = "messaggio-" + Date.now();
    const url = cid ? `${SITE}#/c/${cid}` : SITE;
    if (subs?.length) {
      out.push([subs, { title: "📣 Messaggio del docente" + (where ? " · " + where : ""), body: text, url, tag }]);
      const teacher = await subsFor("owner", ["docente"]);
      if (teacher.length) out.push([teacher, { title: "📣 Inviato a " + (where || "tutte le classi"), body: text, url, tag }]);
    }
  }
  return out;
}

async function send(pairs: [Sub[], Msg][]) {
  await keys();
  let sent = 0, gone = 0, failed = 0;
  const jobs: Promise<void>[] = [];
  for (const [subs, msg] of pairs) {
    const payload = JSON.stringify(msg);
    const seen = new Set<string>(); // lo stesso telefono iscritto come docente e come studente riceve un solo avviso
    for (const s of subs) {
      if (seen.has(s.endpoint)) continue;
      seen.add(s.endpoint);
      jobs.push(webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: msg.ttl ?? 3 * 86400, urgency: msg.ttl ? "high" : "normal", topic: msg.tag.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 32) })
        .then(async () => { sent++; await sb.from("push_subscriptions").update({ last_ok: new Date().toISOString() }).eq("endpoint", s.endpoint).eq("owner", s.owner); })
        .catch(async (e: { statusCode?: number; body?: string }) => {
          // 404/410: il browser ha tolto il permesso o l'app è stata disinstallata
          if (e.statusCode === 404 || e.statusCode === 410) { gone++; await sb.from("push_subscriptions").update({ disabled_at: new Date().toISOString() }).eq("endpoint", s.endpoint).eq("owner", s.owner); }
          else { failed++; console.error("push", e.statusCode, String(e.body || e).slice(0, 200)); }
        }));
    }
  }
  await Promise.all(jobs);
  return { sent, gone, failed };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    if (req.method === "GET") return json({ key: (await keys()).publicKey });
    const body = await req.json().catch(() => ({}));
    if (body.op === "chiave") return json({ key: (await keys()).publicKey });
    const token = await setting("push_token");
    if (!token || req.headers.get("x-novaula-push") !== token) return json({ error: "non autorizzato" }, 401);
    return json(await send(await build(body)));
  } catch (e) {
    console.error(e);
    return json({ error: String((e as Error).message || e) }, 500);
  }
});
