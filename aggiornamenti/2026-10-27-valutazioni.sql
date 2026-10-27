-- Novaula 2.18.0: piano delle valutazioni (Area docente → Piano valutazioni).
-- Solo aggiunte e "create or replace": nessuna tabella nuova, nessuna riga cancellata, nessun job pianificato.
--   * Obiettivi per periodo nella riga grade_settings con scope 'piano' (colonna weights):
--     {"min_marks": 3, "min_verifica": 1, "min_orale": 1}. Senza riga valgono questi numeri.
--   * teacher_add_students(classe, righe): il docente inserisce l'elenco della classe in un colpo solo.
--   * evaluation_plan(classe, giorno): stato delle valutazioni nel periodo in corso (per il riepilogo del venerdì).
--   * weekly_summary_data: stessa funzione di prima con in più la chiave 'evaluation' per ogni classe.
--   * Stampa: bucket privato 'stampe' per il PDF da mandare alla cartoleria (link firmato di 7 giorni).
--   * Scansioni: bucket privato 'scansioni' + tabella test_scans (posta in arrivo delle verifiche scansionate).
--     Su richiesta, Claude divide ogni scansione per studente (strumenti/correggi.py scansioni / dividi):
--     ogni copia diventa una consegna di un compito nascosto legato alla verifica (assignments.test_id)
--     e passa dalla correzione normale; il voto proposto resta nascosto finché il docente non lo accetta.
-- Si può eseguire più volte.

-- Giorni senza lezione noti a livello nazionale (Pasqua esclusa): festività e vacanze di Natale
create or replace function public.school_holiday(d date) returns boolean
language sql immutable set search_path = public as $$
  select to_char(d, 'MM-DD') in ('11-01', '12-08', '04-25', '05-01', '06-02')
      or to_char(d, 'MM-DD') >= '12-23' or to_char(d, 'MM-DD') <= '01-06'
      or extract(isodow from d) > 5;
$$;

-- Elenco della classe inserito dal docente: [{"first": "Mario", "last": "Rossi"}, …]. Salta chi c'è già.
create or replace function public.teacher_add_students(p_class text, p_rows jsonb)
returns json language plpgsql security definer set search_path = public as $$
declare r jsonb; f text; l text; k text; added int := 0; skipped int := 0;
begin
  if not public.current_user_is_teacher() then raise exception 'Solo il docente può inserire l''elenco della classe.'; end if;
  if not exists (select 1 from classes where id = p_class) then raise exception 'Classe non trovata.'; end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 60 then raise exception 'Elenco non valido (massimo 60 nomi).'; end if;
  for r in select * from jsonb_array_elements(p_rows) loop
    f := left(trim(coalesce(r->>'first', '')), 40); l := left(trim(coalesce(r->>'last', '')), 40);
    if char_length(f) < 2 or char_length(l) < 2 then skipped := skipped + 1; continue; end if;
    k := name_key(f, l);
    if exists (select 1 from students where class_id = p_class and name_key = k) then skipped := skipped + 1; continue; end if;
    if (select count(*) from students where class_id = p_class) >= 60 then skipped := skipped + 1; continue; end if;
    insert into students (class_id, first_name, last_name, name_key) values (p_class, initcap(f), initcap(l), k);
    added := added + 1;
  end loop;
  return json_build_object('added', added, 'skipped', skipped);
end $$;
revoke all on function public.teacher_add_students(text, jsonb) from public, anon;
grant execute on function public.teacher_add_students(text, jsonb) to authenticated;

