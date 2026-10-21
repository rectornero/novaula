-- Novaula 2.9.0 · Notifica all'inizio di ogni lezione (orario in tabella timetable, ora di Roma)
-- pg_cron controlla ogni minuto, lun–sab tra le 5 e le 12 UTC (copre ora legale e solare);
-- per ogni lezione che inizia proprio adesso la funzione Edge "notifiche" avvisa gli studenti
-- della classe iscritti e il docente. Solo aggiunte.

create extension if not exists pg_cron;

grant select (id, class_id, subject, room, starts, ends) on timetable to service_role;

create or replace function lessons_push() returns void
language plpgsql security definer set search_path = public as $$
declare ids bigint[]; t timestamp := date_trunc('minute', now() at time zone 'Europe/Rome');
begin
  select array_agg(id) into ids from timetable where weekday = extract(isodow from t) and starts = t::time;
  if ids is not null then perform push_send(jsonb_build_object('tipo', 'lezione', 'ids', to_jsonb(ids))); end if;
end $$;
revoke all on function lessons_push() from public;

-- con lo stesso nome cron.schedule sostituisce il lavoro esistente
select cron.schedule('novaula-lezioni', '* 5-12 * * 1-6', 'select lessons_push()');
