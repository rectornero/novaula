# Scanned paper tests: split per student, then mark

Nero prints a test from **Area docente → Piano valutazioni → Verifiche → 🖨 Stampa**: one copy per student,
and every page carries a band at the top with the student's name (or a blank "Nome e cognome" line on
spare copies), class, test date, `pag. N/M` and `cod. XXXX`. The code is the first 4 hex characters of the
student's id, uppercased (`codice()` in `correggi.py`, `code()` in `sito/valutazioni.js`).

After the test he scans the papers (one PDF for the whole class in any order, or photos) and uploads them
with **📥 Scansioni** next to the test. They wait in the inbox (`test_scans`, status `nuova`) until he asks
in the Novaula project, for example "correct the scans" / «Correggi le scansioni delle verifiche».
Nothing runs on a schedule (Nero chose this on 2026-10-27).

## Steps

```bash
python3 -m pip install -q pymupdf
W=$(mktemp -d)                                  # student work: scratch only, never the shared folder
python3 strumenti/correggi.py scansioni --dir "$W"
#   -> $W/scan-<id>/manifest.json, scansione.pdf, verifica.pdf, soluzioni.pdf (when on the site)
python3 strumenti/correggi.py pagine "$W/scan-<id>/scansione.pdf"
```

1. **Split.** Look at every page image. Match each page to a student from the printed band: the code is the
   most reliable (`studenti[].codice` in the manifest; `codici_doppi` lists codes that are not unique, use the
   name there). Spare copies (`cod. X1`, `X2`…) have a handwritten name: match it to the class list; if you
   can't, leave those pages out. Use `pag. N/M` to order pages and spot missing ones. Pages can be upside down
   or out of order. Write `divisione.json`:
   `{"copie": [{"student_id": "...", "pagine": [3, 4, 1]}], "non_assegnate": [9], "nota": "Pagina 9 senza nome."}`
   then `python3 strumenti/correggi.py dividi "$W/scan-<id>/manifest.json" divisione.json`.
   Each copy becomes a hand-in of a hidden assignment linked to the test (`assignments.test_id`, never shown
   to students) and the scan is closed. If the scan can't be split at all (wrong test, unreadable):
   `python3 strumenti/correggi.py scansione-errore <scan_id> "motivo in italiano"`.
2. **Mark.** `python3 strumenti/correggi.py scarica --nuove --dir "$W/correzioni"` now lists the copies.
   Mark them exactly as [GUIDA-CORREZIONI.md](GUIDA-CORREZIONI.md) says, using `soluzioni.pdf` from step 1
   as the answer key (scans have no text layer: mark by `riquadro`), and upload with
   `carica ... --automatica`. The proposed `voto` becomes a hidden proposed mark of category `verifica`
   with the test's id and date; Nero accepts or changes it in "Correzioni da controllare".
3. `rm -rf "$W"` and reply to Nero in English: per class and test, how many copies were split and marked,
   pages that couldn't be assigned, and a pointer to Area docente. No student names outside the thread.

## Pieces

- SQL: `aggiornamenti/2026-10-27-valutazioni.sql` (`test_scans`, buckets `scansioni` and `stampe`,
  `assignments.test_id`, functions `scan_inbox`, `scan_register_student`, `scan_done`).
- Edge Function `correzioni`: ops `scansioni`, `dividi`, `scansione_fatta` (same `x-novaula-token`).
