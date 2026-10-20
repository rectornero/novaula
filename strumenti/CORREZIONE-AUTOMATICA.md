# Automatic correction on hand-in

A scheduled Claude task runs every hour, Monday to Saturday from 8:00 to 20:00 (Europe/Rome), in the
"Novaula" cloud environment (it has `NOVAULA_TOKEN` and can reach `*.supabase.co`). No API key is
involved: each run is a fresh Claude session that follows this file. It corrects every new hand-in the
same way as [GUIDA-CORREZIONI.md](GUIDA-CORREZIONI.md) and leaves the result for Nero in
**Area docente → Correzioni da controllare**, marked "⚡ Automatica". The proposed mark stays hidden
from students until Nero accepts it or sets another one.

## Rules for the run

- **Quiet when there is nothing new.** If `scarica --nuove` prints `Nessuna consegna nuova.`, stop at once:
  no files, no messages, no other tool calls.
- **Idempotent.** The queue only contains hand-ins with no correction and no skip, so a hand-in is never
  corrected twice. `carica --automatica` also refuses to replace an existing correction (prints
  `Già corretta`), so two overlapping runs cannot overwrite each other or a correction Nero asked for.
- **Never touch marks or the database directly.** Everything goes through `correggi.py`; the database turns
  the uploaded `voto` into a hidden proposed mark by itself.
- **Student work stays in a scratch folder** (`mktemp -d`), deleted at the end. Never print `NOVAULA_TOKEN`.
- **Cap:** at most 25 hand-ins per run; the rest are picked up next hour.

## Steps

```bash
python3 -m pip install -q pymupdf
W=$(mktemp -d)
python3 strumenti/correggi.py scarica --nuove --dir "$W"
```

For each folder in `$W` (one per assignment) read `manifest.json`: the assignment (`title`, `description`,
`kind`, `group_work`) and `traccia.pdf` if present. Work out the expected answers once per assignment.
Then for each entry in `consegne`:

1. **No usable PDF** (`pdf` is null: video, archive, unknown format, empty hand-in) or work that can't be
   judged from the file (a physical object, a live presentation, a file that is only a link with nothing
   to read): skip it with a short Italian reason, then go on:
   `python3 strumenti/correggi.py salta <id> "Il file è un video (.mp4): va guardato a mano."`
   Spreadsheets and other formats: try the conversions in GUIDA-CORREZIONI.md first.
2. `python3 strumenti/correggi.py pagine "$W/<folder>/<pdf>"` and look at the page images and text.
3. Write `<name>.json` exactly as GUIDA-CORREZIONI.md says (`submission_id` = the entry's `id`,
   `studente`, `classe`, `compito`, `voto` like `7`, `7+`, `6½`, `sintesi`, `segni`; all text in Italian).
   For an entry with `"solo_nota": true` the student wrote the answer in the note: mark the generated PDF.
4. `python3 strumenti/correggi.py annota <pdf> <name>.json`, render one page to check the highlights sit
   on the right lines, fix the JSON if not.
5. `python3 strumenti/correggi.py carica <name>.json --pdf <name>-corretto.pdf --automatica`

If one hand-in fails (download error, crash), leave it alone: it stays in the queue for the next run.
If the same one has clearly failed for a reason that will not go away, skip it with that reason.

Finally `rm -rf "$W"` and end with a two-line summary (how many corrected, how many skipped), with no
student names.

## Teacher controls (in the app)

- Each assignment's "Consegne ricevute" has the switch **Correzione automatica di Claude** (column
  `assignments.auto_correct`, on by default). Off = the task ignores that assignment.
- Skipped hand-ins show in "Correzioni da controllare" as **Da correggere a mano** with the reason;
  **Riprova al prossimo giro** puts them back in the queue (`correction_skips.retry = true`).
- SQL: `aggiornamenti/2026-10-20-correzioni-automatiche.sql`. Edge Function: `supabase/functions/correzioni`
  (`consegne` with `nuove`, `salva` with `automatica`, `salta`).
