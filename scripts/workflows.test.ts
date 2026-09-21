/**
 * Only one workflow is allowed to publish to GitHub Pages.
 *
 * On 20 September 2026 the live site served a Jekyll render of README.md for
 * four deployments while every job in every workflow reported success. The
 * cause was the repository's Pages source being set to "Deploy from a branch",
 * so GitHub built and published the repo itself.
 *
 * Hours after that was fixed, six workflow templates were added to main from
 * GitHub's suggested-workflow gallery. Two of them — "Deploy Jekyll with
 * GitHub Pages dependencies preinstalled" and "Deploy static content to
 * Pages" — deploy to Pages on every push to main. With the source now set to
 * "GitHub Actions" they are no longer blocked by configuration: they are live
 * publishers, racing deploy-pages.yml for the same site, and the last one to
 * finish wins. One builds Jekyll over the repository root. The other uploads
 * `path: '.'` — the entire source tree, with no application index.html.
 *
 * Either one recreates the original incident from inside the repository.
 *
 * So the invariant is asserted rather than remembered: exactly one workflow
 * may upload a Pages artifact or call deploy-pages, and it is this project's
 * own. Adding a second means deleting a test to do it.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const WORKFLOW_DIR = join(process.cwd(), ".github", "workflows");

/** The one workflow that is allowed to publish the site. */
const THE_PAGES_WORKFLOW = "deploy-pages.yml";

/**
 * Comments are stripped before matching. deploy-pages.yml explains the Jekyll
 * incident in its own comments, and a guard that fires on the description of a
 * problem rather than the problem is a guard that gets deleted.
 */
const withoutComments = (body: string) =>
  body
    .split("\n")
    .filter((line) => !/^\s*#/.test(line))
    .join("\n");

const workflows = readdirSync(WORKFLOW_DIR)
  .filter((name) => name.endsWith(".yml") || name.endsWith(".yaml"))
  .map((name) => ({ name, body: withoutComments(readFileSync(join(WORKFLOW_DIR, name), "utf8")) }));

/** Publishing to Pages requires one of these two actions. */
const publishes = (body: string) =>
  body.includes("actions/deploy-pages") || body.includes("actions/upload-pages-artifact");

describe("only one workflow publishes to GitHub Pages", () => {
  it("and it is deploy-pages.yml", () => {
    const publishers = workflows.filter(({ body }) => publishes(body)).map(({ name }) => name);
    expect(publishers).toEqual([THE_PAGES_WORKFLOW]);
  });

  it("no workflow builds this repository with Jekyll", () => {
    // Jekyll over the repo root renders README.md as the site. That is the
    // exact page that was live during the incident.
    for (const { name, body } of workflows) {
      const invokesJekyll = /jekyll-build-pages|jekyll\/builder|jekyll build|bundle exec jekyll/i.test(body);
      expect({ name, invokesJekyll }).toEqual({ name, invokesJekyll: false });
    }
  });

  it("no workflow uploads the whole repository as the site", () => {
    // `path: '.'` ships the source tree instead of dist/public.
    for (const { name, body } of workflows) {
      expect({ name, uploadsRoot: /path:\s*['"]?\.['"]?\s*$/m.test(body) }).toEqual({ name, uploadsRoot: false });
    }
  });
});

describe("the workflows that remain are ones this project can actually run", () => {
  it("nothing builds with webpack", () => {
    // The project builds with Vite. A webpack workflow fails on every push
    // and teaches everyone to ignore a red main.
    for (const { name, body } of workflows) {
      expect({ name, webpack: /webpack/i.test(body) }).toEqual({ name, webpack: false });
    }
  });

  it("nothing publishes this application to a package registry", () => {
    // THE RECEIPT is an application, not a library.
    for (const { name, body } of workflows) {
      expect({ name, publishesPackage: /npm publish|npm-publish|registry-url/i.test(body) }).toEqual({
        name,
        publishesPackage: false,
      });
    }
  });

  it("nothing deploys to a host that was never configured", () => {
    // A template left at `your-app-name` fails on every push to main.
    for (const { name, body } of workflows) {
      expect({ name, placeholder: /your-app-name|your-resource-group|<your-/i.test(body) }).toEqual({
        name,
        placeholder: false,
      });
    }
  });
});
