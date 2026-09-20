/**
 * What is actually being served at the published URL.
 *
 * The artifact check (scripts/verifyStaticBuild.mjs) proves the build is
 * deployable. It cannot prove it was deployed. On 20 September 2026 both were
 * true and the site was still broken: the repository's Pages source was set to
 * "Deploy from a branch", so GitHub's own Jekyll builder ran on every push to
 * main, published a themed render of README.md, and — finishing a few seconds
 * after actions/deploy-pages — replaced the application with it. Every job in
 * every workflow reported success.
 *
 * Nothing inside a build can detect that. Only a request to the live URL can.
 * So this runs after the deployment, fetches the page a visitor would get, and
 * fails the workflow when it is not the application.
 *
 * It reports what it received rather than only that something was wrong: a
 * classification, the status, the content type and an excerpt of the body.
 * The first time this ran for real, the configuration check ahead of it failed
 * and skipped this step, which meant the incident report could say the setting
 * was wrong but not say what a visitor was getting. Evidence beats inference,
 * so this now always runs and always prints what it saw.
 */

/** How long to keep retrying while the Pages CDN catches up. */
const ATTEMPTS = 6;
const DELAY_MS = 10_000;

const DEMO_MARKER = "the-receipt-static-demo";
const SERVER_API_PATH = "/api/trpc";
const MIN_ENTRY_BYTES = 50_000;
const EXCERPT_CHARS = 700;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * The classifications this can return. Written out because "the site is wrong"
 * is not a finding — which wrong thing it is decides who fixes what.
 */
export const CLASSIFICATIONS = {
  APP: "THE RECEIPT application",
  STALE_APP: "stale THE RECEIPT deployment",
  JEKYLL: "old Jekyll/README deployment",
  NOT_FOUND: "GitHub Pages 404",
  ERROR: "GitHub Pages error",
  OTHER: "other",
};

/**
 * Jekyll's default theme leaves fingerprints. Finding one means the legacy
 * branch-based Pages build is what is live, which is a repository setting, not
 * anything in this workflow.
 */
function looksLikeJekyll(html) {
  return (
    html.includes("jekyll-theme") ||
    html.includes("/assets/css/style.css") ||
    /<meta name="generator" content="Jekyll/i.test(html) ||
    html.includes("markdown-body")
  );
}

/** GitHub's own "there isn't a site here" page, not the project's 404.html. */
function looksLikePagesNotFound(html) {
  return html.includes("There isn't a GitHub Pages site here") || html.includes("404.github.com");
}

async function get(url) {
  const response = await fetch(url, { redirect: "follow" });
  return { status: response.status, type: response.headers.get("content-type") ?? "", body: await response.text() };
}

/**
 * Decides what the live document is. `expectedEntry`, when given, is the entry
 * bundle path this build produced; a live app pointing at a different bundle is
 * a stale deployment rather than a working one.
 */
export function classify(index, expectedEntry) {
  if (index.status >= 500) return CLASSIFICATIONS.ERROR;
  if (looksLikePagesNotFound(index.body)) return CLASSIFICATIONS.NOT_FOUND;
  if (looksLikeJekyll(index.body)) return CLASSIFICATIONS.JEKYLL;
  if (!index.body.includes('id="root"')) {
    return index.status === 404 ? CLASSIFICATIONS.NOT_FOUND : CLASSIFICATIONS.OTHER;
  }
  if (expectedEntry && !index.body.includes(expectedEntry)) return CLASSIFICATIONS.STALE_APP;
  return CLASSIFICATIONS.APP;
}

/**
 * @param {string} siteUrl e.g. https://owner.github.io/THE-RECEIPT/
 * @param {string} [expectedEntry] the entry bundle path this build produced
 * @returns {Promise<{classification: string, problems: string[], index: object}>}
 */
