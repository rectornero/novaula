// Novaula · funzione Edge "correzioni"
// Ponte tra la sessione Claude che corregge e lo storage privato delle consegne.
// Ogni richiesta deve portare l'header x-novaula-token uguale a private_settings.marking_token.
//   POST {op:"consegne", assignment_id?, classe?, compito?, nuove?}  -> compiti con consegne e link firmati
//        (url = primo file, files = tutti i file della consegna con il loro link)
//        nuove: true = solo le consegne da correggere in automatico (senza correzione, non saltate,
//        non "da rifare", compito con auto_correct); i compiti senza consegne nuove non compaiono
//   POST {op:"salva", submission_id, pdf_base64, grade?, summary?, correct?, wrong?, partial?, automatica?}
//        automatica: true = segnata come automatica e mai sopra una correzione già esistente
//   POST {op:"salta", submission_id, motivo}  -> la consegna non viene più proposta in automatico
//   POST {op:"scansioni"}  -> verifiche scansionate in attesa (test_scans 'nuova'), con link firmato al file,
//        la verifica (testo e soluzioni) e l'elenco della classe
//   POST {op:"dividi", scan_id, student_id, pdf_base64}  -> la copia di uno studente diventa una consegna del
//        compito nascosto della verifica, pronta per la correzione normale (consegne nuove)
//   POST {op:"scansione_fatta", scan_id, stato?, nota?, studenti?}  -> chiude la scansione (fatta / errore)
import { createClient } from "jsr:@supabase/supabase-js@2";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}

function b64ToBytes(b64: string) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function tokenOk(req: Request) {
  const given = req.headers.get("x-novaula-token") || "";
  const { data } = await sb.from("private_settings").select("value").eq("key", "marking_token").single();
  return !!data && given.length > 20 && given === data.value;
}

async function consegne(body: Record<string, string>) {
  const nuove = !!body.nuove;
  let q = sb.from("assignments").select("id, class_id, title, description, pdf_url, due_date, kind, group_work, auto_correct").order("created_at");
  if (nuove) q = q.eq("auto_correct", true);
  if (body.assignment_id) q = q.eq("id", body.assignment_id);
  if (body.classe) q = q.eq("class_id", body.classe.toLowerCase());
  if (body.compito) q = q.ilike("title", "%" + body.compito + "%");
  const { data: assignments, error } = await q;
  if (error) throw error;
  const out = [];
  for (const a of assignments || []) {
    const { data: subs, error: e2 } = await sb.from("submissions").select("id, student_name, note, file_path, file_name, files, created_at, status, attempt").eq("assignment_id", a.id).order("created_at");
    if (e2) throw e2;
    if (!subs || !subs.length) continue;
    const { data: done } = await sb.from("corrections").select("submission_id, updated_at").eq("assignment_id", a.id);
    const corrected = new Map((done || []).map((c) => [c.submission_id, c.updated_at]));
    const { data: skips } = await sb.from("correction_skips").select("submission_id, reason, retry").eq("assignment_id", a.id);
    const skipped = new Map((skips || []).filter((k) => !k.retry).map((k) => [k.submission_id, k.reason]));
    const list = [];
    for (const s of subs) {
      if (nuove && (corrected.has(s.id) || skipped.has(s.id) || s.status === "da_rifare")) continue;
      let url = null;
      if (s.file_path) {
        const { data: signed } = await sb.storage.from("consegne").createSignedUrl(s.file_path, 900);
        url = signed?.signedUrl || null;
      }
      // consegne con più file (es. foto dalle slide di laboratorio): un link firmato per ciascuno
      const files = [];
      for (const f of Array.isArray(s.files) ? s.files : []) {
        if (!f || !f.path) continue;
        const { data: sf } = await sb.storage.from("consegne").createSignedUrl(f.path, 900);
        files.push({ name: f.name || f.path.split("/").pop(), url: sf?.signedUrl || null });
      }
      list.push({ ...s, url, files, corrected_at: corrected.get(s.id) || null, skipped: skipped.get(s.id) || null });
    }
    if (!list.length) continue;
    out.push({ ...a, submissions: list });
  }
  return out;
}

