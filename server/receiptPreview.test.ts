import { describe, expect, it } from "vitest";
import {
  buildReceiptDescription,
  buildReceiptMetaTags,
  buildReceiptTitle,
  escapeHtml,
  injectMetaTags,
  originFor,
} from "./receiptPreview";
import { renderReceiptPng, renderReceiptSvg } from "./receiptImage";
import { CARD_FORMATS } from "@shared/cardFormats";
import { DELETED_AUTHOR_LABEL } from "@shared/accountDeletion";

const pending = {
  id: 4821,
  prediction: "This tiny app will become the group chat's new obsession.",
  category: "INTERNET",
  confidence: 65,
  status: "LOCKED",
  createdAt: new Date("2026-09-19T00:00:00Z"),
  resolutionDate: new Date("2026-10-03T00:00:00Z"),
};
const resolved = { ...pending, id: 4814, status: "WRONG" };

describe("escapeHtml", () => {
  it("neutralises the characters that could break out of an attribute", () => {
    expect(escapeHtml(`<script>"x"&'y'</script>`)).toBe(
      "&lt;script&gt;&quot;x&quot;&amp;&#39;y&#39;&lt;/script&gt;",
    );
  });
});

describe("buildReceiptDescription", () => {
  it("names the caller by username when there is one", () => {
    expect(buildReceiptDescription(pending, { username: "nia", name: "Nia" })).toContain("@nia");
  });

  it("falls back to a display name, then to a neutral noun", () => {
    expect(buildReceiptDescription(pending, { username: null, name: "Nia" })).toContain("Nia");
    expect(buildReceiptDescription(pending, null)).toContain("Someone");
  });

  it("names a deleted author generically, never by a surviving handle", () => {
    const orphan = { ...pending, userId: null };
    const description = buildReceiptDescription(orphan, { username: "nia", name: "Nia" });
    expect(description).toContain(DELETED_AUTHOR_LABEL);
    expect(description).not.toContain("@nia");
    expect(description).not.toContain("Nia");
  });

  it("still names a live author when the receipt carries their id", () => {
    expect(buildReceiptDescription({ ...pending, userId: 7 }, { username: "nia", name: "Nia" })).toContain("@nia");
  });

  it("leads with the resolution date while the receipt is open", () => {
    expect(buildReceiptDescription(pending, null)).toContain("Resolves");
  });

  it("leads with the verdict once reality has answered", () => {
    const text = buildReceiptDescription(resolved, null);
    expect(text).toContain("WRONG.");
    expect(text).not.toContain("Resolves");
  });

  it("carries the prediction and the confidence", () => {
    const text = buildReceiptDescription(pending, null);
    expect(text).toContain("65% sure");
    expect(text).toContain(pending.prediction);
  });
});

describe("buildReceiptMetaTags", () => {
  const url = "https://example.test/r/4821";

  it("sets the canonical URL and og:url to the receipt's own address", () => {
    const tags = buildReceiptMetaTags(pending, null, url);
    expect(tags).toContain(`<link rel="canonical" href="${url}" />`);
    expect(tags).toContain(`<meta property="og:url" content="${url}" />`);
  });

  it("titles the card with the padded receipt number", () => {
    expect(buildReceiptTitle(pending)).toBe("Receipt #004821 — THE RECEIPT");
  });

  it("degrades to a summary card when no image is generated", () => {
    const tags = buildReceiptMetaTags(pending, null, url);
    expect(tags).toContain('name="twitter:card" content="summary"');
    expect(tags).not.toContain("og:image");
  });

  it("claims a large image only when one is supplied", () => {
    const tags = buildReceiptMetaTags(pending, null, url, `${url}/image.png`);
    expect(tags).toContain('name="twitter:card" content="summary_large_image"');
    expect(tags).toContain(`<meta property="og:image" content="${url}/image.png" />`);
    expect(tags).toContain('content="1200"');
    expect(tags).toContain('content="630"');
  });

  it("escapes a prediction that tries to close the attribute", () => {
    const hostile = { ...pending, prediction: `"><script>alert(1)</script>` };
    const tags = buildReceiptMetaTags(hostile, null, url);
    expect(tags).not.toContain("<script>alert(1)</script>");
    expect(tags).toContain("&lt;script&gt;");
  });
});

