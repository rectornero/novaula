// Licensing audit of the published site (sito/). No dependencies, no network, no database.
// Run: node strumenti/audit-licenze.mjs   (exit code 1 when something needs fixing)
// Runs in .github/workflows/licenze.yml on every push and pull request, and each weekday morning.
// The full register (with assets outside the repo) is kept by the Licensing office in
// /mnt/project-files/management/licensing/register.md; THIRD-PARTY.md lists what ships with the site.
import { readdirSync, readFileSync, existsSync, appendFileSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const SITO = join(ROOT, "sito");

// Every file in sito/ must match one of these rows. "needs" = license files that must sit next to it.
const RULES = [
  { id: "own-code", re: /^[a-z]+\.(js|css|html)$|^manifest\.webmanifest$/, what: "Novaula app code (Claude for Nero)" },
  { id: "fonts", re: /^fonts\/.+\.woff2$/, what: "OFL 1.1 fonts", needs: ["fonts/OFL.txt"] },
  { id: "license", re: /(^|\/)(LICENSE|OFL\.txt|[\w.-]+\.LICENSE\.md)$/, what: "license text" },
  { id: "pdfjs", re: /^vendor\/pdfjs\/pdf(\.worker)?\.min\.js$/, what: "pdf.js, Apache-2.0", needs: ["vendor/pdfjs/LICENSE"] },
  { id: "pdf-lib", re: /^vendor\/pdf-lib\.min\.js$/, what: "pdf-lib, MIT", needs: ["vendor/pdf-lib.LICENSE.md"] },
  { id: "supabase-js", re: /^vendor\/supabase\.js$/, what: "supabase-js, MIT", needs: ["vendor/supabase.LICENSE.md"] },
  { id: "qrcode", re: /^vendor\/qrcode\.js$/, what: "qrcode-generator, MIT (notice in file header)", header: /Licensed under the MIT license/ },
  { id: "icons", re: /^icons\/.+\.(png|svg)$/, what: "app icons made by Claude", c2pa: true },
  { id: "decks", re: /^contenuti\/lezioni\/[\w-]+\.(html|pdf|xlsx|css|js)$/, what: "lesson decks and starter files written by Claude" },
  { id: "sheets", re: /^contenuti\/(compiti|verifiche)\/[\w-]+\.pdf$/, what: "homework and tests written by Claude" },
  { id: "materials", re: /^contenuti\/[\w-]+\.(pdf|html)$/, what: "class materials (see register)" },
];

// External hosts a page may load code, styles, fonts or frames from. Links to visit are fine anywhere.
const ALLOWED_HOSTS = ["pplpkabznbihovqwzenq.supabase.co"];
const TAG_LOADS = [
  /<script[^>]+src=["'](https?:)?\/\/([^/"']+)/gi,
  /<link[^>]+href=["'](https?:)?\/\/([^/"']+)[^>]*>/gi,
  /<iframe[^>]+src=["'](https?:)?\/\/([^/"']+)/gi,
];
// Only inside CSS (a .css file or a <style> block), so code examples like new URL("https://...") don't count.
const CSS_LOADS = [
  /@import\s+(?:url\()?["']?(https?:)?\/\/([^/"')]+)/gi,
  /url\(["']?(https?:)?\/\/([^/"')]+)/gi,
];
const IMAGE = /\.(png|jpe?g|gif|webp|svg|avif)$/i;

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((d) =>
    d.isDirectory() ? walk(join(dir, d.name)) : [join(dir, d.name)]);
}

const problems = [], counts = {};
for (const abs of walk(SITO)) {
  const rel = relative(SITO, abs);
  const rule = RULES.find((r) => r.re.test(rel));
  if (!rule) { problems.push(`${rel}: not in the register (add a row, or remove the file)`); continue; }
  counts[rule.id] = (counts[rule.id] || 0) + 1;
  for (const need of rule.needs || []) if (!existsSync(join(SITO, need))) problems.push(`${rel}: ${rule.what} without ${need}`);
  if (rule.header && !rule.header.test(readFileSync(abs, "utf8").slice(0, 2000))) problems.push(`${rel}: license header missing`);
  // Images must carry Claude's content credentials (C2PA); anything else is third-party and needs a register row.
  if (IMAGE.test(rel) && !readFileSync(abs).includes("c2pa")) problems.push(`${rel}: image without provenance (no C2PA credentials)`);
  if (/\.(html|css)$/.test(rel) || (rel.endsWith(".js") && !rel.startsWith("vendor/"))) {
    const text = readFileSync(abs, "utf8");
    const css = rel.endsWith(".css") ? text : [...text.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]).join("\n");
    const found = [...TAG_LOADS.flatMap((re) => [...text.matchAll(re)]), ...CSS_LOADS.flatMap((re) => [...css.matchAll(re)])];
    for (const m of found) {
      if (/<link/i.test(m[0]) && !/rel=["']?(stylesheet|preconnect|preload|icon|manifest|modulepreload)/i.test(m[0])) continue;
      if (!ALLOWED_HOSTS.includes(m[2])) problems.push(`${rel}: loads from ${m[2]} (third-party host; self-host it instead)`);
    }
  }
}

const lines = [
  "## Licensing audit of sito/",
  "",
  Object.entries(counts).map(([k, n]) => `${k} ${n}`).join(" · "),
  "",
  problems.length ? `**${problems.length} to fix:**` : "**Clean:** every file is registered, licensed and self-hosted.",
  ...problems.map((p) => `- ${p}`),
];
console.log(lines.join("\n"));
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join("\n") + "\n");
process.exit(problems.length ? 1 : 0);
