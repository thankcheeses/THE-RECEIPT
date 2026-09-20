/**
 * The guard that stands between a green build and a broken site.
 *
 * Every test here builds a directory that is wrong in exactly one way and
 * asserts the checker says so. A guard nobody has watched fail is not a guard,
 * and this one exists because on 20 September 2026 the Pages workflow reported
 * success on every job while the live site served a themed README.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
// @ts-expect-error - plain ESM script, deliberately not part of the tsc project
import { checkStaticBuild } from "./verifyStaticBuild.mjs";

const BASE = "/THE-RECEIPT/";

/** A bundle big enough to pass the size floor, carrying the demo marker. */
const BUNDLE = `const KEY="the-receipt-static-demo";${"//padding\n".repeat(6000)}`;

const INDEX = `<!doctype html>
<html lang="en">
  <head>
    <title>THE RECEIPT</title>
    <script type="module" crossorigin src="${BASE}assets/index-abc.js"></script>
    <link rel="stylesheet" crossorigin href="${BASE}assets/index-abc.css">
  </head>
  <body><div id="root"></div></body>
</html>
`;

const made: string[] = [];

/** A directory that passes every check, then mutated per test. */
function build(
  changes: {
    index?: string | null;
    fallback?: string | null;
    nojekyll?: boolean;
    bundle?: string | null;
    css?: boolean;
  } = {},
) {
  const dir = mkdtempSync(join(tmpdir(), "static-build-"));
  made.push(dir);
  mkdirSync(join(dir, "assets"));

  const index = changes.index === undefined ? INDEX : changes.index;
  if (index !== null) writeFileSync(join(dir, "index.html"), index);

  const fallback = changes.fallback === undefined ? index : changes.fallback;
  if (fallback !== null) writeFileSync(join(dir, "404.html"), fallback);

  if (changes.nojekyll !== false) writeFileSync(join(dir, ".nojekyll"), "");

  const bundle = changes.bundle === undefined ? BUNDLE : changes.bundle;
  if (bundle !== null) writeFileSync(join(dir, "assets", "index-abc.js"), bundle);

  if (changes.css !== false) writeFileSync(join(dir, "assets", "index-abc.css"), "body{}");

  return dir;
}

const check = (dir: string) => checkStaticBuild({ dir, base: BASE }) as string[];

afterEach(() => {
  for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("a build that is fine", () => {
  it("reports nothing", () => {
    expect(check(build())).toEqual([]);
  });
});

describe("things that would leave nothing to serve", () => {
  it("catches a missing output directory", () => {
    const problems = check(join(tmpdir(), "definitely-not-built-12345"));
    expect(problems.join("\n")).toMatch(/does not exist/);
  });

  it("catches a missing index.html", () => {
    expect(check(build({ index: null })).join("\n")).toMatch(/index\.html is missing/);
  });

  it("catches an index.html too small to be a document", () => {
    expect(check(build({ index: "<html></html>" })).join("\n")).toMatch(/too small/);
  });

  it("catches a missing mount point", () => {
    const problems = check(build({ index: INDEX.replace('<div id="root"></div>', "<div></div>") }));
    expect(problems.join("\n")).toMatch(/no <div id="root">/);
  });
});

describe("things that break GitHub Pages specifically", () => {
  it("catches a missing 404.html", () => {
    // Without it every client route 404s, which is most of the product.
    expect(check(build({ fallback: null })).join("\n")).toMatch(/404\.html is missing/);
  });

  it("catches a 404.html that is not the application", () => {
    expect(check(build({ fallback: "<html>Not found</html>" })).join("\n")).toMatch(/404\.html differs/);
  });

  it("catches a missing .nojekyll", () => {
    expect(check(build({ nojekyll: false })).join("\n")).toMatch(/\.nojekyll is missing/);
  });
});

describe("things that break the asset paths", () => {
  it("catches an asset URL without the base path", () => {
    const problems = check(build({ index: INDEX.replaceAll(BASE, "/") }));
    expect(problems.join("\n")).toMatch(/does not start with the base path/);
  });

  it("catches a referenced file that is not in the artifact", () => {
    expect(check(build({ bundle: null })).join("\n")).toMatch(/not in the artifact/);
  });

  it("catches an index.html with no module script", () => {
    const problems = check(build({ index: INDEX.replace('type="module" ', "") }));
    expect(problems.join("\n")).toMatch(/loads no <script type="module">/);
  });

  it("catches a missing stylesheet reference", () => {
    const problems = check(build({ index: INDEX.replace(/<link[^>]*>/, ""), css: false }));
    expect(problems.join("\n")).toMatch(/references no stylesheet/);
  });

  it("catches an unresolved %VITE_% placeholder", () => {
    // This one shipped once: the analytics tag's placeholders survived the
    // build and pointed a script tag at a path that does not exist.
    const withPlaceholder = INDEX.replace(
      "</head>",
      '  <script defer src="%VITE_ANALYTICS_ENDPOINT%/umami"></script>\n  </head>',
    );
    expect(check(build({ index: withPlaceholder })).join("\n")).toMatch(/unresolved placeholder %VITE_ANALYTICS/);
  });
});

describe("things that mean this is not the static demo build", () => {
  it("catches a husk of a bundle", () => {
    expect(check(build({ bundle: "console.log(1)" })).join("\n")).toMatch(/not a built application/);
  });

  it("catches a bundle with no static demo store", () => {
    expect(check(build({ bundle: `const x=1;${"//padding\n".repeat(6000)}` })).join("\n")).toMatch(
      /static demo link is not wired in/,
    );
  });

  it("catches a bundle that still calls the server", () => {
    // The demo has no server. A bundle carrying /api/trpc is the server build
    // wearing the demo's base path, and every screen would fail at runtime.
    expect(check(build({ bundle: `${BUNDLE}fetch("/api/trpc/receipts.list")` })).join("\n")).toMatch(
      /must not carry the server's API path/,
    );
  });
});

describe("the base path itself", () => {
  it("rejects one that is not bounded by slashes", () => {
    const problems = checkStaticBuild({ dir: build(), base: "/THE-RECEIPT" }) as string[];
    expect(problems.join("\n")).toMatch(/must start and end with/);
  });
});
