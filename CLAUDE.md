# Novaula: notes for Claude

## Artache
This studio tracks its work in Artache. The `artache` MCP tools post there (see "Posting updates to Artache").
- Use `rectornero/novaula` as `project`.
- Releases are posted automatically: every push to `main` that changes `CHANGELOG.md` runs
  `.github/workflows/artache.yml`, which posts the newest changelog entry as a `release` and updates the Studio item
  `rectornero/novaula:platform`. So do not post a `release` for a version bump yourself; write a good CHANGELOG entry instead.
- Post yourself only for what the changelog does not cover: `milestone` for a big step inside longer work,
  `question` when Nero must decide something, `note` for a decision or tradeoff worth keeping. Check
  `artache_recent_updates` first if unsure whether it was already posted.
- Title under 100 characters, written for someone who didn't see the session. Body: what changed, why it matters,
  what's next, in English. Add a `url` to the PR or doc when there is one.
- Never put student data in Artache: no student names, marks, hand-ins, PINs, tokens, keys or anything read from the
  Supabase database. App progress and release notes only.
- If the `artache` tools are not available in the session (cloud sessions can't reach artache.netlify.app unless the
  environment allows it), skip posting; don't work around it.
