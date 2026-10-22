# Novaula changelog

Every change to the app gets a new version here, newest first, and the same number goes in
`VERSION` at the top of `sito/app.js`, where it shows at the bottom of the home page and of Area docente.
Versions follow MAJOR.MINOR.PATCH: MAJOR when the way students or the teacher use the app changes,
MINOR for new features, PATCH for fixes. Each entry names any SQL in `aggiornamenti/` it needs.

## 2.11.0 (22 Oct 2026): slide bookmark
- Every lesson deck now has a «🔖» button in the slide bar (or press B) that puts a bookmark on the current slide,
  so a lesson that ran out of time can pick up where it stopped. One bookmark per deck; pressing it on another slide
  moves it there, pressing it again on the same slide removes it.
- When the deck is opened again, a small banner offers «Riprendi da lì» (jump to the bookmarked slide) or
  «Dall'inizio». Links that already point to a slide number open that slide as before.
- The bookmarked slide shows 🔖 next to its number, and the bar button shows which slide holds the bookmark.
- The bookmark is saved on the device (the LIM, the teacher's laptop or a student's phone), so students can use it
  for their own revision too. It comes from the shared deck engine (`deck.js`, `deck.css`), so every deck has it.
- No SQL. Service worker cache `classe-v27`.

## 2.10.0 (21 Oct 2026): hand-in button on lab slides
- Every "Al computer" lab slide in every deck (1D, 1E, 3E, 5G and future ones) now shows a yellow «📎 Consegna»
  button in the slide bar. It comes from the shared deck engine (`deck.js`, `interattivo.js`, `deck.css`), so no
  deck was edited by hand. Any other slide can get it with `data-consegna`; `data-consegna="no"` removes it.
- The hand-in form asks for Nome, Cognome, a text box for a comment or the written answer, and files: several at
  once (photos from the camera or gallery, PDFs, code, any type; up to 10 files, 20 MB each). Works on Android and iPhone.
- Profiles and PIN: a student already signed in on the site hands in as their profile. If the typed name matches a
  profile with a PIN, the form asks for the PIN; a profile without PIN is linked automatically. Names without a
  profile are still accepted.
- The first hand-in on a slide creates a hidden "Lavoro in classe" for that class (title "Lesson · slide N: …",
  description = the slide text, so automatic corrections know the exercise). Teachers find them in Compiti under
  «Docente: consegne dalle slide», grouped by lesson, with the usual «Consegne ricevute», downloads for every file,
  Claude's corrections and marks. Students don't see them in Compiti but find them in «Le mie consegne».
- On the LIM, the teacher's «📎 Consegna» button lists who has already handed in that slide.
- SQL: `aggiornamenti/2026-10-21-consegne-slide.sql` (applied): `assignments.deck/slide`, `submissions.files`,
  RPCs `slide_submit` and `slide_status`. Service worker cache `classe-v26`.

## 2.9.0 (21 Oct 2026): lesson-start notifications
- When a lesson in the timetable starts, the students of that class who turned on notifications get
  "Inizia la lezione" with subject, room and times, and so does the teacher. Tapping it opens the class page.
- Checked every minute by pg_cron (Mon–Sat, Rome time). An alert that can't be delivered within 15 minutes is dropped.
- A phone subscribed both as teacher and as a student gets one alert, not two.
- Numbered 2.9.0 because 2.7.0 and 2.8.0 are taken by other open PRs.
- SQL: `aggiornamenti/2026-10-21-notifiche-lezioni.sql` (applied). Edge Function `notifiche` v2 (deployed).

## 2.8.0 (20 Oct 2026): updates posted to Artache
- Every new Novaula version is now posted to the Artache Updates feed by itself: a GitHub Action
  (`.github/workflows/artache.yml`) runs on each push to `main` that changes this changelog and posts the newest entry
  as a release, then updates the "Novaula" platform item in the Artache Studio. Re-runs never post the same version twice.
- Only this changelog text is sent, never anything from the database about students; the script refuses to post
  anything that looks like a key or token. It needs the repository secret `ARTACHE_TOKEN`; without it nothing is sent.
- `CLAUDE.md` tells Claude sessions when to post milestones, questions and notes to Artache themselves.
- No change for students or in the app besides the version number (and the offline cache name). No SQL.

## 2.7.0 (20 Oct 2026): automatic corrections on hand-in
- A scheduled Claude task (no API key, a fresh Claude session each run) checks for new hand-ins every hour,
  Monday to Saturday 8:00–20:00, and corrects them like the on-request corrections: annotated PDF (green/orange/red),
  summary and proposed mark, hidden from students until the teacher accepts it or sets another.
