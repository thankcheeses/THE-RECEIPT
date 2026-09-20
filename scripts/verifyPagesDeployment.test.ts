/**
 * Telling apart the ways a Pages site can be wrong.
 *
 * "The site is broken" is not a finding. A Jekyll render of README.md, a
 * GitHub "no site here" page, and a correct-but-stale deployment each need a
 * different person to do a different thing, and the first incident cost real
 * time because the report could say the setting was wrong without being able
 * to say what a visitor was actually getting.
 *
 * These pin the classifier that closes that gap. The fixtures are trimmed from
 * output this repository really produced.
 */
import { describe, expect, it } from "vitest";
// @ts-expect-error - plain ESM script, deliberately not part of the tsc project
import { CLASSIFICATIONS, classify } from "./verifyPagesDeployment.mjs";

const response = (body: string, status = 200, type = "text/html") => ({ status, type, body });

const ENTRY = "/THE-RECEIPT/assets/index-CpUN3VI3.js";

/** What `pnpm build:static` emits, trimmed. */
const APP = `<!doctype html>
<html lang="en"><head>
<title>THE RECEIPT — Put it on the record.</title>
<script type="module" crossorigin src="${ENTRY}"></script>
<link rel="stylesheet" crossorigin href="/THE-RECEIPT/assets/index-OUNPCiqI.css">
</head><body><div id="root"></div></body></html>`;

/** What actions/jekyll-build-pages emitted over this repository's root. */
const JEKYLL = `<!DOCTYPE html>
<html lang="en-US"><head>
<meta name="generator" content="Jekyll v3.10.0" />
<link rel="stylesheet" href="/THE-RECEIPT/assets/css/style.css?v=dee8e88">
<title>THE RECEIPT | THE-RECEIPT</title>
</head><body><div class="container-lg px-3 my-5 markdown-body">
<h1>THE RECEIPT</h1></div></body></html>`;

const PAGES_404 = `<!DOCTYPE html><html><head><title>Site not found</title></head>
<body><h1>404</h1><p>There isn't a GitHub Pages site here.</p></body></html>`;

describe("the application", () => {
  it("is recognised when the entry bundle matches this build", () => {
    expect(classify(response(APP), ENTRY)).toBe(CLASSIFICATIONS.APP);
  });

  it("is recognised without an expected entry to compare against", () => {
    expect(classify(response(APP))).toBe(CLASSIFICATIONS.APP);
  });

  it("is called stale when it points at a different bundle", () => {
    // Pages served an older deployment: the document is ours, the hash is not.
    expect(classify(response(APP), "/THE-RECEIPT/assets/index-OTHER.js")).toBe(CLASSIFICATIONS.STALE_APP);
  });
});

describe("the Jekyll deployment", () => {
  it("is recognised by the generator meta tag", () => {
    expect(classify(response(JEKYLL), ENTRY)).toBe(CLASSIFICATIONS.JEKYLL);
  });

  it("is recognised by the theme stylesheet alone", () => {
    const themed = `<!DOCTYPE html><html><head>
      <link rel="stylesheet" href="/THE-RECEIPT/assets/css/style.css">
      </head><body><h1>THE RECEIPT</h1></body></html>`;
    expect(classify(response(themed), ENTRY)).toBe(CLASSIFICATIONS.JEKYLL);
  });

  it("wins over the application check even if a #root somehow appears", () => {
    // Jekyll copies the source tree through; a stray match must not be read
    // as "the app is live".
    expect(classify(response(`${JEKYLL}<div id="root"></div>`), ENTRY)).toBe(CLASSIFICATIONS.JEKYLL);
  });
});

describe("no site at all", () => {
  it("recognises GitHub's own 404 page", () => {
    expect(classify(response(PAGES_404, 404), ENTRY)).toBe(CLASSIFICATIONS.NOT_FOUND);
  });

  it("recognises it even when served with a 200", () => {
    expect(classify(response(PAGES_404), ENTRY)).toBe(CLASSIFICATIONS.NOT_FOUND);
  });

  it("calls a 404 with no mount point a 404", () => {
    expect(classify(response("<html><body>gone</body></html>", 404), ENTRY)).toBe(CLASSIFICATIONS.NOT_FOUND);
  });
});

describe("everything else", () => {
  it("calls a 5xx an error", () => {
    expect(classify(response("<html>oops</html>", 503), ENTRY)).toBe(CLASSIFICATIONS.ERROR);
  });

  it("calls an unrecognised 200 document other", () => {
    expect(classify(response("<html><body>something new</body></html>"), ENTRY)).toBe(CLASSIFICATIONS.OTHER);
  });
});