-- Stato delle valutazioni di una classe nel periodo (trimestre/pentamestre) che contiene p_today
create or replace function public.evaluation_plan(p_class text, p_today date default (now() at time zone 'Europe/Rome')::date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  y int := case when extract(month from p_today) >= 9 then extract(year from p_today)::int else extract(year from p_today)::int - 1 end;
  terms jsonb := coalesce((select nullif(g.terms, '[]'::jsonb) from grade_settings g where g.scope = 'tutte'),
    '[{"name":"Trimestre","from":"09-01","to":"12-31"},{"name":"Pentamestre","from":"01-01","to":"06-30"}]'::jsonb);
  tgt jsonb := coalesce((select g.weights from grade_settings g where g.scope = 'piano'), '{}'::jsonb);
  min_all int := coalesce((tgt->>'min_marks')::int, 3);
  min_ver int := coalesce((tgt->>'min_verifica')::int, 1);
  min_ora int := coalesce((tgt->>'min_orale')::int, 1);
  t jsonb; t_name text; t_from date; t_to date; d1 date; d2 date;
begin
  for t in select * from jsonb_array_elements(terms) loop
    d1 := ((case when left(t->>'from', 2)::int >= 9 then y else y + 1 end)::text || '-' || (t->>'from'))::date;
    d2 := ((case when left(t->>'to', 2)::int >= 9 then y else y + 1 end)::text || '-' || (t->>'to'))::date;
    if p_today between d1 and d2 then t_name := t->>'name'; t_from := d1; t_to := d2; exit; end if;
  end loop;
  if t_name is null then return jsonb_build_object('term', null); end if;
  return jsonb_build_object(
    'term', t_name, 'term_end', t_to,
    'targets', jsonb_build_object('marks', min_all, 'verifica', min_ver, 'orale', min_ora),
    'lessons_left', (select count(*) from generate_series(p_today, t_to, interval '1 day') g(d)
                     join timetable tt on tt.class_id = p_class and tt.weekday = extract(isodow from g.d)
                     where not school_holiday(g.d::date)),
    'profiles', (select count(*) from students s where s.class_id = p_class),
    'behind', (select coalesce(jsonb_agg(jsonb_build_object('name', x.first_name || ' ' || x.last_name,
                 'marks', x.n_all, 'verifica', x.n_ver, 'orale', x.n_ora) order by x.n_all, x.last_name, x.first_name), '[]'::jsonb)
               from (select s.first_name, s.last_name,
                       count(m.id) as n_all,
                       count(m.id) filter (where m.category = 'verifica') as n_ver,
                       count(m.id) filter (where m.category = 'orale') as n_ora
                     from students s
                     left join marks m on m.student_id = s.id and m.status = 'confermato' and m.value is not null
                       and m.mark_date between t_from and t_to
                     where s.class_id = p_class
                     group by s.id, s.first_name, s.last_name) x
               where x.n_all < min_all or x.n_ver < min_ver or x.n_ora < min_ora),
    'tests_in_term', (select count(*) from tests ts where ts.class_id = p_class and ts.test_date between t_from and t_to),
    'tests_to_mark', (select coalesce(jsonb_agg(jsonb_build_object('title', ts.title, 'date', ts.test_date) order by ts.test_date), '[]'::jsonb)
                      from tests ts where ts.class_id = p_class and ts.test_date >= make_date(y, 9, 1) and ts.test_date < p_today
                        and exists (select 1 from students s where s.class_id = p_class)
                        and not exists (select 1 from marks m where m.test_id = ts.id)),
    'tests_next_2_weeks', (select coalesce(jsonb_agg(jsonb_build_object('title', ts.title, 'date', ts.test_date) order by ts.test_date), '[]'::jsonb)
                           from tests ts where ts.class_id = p_class and ts.test_date between p_today and p_today + 14)
  );
end $$;
revoke all on function public.school_holiday(date), public.evaluation_plan(text, date) from public, anon, authenticated;

-- Riepilogo del venerdì: come prima, più 'evaluation' per ogni classe
create or replace function public.weekly_summary_data(p_today date default (now() at time zone 'Europe/Rome')::date)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with
  win as (
    select p_today as today,
           p_today - 7 as week_start,
           (p_today + (8 - extract(isodow from p_today)::int)) as next_mon,
           (p_today + (14 - extract(isodow from p_today)::int)) as next_sun
  ),
  subm as (
    select s.id as sub, s.assignment_id, s.student_id from submissions s where s.student_id is not null
    union
    select m.submission_id, s.assignment_id, m.student_id from submission_members m join submissions s on s.id = m.submission_id
  ),
  handed as (select distinct assignment_id, student_id from subm),
  pairs as (
    select a.id, b.id as other_id, a.assignment_id,
           case when a.file_sha256 is not null and a.file_sha256 = b.file_sha256 then 'same_file' else 'same_device' end as kind
    from submissions a
    join submissions b on a.id < b.id
      and ((a.file_sha256 is not null and a.file_sha256 = b.file_sha256)
        or (a.device_hash is not null and a.device_hash = b.device_hash and a.assignment_id = b.assignment_id))
      and not exists (select 1 from subm x join subm y on y.student_id = x.student_id where x.sub = a.id and y.sub = b.id)
      and not (a.student_id is null and b.student_id is null and lower(a.student_name) = lower(b.student_name))
    where greatest(a.created_at, b.created_at) >= (select week_start from win)::timestamptz
  ),
  per_class as (
    select c.id, c.name, c.sort,
      (select coalesce(jsonb_agg(jsonb_build_object('author', t.author, 'body', left(t.body, 200), 'tag', t.tag,
                'status', t.status, 'stuck', t.stuck, 'metoo', t.metoo, 'since', t.created_at) order by t.created_at), '[]')
         from helpdesk t where t.class_id = c.id and t.status <> 'risolta') as helpdesk_open,
      (select count(*) from slide_questions q where q.class_id = c.id and q.answer is null) as slide_questions_open,
      (select coalesce(jsonb_agg(jsonb_build_object('title', a.title, 'due', a.due_date, 'kind', a.kind,
                'received', (select count(*) from submissions s where s.assignment_id = a.id),
                'profiles', (select count(*) from students st where st.class_id = c.id),
                'missing', (select coalesce(jsonb_agg(st.first_name || ' ' || st.last_name order by st.last_name, st.first_name), '[]')
                              from students st where st.class_id = c.id
                              and not exists (select 1 from handed hd where hd.assignment_id = a.id and hd.student_id = st.id)))
              order by a.due_date), '[]')
         from assignments a, win
         where a.class_id = c.id and a.kind in ('compito', 'progetto')
           and a.due_date >= win.week_start and a.due_date < win.today) as missing,
      (select coalesce(jsonb_agg(jsonb_build_object('kind', p.kind, 'title', a.title,
                'students', (select jsonb_agg(distinct x) from (
                   select coalesce(st.first_name || ' ' || st.last_name, s.student_name) as x
                   from submissions s left join students st on st.id = s.student_id
                   where s.id in (p.id, p.other_id)) n))), '[]')
         from pairs p join assignments a on a.id = p.assignment_id
         where a.class_id = c.id) as flags,
      (select count(*) from submissions s join assignments a on a.id = s.assignment_id, win
         where a.class_id = c.id and a.due_date is not null
           and s.created_at >= win.week_start::timestamptz
           and (s.created_at at time zone 'Europe/Rome')::date > a.due_date) as late,
      (select count(*) from marks m where m.class_id = c.id and m.status = 'proposto') as marks_to_review,
      (select count(*) from marks m where m.class_id = c.id and m.status = 'da_rifare') as redo,
      (select coalesce(jsonb_agg(jsonb_build_object('title', a.title, 'due', coalesce(a.due_date, a.planned_due),
                'kind', a.kind, 'group', a.group_work, 'planned', a.due_date is null)
              order by coalesce(a.due_date, a.planned_due)), '[]')
         from assignments a, win
         where a.class_id = c.id
           and coalesce(a.due_date, a.planned_due) between win.next_mon and win.next_sun) as due_next_week,
      (select coalesce(jsonb_agg(jsonb_build_object('title', t.title, 'date', t.test_date) order by t.test_date), '[]')
         from tests t, win
         where t.class_id = c.id and t.test_date between win.next_mon and win.next_sun) as tests_next_week,
      public.evaluation_plan(c.id, p_today) as evaluation
    from classes c
  )
  select jsonb_build_object(
    'today', w.today, 'week_start', w.week_start, 'next_mon', w.next_mon, 'next_sun', w.next_sun,
    'classes', (select jsonb_agg(to_jsonb(pc) - 'sort' order by pc.sort, pc.id) from per_class pc))
  from win w;
$$;


-- Stampa e scansioni ---------------------------------------------------------------------------
alter table assignments add column if not exists test_id uuid references tests on delete set null;
create index if not exists assignments_test on assignments (test_id) where test_id is not null;

create table if not exists test_scans (
  id          uuid primary key default gen_random_uuid(),
  test_id     uuid not null references tests on delete cascade,
  class_id    text not null references classes on delete cascade,
  file_path   text not null check (char_length(file_path) <= 300),
  file_name   text check (char_length(file_name) <= 200),
  status      text not null default 'nuova' check (status in ('nuova', 'fatta', 'errore')),
  note        text check (char_length(note) <= 2000),
  students    int not null default 0,
  created_at  timestamptz not null default now(),
  done_at     timestamptz
);
create index if not exists test_scans_status on test_scans (status, created_at);
alter table test_scans enable row level security;
revoke all on test_scans from anon;
grant select, insert, update on test_scans to authenticated;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'test_scans' and policyname = 'test_scans teacher') then
    create policy "test_scans teacher" on test_scans for all using (current_user_is_teacher()) with check (current_user_is_teacher());
  end if;
