-- Novaula 2.x: riepilogo settimanale (weekly summary) per il docente.
-- Solo aggiunte: due funzioni, nessuna tabella nuova.
--   weekly_summary_data(giorno)  -> jsonb, NON richiamabile dal sito (solo connettore/ruolo postgres)
--   teacher_weekly_summary(giorno) -> stessa cosa, solo per il docente loggato (Area docente)
-- Finestra: "settimana" = i 7 giorni prima di p_today; "prossima settimana" = lunedì-domenica successivi.

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
  -- chi ha consegnato cosa (consegna diretta o come membro di un gruppo)
  subm as (
    select s.id as sub, s.assignment_id, s.student_id from submissions s where s.student_id is not null
    union
    select m.submission_id, s.assignment_id, m.student_id from submission_members m join submissions s on s.id = m.submission_id
  ),
  handed as (select distinct assignment_id, student_id from subm),
  -- coppie di consegne di studenti diversi con file identico o stesso dispositivo sullo stesso compito
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
      -- domande aperte in Aiuto
      (select coalesce(jsonb_agg(jsonb_build_object('author', t.author, 'body', left(t.body, 200), 'tag', t.tag,
                'status', t.status, 'stuck', t.stuck, 'metoo', t.metoo, 'since', t.created_at) order by t.created_at), '[]')
         from helpdesk t where t.class_id = c.id and t.status <> 'risolta') as helpdesk_open,
      -- domande sulle slide senza risposta
      (select count(*) from slide_questions q where q.class_id = c.id and q.answer is null) as slide_questions_open,
      -- consegne mancanti per i compiti scaduti negli ultimi 7 giorni
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
      -- segnalazioni di coerenza
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
      -- compiti e verifiche della prossima settimana
      (select coalesce(jsonb_agg(jsonb_build_object('title', a.title, 'due', coalesce(a.due_date, a.planned_due),
                'kind', a.kind, 'group', a.group_work, 'planned', a.due_date is null)
              order by coalesce(a.due_date, a.planned_due)), '[]')
         from assignments a, win
         where a.class_id = c.id
           and coalesce(a.due_date, a.planned_due) between win.next_mon and win.next_sun) as due_next_week,
      (select coalesce(jsonb_agg(jsonb_build_object('title', t.title, 'date', t.test_date) order by t.test_date), '[]')
         from tests t, win
         where t.class_id = c.id and t.test_date between win.next_mon and win.next_sun) as tests_next_week
    from classes c
  )
  select jsonb_build_object(
    'today', w.today, 'week_start', w.week_start, 'next_mon', w.next_mon, 'next_sun', w.next_sun,
    'classes', (select jsonb_agg(to_jsonb(pc) - 'sort' order by pc.sort, pc.id) from per_class pc))
  from win w;
$$;

revoke all on function public.weekly_summary_data(date) from public, anon, authenticated;

create or replace function public.teacher_weekly_summary(p_today date default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.current_user_is_teacher() then
    raise exception 'Solo il docente';
  end if;
  return public.weekly_summary_data(coalesce(p_today, (now() at time zone 'Europe/Rome')::date));
end;
$$;

revoke all on function public.teacher_weekly_summary(date) from public, anon;
grant execute on function public.teacher_weekly_summary(date) to authenticated;
