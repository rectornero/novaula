-- Novaula 2.13.0 · Notifica "paga del giorno", solo per il docente
-- Dal lunedì al venerdì, alla fine dell'ultima lezione del giorno (orario in tabella timetable, ora di Roma;
-- alle 14:00 se quel giorno non ci sono lezioni), il docente riceve una notifica con la paga giornaliera:
-- stipendio mensile diviso per i giorni lavorativi (lun–ven) di quel mese, più quanto ha maturato nel mese finora.
-- Le festività infrasettimanali contano come giorni pagati (anche la notifica arriva); sabato e domenica mai.
-- Lo stipendio sta in private_settings ('paga_mensile'), mai nel sito.
-- Solo aggiunte: si può eseguire più volte.

create extension if not exists pg_cron;

insert into private_settings (key, value) values ('paga_mensile', '1850') on conflict (key) do nothing;

create or replace function wage_push() returns void
language plpgsql security definer set search_path = public as $$
declare
  t timestamp := date_trunc('minute', now() at time zone 'Europe/Rome');
  d date := t::date;
  fine time;
  pay numeric;
  giorni int;
  fatti int;
begin
  if extract(isodow from d) > 5 then return; end if;
  select coalesce(max(ends), time '14:00') into fine from timetable where weekday = extract(isodow from d);
  if t::time <> fine then return; end if;
  if not exists (select 1 from push_subscriptions where owner = 'docente' and disabled_at is null) then return; end if;
  select coalesce(nullif(value, '')::numeric, 1850) into pay from private_settings where key = 'paga_mensile';
  pay := coalesce(pay, 1850);
  select count(*) filter (where extract(isodow from g) <= 5),
         count(*) filter (where extract(isodow from g) <= 5 and g::date <= d)
    into giorni, fatti
    from generate_series(date_trunc('month', d), date_trunc('month', d) + interval '1 month' - interval '1 day', interval '1 day') g;
  perform push_send(jsonb_build_object('tipo', 'paga', 'oggi', round(pay / giorni, 2), 'mese', round(pay / giorni * fatti, 2),
    'fatti', fatti, 'giorni', giorni, 'stipendio', pay, 'mese_n', extract(month from d)::int));
end $$;
revoke all on function wage_push() from public;

-- ogni minuto, lun–ven tra le 6 e le 13 UTC (copre 8–15 a Roma con ora legale e solare)
select cron.schedule('novaula-paga', '* 6-13 * * 1-5', 'select wage_push()');
