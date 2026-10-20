-- Pagella: pesi dei tipi di voto e periodi (trimestre/pentamestre) scelti dal docente.
-- Solo aggiunte. Una riga per classe (scope = id della classe) più quella generale (scope = 'tutte').
-- Le medie si calcolano nel browser dai voti confermati (mai dalle proposte di Claude).
create table if not exists grade_settings (
  scope      text primary key check (char_length(scope) between 1 and 40),
  weights    jsonb not null default '{}'::jsonb,
  terms      jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);
alter table grade_settings enable row level security;
revoke all on grade_settings from anon;
grant select, insert, update on grade_settings to authenticated;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'grade_settings' and policyname = 'grade_settings teacher') then
    create policy "grade_settings teacher" on grade_settings for all using (current_user_is_teacher()) with check (current_user_is_teacher());
  end if;
end $$;
