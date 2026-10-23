-- Novaula 2.13.0 · Avvisi di classe
-- Il docente scrive un avviso breve a una o più classi: resta fisso in cima alla pagina della classe
-- (in tutte le schede, chat compresa) fino a fine giornata, poi sparisce da solo.
-- Ogni nuovo avviso manda una notifica sul telefono agli studenti della classe iscritti e al docente
-- (così il docente vede subito com'è arrivato). Usa la stessa funzione Edge "notifiche" (tipo 'avviso').
-- Solo aggiunte: si può eseguire più volte.

create table if not exists announcements (
  id         uuid primary key default gen_random_uuid(),
  class_id   text not null references classes on delete cascade,
  body       text not null check (char_length(btrim(body)) between 1 and 500),
  created_at timestamptz not null default now(),
  -- fine della giornata di oggi, ora di Roma
  expires_at timestamptz not null default ((date_trunc('day', now() at time zone 'Europe/Rome') + interval '1 day') at time zone 'Europe/Rome'),
  check (expires_at > created_at and expires_at <= created_at + interval '8 days')
);
create index if not exists announcements_class on announcements (class_id, expires_at);
alter table announcements enable row level security;

grant select on announcements to anon, authenticated;
grant insert, update, delete on announcements to authenticated;
grant select (id, class_id, body, expires_at) on announcements to service_role;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'announcements' and policyname = 'avvisi read') then
    -- gli studenti vedono solo quelli ancora validi; il docente anche quelli scaduti
    create policy "avvisi read" on announcements for select using (expires_at > now() or current_user_is_teacher());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'announcements' and policyname = 'avvisi write') then
    create policy "avvisi write" on announcements for all to authenticated
      using (current_user_is_teacher()) with check (current_user_is_teacher());
  end if;
end $$;

-- In tempo reale: l'avviso compare subito anche sulla LIM e sui telefoni con la pagina aperta
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'announcements') then
    alter publication supabase_realtime add table announcements;
  end if;
end $$;

-- Una sola chiamata alla funzione Edge per ogni invio, anche se l'avviso va a tutte le classi
create or replace function announcements_push() returns trigger
language plpgsql security definer set search_path = public as $$
declare ids uuid[];
begin
  select array_agg(n.id) into ids from nuovi n where n.expires_at > now();
  if ids is not null then perform push_send(jsonb_build_object('tipo', 'avviso', 'ids', to_jsonb(ids))); end if;
  return null;
end $$;
revoke all on function announcements_push() from public;

create or replace trigger announcements_push after insert on announcements
  referencing new table as nuovi for each statement execute function announcements_push();
