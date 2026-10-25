-- Avvisi a inizio lezione spenti (Nero, 2026-10-25): il lavoro pg_cron novaula-lezioni resta disattivato
-- e push_jobs_schedule() (chiamata dal trigger su timetable) aggiorna solo novaula-paga.
-- Va eseguito dopo 2026-10-25-cron-risparmio.sql. Per riaccendere: cron.alter_job(jobid, active := true)
-- e la versione di push_jobs_schedule() in quel file.

create or replace function push_jobs_schedule() returns void
language plpgsql security definer set search_path = public as $$
declare wmins text; whrs text;
begin
  -- novaula-lezioni è spento (Nero, 2026-10-25): niente avvisi a inizio lezione
  with fine as (
    select d, coalesce((select max(ends) from timetable where weekday = d), time '14:00') t
      from generate_series(1, 5) d)
  select string_agg(distinct extract(minute from t)::int::text, ','),
         (min(extract(hour from t))::int - 2)::text || '-' || (max(extract(hour from t))::int - 1)::text
    into wmins, whrs from fine;
  perform cron.schedule('novaula-paga', wmins || ' ' || whrs || ' * * 1-5', 'select wage_push()');
end $$;

select cron.alter_job(jobid, active := false) from cron.job where jobname = 'novaula-lezioni';