describe("injectMetaTags", () => {
  const shell = `<!doctype html><html><head><meta charset="UTF-8" /><meta name="description" content="generic" /><title>THE RECEIPT</title></head><body><div id="root"></div><script type="module" src="/assets/x.js"></script></body></html>`;

  it("replaces the generic title and description", () => {
    const out = injectMetaTags(shell, buildReceiptMetaTags(pending, null, "https://example.test/r/4821"));
    expect(out).not.toContain('content="generic"');
    expect(out).toContain("Receipt #004821");
    expect(out.match(/<title>/g)).toHaveLength(1);
  });

  it("leaves the application shell intact so the same bundle still boots", () => {
    const out = injectMetaTags(shell, "<meta name='x' content='y' />");
    expect(out).toContain('<div id="root"></div>');
    expect(out).toContain('src="/assets/x.js"');
  });
});

describe("originFor", () => {
  const req = (headers: Record<string, string>, protocol = "http") =>
    ({ headers, protocol, get: () => "receipts.example" }) as never;

  it("prefers the forwarded protocol behind a terminating proxy", () => {
    expect(originFor(req({ "x-forwarded-proto": "https" }))).toBe("https://receipts.example");
  });

  it("takes the first entry of a forwarded chain", () => {
    expect(originFor(req({ "x-forwarded-proto": "https, http" }))).toBe("https://receipts.example");
  });

  it("falls back to the request protocol when nothing is forwarded", () => {
    expect(originFor(req({}, "http"))).toBe("http://receipts.example");
  });
});

describe("receipt card rendering", () => {
  it("renders an SVG at the declared card dimensions", async () => {
    const svg = await renderReceiptSvg({ ...pending, username: "nia" });
    expect(svg).toContain("<svg");
    expect(svg).toContain('width="1200"');
    expect(svg).toContain('height="630"');
  });

  it("renders every format at its own dimensions", async () => {
    for (const [format, size] of Object.entries(CARD_FORMATS)) {
      const svg = await renderReceiptSvg({ ...pending, username: "nia" }, format as keyof typeof CARD_FORMATS);
      expect(svg).toContain(`width="${size.width}"`);
      expect(svg).toContain(`height="${size.height}"`);
    }
  });

  it("caches per format, so one shape never serves another", async () => {
    const story = await renderReceiptPng({ ...pending, id: 991 }, "story");
    const og = await renderReceiptPng({ ...pending, id: 991 }, "og");
    expect(story.equals(og)).toBe(false);
    // A repeat request returns the same bytes rather than re-rendering.
    expect((await renderReceiptPng({ ...pending, id: 991 }, "story")).equals(story)).toBe(true);
  });

  it("renders a long prediction at every format without failing", async () => {
    for (const format of Object.keys(CARD_FORMATS) as Array<keyof typeof CARD_FORMATS>) {
      const png = await renderReceiptPng({ ...pending, id: 992, prediction: "x ".repeat(140) }, format);
      expect(png.length).toBeGreaterThan(1000);
    }
  });

  it("renders a PNG", async () => {
    const png = await renderReceiptPng({ ...pending, username: "nia" });
    // PNG magic number.
    expect(png.subarray(0, 4)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    expect(png.length).toBeGreaterThan(1000);
  });

  it("renders every resolution state without throwing", async () => {
    for (const status of ["PENDING", "LOCKED", "RIGHT", "WRONG", "PARTIALLY RIGHT", "TOO EARLY"]) {
      const png = await renderReceiptPng({ ...pending, id: 1, status, username: null });
      expect(png.length).toBeGreaterThan(1000);
    }
  });

  it("handles a maximum-length prediction without failing", async () => {
    const png = await renderReceiptPng({ ...pending, id: 2, prediction: "x".repeat(280) });
    expect(png.length).toBeGreaterThan(1000);
  });
});
