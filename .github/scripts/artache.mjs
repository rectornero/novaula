#!/usr/bin/env node
// Posts the newest CHANGELOG.md entry to the Artache Updates feed as a release
// and keeps the Novaula platform item in the Artache Studio up to date.
//
//   node .github/scripts/artache.mjs [--dry-run] [--changelog CHANGELOG.md]
//
// Reads ARTACHE_TOKEN (required unless --dry-run) and ARTACHE_URL (default https://artache.netlify.app).
// Only the changelog text goes out: never student names, marks, hand-ins, PINs or anything from the database.

import { readFileSync } from "node:fs";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const changelogPath = args.includes("--changelog") ? args[args.indexOf("--changelog") + 1] : "CHANGELOG.md";
const base = (process.env.ARTACHE_URL || "https://artache.netlify.app").replace(/\/+$/, "");
const token = process.env.ARTACHE_TOKEN || "";
const project = process.env.ARTACHE_PROJECT || process.env.GITHUB_REPOSITORY || "rectornero/novaula";
const site = "https://novaula.netlify.app";

// "## 2.6.0 (20 Oct 2026): phone notifications" followed by "- " bullets (continuation lines indented).
function latestEntry(text) {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((l) => /^## \d+\.\d+\.\d+/.test(l));
  if (start < 0) throw new Error("No version heading found in " + changelogPath);
  const m = lines[start].match(/^## (\d+\.\d+\.\d+)\s*(?:\(([^)]*)\))?\s*:?\s*(.*)$/);
  const bullets = [];
  for (let i = start + 1; i < lines.length && !lines[i].startsWith("## "); i++) {
    const l = lines[i];
    if (/^- /.test(l)) bullets.push(l.slice(2).trim());
    else if (l.trim() && bullets.length) bullets[bullets.length - 1] += " " + l.trim();
  }
  return { version: m[1], date: m[2] || "", name: m[3].trim(), bullets };
}

// Last line of defence: the changelog should never contain secrets, but refuse to send anything that looks like one.
function assertClean(s) {
  const secret = /(art_[A-Za-z0-9]{8,}|sb_secret_|service_role|eyJ[A-Za-z0-9_-]{20,}\.|-----BEGIN [A-Z ]*PRIVATE KEY)/;
  if (secret.test(s)) throw new Error("Refusing to post: the text looks like it contains a secret.");
}

const entry = latestEntry(readFileSync(changelogPath, "utf8"));
const title = `Novaula ${entry.version}: ${entry.name}`.slice(0, 99);
let body = entry.bullets.map((b) => "- " + b).join("\n");
if (body.length > 1800) body = body.slice(0, 1800).replace(/\s+\S*$/, "") + " …";
body += `\n\nLive on ${site}` + (entry.date ? ` since ${entry.date}.` : ".");
assertClean(title + body);

const post = { project, kind: "release", title, body, url: site, author: "GitHub Actions (novaula release)" };
const work = {
  key: `${project}:platform`,
  kind: "platform",
  status: "published",
  project,
  title: "Novaula",
  url: site,
  summary: `Class platform for an Italian technical high school (materials, programme, homework, tests, marks, help desk). Current version ${entry.version}.`,
  tags: ["school", "supabase", "netlify"],
};

async function api(method, path, payload) {
  const res = await fetch(base + path, {
    method,
    headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
    body: payload ? JSON.stringify(payload) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}: ${text.slice(0, 300)}`);
  try { return JSON.parse(text); } catch { return text; }
}

if (dryRun) {
  console.log("POST " + base + "/api/v1/posts\n" + JSON.stringify(post, null, 2));
  console.log("POST " + base + "/api/v1/works\n" + JSON.stringify(work, null, 2));
  process.exit(0);
}
if (!token) {
  console.log("ARTACHE_TOKEN is not set: nothing posted.");
  process.exit(0);
}

// One post per version: skip if the feed already has this title (re-runs, manual dispatch).
const recent = await api("GET", `/api/v1/posts?project=${encodeURIComponent(project)}&limit=30`);
const list = Array.isArray(recent) ? recent : recent.posts || recent.items || recent.data || [];
if (list.some((p) => p && p.title === title)) {
  console.log(`Already posted: "${title}"`);
} else {
  await api("POST", "/api/v1/posts", post);
  console.log(`Posted: "${title}"`);
}
await api("POST", "/api/v1/works", work);
console.log(`Studio item ${work.key} updated to ${entry.version}.`);
