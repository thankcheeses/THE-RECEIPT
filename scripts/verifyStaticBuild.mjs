/**
 * What `pnpm build:static` is supposed to have produced.
 *
 * This exists because a build can succeed and still ship nothing usable. Vite
 * exits 0 whether it emitted a working application or an HTML shell pointing
 * at files that are not there; `cp` and `touch` exit 0 whether or not the SPA
 * fallback and the Jekyll opt-out ended up in the right place. Every one of
 * those is invisible in a green workflow and visible immediately to whoever
 * opens the site.
 *
 * So the artifact is checked before it is uploaded, and the checks are about
 * the things that actually break a GitHub Pages deployment:
 *
 *   - the entry document and its SPA fallback exist and are the same file
 *   - .nojekyll is there, so Pages serves the directory instead of running
 *     Jekyll over it
 *   - every absolute URL in the document carries the project's base path, and
 *     every file it names is really in the artifact
 *   - no %VITE_*% placeholder survived into the shipped HTML
 *   - the bundle is a real bundle, not a husk
 *   - the static build talks to localStorage, never to /api/trpc — the demo
 *     has no server to reach
 *
 * Exported as a function so the rules themselves are testable; see
 * scripts/verifyStaticBuild.test.ts.
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/** Below this the "bundle" is a husk, whatever the build said. */
const MIN_ENTRY_BYTES = 50_000;

/** The static demo's localStorage key. Present iff the demo link is wired in. */
const DEMO_MARKER = "the-receipt-static-demo";

/** The server's tRPC path. Must not survive into a build that has no server. */
const SERVER_API_PATH = "/api/trpc";

/** Every src=/href= in the document, with the attribute that carried it. */
function references(html) {
  const found = [];
  const pattern = /\b(src|href)\s*=\s*"([^"]*)"/g;
  let match = pattern.exec(html);
  while (match !== null) {
    found.push({ attribute: match[1], url: match[2] });
    match = pattern.exec(html);
  }
  return found;
}

/**
 * Checks one built directory. Returns a list of problems, empty when the
 * artifact is deployable. Never throws on a missing file — a missing file is
 * one of the things being reported.
 *
 * @param {{ dir: string, base: string, expectStaticDemo?: boolean }} options
 * @returns {string[]}
 */
export function checkStaticBuild({ dir, base, expectStaticDemo = true }) {
  const problems = [];
  const say = (problem) => problems.push(problem);

  if (!existsSync(dir) || !statSync(dir).isDirectory()) {
    return [`${dir} does not exist — the build produced no output directory.`];
  }

  if (!base.startsWith("/") || !base.endsWith("/")) {
    say(`base ${JSON.stringify(base)} must start and end with "/" — Vite writes it into every asset URL verbatim.`);
  }

  const indexPath = join(dir, "index.html");
  if (!existsSync(indexPath)) {
    return [`${indexPath} is missing — there is no page to serve.`];
  }
  const html = readFileSync(indexPath, "utf8");

  if (html.length < 200) {
    say(`index.html is ${html.length} bytes — too small to be a built document.`);
  }

  // GitHub Pages serves 404.html for any path it has no file for, which is how
  // a client-routed application survives a deep link. It has to be the app.
  const fallbackPath = join(dir, "404.html");
  if (!existsSync(fallbackPath)) {
    say("404.html is missing — every client route except the index would 404 on GitHub Pages.");
  } else if (readFileSync(fallbackPath, "utf8") !== html) {
    say("404.html differs from index.html — the SPA fallback is not the application.");
  }

  // Without this, Pages runs the directory through Jekyll, which drops
  // anything beginning with an underscore and rewrites what it keeps.
  if (!existsSync(join(dir, ".nojekyll"))) {
    say(".nojekyll is missing — GitHub Pages would run Jekyll over the build output.");
  }

  if (!html.includes('id="root"')) {
    say('index.html has no <div id="root"> — React has nothing to mount into.');
  }

  const placeholder = html.match(/%VITE_[A-Z0-9_]*%?/);
  if (placeholder) {
    say(`index.html still contains the unresolved placeholder ${placeholder[0]} — it would ship as a literal URL.`);
  }

  const referenced = references(html);
  const moduleScript = /<script[^>]*type="module"[^>]*src="([^"]+)"/.exec(html);
  if (!moduleScript) {
    say("index.html loads no <script type=\"module\"> — the application entry point is not referenced.");
  }

  const localUrls = referenced.filter(({ url }) => url.startsWith("/"));
  for (const { attribute, url } of localUrls) {
    if (!url.startsWith(base)) {
      say(`${attribute}="${url}" does not start with the base path ${base} — it would resolve off the project site.`);
      continue;
    }
    const onDisk = join(dir, url.slice(base.length));
    if (!existsSync(onDisk)) {
      say(`${attribute}="${url}" points at ${onDisk}, which is not in the artifact.`);
    }
  }

  if (!localUrls.some(({ url }) => url.endsWith(".css"))) {
    say("index.html references no stylesheet — the page would render unstyled.");
  }

  if (moduleScript && moduleScript[1].startsWith(base)) {
    const entryPath = join(dir, moduleScript[1].slice(base.length));
    if (existsSync(entryPath)) {
      const entry = readFileSync(entryPath, "utf8");
      if (entry.length < MIN_ENTRY_BYTES) {
        say(`${moduleScript[1]} is ${entry.length} bytes, under ${MIN_ENTRY_BYTES} — that is not a built application.`);
      }
      if (expectStaticDemo) {
        if (!entry.includes(DEMO_MARKER)) {
          say(
            `the entry bundle does not contain ${JSON.stringify(DEMO_MARKER)} — the static demo link is not wired in, so every screen would try to reach a server that is not there.`,
          );
        }
        if (entry.includes(SERVER_API_PATH)) {
          say(
            `the entry bundle contains ${JSON.stringify(SERVER_API_PATH)} — the static build must not carry the server's API path.`,
          );
        }
      }
    }
  }

  return problems;
}

/** CLI: node scripts/verifyStaticBuild.mjs <dir> <base> */
if (process.argv[1]?.endsWith("verifyStaticBuild.mjs")) {
  const [dir = "dist/public", base = "/THE-RECEIPT/"] = process.argv.slice(2);
  const problems = checkStaticBuild({ dir, base });
  if (problems.length > 0) {
    console.error(`The static build in ${dir} is not deployable:\n`);
    for (const problem of problems) console.error(`  - ${problem}`);
    console.error("");
    process.exit(1);
  }
  console.log(`The static build in ${dir} looks deployable at base ${base}.`);
}
