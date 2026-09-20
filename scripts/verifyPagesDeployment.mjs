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
 * It names the Jekyll case specifically, because that is the failure this was
 * written after and it is not self-evident from "the page is wrong".
 */

/** How long to keep retrying while the Pages CDN catches up. */
const ATTEMPTS = 6;
const DELAY_MS = 10_000;

const DEMO_MARKER = "the-receipt-static-demo";
const SERVER_API_PATH = "/api/trpc";
const MIN_ENTRY_BYTES = 50_000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Jekyll's default theme leaves fingerprints. Finding one means the legacy
 * branch-based Pages build is what is live, which is a repository setting, not
 * anything in this workflow.
 */
function looksLikeJekyll(html) {
  return (
    html.includes("jekyll-theme") ||
    html.includes("/assets/css/style.css") ||
    /<meta name="generator" content="Jekyll/i.test(html)
  );
}

async function get(url) {
  const response = await fetch(url, { redirect: "follow" });
  return { status: response.status, type: response.headers.get("content-type") ?? "", body: await response.text() };
}

/**
 * @param {string} siteUrl e.g. https://owner.github.io/THE-RECEIPT/
 * @returns {Promise<string[]>} problems; empty when the live site is the app
 */
export async function checkLiveSite(siteUrl) {
  const base = new URL(siteUrl).pathname.endsWith("/") ? siteUrl : `${siteUrl}/`;
  const problems = [];
  const say = (problem) => problems.push(problem);

  const index = await get(base);
  if (index.status !== 200) {
    say(`GET ${base} returned ${index.status}, not 200.`);
  }

  if (looksLikeJekyll(index.body)) {
    say(
      `GET ${base} is serving a Jekyll-built page, not this application. That means the repository's Pages source is "Deploy from a branch" rather than "GitHub Actions": GitHub runs its own Jekyll build on every push and deploys it over this workflow's artifact. Fix it at Settings -> Pages -> Build and deployment -> Source -> GitHub Actions.`,
    );
    return problems;
  }

  if (!index.body.includes('id="root"')) {
    say(`GET ${base} returned a document with no <div id="root"> — whatever is live, it is not this application.`);
    return problems;
  }

  const entry = /<script[^>]*type="module"[^>]*src="([^"]+)"/.exec(index.body);
  if (!entry) {
    say(`GET ${base} returned a document that loads no module script — the application entry point is missing.`);
    return problems;
  }

  const entryUrl = new URL(entry[1], base).toString();
  const script = await get(entryUrl);
  if (script.status !== 200) {
    say(`GET ${entryUrl} returned ${script.status} — the page references a bundle that is not being served.`);
  } else {
    if (script.body.length < MIN_ENTRY_BYTES) {
      say(`GET ${entryUrl} returned ${script.body.length} bytes, under ${MIN_ENTRY_BYTES} — that is not the bundle.`);
    }
    if (script.body.includes("<!doctype html") || script.body.includes("<!DOCTYPE html")) {
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

  return problems;
}

if (process.argv[1]?.endsWith("verifyPagesDeployment.mjs")) {
  const siteUrl = process.argv[2];
  if (!siteUrl) {
    console.error("usage: node scripts/verifyPagesDeployment.mjs <url>");
    process.exit(2);
  }

  let problems = [];
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    problems = await checkLiveSite(siteUrl).catch((error) => [`request failed: ${error.message}`]);
    if (problems.length === 0) break;
    if (attempt < ATTEMPTS) {
      console.log(`Attempt ${attempt}/${ATTEMPTS}: not serving the application yet, retrying in ${DELAY_MS / 1000}s.`);
      await sleep(DELAY_MS);
    }
  }

  if (problems.length > 0) {
    console.error(`\n${siteUrl} is not serving THE RECEIPT:\n`);
    for (const problem of problems) console.error(`  - ${problem}`);
    console.error("");
    process.exit(1);
  }
  console.log(`${siteUrl} is serving the application: index, bundle and SPA fallback all check out.`);
}