async function salva(body: Record<string, unknown>) {
  const sid = String(body.submission_id || "");
  const { data: sub, error } = await sb.from("submissions").select("id, assignment_id").eq("id", sid).single();
  if (error || !sub) throw new Error("consegna non trovata");
  if (body.automatica) {
    // l'attività automatica non sostituisce mai una correzione già fatta
    const { data: old } = await sb.from("corrections").select("id").eq("submission_id", sub.id).maybeSingle();
    if (old) return { ok: true, gia_corretta: true };
  }
  const path = `${sub.assignment_id}/${sub.id}.pdf`;
  const up = await sb.storage.from("correzioni").upload(path, b64ToBytes(String(body.pdf_base64 || "")), { contentType: "application/pdf", upsert: true });
  if (up.error) throw up.error;
  const row = {
    submission_id: sub.id, assignment_id: sub.assignment_id, file_path: path,
    grade: body.grade ? String(body.grade).slice(0, 40) : null,
    summary: body.summary ? String(body.summary).slice(0, 4000) : null,
    correct: Number(body.correct) || 0, wrong: Number(body.wrong) || 0, partial: Number(body.partial) || 0,
    reviewed: false, auto: !!body.automatica, updated_at: new Date().toISOString(),
  };
  const res = await sb.from("corrections").upsert(row, { onConflict: "submission_id" });
  if (res.error) throw res.error;
  return { ok: true, file_path: path };
}

async function salta(body: Record<string, unknown>) {
  const sid = String(body.submission_id || "");
  const { data: sub, error } = await sb.from("submissions").select("id, assignment_id").eq("id", sid).single();
  if (error || !sub) throw new Error("consegna non trovata");
  const reason = String(body.motivo || "").trim().slice(0, 500) || "Non correggibile in automatico.";
  const res = await sb.from("correction_skips").upsert(
    { submission_id: sub.id, assignment_id: sub.assignment_id, reason, retry: false, created_at: new Date().toISOString() },
    { onConflict: "submission_id" });
  if (res.error) throw res.error;
  return { ok: true };
}

async function scansioni() {
  const { data, error } = await sb.rpc("scan_inbox");
  if (error) throw error;
  const out = [];
  for (const sc of data || []) {
    const { data: signed } = await sb.storage.from("scansioni").createSignedUrl(sc.file_path, 1800);
    out.push({ ...sc, url: signed?.signedUrl || null });
  }
  return out;
}

async function dividi(body: Record<string, unknown>) {
  const scan = String(body.scan_id || ""), student = String(body.student_id || "");
  const { data: sc, error } = await sb.rpc("scan_inbox");
  if (error) throw error;
  const entry = (sc || []).find((x: { id: string }) => x.id === scan);
  if (!entry) throw new Error("scansione non trovata o già chiusa");
  const st = (entry.students || []).find((x: { id: string }) => x.id === student);
  if (!st) throw new Error("studente non in questa classe");
  const name = String(st.name).normalize("NFD").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "studente";
  const path = `${entry.class_id}/scansioni/${crypto.randomUUID()}-${name}.pdf`;
  const up = await sb.storage.from("consegne").upload(path, b64ToBytes(String(body.pdf_base64 || "")), { contentType: "application/pdf" });
  if (up.error) throw up.error;
  const { data: reg, error: e2 } = await sb.rpc("scan_register_student", { p_scan: scan, p_student: student, p_file_path: path, p_file_name: `${name}.pdf` });
  if (e2) throw e2;
  return { ok: true, ...reg };
}

async function scansioneFatta(body: Record<string, unknown>) {
  const { error } = await sb.rpc("scan_done", {
    p_scan: String(body.scan_id || ""), p_status: String(body.stato || "fatta"),
    p_note: body.nota ? String(body.nota) : null, p_students: body.studenti == null ? null : Number(body.studenti),
  });
  if (error) throw error;
  return { ok: true };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "usa POST" }, 405);
  if (!(await tokenOk(req))) return json({ error: "codice non valido" }, 401);
  try {
    const body = await req.json();
    if (body.op === "consegne") return json(await consegne(body));
    if (body.op === "salva") return json(await salva(body));
    if (body.op === "salta") return json(await salta(body));
    if (body.op === "scansioni") return json(await scansioni());
    if (body.op === "dividi") return json(await dividi(body));
    if (body.op === "scansione_fatta") return json(await scansioneFatta(body));
    return json({ error: "op sconosciuta" }, 400);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
