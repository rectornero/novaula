-- Novaula 2.15.1 · I lavori pg_cron non girano più ogni minuto
-- Prima: novaula-lezioni, novaula-paga e novaula-riunioni partivano ogni minuto (circa 25.000 volte a settimana).
-- Ora girano solo nei minuti in cui può esserci qualcosa da inviare:
-- · lezioni e paga: i minuti di inizio/fine lezione presi dalla tabella timetable (ricalcolati a ogni modifica);
-- · riunioni: un solo appuntamento, al prossimo avviso in programma; dopo l'invio si sposta sul successivo,
--   e senza riunioni in arrivo il lavoro resta spento.
-- pg_cron usa l'ora GMT: per lezioni e paga si coprono sia l'ora legale (UTC+2) sia quella solare (UTC+1).
-- Solo aggiunte e sostituzioni: si può eseguire più volte.

-- Lezioni e paga: minuti e ore dalla tabella timetable
create or replace function push_jobs_schedule() returns void
language plpgsql security definer set search_path = public as $$
declare mins text; hrs text; dows text; wmins text; whrs text;
begin
  select string_agg(distinct extract(minute from starts)::int::text, ','),
         (min(extract(hour from starts))::int - 2)::text || '-' || (max(extract(hour from starts))::int - 1)::text,
         string_agg(distinct (weekday % 7)::text, ',')
    into mins, hrs, dows from timetable;
  if mins is not null then
    perform cron.schedule('novaula-lezioni', mins || ' ' || hrs || ' * * ' || dows, 'select lessons_push()');
  end if;
  -- paga: fine dell'ultima lezione del giorno, oppure le 14:00 (come in wage_push)
  with fine as (
    select d, coalesce((select max(ends) from timetable where weekday = d), time '14:00') t
      from generate_series(1, 5) d)
  select string_agg(distinct extract(minute from t)::int::text, ','),
         (min(extract(hour from t))::int - 2)::text || '-' || (max(extract(hour from t))::int - 1)::text
    into wmins, whrs from fine;
  perform cron.schedule('novaula-paga', wmins || ' ' || whrs || ' * * 1-5', 'select wage_push()');
end $$;
revoke all on function push_jobs_schedule() from public;

create or replace function timetable_reschedule() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform push_jobs_schedule();
  return null;
end $$;

create or replace trigger timetable_reschedule after insert or update on timetable
  for each statement execute function timetable_reschedule();

-- Riunioni: il lavoro parte solo al prossimo minuto in cui c'è un avviso da inviare
create or replace function meetings_schedule() returns void
language plpgsql security definer set search_path = public as $$
declare nxt timestamptz; job bigint;
begin
  select min(t) into nxt from (
    select greatest(starts_at - make_interval(mins => remind_min), now()) t from meetings
     where reminded_at is null and starts_at > now() - interval '10 minutes'
    union all
    select greatest(starts_at, now()) from meetings
     where rung_at is null and reminded_at is not null and remind_min > 0 and starts_at > now() - interval '10 minutes'
  ) x;
  select jobid into job from cron.job where jobname = 'novaula-riunioni';
  if job is null then
    job := cron.schedule('novaula-riunioni', '0 0 1 1 *', 'select meetings_push()');
  end if;
  if nxt is null then
    perform cron.alter_job(job, active := false);
    return;
  end if;
  -- arrotondato al minuto pieno successivo (mai un minuto già iniziato, che pg_cron salterebbe)
  if not (nxt > now() and nxt = date_trunc('minute', nxt)) then nxt := date_trunc('minute', nxt) + interval '1 minute'; end if;
  perform cron.alter_job(job, schedule := to_char(nxt at time zone 'GMT', 'FMMI FMHH24 FMDD FMMM') || ' *', active := true);
end $$;
revoke all on function meetings_schedule() from public;

create or replace function meetings_reschedule() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform meetings_schedule();
  return null;
end $$;

create or replace trigger meetings_reschedule after insert or update on meetings
  for each statement execute function meetings_reschedule();

-- meetings_push invariata, più la chiamata finale a meetings_schedule()
create or replace function meetings_push() returns void
language plpgsql security definer set search_path = public as $$
declare prima uuid[]; ora uuid[];
begin
  with due as (
    update meetings set reminded_at = now(), rung_at = case when starts_at <= now() then now() end
     where reminded_at is null
       and starts_at - make_interval(mins => remind_min) <= now()
       and starts_at > now() - interval '10 minutes'
    returning id)
  select array_agg(id) into prima from due;
  with due as (
    update meetings set rung_at = now()
     where rung_at is null and reminded_at is not null and remind_min > 0
       and starts_at <= now() and starts_at > now() - interval '10 minutes'
       and not (id = any(coalesce(prima, '{}')))
    returning id)
  select array_agg(id) into ora from due;
  perform meetings_schedule();
  if not exists (select 1 from push_subscriptions where owner = 'docente' and disabled_at is null) then return; end if;
  if prima is not null then perform push_send(jsonb_build_object('tipo', 'riunione', 'fase', 'prima', 'ids', to_jsonb(prima))); end if;
  if ora is not null then perform push_send(jsonb_build_object('tipo', 'riunione', 'fase', 'ora', 'ids', to_jsonb(ora))); end if;
end $$;
revoke all on function meetings_push() from public;

select push_jobs_schedule();
select meetings_schedule();
