-- Novaula · Correzioni automatiche alla consegna (2026-10-20)
-- Un'attività programmata di Claude passa ogni ora nei giorni di scuola, corregge le consegne nuove
-- con strumenti/correggi.py e lascia voto proposto + PDF corretto in "Correzioni da controllare".
-- Nessuna API: è una sessione Claude, i file passano dalla funzione Edge "correzioni".
--   corrections.auto        la correzione l'ha fatta l'attività automatica
--   assignments.auto_correct il docente può spegnere la correzione automatica per un compito
--   correction_skips        consegne che Claude non ha potuto correggere (file illeggibile, lavoro
--                           pratico...): non vengono ritentate e il docente le vede con il motivo;
--                           "Riprova" mette retry = true e al giro dopo Claude ci riprova
-- Solo aggiunte, si può eseguire più volte.

alter table corrections add column if not exists auto boolean not null default false;
alter table assignments add column if not exists auto_correct boolean not null default true;

create table if not exists correction_skips (
  submission_id uuid primary key references submissions on delete cascade,
  assignment_id uuid not null references assignments on delete cascade,
  reason        text not null check (char_length(reason) <= 500),
  retry         boolean not null default false,
  created_at    timestamptz not null default now()
);
create index if not exists correction_skips_assignment on correction_skips (assignment_id);
alter table correction_skips enable row level security;
revoke all on correction_skips from anon;
grant select, update on correction_skips to authenticated;
grant select, insert, update on correction_skips to service_role;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'correction_skips' and policyname = 'skips teacher read') then
    create policy "skips teacher read" on correction_skips for select using (current_user_is_teacher());
  end if;
  if not exists (select 1 from pg_policies where tablename = 'correction_skips' and policyname = 'skips teacher update') then
    create policy "skips teacher update" on correction_skips for update using (current_user_is_teacher()) with check (current_user_is_teacher());
  end if;
end $$;
