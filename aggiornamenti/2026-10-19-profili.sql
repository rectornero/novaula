-- Novaula · aggiornamento del 19/10/2026: profili degli studenti, PIN, voti, lavori di gruppo,
-- materiali personali e controlli di coerenza.
-- Gli studenti creano da soli il proprio profilo nella loro classe. Il PIN (4 cifre) è facoltativo
-- e protegge la parte privata (voti, consegne, materiali personali). I PIN sono salvati cifrati.
-- I voti proposti da Claude restano nascosti agli studenti finché il docente non li accetta o li cambia.
-- Si può eseguire più volte. Serve dopo setup.sql e 2026-10-19-correzioni.sql.

-- Profili ---------------------------------------------------------------------------------
create table if not exists students (
  id           uuid primary key default gen_random_uuid(),
  class_id     text not null references classes on delete cascade,
  first_name   text not null check (char_length(first_name) between 1 and 40),
  last_name    text not null check (char_length(last_name) between 1 and 40),
  name_key     text not null,
  pin_hash     text,
  failed_pins  int not null default 0,
  locked_until timestamptz,
  created_at   timestamptz not null default now(),
  last_seen    timestamptz
);
create unique index if not exists students_class_name on students (class_id, name_key);

-- Sessioni: il dispositivo riceve un codice casuale, qui ne resta solo l'hash.
-- Per chiudere una sessione la si fa scadere (expires_at = now()).
create table if not exists student_sessions (
  token_hash  text primary key,
  student_id  uuid not null references students on delete cascade,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default now() + interval '180 days'
);
create index if not exists student_sessions_student on student_sessions (student_id);

-- Compiti: tipo di lavoro e lavoro di gruppo ------------------------------------------------
alter table assignments add column if not exists kind text not null default 'compito';
alter table assignments add column if not exists group_work boolean not null default false;
do $$ begin
  alter table assignments add constraint assignments_kind check (kind in ('compito', 'classe', 'progetto', 'verifica'));
exception when duplicate_object then null; end $$;

-- Consegne: chi ha consegnato, tentativo, stato ("da rifare"), impronta del file e del dispositivo
alter table submissions add column if not exists student_id uuid references students on delete set null;
alter table submissions add column if not exists status text not null default 'consegnata';
alter table submissions add column if not exists attempt int not null default 1;
alter table submissions add column if not exists file_sha256 text;
alter table submissions add column if not exists device_hash text;
alter table submissions add column if not exists teacher_note text;
do $$ begin
  alter table submissions add constraint submissions_status check (status in ('consegnata', 'da_rifare'));
exception when duplicate_object then null; end $$;
create index if not exists submissions_student on submissions (student_id);

-- Tutti i membri di una consegna (uno solo, o tutto il gruppo)
create table if not exists submission_members (
  submission_id uuid not null references submissions on delete cascade,
  student_id    uuid not null references students on delete cascade,
  primary key (submission_id, student_id)
);
create index if not exists submission_members_student on submission_members (student_id);