end $$;

insert into storage.buckets (id, name, public, file_size_limit) values ('scansioni', 'scansioni', false, 104857600) on conflict (id) do nothing;
insert into storage.buckets (id, name, public, file_size_limit) values ('stampe', 'stampe', false, 52428800) on conflict (id) do nothing;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'scansioni teacher read') then
    create policy "scansioni teacher read" on storage.objects for select using (bucket_id = 'scansioni' and current_user_is_teacher());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'scansioni teacher write') then
    create policy "scansioni teacher write" on storage.objects for insert with check (bucket_id = 'scansioni' and current_user_is_teacher());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'stampe teacher read') then
    create policy "stampe teacher read" on storage.objects for select using (bucket_id = 'stampe' and current_user_is_teacher());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'stampe teacher write') then
    create policy "stampe teacher write" on storage.objects for insert with check (bucket_id = 'stampe' and current_user_is_teacher());
  end if;
end $$;

-- Funzioni per la funzione Edge "correzioni" (ruolo service_role, mai dal sito)
-- Posta in arrivo: scansioni nuove con la verifica e l'elenco della classe
create or replace function public.scan_inbox()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', sc.id, 'file_path', sc.file_path, 'file_name', sc.file_name, 'created_at', sc.created_at,
    'class_id', sc.class_id, 'class_name', c.name,
    'test', jsonb_build_object('id', t.id, 'title', t.title, 'description', t.description, 'date', t.test_date,
                               'test_url', f.test_url, 'solutions_url', f.solutions_url),
    'students', (select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'name', s.last_name || ' ' || s.first_name)
                   order by lower(s.last_name), lower(s.first_name)), '[]'::jsonb) from students s where s.class_id = sc.class_id))
    order by sc.created_at), '[]'::jsonb)
  from test_scans sc join tests t on t.id = sc.test_id join classes c on c.id = sc.class_id
  left join test_files f on f.test_id = t.id
  where sc.status = 'nuova';
