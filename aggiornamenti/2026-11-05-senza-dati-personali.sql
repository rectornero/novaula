-- Novaula senza dati personali (spec: management/licensing/no-personal-data.md, decisa da Nero il 5/11/2026).
-- Novaula non sa più chi è ogni studente: consegne, voti, correzioni, assenze, PDP/PEI, profili e PIN vanno via.
-- Restano classi, programma, materiali, compiti come elenco, verifiche, agenda, orario, chat e aiuto anonimi.
--
-- ATTENZIONE: cancella dati in modo DEFINITIVO. Lo esegue Nero a mano nell'SQL editor di Supabase, tutto insieme.
-- Prima:  1. il backup («Database backup» su GitHub, eseguito a mano, finito con l'artifact cifrato);
--         2. il rilascio che toglie dal sito profili, consegne e voti, già online (altrimenti il sito vecchio
--            chiamerebbe funzioni che qui spariscono);
--         3. l'SQL di Systems per la stessa versione, se c'è (sostituisce evaluation_plan e weekly_summary_data
--            senza studenti né voti). Questo file si ferma da solo se quelle due funzioni leggono ancora i voti.
-- Dopo:   svuotare ed eliminare dalla dashboard i bucket consegne, correzioni, scansioni, personali, aiuto, stampe,
--         ed eliminare la Edge Function «correzioni».
-- Si può rieseguire: usa sempre "if exists".

begin;

-- 0. Controllo: le funzioni che restano non devono più leggere le tabelle che spariscono.
do $$
declare f text;
begin
  for f in select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f' and p.proname in ('evaluation_plan', 'weekly_summary_data')
      and pg_get_functiondef(p.oid) ~ '\m(students|marks|submissions|submission_members)\M'
  loop
    raise exception 'Prima esegui l''SQL di Systems: % legge ancora studenti o voti.', f;
  end loop;
end $$;

-- 1. Notifiche agli studenti: via le iscrizioni (un endpoint push identifica un dispositivo). Resta il docente.
do $$ begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'push_subscriptions' and column_name = 'student_id') then
    delete from push_subscriptions where student_id is not null;
  end if;
end $$;
drop trigger if exists materials_push on materials;
drop function if exists materials_push();
drop function if exists student_push_subscribe(uuid, text, text, text, text);
drop function if exists teacher_push_broadcast(text, text);
alter table push_subscriptions drop column if exists student_id;

-- 2. Correzioni, voti e scansioni.
-- (le tabelle prima delle funzioni: "cascade" toglie i loro trigger, così il file si può rieseguire)
drop table if exists marks, corrections, correction_skips, test_scans, submission_members cascade;
drop function if exists corrections_to_marks();
drop function if exists members_to_marks();
drop function if exists sync_claude_mark(uuid);
drop function if exists marks_push_ins();
drop function if exists marks_push_upd();
drop function if exists marks_touch();
drop function if exists mark_value(text);
drop function if exists scan_inbox();
drop function if exists scan_done(uuid, text, text, integer);
drop function if exists scan_register_student(uuid, uuid, text, text);
drop function if exists scan_assignment(uuid);

-- 3. Consegne (dall'app e dalle slide).
drop function if exists student_submit(uuid, text, uuid, text, text, text, text, text, uuid[]);
drop function if exists slide_submit(text, text, integer, text, text, uuid, text, text, text, text, jsonb, text);
drop function if exists slide_status(text, text, uuid, text);
drop table if exists submissions cascade;

-- 4. Identità degli studenti: profili, PIN, sessioni, richieste, materiali personali, posti, assenze, PDP/PEI.
drop table if exists absences, seating_plans, student_requests, student_materials, student_sessions, students cascade;
drop function if exists student_materials_push();
drop function if exists student_private(uuid, text);
drop function if exists student_request(uuid, text, text);
drop function if exists student_set_pin(uuid, text, text);
drop function if exists student_unlock(uuid, text);
drop function if exists student_logout(uuid, text);
drop function if exists student_create(text, text, text, text);
drop function if exists student_new_session(uuid);
drop function if exists student_token_ok(uuid, text);
drop function if exists teacher_add_students(text, jsonb);
drop function if exists teacher_reset_pin(uuid);
drop function if exists class_students(text);
drop function if exists name_key(text, text);

-- 5. Quello che resta diventa anonimo: niente nomi in chat, aiuto e domande sulle slide (le votazioni usano già un
--    codice a caso del dispositivo, non un nome).
update messages set author = case when is_teacher then 'Docente' else 'Studente' end;
update helpdesk set author = 'Studente', image_path = null;
update helpdesk_replies set author = case when is_teacher then 'Docente' else 'Studente' end;
update slide_questions set name = 'Studente';

-- 6. Controllo finale: nessuna tabella o colonna con dati di uno studente.
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public'
             and column_name in ('student_id', 'student_name', 'device_hash', 'learning_plan', 'plan_note', 'pin_hash', 'first_name', 'last_name')) then
    raise exception 'Resta una colonna con dati personali: controlla prima di confermare.';
  end if;
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'
             and (p.proname ~ '^(student_|scan_|slide_s)' or p.proname in ('sync_claude_mark', 'class_students', 'teacher_add_students',
                  'teacher_reset_pin', 'teacher_push_broadcast', 'materials_push', 'corrections_to_marks', 'members_to_marks'))) then
    raise exception 'Resta una funzione per studenti, consegne o voti: controlla prima di confermare.';
  end if;
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.prokind = 'f'
             and pg_get_functiondef(p.oid) ~ '\m(students|student_sessions|student_requests|student_materials|submissions|submission_members|marks|corrections|correction_skips|test_scans|absences|seating_plans)\M') then
    raise exception 'Una funzione che resta legge ancora una tabella eliminata: controlla prima di confermare.';
  end if;
end $$;

commit;
