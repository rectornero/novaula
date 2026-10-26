# Novaula changelog

Every change to the app gets a new version here, newest first, and the same number goes in
`VERSION` at the top of `sito/app.js`, where it shows at the bottom of the home page and of Area docente.
Versions follow MAJOR.MINOR.PATCH: MAJOR when the way students or the teacher use the app changes,
MINOR for new features, PATCH for fixes. Each entry names any SQL in `aggiornamenti/` it needs.

## 2.16.0 (26 Oct 2026): 5F GPOI full course with drag-and-drop exercises
- 5F GPOI now has the whole textbook program: 73 interactive lesson decks, one per textbook lesson across the ten
  units (from "L'impresa" to "Il rischio elettrico"), each with its PDF. They appear in the class's Materiali and are
  linked to 73 new "In programma" topics in the Programma tab, after the topics already covered.
- New drag-and-drop exercises in every lesson deck (`interattivo.js`), working with mouse, finger and the LIM pen:
  «Dividi in categorie» (drag cards into the right box: classifications, true/false, risk matrices) and «Trascina
  le parole» (drag words into the gaps of a text or onto the labels of a diagram, such as a CPM network or the
  break-even chart). Each has Controlla, Soluzione and Ricomincia; tapping a card and then its place also works.
- The existing order and match puzzles can now be dragged too (tapping two items to swap them still works).
  SQL: `aggiornamenti/2026-10-26-corso-5f-programma.sql`, already applied. Service worker cache `classe-v34`.

## 2.15.1 (25 Oct 2026): lower hosting and background costs
- Netlify now skips a production deploy when a push to `main` doesn't change the site (`sito/` or `netlify.toml`), and
  production deploys are batched to at most one per school day. Deploys were the platform's main hosting cost.
- The help desk refreshes every 60 seconds instead of 15 (live updates still arrive instantly through Supabase
  Realtime), and the teacher's meeting alarm checks every 60 seconds instead of 30, only while the page is visible.
- Background jobs no longer run every minute: lesson-start alerts and the daily wage alert run only at the lesson
  start and end minutes in the timetable (recomputed when the timetable changes), and meeting alerts run only at the
  next alert time (switched off when no meeting is coming). About 15,000 runs a week drop to about 150.
  SQL: `aggiornamenti/2026-10-25-cron-risparmio.sql`, already applied. Service worker cache `classe-v33`.
- New cost rules for every future change in `CLAUDE.md` ("Netlify credits").

