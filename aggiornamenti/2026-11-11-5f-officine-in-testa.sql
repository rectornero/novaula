-- Novaula 3.1.1: 5F, ogni Officina in testa alla sua fase (Storywriting, 2026-11-11)
-- Con 3.1.0 l'Officina N stava DOPO i suoi argomenti di Teoria, così l'Officina 1 era 15 argomenti più in basso
-- e il Programma sembrava quello di prima. Teoria (1 h) e Officina (2 h) corrono in parallelo ogni settimana,
-- quindi ogni Officina va all'inizio della sua fase: l'Officina 1 diventa il prossimo argomento.
-- Cambia solo la posizione di 6 argomenti. Idempotente, non cancella niente.
update topics set position = 65  where class_id = '5f' and title = 'Officina 1 · Business Model Canvas' and position <> 65;
update topics set position = 225 where class_id = '5f' and title = 'Officina 2 · Mercato e SWOT' and position <> 225;
update topics set position = 335 where class_id = '5f' and title = 'Officina 3 · WBS, OBS e RACI' and position <> 335;
update topics set position = 445 where class_id = '5f' and title = 'Officina 4 · Reticolo CPM e Gantt' and position <> 445;
update topics set position = 555 where class_id = '5f' and title = 'Officina 5 · Preventivo, pareggio e rischi' and position <> 555;
update topics set position = 665 where class_id = '5f' and title = 'Officina 6 · Business plan e pitch' and position <> 665;
