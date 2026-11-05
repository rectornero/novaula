-- Novaula 3.0.0 · «Senza dati personali» (parte Systems: solo aggiunte e create or replace, nessun drop)
-- Va eseguito PRIMA della release e PRIMA di 2026-11-05-senza-dati-personali.sql (World Build), che poi cancella
-- tabelle e funzioni degli studenti. Si può eseguire più volte.
-- 1. Sportello (helpdesk), risposte, chat e domande sulle slide diventano anonimi: qualunque cosa mandi il browser,
--    il database salva «Studente» (o «Docente») e nessuna immagine.
-- 2. helpdesk_ask senza nome e senza immagine: i limiti (15 secondi, 5 domande aperte) valgono per dispositivo
--    (la chiave che il browser tiene per ritirare le proprie domande), non più per nome.
--    La vecchia versione a 8 argomenti la cancella World Build.
-- 3. anon_cleanup(): chat, sportello e risposte più vecchi di 7 giorni si cancellano quando il docente apre
--    l'Area docente o una chat. Nessun cron.
-- 4. evaluation_plan, weekly_summary_data (e quindi teacher_weekly_summary) senza studenti, voti o consegne:
--    solo conteggi, compiti e verifiche.

-- 1. Nomi fissi
create or replace function anon_helpdesk() returns trigger
language plpgsql as $$
begin
  new.author := 'Studente';
  new.image_path := null;
  return new;
end $$;
create or replace trigger anon_helpdesk before insert or update of author, image_path on helpdesk for each row execute function anon_helpdesk();

create or replace function anon_author() returns trigger
language plpgsql as $$
begin
  new.author := case when new.is_teacher then 'Docente' else 'Studente' end;
  return new;
end $$;
create or replace trigger anon_helpdesk_replies before insert or update of author on helpdesk_replies for each row execute function anon_author();
create or replace trigger anon_messages before insert or update of author on messages for each row execute function anon_author();

create or replace function anon_slide_questions() returns trigger
language plpgsql as $$
begin
  new.name := 'Studente';
  return new;
end $$;
create or replace trigger anon_slide_questions before insert or update of name on slide_questions for each row execute function anon_slide_questions();

-- 2. Sportello senza nome
create or replace function helpdesk_ask(p_class text, p_body text, p_tag text, p_stuck boolean, p_seat text, p_key text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare new_id uuid; k text;
begin
  if char_length(coalesce(p_key, '')) < 16 then raise exception 'chiave non valida'; end if;
  k := md5(p_key);
  if exists (select 1 from helpdesk t join helpdesk_keys hk on hk.ticket_id = t.id
             where hk.key_hash = k and t.created_at > now() - interval '15 seconds') then
    raise exception 'Aspetta qualche secondo prima di fare un''altra domanda.';
  end if;
  if (select count(*) from helpdesk t join helpdesk_keys hk on hk.ticket_id = t.id
      where hk.key_hash = k and t.status <> 'risolta') >= 5 then
    raise exception 'Hai già 5 domande aperte: segna come risolte quelle che non ti servono più.';
  end if;
  insert into helpdesk (class_id, author, body, tag, stuck, seat, image_path)
  values (p_class, 'Studente', trim(p_body), coalesce(p_tag, 'altro'), coalesce(p_stuck, false), nullif(trim(coalesce(p_seat, '')), ''), null)
  returning id into new_id;
  insert into helpdesk_keys values (new_id, k);
  return new_id;
end $$;
revoke all on function helpdesk_ask(text, text, text, boolean, text, text) from public;
grant execute on function helpdesk_ask(text, text, text, boolean, text, text) to anon, authenticated;

-- 3. Pulizia a 7 giorni (solo il docente)
create or replace function anon_cleanup() returns jsonb
language plpgsql security definer set search_path = public as $$
declare n_msg int; n_rep int; n_hd int;
begin
  if not current_user_is_teacher() then raise exception 'Solo il docente.'; end if;
  delete from messages where created_at < now() - interval '7 days';
  get diagnostics n_msg = row_count;
  delete from helpdesk_replies where created_at < now() - interval '7 days';
  get diagnostics n_rep = row_count;
  -- le risposte e le chiavi delle domande cancellate se ne vanno con loro (on delete cascade)
  delete from helpdesk where created_at < now() - interval '7 days';
  get diagnostics n_hd = row_count;
  return jsonb_build_object('messages', n_msg, 'helpdesk_replies', n_rep, 'helpdesk', n_hd);
end $$;
revoke all on function anon_cleanup() from public;
grant execute on function anon_cleanup() to authenticated;

-- 4a. Piano del periodo senza studenti né voti
create or replace function evaluation_plan(p_class text, p_today date default ((now() at time zone 'Europe/Rome'))::date)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  y int := case when extract(month from p_today) >= 9 then extract(year from p_today)::int else extract(year from p_today)::int - 1 end;
  terms jsonb := coalesce((select nullif(g.terms, '[]'::jsonb) from grade_settings g where g.scope = 'tutte'),
    '[{"name":"Trimestre","from":"09-01","to":"12-31"},{"name":"Pentamestre","from":"01-01","to":"06-30"}]'::jsonb);
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
    'lessons_left', (select count(*) from generate_series(p_today, t_to, interval '1 day') g(d)
                     join timetable tt on tt.class_id = p_class and tt.weekday = extract(isodow from g.d)
                     where not school_holiday(g.d::date)),
    'tests_in_term', (select count(*) from tests ts where ts.class_id = p_class and ts.test_date between t_from and t_to),
    'tests_not_done', (select coalesce(jsonb_agg(jsonb_build_object('title', ts.title, 'date', ts.test_date) order by ts.test_date), '[]'::jsonb)
                       from tests ts where ts.class_id = p_class and ts.test_date >= make_date(y, 9, 1) and ts.test_date < p_today and not ts.done),
    'tests_next_2_weeks', (select coalesce(jsonb_agg(jsonb_build_object('title', ts.title, 'date', ts.test_date) order by ts.test_date), '[]'::jsonb)
                           from tests ts where ts.class_id = p_class and ts.test_date between p_today and p_today + 14)
  );
end $$;
revoke all on function evaluation_plan(text, date) from public;

-- 4b. Riepilogo della settimana: solo conteggi, compiti e verifiche
create or replace function weekly_summary_data(p_today date default ((now() at time zone 'Europe/Rome'))::date)
returns jsonb
language sql stable security definer set search_path = public as $$
  with
  win as (
    select p_today as today,
           p_today - 7 as week_start,
           (p_today + (8 - extract(isodow from p_today)::int)) as next_mon,
           (p_today + (14 - extract(isodow from p_today)::int)) as next_sun
  ),
  per_class as (
    select c.id, c.name, c.sort,
      (select count(*) from helpdesk t where t.class_id = c.id and t.status <> 'risolta') as helpdesk_open,
      (select count(*) from helpdesk t where t.class_id = c.id and t.status <> 'risolta' and t.stuck) as helpdesk_stuck,
      (select count(*) from slide_questions q where q.class_id = c.id and q.answer is null) as slide_questions_open,
      (select coalesce(jsonb_agg(jsonb_build_object('title', a.title, 'due', coalesce(a.due_date, a.planned_due),
                'kind', a.kind, 'group', a.group_work, 'planned', a.due_date is null)
              order by coalesce(a.due_date, a.planned_due)), '[]')
         from assignments a, win
         where a.class_id = c.id and a.deck is null and a.test_id is null
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
revoke all on function weekly_summary_data(date) from public;
