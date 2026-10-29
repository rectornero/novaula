-- Novaula 2.19.0 · Agenda del giorno, calendario dell'anno, Google Classroom, giorni di vacanza, PDP e PEI
-- 1. calendar_events: date dell'anno aggiunte dal docente (scrutini, pagellino, ponti, uscite, scadenze della scuola).
--    Le date fisse (Lazio 2026/27, festività, scadenze nazionali) stanno già in sito/agenda.js; qui vanno solo
--    quelle della scuola. public = true le vedono anche gli studenti (solo quelle senza dati personali!).
--    Per aggiungerne una da SQL:
--      insert into calendar_events (day, title, kind, public) values ('2027-01-14', 'Scrutini del trimestre', 'scrutinio', false);
--    kind: 'scadenza', 'scrutinio', 'vacanza', 'evento'. class_id null = tutte le classi (3E ha id '3g').
-- 2. classes.classroom_url: link al corso Google Classroom di ogni classe (lo imposta il docente dall'agenda).
-- Nessun cron, nessuna funzione: l'app legge queste righe solo quando si apre una pagina.
-- Solo aggiunte: si può eseguire più volte.

create table if not exists calendar_events (
  id         uuid primary key default gen_random_uuid(),
  day        date not null,
  until      date check (until is null or until >= day),
  title      text not null check (char_length(btrim(title)) between 1 and 120),
  kind       text not null default 'scadenza' check (kind in ('scadenza', 'scrutinio', 'vacanza', 'evento')),
  class_id   text references classes on delete cascade,
  public     boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists calendar_events_day on calendar_events (day);
alter table calendar_events enable row level security;
grant select on calendar_events to anon, authenticated;
grant insert, update, delete on calendar_events to authenticated;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'calendar_events' and policyname = 'calendar_events read') then
    create policy "calendar_events read" on calendar_events for select using (public or current_user_is_teacher());
  end if;
  if not exists (select 1 from pg_policies where tablename = 'calendar_events' and policyname = 'calendar_events teacher') then
    create policy "calendar_events teacher" on calendar_events for all using (current_user_is_teacher()) with check (current_user_is_teacher());
  end if;
end $$;

alter table classes add column if not exists classroom_url text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'classes_classroom_url_check') then
    alter table classes add constraint classes_classroom_url_check check (classroom_url is null or classroom_url ~ '^https://classroom\.google\.com/');
  end if;
end $$;
grant update (classroom_url) on classes to authenticated;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'classes' and policyname = 'classes teacher update') then
    create policy "classes teacher update" on classes for update using (current_user_is_teacher()) with check (current_user_is_teacher());
  end if;
end $$;

-- 3. Giorni senza lezione (stesse regole di sito/agenda.js e valutazioni.js): fine settimana, fuori dall'anno
--    (15 settembre – 8 giugno, Lazio), festività nazionali, Natale 23/12–6/1, Pasqua dal giovedì al martedì dopo,
--    più le vacanze aggiunte dal docente in calendar_events (kind 'vacanza', tutte le classi).
--    La notifica della paga a fine lezioni non parte più nei giorni di vacanza.
create or replace function easter_sunday(y int) returns date
language plpgsql immutable as $$
declare a int := y % 19; b int := y / 100; c int := y % 100; d int := b / 4; e int := b % 4;
  f int := (b + 8) / 25; g int := (b - f + 1) / 3; h int := (19 * a + b - d - g + 15) % 30; i int := c / 4; k int := c % 4;
  l int := (32 + 2 * e + 2 * i - h - k) % 7; m int := (a + 11 * h + 22 * l) / 451;
begin
  return make_date(y, (h + l - 7 * m + 114) / 31, ((h + l - 7 * m + 114) % 31) + 1);
end $$;

create or replace function school_day_off(d date) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare md text := to_char(d, 'MM-DD'); e date := easter_sunday(extract(year from d)::int);
begin
  if extract(isodow from d) > 5 then return true; end if;
  if md > '06-08' and md < '09-15' then return true; end if;
  if md in ('11-01', '12-08', '04-25', '05-01', '06-02') or md >= '12-23' or md <= '01-06' then return true; end if;
  if d between e - 3 and e + 2 then return true; end if;
  return exists (select 1 from calendar_events where kind = 'vacanza' and class_id is null and d between day and coalesce(until, day));
end $$;
revoke all on function school_day_off(date) from public;
grant execute on function school_day_off(date) to authenticated;

create or replace function public.wage_push()
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
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
  if school_day_off(d) then return; end if; -- 2.19.0: niente notifica nei giorni di vacanza
  if not exists (select 1 from push_subscriptions where owner = 'docente' and disabled_at is null) then return; end if;
  select coalesce(nullif(value, '')::numeric, 1850) into pay from private_settings where key = 'paga_mensile';
  pay := coalesce(pay, 1850);
  select count(*) filter (where extract(isodow from g) <= 5),
         count(*) filter (where extract(isodow from g) <= 5 and g::date <= d)
    into giorni, fatti
    from generate_series(date_trunc('month', d), date_trunc('month', d) + interval '1 month' - interval '1 day', interval '1 day') g;
  perform push_send(jsonb_build_object('tipo', 'paga', 'oggi', round(pay / giorni, 2), 'mese', round(pay / giorni * fatti, 2),
    'fatti', fatti, 'giorni', giorni, 'stipendio', pay, 'mese_n', extract(month from d)::int));
end $function$;

-- 4. PDP e PEI: il docente segna chi ha un piano personalizzato e le misure da preparare per le verifiche.
--    La tabella students resta solo per il docente (RLS "students teacher"); nessuna funzione per studenti legge queste colonne.
alter table students add column if not exists learning_plan text;
alter table students add column if not exists plan_note text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'students_learning_plan_check') then
    alter table students add constraint students_learning_plan_check check (learning_plan is null or learning_plan in ('pdp', 'pei'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'students_plan_note_check') then
    alter table students add constraint students_plan_note_check check (plan_note is null or char_length(plan_note) <= 200);
  end if;
end $$;