-- Voti --------------------------------------------------------------------------------------
-- source: chi l'ha proposto (claude / docente). status: proposto = solo docente, confermato = visibile,
-- da_rifare = lavoro respinto, visibile allo studente, non fa media.
create table if not exists marks (
  id             uuid primary key default gen_random_uuid(),
  student_id     uuid not null references students on delete cascade,
  class_id       text not null references classes on delete cascade,
  category       text not null default 'compito' check (category in ('compito', 'classe', 'verifica', 'orale', 'progetto', 'altro')),
  title          text not null check (char_length(title) between 1 and 200),
  label          text check (char_length(label) <= 12),
  value          numeric(4,2) check (value between 0 and 10),
  proposed_label text check (char_length(proposed_label) <= 40),
  proposed_value numeric(4,2) check (proposed_value between 0 and 10),
  source         text not null default 'docente' check (source in ('claude', 'docente')),
  status         text not null default 'confermato' check (status in ('proposto', 'confermato', 'da_rifare')),
  note           text check (char_length(note) <= 2000),
  assignment_id  uuid references assignments on delete set null,
  submission_id  uuid references submissions on delete set null,
  test_id        uuid references tests on delete set null,
  mark_date      date not null default current_date,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists marks_student on marks (student_id, mark_date);
create index if not exists marks_class on marks (class_id);
create unique index if not exists marks_submission_student on marks (submission_id, student_id) where submission_id is not null;

-- Materiali inviati a uno studente ----------------------------------------------------------
create table if not exists student_materials (
  id          uuid primary key default gen_random_uuid(),
  student_id  uuid not null references students on delete cascade,
  title       text not null check (char_length(title) between 1 and 200),
  description text check (char_length(description) <= 2000),
  url         text check (char_length(url) <= 1000),
  file_path   text,
  file_name   text,
  created_at  timestamptz not null default now()
);
create index if not exists student_materials_student on student_materials (student_id);

-- Richieste di materiale da parte degli studenti
create table if not exists student_requests (
  id          uuid primary key default gen_random_uuid(),
  student_id  uuid not null references students on delete cascade,
  body        text not null check (char_length(body) between 3 and 600),
  done        boolean not null default false,
  created_at  timestamptz not null default now()
);

-- Sicurezza ---------------------------------------------------------------------------------
alter table students           enable row level security;
alter table student_sessions   enable row level security;
alter table submission_members enable row level security;
alter table marks              enable row level security;
alter table student_materials  enable row level security;
alter table student_requests   enable row level security;

-- Nessun accesso diretto per chi non è docente: gli studenti passano dalle funzioni qui sotto
revoke all on students, student_sessions, submission_members, marks, student_materials, student_requests from anon;
revoke all on student_sessions from authenticated;
grant select, update, delete on students to authenticated;
grant select, insert, update, delete on submission_members, marks, student_materials, student_requests to authenticated;
grant update on submissions to authenticated;

do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'students' and policyname = 'students teacher') then
    create policy "students teacher" on students for all using (current_user_is_teacher()) with check (current_user_is_teacher());
  end if;
  if not exists (select 1 from pg_policies where tablename = 'submission_members' and policyname = 'members teacher') then
    create policy "members teacher" on submission_members for all using (current_user_is_teacher()) with check (current_user_is_teacher());
  end if;
  if not exists (select 1 from pg_policies where tablename = 'marks' and policyname = 'marks teacher') then
    create policy "marks teacher" on marks for all using (current_user_is_teacher()) with check (current_user_is_teacher());
  end if;
  if not exists (select 1 from pg_policies where tablename = 'student_materials' and policyname = 'student materials teacher') then
    create policy "student materials teacher" on student_materials for all using (current_user_is_teacher()) with check (current_user_is_teacher());
  end if;
  if not exists (select 1 from pg_policies where tablename = 'student_requests' and policyname = 'student requests teacher') then
    create policy "student requests teacher" on student_requests for all using (current_user_is_teacher()) with check (current_user_is_teacher());
  end if;
  if not exists (select 1 from pg_policies where tablename = 'submissions' and policyname = 'submissions teacher update') then
    create policy "submissions teacher update" on submissions for update using (current_user_is_teacher()) with check (current_user_is_teacher());
  end if;
end $$;
-- Le consegne anonime (vecchio modulo) restano possibili, ma non a nome di un profilo
alter policy "submissions insert" on submissions with check (student_id is null and status = 'consegnata' and attempt = 1);

-- Funzioni di servizio (non chiamabili dal sito) ------------------------------------------------
create or replace function name_key(p_first text, p_last text) returns text
language sql immutable set search_path = public as $$
  select lower(regexp_replace(trim(p_first) || ' ' || trim(p_last), '\s+', ' ', 'g'));
$$;

