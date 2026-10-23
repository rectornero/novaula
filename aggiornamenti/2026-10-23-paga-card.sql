-- Novaula 2.15.0 · Riquadro "paga del giorno" nella home del docente
-- Stessi conti della notifica (wage_push, aggiornamenti/2026-10-23-paga.sql): stipendio mensile diviso per i giorni
-- lun–ven del mese (festività comprese). Il riquadro compare quando finisce l'ultima lezione del giorno e resta fino
-- a mezzanotte. Solo il docente può chiamarla. Solo aggiunte: si può eseguire più volte.

create or replace function teacher_wage_today() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  t timestamp := now() at time zone 'Europe/Rome';
  d date := t::date;
  fine time;
  pay numeric;
  giorni int;
  fatti int;
begin
  if not current_user_is_teacher() then raise exception 'Solo il docente.'; end if;
  if extract(isodow from d) > 5 then return jsonb_build_object('workday', false); end if;
  select coalesce(max(ends), time '14:00') into fine from timetable where weekday = extract(isodow from d);
  select coalesce(nullif(value, '')::numeric, 1850) into pay from private_settings where key = 'paga_mensile';
  pay := coalesce(pay, 1850);
  select count(*) filter (where extract(isodow from g) <= 5),
         count(*) filter (where extract(isodow from g) <= 5 and g::date <= d)
    into giorni, fatti
    from generate_series(date_trunc('month', d), date_trunc('month', d) + interval '1 month' - interval '1 day', interval '1 day') g;
  return jsonb_build_object('workday', true, 'done', t::time >= fine, 'ends', to_char(fine, 'HH24:MI'),
    'oggi', round(pay / giorni, 2), 'mese', round(pay / giorni * fatti, 2), 'fatti', fatti, 'giorni', giorni,
    'stipendio', pay, 'mese_n', extract(month from d)::int);
end $$;
revoke all on function teacher_wage_today() from public;
grant execute on function teacher_wage_today() to authenticated;
