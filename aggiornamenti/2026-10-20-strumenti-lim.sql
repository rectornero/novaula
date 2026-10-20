-- Novaula 2.x · Strumenti per la LIM: piantina dei posti per classe (solo docente).
-- Solo aggiunte: si può eseguire più volte.
create table if not exists public.seating_plans (
  class_id text primary key references public.classes(id) on update cascade,
  rows smallint not null default 5 check (rows between 1 and 12),
  cols smallint not null default 6 check (cols between 1 and 12),
  seats jsonb not null default '{}'::jsonb,   -- { "r-c": "student uuid" }
  updated_at timestamptz not null default now()
);
alter table public.seating_plans enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'seating_plans' and policyname = 'seating_teacher') then
    create policy seating_teacher on public.seating_plans for all to authenticated
      using (current_user_is_teacher()) with check (current_user_is_teacher());
  end if;
end $$;