- "Correzioni da controllare" in Area docente marks these with "⚡ Automatica" and the time, lists them first, and
  shows hand-ins Claude could not mark (video, unreadable file…) as "Da correggere a mano" with the reason and a
  "Riprova al prossimo giro" button.
- Each assignment's "Consegne ricevute" has a "Correzione automatica di Claude" switch (on by default).
- A hand-in is never corrected twice and an automatic run never replaces an existing correction. Hand-ins made only
  of a note are turned into a PDF and marked too.
- Hand-ins with several files (e.g. photos from a lab slide's hand-in button) are joined into one PDF and marked as a whole.
- Instructions for the task: `strumenti/CORREZIONE-AUTOMATICA.md`. Edge Function `correzioni` updated (deployed).
- SQL: `aggiornamenti/2026-10-20-correzioni-automatiche.sql` (applied).

## 2.6.0 (20 Oct 2026): phone notifications
- Students can turn on notifications in «Il mio profilo» («🔔 Notifiche sul telefono»). They get an alert for a new
  visible mark, a "Da rifare" or new material for their class or for them personally. Claude's proposed marks never
  notify: only marks the teacher confirmed. Students with a PIN see "Nuovo voto" without the mark on the lock screen.
- The teacher turns them on in Area docente and gets an alert for every new question in the Aiuto tab.
- A test notification arrives right after turning them on. Tapping a notification opens the right page.
- On iPhone notifications only work after «Aggiungi alla schermata Home» (iOS 16.4+): the profile shows the steps in Italian.
- Free Web Push from the app itself: database triggers call the new Edge Function `notifiche`, which writes the texts
  and sends them. Grading a whole class at once sends one alert per student, and a batch of materials sends one alert.
- SQL: `aggiornamenti/2026-10-20-notifiche.sql` (applied). Edge Function: `supabase/functions/notifiche` (deployed).

## 2.5.0 (20 Oct 2026): class tools on the LIM
- Under the teacher's "Adesso / Dopo" lesson card there is a new "Strumenti per la classe" bar (class of the current
  lesson preselected, any class can be chosen) with three full-screen tools, built for the LIM and for phones.
- Sorteggia: random student picker. Students with fewer confirmed marks are much more likely to be picked
  (weight 1/(1+marks)², the chance is shown next to each name). Tap a name to mark them absent; absent and already
  picked students are left out for the rest of the day on that device. After a pick: number of marks, desk from the
  seating plan, last oral test, "Assente, estrai un altro", and a quick "Salva interrogazione" that saves an oral mark.
  Space bar draws.
- Timer: presets from 1 to 30 minutes, "Fino a fine ora", ±1 minute, pause; big ring countdown, beeps and flashes at
  the end, keeps the screen on. It keeps running when the window is closed or the page changes (a chip in the corner shows it).
- Posti: seating plan per class with rows and desks per row, tap a name then a desk to place, move or swap,
  "Mescola" for a random plan, view from the desk or from the students. Saved automatically.
- SQL: `aggiornamenti/2026-10-20-strumenti-lim.sql` (new `seating_plans` table, teacher only; applied).

## 2.4.0 (20 Oct 2026): Pagella
- New "Pagella" page in Area docente (button next to "Vai alle classi", or `#/docente/pagella`): for each class and
  term, every student's average per mark type, the weighted average and a proposed whole mark for the register.
- Only marks the teacher confirmed count. Claude's unreviewed proposals and "Da rifare" are left out; the page and the
  file show how many are still waiting per student.
- Weights per mark type (default: test and oral 2, project 1.5, the rest 1), the same for all classes or set per class.
  The weighted average weighs each mark by its type; weight 0 leaves a type out.
- Terms default to trimestre (1 Sep–31 Dec) and pentamestre (1 Jan–30 Jun), plus "Anno intero"; names and dates can be changed.
- "Scarica Excel" downloads a real .xlsx for the class: one sheet per term plus a "Voti" sheet listing every confirmed mark.
- SQL: `aggiornamenti/2026-10-20-pagella.sql` (new `grade_settings` table, teacher only; applied).

## 2.3.0 (20 Oct 2026): weekly summary
- Area docente has a new "Riepilogo della settimana" box: for each class, open help desk questions (and unanswered
  slide questions), missing hand-ins for homework due in the last 7 days, things to check (identical files or same
  device between different students, late hand-ins, Claude's proposed marks to confirm, "Da rifare" pending) and the
  homework and tests due next week (homework still waiting for its topic is shown as "previsto").
- Every Friday afternoon Claude posts the same summary in English in the Novaula project.
- SQL: `aggiornamenti/2026-10-20-riepilogo.sql` (applied): functions `weekly_summary_data` (not callable from the site)
  and `teacher_weekly_summary` (teacher only).

## 2.2.0 (19 Oct 2026): the 3E TPSI course
- 3E's Programma now follows the textbook: 60 new topics after the 5 already there (Units 1–7, two group projects,
  three Educazione civica lessons), including the book's online lessons and labs.
