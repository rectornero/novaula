# Novaula: notes for Claude

## Artache
This studio tracks its work in Artache. The `artache` MCP tools talk to it.

- No `artache` tools in this session (cloud sessions)? Use the same API over HTTPS with the `ARTACHE_TOKEN` environment
  variable: `curl -sS "https://artache.netlify.app/api/v1/inbox?project=rectornero/novaula" -H "Authorization: Bearer $ARTACHE_TOKEN"`
  for the inbox, and POST JSON (`project`, `kind`, `title`, `body`, `url`, `brief_id`) to `/api/v1/posts` for updates.
  Briefs: POST `/api/v1/briefs/<id>` with `status`; replies: POST `/api/v1/replies`.
- At the start of a session, call `artache_inbox` with `rectornero/novaula` to see briefs and studio replies for this
  project. Briefs come first: accept one with `artache_update_brief` before starting, say what blocks you in a reply,
  and mark it done with a `result_url` when finished. Answer studio replies with `artache_reply`.
- After meaningful progress (a feature or fix merged, a release or deploy, a milestone, a decision, or a question the
  team must answer), post one update with `artache_post_update` (with `brief_id` when it delivers a brief). Use
  `rectornero/novaula` as `project`.
- Releases are posted automatically: every push to `main` that changes `CHANGELOG.md` runs
  `.github/workflows/artache.yml`, which posts the newest changelog entry as a `release` and updates the Studio item
  `rectornero/novaula:platform`. So do not post a `release` for a version bump yourself; write a good CHANGELOG entry
  instead. Post yourself only for what the changelog does not cover.
- Write the title for someone who didn't see the session (under 100 characters). In the body, in English: what
  changed, why it matters, what's next. Add a `url` to the PR, deploy or doc when there is one.
- Use kind `release` for something shipped (normally left to the workflow above), `milestone` for a big step,
  `question` when you need a human decision, `note` for context, `update` otherwise.
- Don't post for trivial edits, failed attempts or work in progress with nothing to show. One update per meaningful
  result; check `artache_recent_updates` if unsure whether it was already posted.
- When you create or publish a platform, article or other work, record it with `artache_upsert_work` and a stable `key`
  like "rectornero/novaula:article-slug", so later changes update the same item.
- Never put student data in Artache: no student names, marks, hand-ins, PINs, tokens, keys or anything read from the
  Supabase database. App progress and release notes only.

## Netlify credits
All of Nero's sites (laventina, artache, novaula, ai-ice, tzero) share one Netlify team, "overgame-director", with one
credit balance: 1,000 credits a month plus bought packs. When it hits zero, every site is paused. Prices: production
deploy 15 credits; compute and database compute 10 credits per GB-hour; bandwidth 20 credits per GB; web requests 2
credits per 10,000; AI Gateway 180 credits per USD. Deploy Previews and branch deploys are free.

- Every push to `main` that changes `sito/` or `netlify.toml` is a production deploy (other pushes are skipped by the
  `ignore` command in `netlify.toml`). Test on branches (free). Batch changes into as few production deploys as
  possible, at most one per school day, and ask Nero before deploying while credits are low.
- No scheduled job or polling loop touches the database on every run. Gate it on a cheap check (such as a note of when
  there is next work), or use delayed or event-driven scheduling instead of polling. This also holds for Supabase
  pg_cron: `novaula-riunioni` is scheduled only for the next meeting alert, and `novaula-lezioni` / `novaula-paga`
  only at lesson start and end minutes from `timetable` (`aggiornamenti/2026-10-25-cron-risparmio.sql`).
- Client polling (setInterval, refetch) is never faster than 60 seconds and skips hidden tabs; prefer Supabase Realtime.
- No Netlify AI Gateway (or any other paid AI API) unless Nero approves it.
- Before adding any schedule, polling loop, Netlify Function or production deploy, estimate its monthly credits and
  say the number to Nero.