## 2.15.0 (23 Oct 2026): daily wage card
- Teacher only: when the last lesson of the day ends (14:00 on days without lessons), a golden «Today's wage» card
  appears above the lessons on the home page and in Area docente, and stays until midnight. It shows the day's wage
  in big (+€84.09), a short cheer, and a piggy bank for the month: how much is earned so far out of the monthly
  salary, a progress bar and one coin per Monday–Friday day (today's coin pops in). The first time it is seen each
  day a few coins rain down (not with reduced motion). It appears by itself at the end time if the page is open.
- The «💶 Daily wage earned» phone notification now stays on screen until it is swiped away.
- Same maths as the notification: monthly salary / that month's Monday–Friday days, weekday holidays included.
  SQL: `aggiornamenti/2026-10-23-paga-card.sql` (function `teacher_wage_today`), already applied.
  Service worker cache `classe-v32`.

## 2.14.1 (23 Oct 2026): meetings on the teacher's home page
- When the teacher is logged in, the home page now shows «🎥 Prossime riunioni» right under the lesson cards: the
  meetings of the next 7 days (up to three), grouped by day, with an «Entra» button for the link, plus a link to the
  full Riunioni page to add more. Service worker cache `classe-v31`.

## 2.14.0 (23 Oct 2026): teacher meetings with an alarm before each one
- New page «🎥 Riunioni» in Area docente (`#/docente/riunioni`) for class councils (CdC) and GLO meetings: date, time,
  class, Meet link, length and an optional note. Upcoming meetings are grouped by day (Oggi, Domani, …) with a big
  «Entra» button that opens the link; past ones are folded away at the bottom. Each meeting can be edited, deleted
  or added to Google Calendar («📅 Aggiungi al calendario»), so the phone calendar can ring too.
- Adding one takes a few taps: a CdC / GLO menu, a class menu, day buttons for the next two weeks (Oggi, Domani,
  lun 26…), start-time buttons from 14.00 to 19.30 every half hour, length buttons (30 min to 2 hours) and the
  alarm lead time (5 minutes to 1 hour, default 10). Any other date or time can still be typed.
- Area docente also shows a «🎥 Riunioni» box with the next three meetings.
- Alarm-style phone notification for the teacher, meetings only: «⏰ Tra 10 min: Consiglio di classe 5G». It stays
  on screen until tapped, vibrates longer than normal alerts, and comes back at start time («⏰ Inizia ora»).
  Tapping it opens the Meet link directly. Web notifications can't use a custom ringtone, so it uses the phone's
  notification sound.
- When Novaula is open on any page, a full-screen alarm also appears and beeps until «Apri Meet» or «Silenzia».
- SQL: `aggiornamenti/2026-10-23-riunioni.sql` (table `meetings`, teacher-only RLS, `meetings_push()` and pg_cron job
  `novaula-riunioni` every minute), already applied with this week's councils. Edge Function `notifiche` gains the
  `riunione` type (already deployed). Service worker cache `classe-v30`.

## 2.13.0 (23 Oct 2026): class announcements and daily wage notification
- The teacher can post a short announcement («avviso», up to 500 characters) to one or more classes, from the yellow
  «Docente: nuovo avviso» panel under the class title or from the new «📌 Avvisi di classe» box in Area docente
  (with a tick list of classes). It stays pinned at the top of the class page, above the tabs, so it shows on every
  tab including the chat, until midnight (or until tomorrow night, if chosen), then disappears by itself.
- The pinned note is a big yellow card with the time it was posted and how long it stays; links in the text are
  clickable, and on the LIM the text is larger. It appears live on open pages (Realtime) and drops off at expiry
  even if the page stays open. The teacher can remove it early with «Togli».
- Every new announcement sends a phone notification («📌 Avviso · 5G TPSI») to the class students who turned
  notifications on, and one to the teacher as a test («📌 Avviso inviato», one per text even when sent to several
  classes). Tapping it opens the class page. The notification expires with the announcement.
- On the home page, classes with an active announcement show a «📌 Avviso» tag.
- Teacher only: at the end of every weekday (when the last lesson of the day ends, 14:00 if there are none) a phone
  notification «💶 Daily wage earned: €84.09», with what the month has paid so far («October so far: €1,429.55 (17 of
  22 working days)»). Daily wage = monthly salary (`private_settings.paga_mensile`, 1850) divided by that month's
  Monday–Friday days; weekday holidays count as paid days, Saturday and Sunday never. pg_cron job `novaula-paga`.
  SQL: `aggiornamenti/2026-10-23-paga.sql`, already applied.
- SQL: `aggiornamenti/2026-10-23-avvisi.sql` (table `announcements`, RLS, Realtime, push trigger), already applied.
  Edge Function `notifiche` gains the `avviso` type (already deployed). Service worker cache `classe-v29`.

## 2.12.0 (22 Oct 2026): full teacher timetable
- New page «Orario completo» in Area docente (`#/docente/orario`, also linked under the "Adesso / Dopo" cards):
  the teacher's whole weekly timetable, one day at a time. A day menu at the top (opens on today; on weekends on
  Monday) plus ‹ › buttons and the left/right arrow keys switch day. The chosen day stays in the link
  (`#/docente/orario/3` = Wednesday), so it can be bookmarked.
- Each day shows how many hours, from when to when and which classes, then every lesson in order: start and end
  time, which period (1ª–7ª ora, double periods marked), class in its colour, subject, the room in big yellow with
  building and floor, and the timetable note. Free periods between lessons are shown as «Ora libera», and between
  two lessons the route from one room to the next (same logic as the "Dopo" card), flagged in red when the move is
  long and there is no break. On today's page the lesson in progress is highlighted with a progress bar and the
  lessons already done are dimmed; it refreshes every 30 seconds.
- Below, «Tutta la settimana»: a Monday–Friday grid by period with class and room in every cell (double periods
  span two rows), the hours per class and in total, and a «Stampa» button that prints just the grid.
- Works on the phone and on the LIM, light and dark theme. Reads the same `timetable` table (no SQL). Service worker
  cache `classe-v28`.

## 2.11.0 (22 Oct 2026): slide bookmark, bigger rooms and routes on the timetable
- Every lesson deck now has a «🔖» button in the slide bar (or press B) that puts a bookmark on the current slide,
  so a lesson that ran out of time can pick up where it stopped. One bookmark per deck; pressing it on another slide
  moves it there, pressing it again on the same slide removes it.
- When the deck is opened again, a small banner offers «Riprendi da lì» (jump to the bookmarked slide) or
  «Dall'inizio». Links that already point to a slide number open that slide as before.
- The bookmarked slide shows 🔖 next to its number, and the bar button shows which slide holds the bookmark.
- The bookmark is saved on the device (the LIM, the teacher's laptop or a student's phone), so students can use it
  for their own revision too. It comes from the shared deck engine (`deck.js`, `deck.css`), so every deck has it.
- Teacher timetable ("Adesso / Dopo" cards): the room is now shown big, with the building and floor spelled out
  (for example «2B01 · Edificio B · 2º piano · TB1»; `T` = piano terra). The strip of today's lessons shows the rooms in bold.
- The "Dopo" card suggests a route from the room you are in (or the last room of the day) to the next one: change floor
  in the same building, cross between B and C through the connecting passage, or go outside for building A, which is
  not connected. A long move with no break between lessons is flagged in red. Room codes are read as floor + building
  + room number. The floors of the B–C passage can be set in `LINK_FLOORS` in `sito/orario.js` (now: every floor).
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
