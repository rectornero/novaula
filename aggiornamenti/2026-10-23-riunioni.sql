-- Novaula 2.14.0 · Riunioni del docente
-- Consigli di classe, collegi, colloqui: data, ora, classe e link (Meet). Solo il docente le vede.
-- Qualche minuto prima (remind_min, di solito 10) arriva una notifica "sveglia" sul telefono del docente
-- (resta sullo schermo finché non la tocca, vibrazione lunga) e una seconda all'ora d'inizio:
-- toccandola si apre direttamente il link della riunione. Usa la funzione Edge "notifiche" (tipo 'riunione').
-- Per aggiungerne una da SQL basta un insert, per esempio:
--   insert into meetings (kind, title, class_id, starts_at, ends_at, link)
--   values ('cdc', 'Consiglio di classe', '5g', '2026-10-23 16:00 Europe/Rome', '2026-10-23 17:00 Europe/Rome',
--           'https://meet.google.com/xxx-xxxx-xxx');
-- kind: 'cdc' (consiglio di classe), 'glo' (GLO), 'altro' (usa title). La classe 3E ha id '3g'.
-- Solo aggiunte: si può eseguire più volte.

create extension if not exists pg_cron;

create table if not exists meetings (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null default 'cdc' check (kind in ('cdc', 'glo', 'altro')), -- CdC, GLO o altro
  title       text not null default 'Consiglio di classe' check (char_length(btrim(title)) between 1 and 120),
  class_id    text references classes on delete set null,
  starts_at   timestamptz not null,
  ends_at     timestamptz check (ends_at is null or ends_at > starts_at),
  link        text check (link is null or link ~ '^https?://'),
  note        text check (note is null or char_length(note) <= 500),
  remind_min  int not null default 10 check (remind_min between 0 and 1440),
  reminded_at timestamptz,
  rung_at     timestamptz,
  created_at  timestamptz not null default now()
);
alter table meetings add column if not exists rung_at timestamptz;
alter table meetings add column if not exists kind text not null default 'cdc';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'meetings_kind_check') then
    alter table meetings add constraint meetings_kind_check check (kind in ('cdc', 'glo', 'altro'));
  end if;
end $$;
create index if not exists meetings_starts on meetings (starts_at);
alter table meetings enable row level security;

grant select, insert, update, delete on meetings to authenticated;
grant select (id, kind, title, class_id, starts_at, ends_at, link, note, remind_min) on meetings to service_role;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'meetings' and policyname = 'riunioni docente') then
    create policy "riunioni docente" on meetings for all to authenticated
      using (current_user_is_teacher()) with check (current_user_is_teacher());
  end if;
end $$;

-- Se cambiano ora o preavviso, il promemoria riparte
create or replace function meetings_reset() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.starts_at is distinct from old.starts_at or new.remind_min is distinct from old.remind_min then
    new.reminded_at := null;
    new.rung_at := null;
  end if;
  return new;
end $$;

create or replace trigger meetings_reset before update on meetings
  for each row execute function meetings_reset();

-- Ogni minuto: le riunioni entrate nel preavviso partono una volta sola (reminded_at), poi una seconda
-- volta all'ora d'inizio (rung_at). Una riunione aggiunta all'ultimo momento avvisa subito,
-- fino a 10 minuti dopo l'inizio.
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
  if not exists (select 1 from push_subscriptions where owner = 'docente' and disabled_at is null) then return; end if;
  if prima is not null then perform push_send(jsonb_build_object('tipo', 'riunione', 'fase', 'prima', 'ids', to_jsonb(prima))); end if;
  if ora is not null then perform push_send(jsonb_build_object('tipo', 'riunione', 'fase', 'ora', 'ids', to_jsonb(ora))); end if;
end $$;
revoke all on function meetings_push() from public;

-- ogni minuto, tutto il giorno (le riunioni possono essere anche di pomeriggio o di sera)
select cron.schedule('novaula-riunioni', '* * * * *', 'select meetings_push()');
