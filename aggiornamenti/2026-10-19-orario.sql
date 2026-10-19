-- Novaula · aggiornamento del 19/10/2026: orario settimanale del docente.
-- Serve al riquadro "Adesso / Dopo" nella home dell'area docente.
-- Incollare tutto nel SQL Editor di Supabase ed eseguire. Si può rieseguire: non crea doppioni.
-- Visibile e modificabile solo dal docente (gli studenti non lo leggono).

create table if not exists timetable (
  id          bigint generated always as identity primary key,
  weekday     smallint not null check (weekday between 1 and 7),   -- 1 = lunedì … 5 = venerdì
  starts      time not null,
  ends        time not null check (ends > starts),
  class_id    text not null references classes on delete cascade,
  subject     text not null check (char_length(subject) <= 60),
  room        text check (char_length(room) <= 40),
  note        text check (char_length(note) <= 60),
  unique (weekday, starts)
);

alter table timetable enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'timetable' and policyname = 'timetable teacher') then
    create policy "timetable teacher" on timetable for all
      using (current_user_is_teacher()) with check (current_user_is_teacher());
  end if;
end $$;

-- Orario 2026/27 (dalla foto del 19/10/2026). Ore: 8.00, 8.55, 9.55, 10.55, 11.55, 12.45, 13.35.
-- Le ore doppie consecutive sono un'unica riga. 3E ha id '3g'.
insert into timetable (weekday, starts, ends, class_id, subject, room, note) values
  (1, '08:00', '09:55', '1d', 'Info. Reti · Lab', 'TC02 LI', 'CAR_24'),
  (1, '09:55', '10:55', '1e', 'Info. Reti',       '2B01 TB1', null),
  (1, '10:55', '11:55', '5f', 'GPO · Lab',        '4B01 LI', 'CAR_23'),
  (2, '08:00', '09:55', '5g', 'TPSI · Lab',       '4B02', 'GUE_75'),
  (2, '09:55', '10:55', '3g', 'TPSI · Lab',       'TC02 LI', 'SCA_131'),
  (3, '08:00', '08:55', '1e', 'Info. Reti',       '2B01 TB1', null),
  (3, '08:55', '09:55', '5g', 'TPSI · Lab',       '4B02', 'GUE_75'),
  (3, '09:55', '10:55', '1d', 'Info. Reti',       '2B01 TB1', null),
  (3, '10:55', '11:55', '5f', 'GPO',              '1C04', null),
  (4, '08:00', '08:55', '1d', 'Info. Reti',       '2B06 TB2', null),
  (4, '08:55', '09:55', '3g', 'TPSI',             '3B03', null),
  (5, '08:00', '08:55', '5f', 'GPO',              '1C04', null),
  (5, '08:55', '10:55', '1e', 'Info. Reti · Lab', 'TC02 LI', 'SCA_131'),
  (5, '11:55', '12:45', '3g', 'TPSI',             '3B04', null),
  (5, '12:45', '13:35', '5g', 'TPSI',             '1C05', null)
on conflict (weekday, starts) do nothing;
