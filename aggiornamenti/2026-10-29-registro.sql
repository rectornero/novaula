-- Novaula 2.19.0 (seconda parte) · Assenze, argomento della lezione, suggerimenti degli studenti
-- 1. absences: chi era assente in un giorno (solo il docente). L'agenda segnala chi ha perso una verifica e va recuperato.
-- 2. lesson_log: l'argomento di ogni ora in una riga, da incollare sul registro elettronico (solo il docente).
-- 3. feedback: gli studenti mandano un'idea o segnalano un problema (anonimo, senza nome); solo il docente li legge.
--    Limite: al massimo 30 suggerimenti nell'ultima ora da tutta la scuola, per evitare raffiche.
-- Nessun cron, nessuna funzione Edge: l'app legge solo quando si apre una pagina. Solo aggiunte: si può eseguire più volte.

create table if not exists absences (
  id         uuid primary key default gen_random_uuid(),
  class_id   text not null references classes on delete cascade,
  student_id uuid not null references students on delete cascade,
  day        date not null,
  created_at timestamptz not null default now(),
  unique (student_id, day)
);
create index if not exists absences_class_day on absences (class_id, day);
alter table absences enable row level security;
revoke all on absences from anon;
grant select, insert, delete on absences to authenticated;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'absences' and policyname = 'absences teacher') then
    create policy "absences teacher" on absences for all using (current_user_is_teacher()) with check (current_user_is_teacher());
  end if;
end $$;

create table if not exists lesson_log (
  id         uuid primary key default gen_random_uuid(),
  class_id   text not null references classes on delete cascade,
  day        date not null,
  starts     text not null check (starts ~ '^\d{2}:\d{2}$'),
  text       text not null check (char_length(btrim(text)) between 1 and 300),
  topic_id   uuid,
  created_at timestamptz not null default now(),
  unique (class_id, day, starts)
);
alter table lesson_log enable row level security;
revoke all on lesson_log from anon;
grant select, insert, update, delete on lesson_log to authenticated;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'lesson_log' and policyname = 'lesson_log teacher') then
    create policy "lesson_log teacher" on lesson_log for all using (current_user_is_teacher()) with check (current_user_is_teacher());
  end if;
end $$;

create table if not exists feedback (
  id         uuid primary key default gen_random_uuid(),
  class_id   text references classes on delete set null,
  kind       text not null default 'idea' check (kind in ('idea', 'problema')),
  text       text not null check (char_length(btrim(text)) between 3 and 500),
  status     text not null default 'nuovo' check (status in ('nuovo', 'visto', 'fatto')),
  created_at timestamptz not null default now()
);
create index if not exists feedback_created on feedback (created_at desc);
alter table feedback enable row level security;
grant insert (class_id, kind, text) on feedback to anon, authenticated;
grant select, update, delete on feedback to authenticated;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'feedback' and policyname = 'feedback send') then
    create policy "feedback send" on feedback for insert with check (status = 'nuovo');
  end if;
  if not exists (select 1 from pg_policies where tablename = 'feedback' and policyname = 'feedback teacher') then
    create policy "feedback teacher" on feedback for all using (current_user_is_teacher()) with check (current_user_is_teacher());
  end if;
end $$;

create or replace function feedback_limit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from feedback where created_at > now() - interval '1 hour') >= 30 then
    raise exception 'Troppi suggerimenti in poco tempo: riprova più tardi.';
  end if;
  return new;
end $$;
revoke all on function feedback_limit() from public;
create or replace trigger feedback_limit before insert on feedback for each row execute function feedback_limit();
