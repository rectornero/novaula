-- Novaula 2.16.1 · Nuovo orario docente (ORARIO DOCENTE Di_54, 26/10/2026)
-- Sostituisce del tutto il vecchio orario. Campanelle: 8.00, 8.55, 9.50, 10.50, 11.50, 12.45, 13.35.
-- Le ore doppie sono una sola riga. L'inserimento fa scattare il trigger timetable_reschedule,
-- che sposta solo novaula-paga alla fine dell'ultima lezione del giorno (novaula-lezioni resta spento).

delete from timetable;

insert into timetable (weekday, starts, ends, class_id, subject, room, note) values
  (1, '08:00', '09:50', '5g', 'TPSI · Lab',       '4B02 LI',  'GUE_77'),
  (1, '09:50', '10:50', '5f', 'GPO · Lab',        '4B01 LI',  'CAR_24'),
  (1, '11:50', '12:45', '3g', 'TPSI',             '3B03',     null),
  (1, '12:45', '13:35', '1e', 'Info. Reti',       '2B01 TB1', null),
  (2, '08:00', '09:50', '1d', 'Info. Reti · Lab', 'TC02 LI',  'CAR_25'),
  (2, '09:50', '10:50', '5g', 'TPSI · Lab',       '4B02 LI',  'GUE_77'),
  (2, '10:50', '11:50', '3g', 'TPSI',             '3B03',     null),
  (3, '08:00', '08:55', '1d', 'Info. Reti',       '2B01 TB1', null),
  (3, '08:55', '09:50', '5f', 'GPO',              '1C03',     null),
  (3, '09:50', '10:50', '5g', 'TPSI',             '2C05',     null),
  (4, '08:00', '09:50', '1e', 'Info. Reti · Lab', 'TC02 LI',  'SCA_133'),
  (4, '09:50', '10:50', '5f', 'GPO',              '1C05',     null),
  (4, '10:50', '11:50', '3g', 'TPSI · Lab',       'TC02 LI',  'SCA_133'),
  (5, '10:50', '11:50', '1e', 'Info. Reti',       '2B01 TB1', null),
  (5, '12:45', '13:35', '1d', 'Info. Reti',       '2B01 TB1', null);
