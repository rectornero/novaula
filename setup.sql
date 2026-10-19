-- Piattaforma di classe: schema Supabase
-- Incollare tutto nel SQL Editor del progetto Supabase ed eseguire una volta.
-- Poi eseguire, in ordine, i file della cartella "aggiornamenti" (programma, lezioni, compiti).

-- Classi -----------------------------------------------------------------
create table if not exists classes (
  id   text primary key,
  name text not null,
  sort int  not null default 0
);

insert into classes (id, name, sort) values
  ('1d', '1D Informatica', 1),
  ('1e', '1E Informatica', 2),
  ('3g', '3G TPSI', 3),
  ('5f', '5F GPOI', 4),
  ('5g', '5G TPSI', 5)
on conflict (id) do nothing;

-- Docenti: solo gli utenti in questa tabella hanno i poteri da docente ------
create table if not exists teachers (
  user_id uuid primary key references auth.users on delete cascade
);

create or replace function current_user_is_teacher() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from teachers where user_id = auth.uid());
$$;

-- Materiali --------------------------------------------------------------
create table if not exists materials (
  id          uuid primary key default gen_random_uuid(),
  class_id    text not null references classes on delete cascade,
  title       text not null check (char_length(title) between 1 and 200),
  description text check (char_length(description) <= 2000),
  url         text check (char_length(url) <= 1000),
  file_path   text,
  file_name   text,
  pdf_url     text,
  created_at  timestamptz not null default now()
);
alter table materials add column if not exists pdf_url text;

-- Compiti ----------------------------------------------------------------
create table if not exists assignments (
  id          uuid primary key default gen_random_uuid(),
  class_id    text not null references classes on delete cascade,
  title       text not null check (char_length(title) between 1 and 200),
  description text check (char_length(description) <= 4000),
  due_date    date,
  created_at  timestamptz not null default now()
);

create table if not exists submissions (
  id            uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references assignments on delete cascade,
  student_name  text not null check (char_length(student_name) between 2 and 80),
  note          text check (char_length(note) <= 2000),
  file_path     text,
  file_name     text,
  created_at    timestamptz not null default now()
);

-- Chat -------------------------------------------------------------------
create table if not exists messages (
  id         bigint generated always as identity primary key,
  class_id   text not null references classes on delete cascade,
  author     text not null check (char_length(author) between 1 and 40),
  body       text not null check (char_length(body) between 1 and 1000),
  is_teacher boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists messages_class_time on messages (class_id, created_at desc);

-- Sicurezza (Row Level Security) -----------------------------------------
alter table classes     enable row level security;
alter table teachers    enable row level security;
alter table materials   enable row level security;
alter table assignments enable row level security;
alter table submissions enable row level security;
alter table messages    enable row level security;

-- Permessi espliciti (funziona anche con "Automatically expose new tables" disattivato)
grant usage on schema public to anon, authenticated;
grant select on classes, materials, assignments, messages to anon, authenticated;
grant insert, update, delete on materials, assignments to authenticated;
grant insert on submissions, messages to anon, authenticated;
grant select, delete on submissions to authenticated;
grant delete on messages to authenticated;
grant usage on all sequences in schema public to anon, authenticated;
grant execute on function current_user_is_teacher() to anon, authenticated;

-- Tutti leggono classi, materiali, compiti e chat
create policy "classes read"     on classes     for select using (true);
create policy "materials read"   on materials   for select using (true);
create policy "assignments read" on assignments for select using (true);
create policy "messages read"    on messages    for select using (true);

-- Solo il docente modifica materiali e compiti
create policy "materials write"   on materials   for all using (current_user_is_teacher()) with check (current_user_is_teacher());
create policy "assignments write" on assignments for all using (current_user_is_teacher()) with check (current_user_is_teacher());

-- Gli studenti consegnano senza account; solo il docente vede e cancella le consegne
create policy "submissions insert" on submissions for insert with check (true);
create policy "submissions read"   on submissions for select using (current_user_is_teacher());
create policy "submissions delete" on submissions for delete using (current_user_is_teacher());

-- Chat: tutti scrivono come studenti; solo il docente scrive come docente e cancella
create policy "messages insert" on messages for insert
  with check (is_teacher = false or current_user_is_teacher());
create policy "messages delete" on messages for delete using (current_user_is_teacher());

-- Chat in tempo reale
alter publication supabase_realtime add table messages;

-- Archivio file ------------------------------------------------------------
-- "materiali": pubblico in lettura (PDF, slide); "consegne": privato
insert into storage.buckets (id, name, public, file_size_limit)
values ('materiali', 'materiali', true, 52428800),
       ('consegne',  'consegne',  false, 20971520)
on conflict (id) do nothing;

create policy "materiali teacher write" on storage.objects for insert
  with check (bucket_id = 'materiali' and current_user_is_teacher());
create policy "materiali teacher delete" on storage.objects for delete
  using (bucket_id = 'materiali' and current_user_is_teacher());

create policy "consegne upload" on storage.objects for insert
  with check (bucket_id = 'consegne');
create policy "consegne teacher read" on storage.objects for select
  using (bucket_id = 'consegne' and current_user_is_teacher());
create policy "consegne teacher delete" on storage.objects for delete
  using (bucket_id = 'consegne' and current_user_is_teacher());

-- Materiali iniziali ----------------------------------------------------------
insert into materials (class_id, title, description, url, pdf_url) values
  ('1d', 'Imparare a imparare', 'Slide della lezione in PDF.', 'contenuti/imparare-a-imparare.pdf', null),
  ('1e', 'Imparare a imparare', 'Slide della lezione in PDF.', 'contenuti/imparare-a-imparare.pdf', null),
  ('3g', 'Densità e incidenza percentuale', 'Presentazione della lezione.', 'https://claude.ai/artifact/YXippEqpmMPmB94NriwqJT', 'contenuti/densita-e-incidenza-percentuale.pdf'),
  ('5f', 'Ciclo di vita del software', 'Presentazione della lezione.', 'https://claude.ai/artifact/L2z6Rt8YHFzu8u2KnAxBXb', 'contenuti/ciclo-di-vita-del-software.pdf'),
  ('5f', 'Ciclo di vita del progetto', 'Presentazione della lezione.', 'https://claude.ai/artifact/FMS18ViZRQQEVNhYyF8eth', 'contenuti/ciclo-di-vita-del-progetto.pdf'),
  ('5f', 'Quiz: ciclo di progetto', 'Quiz di ripasso da fare in classe sulla LIM.', 'contenuti/quiz-ciclo-di-progetto.html', null);