-- "7+", "6½", "6,5", "8-" -> numero (7.25, 6.5, 6.5, 7.75)
create or replace function mark_value(p_label text) returns numeric
language plpgsql immutable set search_path = public as $$
declare m text[]; v numeric;
begin
  m := regexp_match(trim(coalesce(p_label, '')), '^(\d{1,2})(?:[.,](\d{1,2}))?\s*(\+|-|½|1/2|e mezzo)?');
  if m is null then return null; end if;
  v := m[1]::numeric + coalesce(('0.' || m[2])::numeric, 0);
  if m[3] = '+' then v := v + 0.25; elsif m[3] = '-' then v := v - 0.25; elsif m[3] is not null then v := v + 0.5; end if;
  if v < 0 or v > 10 then return null; end if;
  return v;
end $$;

create or replace function student_token_ok(p_student uuid, p_token text) returns boolean
language sql stable security definer set search_path = public, extensions as $$
  select exists (select 1 from student_sessions
    where student_id = p_student and token_hash = encode(digest(coalesce(p_token, ''), 'sha256'), 'hex') and expires_at > now());
$$;

create or replace function student_new_session(p_student uuid) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare t text := encode(gen_random_bytes(24), 'hex');
begin
  insert into student_sessions (token_hash, student_id) values (encode(digest(t, 'sha256'), 'hex'), p_student);
  update students set last_seen = now() where id = p_student;
  return t;
end $$;

-- Voto proposto da Claude: nasce dalla correzione, uno per ogni membro della consegna
create or replace function sync_claude_mark(p_submission uuid) returns void
language plpgsql security definer set search_path = public as $$
declare c record; s record;
begin
  select * into c from corrections where submission_id = p_submission;
  if not found then return; end if;
  select sub.id, a.id as aid, a.class_id, a.title, a.kind into s
    from submissions sub join assignments a on a.id = sub.assignment_id where sub.id = p_submission;
  insert into marks (student_id, class_id, category, title, proposed_label, proposed_value, source, status, assignment_id, submission_id, note)
  select m.student_id, s.class_id, case s.kind when 'verifica' then 'verifica' when 'classe' then 'classe' when 'progetto' then 'progetto' else 'compito' end,
         s.title, c.grade, mark_value(c.grade), 'claude', 'proposto', s.aid, s.id, null
  from submission_members m where m.submission_id = p_submission
  on conflict (submission_id, student_id) where submission_id is not null
  do update set proposed_label = excluded.proposed_label, proposed_value = excluded.proposed_value, updated_at = now();
end $$;

create or replace function corrections_to_marks() returns trigger
language plpgsql security definer set search_path = public as $$
begin perform sync_claude_mark(new.submission_id); return new; end $$;
create or replace trigger corrections_to_marks after insert or update of grade on corrections
  for each row execute function corrections_to_marks();

create or replace function members_to_marks() returns trigger
language plpgsql security definer set search_path = public as $$
begin perform sync_claude_mark(new.submission_id); return new; end $$;
create or replace trigger members_to_marks after insert on submission_members
  for each row execute function members_to_marks();

create or replace function marks_touch() returns trigger language plpgsql set search_path = public as $$
begin new.updated_at := now(); return new; end $$;
create or replace trigger marks_touch before update on marks for each row execute function marks_touch();

revoke all on function name_key(text, text), mark_value(text), student_token_ok(uuid, text), student_new_session(uuid),
  sync_claude_mark(uuid), corrections_to_marks(), members_to_marks(), marks_touch() from public, anon, authenticated;
grant execute on function mark_value(text), name_key(text, text) to authenticated;

