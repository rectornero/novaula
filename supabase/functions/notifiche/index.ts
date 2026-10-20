// Novaula · funzione Edge "notifiche" (Web Push)
// Pubblica, senza JWT: fa da sola i controlli.
//   GET  (o POST {op:"chiave"})       -> {key} chiave VAPID pubblica per l'iscrizione nel browser
//                                       (la coppia di chiavi nasce qui al primo uso e resta in private_settings)
//   POST {tipo, ids|endpoint,owner}   -> solo dai trigger del database, con header x-novaula-push = private_settings.push_token
//        tipo: voti | materiali | personali | aiuto | prova
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

type Msg = { title: string; body: string; url: string; tag: string };
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
    out.push([data || [], { title: "Notifiche attive ✓", body: teacher ? "Ti avviserò per ogni nuova domanda nella scheda Aiuto." : "Ti avviserò per nuovi voti, lavori da rifare e nuovi materiali.", url: SITE, tag: "prova" }]);
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
  return out;
}

async function send(pairs: [Sub[], Msg][]) {
  await keys();
  let sent = 0, gone = 0, failed = 0;
  const jobs: Promise<void>[] = [];
  for (const [subs, msg] of pairs) {
    const payload = JSON.stringify(msg);
    for (const s of subs) {
      jobs.push(webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 3 * 86400, urgency: "normal", topic: msg.tag.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 32) })
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
