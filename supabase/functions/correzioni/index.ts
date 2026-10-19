// Novaula · funzione Edge "correzioni"
// Ponte tra la sessione Claude che corregge e lo storage privato delle consegne.
// Ogni richiesta deve portare l'header x-novaula-token uguale a private_settings.marking_token.
//   POST {op:"consegne", assignment_id?, classe?, compito?}  -> compiti con consegne e link firmati
//   POST {op:"salva", submission_id, pdf_base64, grade?, summary?, correct?, wrong?, partial?}
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
  let q = sb.from("assignments").select("id, class_id, title, description, pdf_url, due_date").order("created_at");
  if (body.assignment_id) q = q.eq("id", body.assignment_id);
  if (body.classe) q = q.eq("class_id", body.classe.toLowerCase());
  if (body.compito) q = q.ilike("title", "%" + body.compito + "%");
  const { data: assignments, error } = await q;
  if (error) throw error;
  const out = [];
  for (const a of assignments || []) {
    const { data: subs, error: e2 } = await sb.from("submissions").select("id, student_name, note, file_path, file_name, created_at").eq("assignment_id", a.id).order("created_at");
    if (e2) throw e2;
    if (!subs || !subs.length) continue;
    const { data: done } = await sb.from("corrections").select("submission_id, updated_at").eq("assignment_id", a.id);
    const corrected = new Map((done || []).map((c) => [c.submission_id, c.updated_at]));
    const list = [];
    for (const s of subs) {
      let url = null;
      if (s.file_path) {
        const { data: signed } = await sb.storage.from("consegne").createSignedUrl(s.file_path, 900);
        url = signed?.signedUrl || null;
      }
      list.push({ ...s, url, corrected_at: corrected.get(s.id) || null });
    }
    out.push({ ...a, submissions: list });
  }
  return out;
}

async function salva(body: Record<string, unknown>) {
  const sid = String(body.submission_id || "");
  const { data: sub, error } = await sb.from("submissions").select("id, assignment_id").eq("id", sid).single();
  if (error || !sub) throw new Error("consegna non trovata");
  const path = `${sub.assignment_id}/${sub.id}.pdf`;
  const up = await sb.storage.from("correzioni").upload(path, b64ToBytes(String(body.pdf_base64 || "")), { contentType: "application/pdf", upsert: true });
  if (up.error) throw up.error;
  const row = {
    submission_id: sub.id, assignment_id: sub.assignment_id, file_path: path,
    grade: body.grade ? String(body.grade).slice(0, 40) : null,
    summary: body.summary ? String(body.summary).slice(0, 4000) : null,
    correct: Number(body.correct) || 0, wrong: Number(body.wrong) || 0, partial: Number(body.partial) || 0,
    reviewed: false, updated_at: new Date().toISOString(),
  };
  const res = await sb.from("corrections").upsert(row, { onConflict: "submission_id" });
  if (res.error) throw res.error;
  return { ok: true, file_path: path };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "usa POST" }, 405);
  if (!(await tokenOk(req))) return json({ error: "codice non valido" }, 401);
  try {
    const body = await req.json();
    if (body.op === "consegne") return json(await consegne(body));
    if (body.op === "salva") return json(await salva(body));
    return json({ error: "op sconosciuta" }, 400);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
