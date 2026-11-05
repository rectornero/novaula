# Strumenti archiviati (Novaula 3.0.0, «senza dati personali»)

Dal 2026-11-05 Novaula non raccoglie più dati personali degli studenti: niente profili, consegne, voti,
scansioni o correzioni. Per questo sono stati tolti dal repository:

- `strumenti/correggi.py`, `GUIDA-CORREZIONI.md`, `CORREZIONE-AUTOMATICA.md`, `SCANSIONI.md`
  (correzione con Claude delle consegne e delle verifiche scansionate);
- la funzione Edge `supabase/functions/correzioni`.

Le consegne e i voti passano da Google Classroom e dal registro elettronico. Le vecchie versioni restano
nella storia di git (ultimo commit che li contiene: quello prima di «Novaula 3.0.0»), ma non vanno
rimesse in uso senza una nuova valutazione privacy dell'ufficio Licensing.
