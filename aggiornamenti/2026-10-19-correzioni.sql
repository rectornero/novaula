-- Novaula · Correzioni automatiche delle consegne (2026-10-19)
-- Claude legge i PDF consegnati e prepara un PDF corretto (verde = giusto, rosso = sbagliato)
-- con un riepilogo. Le correzioni sono visibili solo al docente, in Area docente e sotto le consegne.
-- I file passano dalla funzione Edge "correzioni", protetta da un codice segreto che sta in
-- private_settings (nessuna policy: lo leggono solo la funzione e il connettore Supabase).
-- Si può eseguire più volte.

create table if not exists corrections (
  id            uuid primary key default gen_random_uuid(),
  submission_id uuid not null unique references submissions on delete cascade,
  assignment_id uuid not null references assignments on delete cascade,
  file_path     text not null,
  grade         text check (char_length(grade) <= 40),
  summary       text check (char_length(summary) <= 4000),
  correct       int not null default 0,
  wrong         int not null default 0,
  partial       int not null default 0,
  reviewed      boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists corrections_assignment on corrections (assignment_id);
alter table corrections enable row level security;
revoke all on corrections from anon;
grant select, update, delete on corrections to authenticated;

create table if not exists private_settings (
  key   text primary key,
  value text not null
);
alter table private_settings enable row level security;
revoke all on private_settings from anon, authenticated;
insert into private_settings (key, value)
select 'marking_token', replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')
where not exists (select 1 from private_settings where key = 'marking_token');

insert into storage.buckets (id, name, public, file_size_limit)
values ('correzioni', 'correzioni', false, 52428800)
on conflict (id) do nothing;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'corrections' and policyname = 'corrections teacher read') then
    create policy "corrections teacher read" on corrections for select using (current_user_is_teacher());
  end if;
  if not exists (select 1 from pg_policies where tablename = 'corrections' and policyname = 'corrections teacher update') then
    create policy "corrections teacher update" on corrections for update using (current_user_is_teacher()) with check (current_user_is_teacher());
  end if;
  if not exists (select 1 from pg_policies where tablename = 'corrections' and policyname = 'corrections teacher delete') then
    create policy "corrections teacher delete" on corrections for delete using (current_user_is_teacher());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'correzioni teacher read') then
    create policy "correzioni teacher read" on storage.objects for select using (bucket_id = 'correzioni' and current_user_is_teacher());
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'correzioni teacher delete') then
    create policy "correzioni teacher delete" on storage.objects for delete using (bucket_id = 'correzioni' and current_user_is_teacher());
  end if;
end $$;
