# Novaula changelog

Every change to the app gets a new version here, newest first, and the same number goes in
`VERSION` at the top of `sito/app.js`, where it shows at the bottom of the home page and of Area docente.
Versions follow MAJOR.MINOR.PATCH: MAJOR when the way students or the teacher use the app changes,
MINOR for new features, PATCH for fixes. Each entry names any SQL in `aggiornamenti/` it needs.

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
