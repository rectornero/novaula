# Class platform: setup guide

The platform is a small website (folder `sito`) plus a free Supabase project that stores materials, homework and chat messages. Students open the link with no account; only you log in, as the teacher.

Cost: €0 on both free plans. Time: about 15 minutes, once.

## 1. Create the database (Supabase)

1. Go to https://supabase.com, sign up (Google or GitHub login is fine), and click **New project**.
   - Name: `classe`. Region: **Central EU (Frankfurt)**, to keep student data in the EU.
   - Choose a database password and save it somewhere (you will rarely need it).
2. When the project is ready, open **SQL Editor** → **New query**, paste the whole content of `setup.sql`, and click **Run**. It should say "Success".
3. Create your teacher login: **Authentication → Users → Add user → Create new user**. Enter your email and a strong password, and tick **Auto Confirm User**.
4. Make that user the teacher: back in **SQL Editor**, run this (with your email):
   ```sql
   insert into teachers select id from auth.users where email = 'YOUR-EMAIL';
   ```
5. Turn off public sign-ups: **Authentication → Sign In / Providers** → disable **Allow new users to sign up**.
6. Open **Project Settings → API** (or **Data API**) and copy two values: the **Project URL** and the **anon public** key. The anon key is meant to be public, so it is safe to share it with Claude.

## 2. Connect the website

Open `sito/config.js` and paste the two values:

```js
SUPABASE_URL: "https://xxxx.supabase.co",
SUPABASE_ANON_KEY: "eyJ...",
```

(Or send them to Claude in the Management thread, and Claude will do this and test the live platform.)

## 3. Put it online (Netlify)

1. Go to https://app.netlify.com/drop and sign up (free).
2. Drag the whole `sito` folder onto the page. After a few seconds you get a link like `https://random-name.netlify.app`.
3. Optional: **Site configuration → Change site name** to something easy, like `classi-prof.netlify.app`.
4. To update the site later: **Deploys** tab → drag the `sito` folder again.

## 4. Share it with students

- Send each class the link (a QR code on the whiteboard works well).
- Android (Chrome): menu ⋮ → **Add to Home screen**. iPhone (Safari): Share → **Add to Home Screen**. It then opens like an app.
- Windows and Linux: any modern browser (Chrome, Edge, Firefox).

## Using it as the teacher

Open the site, tap **Area docente**, and log in. In each class you then see yellow panels to:
- publish materials (a link, or a file such as a PDF up to 50 MB);
- assign homework with a due date, and download what students handed in;
- write in the chat as **Docente** and delete messages.

## Good to know

- **Free-plan pause:** Supabase pauses a free project after 7 days with no activity (for example, during holidays). Students then see a connection error. Fix: open supabase.com and click **Restore project**.
- **Limits:** 1 GB of files and 500 MB of data on the free plan. Homework files are capped at 20 MB each. Delete old hand-ins at the end of the year to free space.
- **No accounts means no identity check.** Anyone with the link can read the chat and post under any name. You can delete messages; if it gets abused, change the site name on Netlify to get a new link.
- **Privacy:** the platform stores students' names, chat messages and homework files. Check that this fits your school's privacy rules before using it with the classes.
- The two claude.ai presentations linked for 3G and 5F only open for students if they are shared publicly. Exporting them to PDF and uploading them as files is more reliable.
