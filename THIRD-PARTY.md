# Third-party code and fonts in Novaula

Everything else in `sito/` was written for Novaula: the app by Claude for Nero, the lesson decks, homework, tests
and class materials by Claude on Nero's course plans, and the app icons by Claude (they carry Anthropic C2PA
content credentials). The site loads nothing from other hosts except the school's Supabase project.

| File | What | License | Notice |
|---|---|---|---|
| `sito/vendor/supabase.js` | supabase-js 2.117.2 | MIT | `sito/vendor/supabase.LICENSE.md` |
| `sito/vendor/pdfjs/pdf.min.js`, `pdf.worker.min.js` | pdf.js (Mozilla) | Apache-2.0 | `sito/vendor/pdfjs/LICENSE` |
| `sito/vendor/pdf-lib.min.js` | pdf-lib (Andrew Dillon) | MIT | `sito/vendor/pdf-lib.LICENSE.md` |
| `sito/vendor/qrcode.js` | QR Code Generator (Kazuhiko Arase) | MIT | header of the file |
| `sito/fonts/atkinson-hyperlegible-*.woff2` | Atkinson Hyperlegible (Braille Institute) | OFL 1.1 | `sito/fonts/OFL.txt` |
| `sito/fonts/bricolage-grotesque-*.woff2` | Bricolage Grotesque | OFL 1.1 | `sito/fonts/OFL.txt` |
| `sito/fonts/dm-sans-*.woff2` | DM Sans | OFL 1.1 | `sito/fonts/OFL.txt` |
| `sito/fonts/jetbrains-mono-*.woff2` | JetBrains Mono | OFL 1.1 | `sito/fonts/OFL.txt` |

"QR Code" is a registered trademark of DENSO WAVE INCORPORATED.

`node strumenti/audit-licenze.mjs` checks that every file in `sito/` is covered here or is Novaula's own work, that
each license file is present, that images carry provenance, and that no page loads code, styles or fonts from another
host. It runs on every push and pull request and each weekday morning (`.github/workflows/licenze.yml`).
Add a row here, and a rule in the script, before adding any new third-party file.