-- Funzioni per gli studenti -------------------------------------------------------------------
-- Elenco dei profili di una classe (solo nome e se c'è un PIN)
create or replace function class_students(p_class text)
returns table (id uuid, first_name text, last_name text, has_pin boolean)
language sql stable security definer set search_path = public as $$
  select s.id, s.first_name, s.last_name, s.pin_hash is not null from students s
  where s.class_id = p_class order by lower(s.last_name), lower(s.first_name);
$$;

-- Crea il profilo e restituisce il codice per questo dispositivo
create or replace function student_create(p_class text, p_first text, p_last text, p_pin text default null)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare new_id uuid; k text := name_key(p_first, p_last);
begin
  if not exists (select 1 from classes where id = p_class) then raise exception 'Classe non trovata.'; end if;
  if char_length(trim(coalesce(p_first, ''))) < 2 or char_length(trim(coalesce(p_last, ''))) < 2 then
    raise exception 'Scrivi nome e cognome per intero.';
  end if;
  if p_pin is not null and p_pin !~ '^\d{4}$' then raise exception 'Il PIN deve avere 4 cifre.'; end if;
  if exists (select 1 from students where class_id = p_class and name_key = k) then
    raise exception 'Esiste già un profilo con questo nome: sceglilo dalla lista. Se non sei stato tu a crearlo, avvisa il docente.';
  end if;
  if (select count(*) from students where class_id = p_class) >= 60 then raise exception 'Troppi profili in questa classe: avvisa il docente.'; end if;
  if exists (select 1 from students where class_id = p_class and created_at > now() - interval '5 seconds') then
    raise exception 'Aspetta qualche secondo e riprova.';
  end if;
  insert into students (class_id, first_name, last_name, name_key, pin_hash)
  values (p_class, initcap(trim(p_first)), initcap(trim(p_last)), k, case when p_pin is null then null else crypt(p_pin, gen_salt('bf', 8)) end)
  returning id into new_id;
  return json_build_object('id', new_id, 'token', student_new_session(new_id));
end $$;

-- Entra nel profilo: senza PIN si entra subito; con il PIN, 5 errori bloccano per 10 minuti
create or replace function student_unlock(p_student uuid, p_pin text default null)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare s record;
begin
  select * into s from students where id = p_student;
  if not found then return json_build_object('error', 'Profilo non trovato.'); end if;
  if s.pin_hash is null then return json_build_object('token', student_new_session(s.id)); end if;
  if s.locked_until is not null and s.locked_until > now() then
    return json_build_object('error', 'Troppi tentativi. Riprova tra ' || ceil(extract(epoch from s.locked_until - now()) / 60) || ' minuti o chiedi al docente.');
  end if;
  if coalesce(p_pin, '') !~ '^\d{4}$' or crypt(p_pin, s.pin_hash) <> s.pin_hash then
    update students set failed_pins = failed_pins + 1,
      locked_until = case when failed_pins + 1 >= 5 then now() + interval '10 minutes' else null end
    where id = s.id;
    return json_build_object('error', case when s.failed_pins + 1 >= 5 then 'PIN errato. Profilo bloccato per 10 minuti.'
      else 'PIN errato. Tentativi rimasti: ' || (5 - s.failed_pins - 1) end);
  end if;
  update students set failed_pins = 0, locked_until = null where id = s.id;
  return json_build_object('token', student_new_session(s.id));
end $$;

-- Imposta, cambia o toglie il PIN (p_pin null = nessun PIN). Le altre sessioni vengono chiuse.
create or replace function student_set_pin(p_student uuid, p_token text, p_pin text)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  if not student_token_ok(p_student, p_token) then raise exception 'Sessione scaduta: rientra nel profilo.'; end if;
  if p_pin is not null and p_pin !~ '^\d{4}$' then raise exception 'Il PIN deve avere 4 cifre.'; end if;
  update students set pin_hash = case when p_pin is null then null else crypt(p_pin, gen_salt('bf', 8)) end,
    failed_pins = 0, locked_until = null where id = p_student;
  update student_sessions set expires_at = now()
    where student_id = p_student and expires_at > now() and token_hash <> encode(digest(p_token, 'sha256'), 'hex');
end $$;

create or replace function student_logout(p_student uuid, p_token text)
returns void language sql security definer set search_path = public, extensions as $$
  update student_sessions set expires_at = now()
  where student_id = p_student and token_hash = encode(digest(coalesce(p_token, ''), 'sha256'), 'hex');
$$;

-- Parte privata: voti visibili, consegne (anche quelle da rifare), materiali e richieste
create or replace function student_private(p_student uuid, p_token text)
returns json language plpgsql security definer set search_path = public as $$
declare r json;
begin
  if not student_token_ok(p_student, p_token) then raise exception 'Sessione scaduta: rientra nel profilo.'; end if;
  update students set last_seen = now() where id = p_student;
  select json_build_object(
    'student', (select json_build_object('id', s.id, 'class_id', s.class_id, 'first_name', s.first_name, 'last_name', s.last_name, 'has_pin', s.pin_hash is not null) from students s where s.id = p_student),
    'marks', coalesce((select json_agg(json_build_object('id', m.id, 'category', m.category, 'title', m.title, 'label', m.label, 'value', m.value,
        'status', m.status, 'note', m.note, 'mark_date', m.mark_date, 'assignment_id', m.assignment_id, 'submission_id', m.submission_id) order by m.mark_date desc, m.created_at desc)
      from marks m where m.student_id = p_student and m.status <> 'proposto'), '[]'),
    'submissions', coalesce((select json_agg(json_build_object('id', sub.id, 'assignment_id', sub.assignment_id, 'title', a.title, 'kind', a.kind,
        'created_at', sub.created_at, 'file_name', sub.file_name, 'note', sub.note, 'status', sub.status, 'attempt', sub.attempt,
        'teacher_note', sub.teacher_note,
        'members', (select json_agg(st.first_name || ' ' || st.last_name order by st.last_name) from submission_members mm join students st on st.id = mm.student_id where mm.submission_id = sub.id)
      ) order by sub.created_at desc)
      from submissions sub join assignments a on a.id = sub.assignment_id
      where exists (select 1 from submission_members mm where mm.submission_id = sub.id and mm.student_id = p_student)), '[]'),
    'materials', coalesce((select json_agg(json_build_object('id', x.id, 'title', x.title, 'description', x.description, 'url', x.url,
        'file_path', x.file_path, 'file_name', x.file_name, 'created_at', x.created_at) order by x.created_at desc)
      from student_materials x where x.student_id = p_student), '[]'),
    'requests', coalesce((select json_agg(json_build_object('id', q.id, 'body', q.body, 'done', q.done, 'created_at', q.created_at) order by q.created_at desc)
      from student_requests q where q.student_id = p_student), '[]')
  ) into r;
  return r;
end $$;

-- Consegna a nome del profilo (e del gruppo, se il compito lo prevede). Il file è già nel bucket "consegne".
create or replace function student_submit(p_student uuid, p_token text, p_assignment uuid, p_note text,
  p_file_path text, p_file_name text, p_sha text, p_device text, p_members uuid[] default '{}')
returns uuid language plpgsql security definer set search_path = public as $$
declare st record; a record; new_id uuid; n int; names text; mid uuid;
begin
  if not student_token_ok(p_student, p_token) then raise exception 'Sessione scaduta: rientra nel profilo.'; end if;
  select * into st from students where id = p_student;
  select * into a from assignments where id = p_assignment;
  if not found or a.class_id <> st.class_id then raise exception 'Compito non trovato.'; end if;
  if a.topic_id is not null and not exists (select 1 from topics t where t.id = a.topic_id and t.done) then raise exception 'Compito non ancora disponibile.'; end if;
  if p_file_path is null and char_length(trim(coalesce(p_note, ''))) = 0 then raise exception 'Allega un file oppure scrivi una nota.'; end if;
  if p_file_path is not null and p_file_path !~ ('^' || a.class_id || '/' || a.id || '/[A-Za-z0-9._-]+$') then raise exception 'File non valido.'; end if;
  if exists (select 1 from submissions where student_id = p_student and assignment_id = p_assignment and created_at > now() - interval '20 seconds') then
    raise exception 'Hai appena consegnato: aspetta qualche secondo.';
  end if;
  p_members := array(select distinct x from unnest(coalesce(p_members, '{}') || p_student) x);
  if not a.group_work and array_length(p_members, 1) > 1 then raise exception 'Questo compito è individuale.'; end if;
  if array_length(p_members, 1) > 8 then raise exception 'Al massimo 8 persone per gruppo.'; end if;
  if exists (select 1 from unnest(p_members) x where not exists (select 1 from students s where s.id = x and s.class_id = a.class_id)) then
    raise exception 'Un compagno del gruppo non è in questa classe.';
  end if;
  -- tentativo: 1 + consegne precedenti di questo studente per questo compito
  select count(*) into n from submissions sub join submission_members mm on mm.submission_id = sub.id
    where sub.assignment_id = p_assignment and mm.student_id = p_student;
  select string_agg(s.first_name || ' ' || s.last_name, ', ' order by s.id = p_student desc, s.last_name) into names
    from students s where s.id = any (p_members);
  insert into submissions (assignment_id, student_name, note, file_path, file_name, student_id, attempt, file_sha256, device_hash)
  values (p_assignment, left(names, 80), nullif(trim(coalesce(p_note, '')), ''), p_file_path, p_file_name, p_student, n + 1,
          nullif(left(coalesce(p_sha, ''), 64), ''), nullif(left(coalesce(p_device, ''), 64), ''))
  returning id into new_id;
  foreach mid in array p_members loop
    insert into submission_members values (new_id, mid);
  end loop;
  return new_id;
end $$;

create or replace function student_request(p_student uuid, p_token text, p_body text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not student_token_ok(p_student, p_token) then raise exception 'Sessione scaduta: rientra nel profilo.'; end if;
  if (select count(*) from student_requests where student_id = p_student and not done) >= 5 then
    raise exception 'Hai già 5 richieste aperte.';
  end if;
  insert into student_requests (student_id, body) values (p_student, trim(p_body));
end $$;

-- Il docente azzera il PIN dimenticato (chiude anche tutte le sessioni)
create or replace function teacher_reset_pin(p_student uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not current_user_is_teacher() then raise exception 'Solo il docente.'; end if;
  update students set pin_hash = null, failed_pins = 0, locked_until = null where id = p_student;
  update student_sessions set expires_at = now() where student_id = p_student and expires_at > now();
end $$;

revoke all on function class_students(text), student_create(text, text, text, text), student_unlock(uuid, text),
  student_set_pin(uuid, text, text), student_logout(uuid, text), student_private(uuid, text),
  student_submit(uuid, text, uuid, text, text, text, text, text, uuid[]), student_request(uuid, text, text),
  teacher_reset_pin(uuid) from public, anon, authenticated;
grant execute on function class_students(text), student_create(text, text, text, text), student_unlock(uuid, text),
  student_set_pin(uuid, text, text), student_logout(uuid, text), student_private(uuid, text),
  student_submit(uuid, text, uuid, text, text, text, text, text, uuid[]), student_request(uuid, text, text)
  to anon, authenticated;
grant execute on function teacher_reset_pin(uuid) to authenticated;

-- File personali: bucket pubblico in lettura ma con percorsi casuali e senza elenco; scrive solo il docente
insert into storage.buckets (id, name, public, file_size_limit)
values ('personali', 'personali', true, 52428800)
on conflict (id) do nothing;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'personali teacher write') then
    create policy "personali teacher write" on storage.objects for insert with check (bucket_id = 'personali' and current_user_is_teacher());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'personali teacher remove') then
    create policy "personali teacher remove" on storage.objects for delete using (bucket_id = 'personali' and current_user_is_teacher());
  end if;
end $$;