export async function checkLiveSite(siteUrl, expectedEntry) {
  const base = siteUrl.endsWith("/") ? siteUrl : `${siteUrl}/`;
  const problems = [];
  const say = (problem) => problems.push(problem);

  const index = await get(base);
  const classification = classify(index, expectedEntry);

  if (classification === CLASSIFICATIONS.JEKYLL) {
    say(
      `${base} is serving a Jekyll-built page, not this application. The repository's Pages source is "Deploy from a branch" rather than "GitHub Actions": GitHub runs its own Jekyll build on every push and deploys it over this workflow's artifact. Fix it at Settings -> Pages -> Build and deployment -> Source -> GitHub Actions.`,
    );
    return { classification, problems, index };
  }

  if (classification !== CLASSIFICATIONS.APP && classification !== CLASSIFICATIONS.STALE_APP) {
    say(`${base} returned ${classification} (HTTP ${index.status}, ${index.type || "no content-type"}).`);
    return { classification, problems, index };
  }

  if (classification === CLASSIFICATIONS.STALE_APP) {
    say(`${base} is serving THE RECEIPT, but not this build — it does not reference ${expectedEntry}.`);
  }

  if (index.status !== 200) say(`GET ${base} returned ${index.status}, not 200.`);

  const entry = /<script[^>]*type="module"[^>]*src="([^"]+)"/.exec(index.body);
  if (!entry) {
    say(`${base} returned a document that loads no module script — the application entry point is missing.`);
    return { classification, problems, index };
  }

  const entryUrl = new URL(entry[1], base).toString();
  const script = await get(entryUrl);
  if (script.status !== 200) {
    say(`GET ${entryUrl} returned ${script.status} — the page references a bundle that is not being served.`);
  } else {
    if (script.body.length < MIN_ENTRY_BYTES) {
      say(`GET ${entryUrl} returned ${script.body.length} bytes, under ${MIN_ENTRY_BYTES} — that is not the bundle.`);
    }
    if (/<!doctype html/i.test(script.body)) {
      say(`GET ${entryUrl} returned HTML, not JavaScript — the asset path is wrong or the assets were not deployed.`);
    }
    if (!script.body.includes(DEMO_MARKER)) {
      say(`the live bundle does not contain ${JSON.stringify(DEMO_MARKER)} — this is not the static-demo build.`);
    }
    if (script.body.includes(SERVER_API_PATH)) {
      say(`the live bundle contains ${JSON.stringify(SERVER_API_PATH)} — the demo has no server to call.`);
    }
  }

  // A deep link is the thing a shared receipt URL actually is. Pages answers
  // with 404 and the custom 404.html body; the body is what matters.
  const deep = await get(`${base}archive`);
  if (!deep.body.includes('id="root"')) {
    say(`GET ${base}archive did not return the SPA fallback — deep links and shared receipt URLs are broken.`);
  }

  return { classification, problems, index };
}

if (process.argv[1]?.endsWith("verifyPagesDeployment.mjs")) {
  const [siteUrl, expectedEntry] = process.argv.slice(2);
  if (!siteUrl) {
    console.error("usage: node scripts/verifyPagesDeployment.mjs <url> [expected-entry-path]");
    process.exit(2);
  }

  let result = { classification: CLASSIFICATIONS.OTHER, problems: ["not attempted"], index: null };
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    result = await checkLiveSite(siteUrl, expectedEntry).catch((error) => ({
      classification: CLASSIFICATIONS.ERROR,
      problems: [`request failed: ${error.message}`],
      index: null,
    }));
    if (result.problems.length === 0) break;
    // A misconfigured Pages source is not going to resolve itself in ten
    // seconds; only a deployment still propagating is worth waiting for.
    if (result.classification === CLASSIFICATIONS.JEKYLL) break;
    if (attempt < ATTEMPTS) {
      console.log(`Attempt ${attempt}/${ATTEMPTS}: got "${result.classification}", retrying in ${DELAY_MS / 1000}s.`);
      await sleep(DELAY_MS);
    }
  }

  // Printed whether or not the check passed: the next person reading this log
  // should not have to guess what a visitor was actually served.
  console.log(`\n--- what ${siteUrl} actually returned ---`);
  if (result.index) {
    console.log(`status:         ${result.index.status}`);
    console.log(`content-type:   ${result.index.type || "(none)"}`);
    console.log(`bytes:          ${result.index.body.length}`);
    console.log(`classification: ${result.classification}`);
    console.log(`\nfirst ${EXCERPT_CHARS} characters:\n`);
    console.log(result.index.body.slice(0, EXCERPT_CHARS));
  } else {
    console.log(`classification: ${result.classification} (no response captured)`);
  }
  console.log(`--- end ---\n`);

  if (result.problems.length > 0) {
    console.error(`${siteUrl} is not serving THE RECEIPT:\n`);
    for (const problem of result.problems) console.error(`  - ${problem}`);
    console.error("");
    process.exit(1);
  }
  console.log(`${siteUrl} is serving the application: index, bundle and SPA fallback all check out.`);
}