$$;

-- Compito nascosto legato alla verifica (uno per verifica): raccoglie le copie scansionate da correggere
create or replace function public.scan_assignment(p_test uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare t record; aid uuid;
begin
  select * into t from tests where id = p_test;
  if not found then raise exception 'verifica non trovata'; end if;
  select id into aid from assignments where test_id = p_test order by created_at limit 1;
  if aid is null then
    insert into assignments (class_id, title, description, kind, group_work, auto_correct, test_id)
    values (t.class_id, t.title, coalesce(t.description, '') || ' (copie scansionate della verifica del ' || to_char(t.test_date, 'DD/MM/YYYY') || ')',
            'verifica', false, true, p_test)
    returning id into aid;
  end if;
  return aid;
end $$;

-- Una copia di uno studente, già caricata nel bucket consegne, diventa una consegna da correggere
create or replace function public.scan_register_student(p_scan uuid, p_student uuid, p_file_path text, p_file_name text)
returns json language plpgsql security definer set search_path = public as $$
declare sc record; st record; aid uuid; sid uuid;
begin
  select * into sc from test_scans where id = p_scan;
  if not found then raise exception 'scansione non trovata'; end if;
  select * into st from students where id = p_student and class_id = sc.class_id;
  if not found then raise exception 'studente non in questa classe'; end if;
  aid := scan_assignment(sc.test_id);
  select s.id into sid from submissions s where s.assignment_id = aid and s.student_id = p_student limit 1;
  if sid is not null then
    -- di nuovo la stessa copia (per esempio una seconda scansione più leggibile): si aggiorna il file
    update submissions set file_path = p_file_path, file_name = p_file_name where id = sid;
    return json_build_object('submission_id', sid, 'assignment_id', aid, 'gia_presente', true);
  end if;
  insert into submissions (assignment_id, student_name, note, file_path, file_name, student_id, attempt)
  values (aid, left(st.first_name || ' ' || st.last_name, 80), 'Verifica scansionata', p_file_path, p_file_name, p_student, 1)
  returning id into sid;
  insert into submission_members values (sid, p_student);
  return json_build_object('submission_id', sid, 'assignment_id', aid, 'gia_presente', false);
end $$;

create or replace function public.scan_done(p_scan uuid, p_status text, p_note text, p_students int)
returns void language sql security definer set search_path = public as $$
  update test_scans set status = case when p_status in ('fatta', 'errore', 'nuova') then p_status else 'fatta' end,
    note = left(p_note, 2000), students = coalesce(p_students, students), done_at = now()
  where id = p_scan;
$$;

revoke all on function public.scan_inbox(), public.scan_assignment(uuid), public.scan_register_student(uuid, uuid, text, text),
  public.scan_done(uuid, text, text, int) from public, anon, authenticated;
grant execute on function public.scan_inbox(), public.scan_assignment(uuid), public.scan_register_student(uuid, uuid, text, text),
  public.scan_done(uuid, text, text, int) to service_role;

-- I voti proposti da Claude per una verifica scansionata portano la verifica e la sua data
create or replace function public.sync_claude_mark(p_submission uuid) returns void
language plpgsql security definer set search_path = public as $$
declare c record; s record;
begin
  select * into c from corrections where submission_id = p_submission;
  if not found then return; end if;
  select sub.id, a.id as aid, a.class_id, a.title, a.kind, a.test_id, t.test_date into s
    from submissions sub join assignments a on a.id = sub.assignment_id left join tests t on t.id = a.test_id
    where sub.id = p_submission;
  insert into marks (student_id, class_id, category, title, proposed_label, proposed_value, source, status, assignment_id, submission_id, note, test_id, mark_date)
  select m.student_id, s.class_id, case s.kind when 'verifica' then 'verifica' when 'classe' then 'classe' when 'progetto' then 'progetto' else 'compito' end,
         s.title, c.grade, mark_value(c.grade), 'claude', 'proposto', s.aid, s.id, null, s.test_id, coalesce(s.test_date, current_date)
  from submission_members m where m.submission_id = p_submission
  on conflict (submission_id, student_id) where submission_id is not null
  do update set proposed_label = excluded.proposed_label, proposed_value = excluded.proposed_value, updated_at = now();
end $$;

-- Il piano legge l'orario (le righe restano visibili solo al docente per la regola "timetable teacher")
grant select on timetable to authenticated;
