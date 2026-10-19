# Correcting submissions with Claude

Nero asks in the Novaula project, for example "correct 5G's Startup Lab homework". A Claude
session downloads the submissions, marks each one, and uploads an annotated PDF per student.
Nero then reviews them in **Area docente → Correzioni da controllare**, and under
"Consegne ricevute" on the homework card. Everything stays teacher-only.

The annotated PDF has a summary page first (proposed grade, counts, a short summary, the list of
numbered points), followed by the student's pages with a margin for notes. Correct parts are
highlighted green, partly correct ones orange, and wrong ones red. All text in the PDF is in Italian.

## Pieces

- `strumenti/correggi.py` handles downloading, page previews, drawing, and uploading. It needs PyMuPDF
  (`python3 -m pip install pymupdf`).
- The Supabase Edge Function `correzioni` (source in `supabase/functions/correzioni/`) is the
  only door to the private buckets. It requires the header `x-novaula-token`.
- Table `corrections` and the private bucket `correzioni` are created by `aggiornamenti/2026-10-19-correzioni.sql`.
- The token lives in `private_settings`. Read it with the Supabase connector:
  `select value from private_settings where key = 'marking_token';` and export it as `NOVAULA_TOKEN`.
  Never write it into a file, memory, or chat.
- The session's network must allow `pplpkabznbihovqwzenq.supabase.co`, which requires a cloud environment with that allowed domain.

## Steps

```bash
export NOVAULA_TOKEN=...            # from private_settings, see above
cd /tmp/correzioni                  # scratch, NOT the shared folder (student work)
python3 strumenti/correggi.py scarica --classe 5g --compito "startup"
#   -> 5g-startup-lab-.../manifest.json, traccia.pdf, one <student>-<id>.pdf per submission
python3 strumenti/correggi.py pagine 5g-.../mario-rossi-1a2b3c4d.pdf
#   -> page PNGs with a 0-1 grid and every text line with its [x0,y0,x1,y1]
```

For each submission:

1. Read the assignment (`description` in manifest.json and `traccia.pdf`), then work out the expected answers yourself.
2. Look at the page PNGs and the extracted text. A scan or photo has no text, so mark it by `riquadro`.
3. Write `<student>.json` with `submission_id` (from the manifest), `studente`, `classe`, `compito`,
   `voto` (on the Italian 1-10 scale, a proposal), `sintesi` (2-3 sentences addressed to the teacher), and `segni`.
   Use one mark per answer or step: `esito` is `giusto`, `parziale`, or `sbagliato`, with `testo` (an exact snippet from the PDF)
   or `riquadro`, plus a short `nota` in Italian that says why and what the right answer is.
4. `python3 strumenti/correggi.py annota <student>.pdf <student>.json`, then look at the result
   (render a page to PNG) and check that the highlights sit on the right lines.
5. `python3 strumenti/correggi.py carica <student>.json --pdf <student>-corretto.pdf`

Be fair and specific. Praise what is right, too. For open-ended work (projects, essays) mark the
strong and weak passages rather than "right/wrong" per line. When unsure, use `parziale` and say so
in the note: Nero has the final word. Uploading again replaces the earlier correction and sets it back to "not reviewed".

Report to Nero in the thread with one line per student (name, proposed grade) and the pointer to Area docente.
Delete the scratch folder afterwards, because student work does not belong in the shared folder or the repo.