- 60 new interactive decks for 3E, each with a PDF, polls, quizzes, puzzles, at least three computer labs and the
  "? Domande" button. Labs use free online tools with no account (OnlineGDB and Java Tutor for Java, CodePen,
  Photopea, AudioMass, JSLinux, Teachable Machine…). The older binary, conversion and hex decks are linked to the
  matching book topics.
- The two projects are our own on the book's themes: "DomoDash" (a smart-home dashboard) and "Il nostro Comune a
  raggi X" (a site on local waste and energy with real open data).
- 60 homework sheets, hidden until their topic is marked done, then due 14 days later; the two projects are group work.
- 7 unit tests, each with a practice test for students and the real test and answer key for the teacher.
- SQL: `aggiornamenti/2026-10-19-corso-3e-1-programma.sql` and `2026-10-19-corso-3e-2-compiti.sql` (applied).

## 2.1.0 (19 Oct 2026): the 5G TPSI course
- 5G's Programma now follows the textbook: 53 new topics after the 7 already done (Units 1–6, Learning by project,
  Educazione civica, Esame di Stato e orientamento), plus the Claude Code lesson.
- 42 new interactive decks for 5G (Units 1–6 and the three civic education lessons), each with a PDF, polls, quizzes,
  puzzles, three computer labs and the "? Domande" button. The older cybersecurity decks are linked to the matching book topics.
- 42 homework sheets, hidden until their topic is marked done, then due 14 days later. Unit 5 and the two chat labs
  are group work, as are two Learning by project assignments (no sheet).
- 6 unit tests in Verifiche: practice test public, real test and answer key under secret file names until the test is ticked.
- Teacher notes in every deck open with the N key, only for the logged-in teacher (deck engine update that had not been deployed yet).
- SQL: `aggiornamenti/2026-10-19-corso-5g-1-programma.sql` and `2026-10-19-corso-5g-2-compiti.sql` (applied).

## 2.0.0 (19 Oct 2026): student profiles and marks
- Students create their own profile per class («Il mio profilo»), with an optional 4-digit PIN that protects
  the private part. PINs are stored hashed, and 5 wrong tries lock the profile for 10 minutes. The teacher can reset a PIN.
- The profile shows marks by type with averages, every submission (including "Da rifare" attempts),
  personal materials and requests for material.
- Work is handed in under the profile. Group assignments let students add teammates.
- Marks by type (homework, classwork, test, oral, project, other), entered per student or for a whole class.
- Claude's grades from corrections become hidden proposals. The teacher accepts them, replaces them or sets "Da rifare".
- "Controlli di coerenza e copiature": identical files, the same device for different students, late work,
  homework far above in-class work, and marks far from a student's average.
- Assignments have a type and an optional "group work" flag.
- SQL: `aggiornamenti/2026-10-19-profili.sql` (applied).

## 1.7.0 (19 Oct 2026): corrections by Claude
- Claude marks submitted PDFs (green = right, red = wrong) with a proposed grade, shown only to the
  teacher in Area docente → "Correzioni da controllare". SQL: `2026-10-19-correzioni.sql`.

## 1.6.0 (19 Oct 2026): live timetable
- Area docente shows the lesson in progress and the next one. SQL: `2026-10-19-orario.sql`.

## 1.5.0 (19 Oct 2026): "Aiuto" help desk
- Quick in-class questions with photos and screenshots, classmates' comments and an FAQ board. SQL: `2026-10-19-helpdesk.sql`.

## 1.4.0 (19 Oct 2026): 1D/1E course
- 53 interactive decks, 53 homework sheets released when a topic is marked done, and 10 tests in the new
  Verifiche tab. Also questions on slides and phone voting (/vota.html). 3G renamed 3E TPSI. SQL: `2026-10-19-corso.sql`.
- Published from GitHub: pushes to `main` deploy novaula.netlify.app.

## 1.3.0 (16 Oct 2026): textbook programme
- Programma rebuilt on the textbook's units. SQL: `2026-10-16-programma-libro.sql`.

## 1.2.0 (13 Oct 2026): PDF viewer
- PDFs open inside the site (pdf.html) with a Close button, which fixes opening files on Android.

## 1.1.0 (12 Oct 2026): Programma tab
- Timeline of topics with linked materials, new lesson decks with PDF downloads, and a "Scarica" button.
  SQL: `2026-10-12-programma.sql`, `2026-10-12-pdf-presentazioni.sql`.

## 1.0.0 (12 Oct 2026): launch
- Per-class materials, homework hand-in without accounts, class chat, teacher login. Installable as an app on phones.
