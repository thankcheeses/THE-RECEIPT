import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { isPubliclyVisible } from "@shared/moderation";
import express from "express";
import type { Server } from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const publicReceipt = {
  receipt: {
    id: 4821,
    prediction: `A "quoted" & <tagged> prediction.`,
    category: "INTERNET",
    confidence: 65,
    status: "LOCKED",
    createdAt: new Date("2026-09-19T00:00:00Z"),
    resolutionDate: new Date("2026-10-03T00:00:00Z"),
    visibility: "PUBLIC",
    moderationStatus: "VISIBLE",
  },
  user: { username: "nia", name: "Nia" },
};

// The same receipt after a moderator took it down. Nothing about it changed
// except whether the public may see it.
const hiddenReceipt = {
  receipt: { ...publicReceipt.receipt, id: 4823, moderationStatus: "HIDDEN" },
  user: publicReceipt.user,
};

// 4821 is public, 4823 is hidden, 4822 stands in for private or missing. The
// mock applies the same rule the real getPublicReceipt does, so a takedown
// closes the preview and the card together.
vi.mock("./db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./db")>()),
  getPublicReceipt: async (id: number) => {
    const row = id === 4821 ? publicReceipt : id === 4823 ? hiddenReceipt : undefined;
    return row && isPubliclyVisible(row.receipt) ? row : undefined;
  },
}));

const { registerReceiptPreview } = await import("./receiptPreview");

const SHELL = `<!doctype html><html><head><meta charset="UTF-8" /><meta name="description" content="generic site description" /><title>THE RECEIPT — Put it on the record.</title></head><body><div id="root"></div><script type="module" src="/assets/app.js"></script></body></html>`;

let server: Server;
let base: string;
let distPath: string;

beforeAll(async () => {
  distPath = fs.mkdtempSync(path.join(os.tmpdir(), "receipt-preview-"));
  fs.writeFileSync(path.join(distPath, "index.html"), SHELL);
  const app = express();
  registerReceiptPreview(app, distPath);
  // Stands in for the static handler that normally follows.
  app.use("*", (_req, res) => res.status(200).type("html").send(SHELL));
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  fs.rmSync(distPath, { recursive: true, force: true });
});

describe("GET /r/:id", () => {
  it("injects the receipt's own title, description and canonical URL", async () => {
    const html = await (await fetch(`${base}/r/4821`)).text();
    expect(html).toContain("Receipt #004821 — THE RECEIPT");
    expect(html).toContain(`<link rel="canonical" href="${base}/r/4821" />`);
    expect(html).toContain('property="og:url"');
    expect(html).toContain("@nia");
  });

  it("drops the generic site description so crawlers see the receipt's", async () => {
    const html = await (await fetch(`${base}/r/4821`)).text();
    expect(html).not.toContain("generic site description");
    expect(html.match(/<title>/g)).toHaveLength(1);
  });

  it("escapes user-written prediction text in the metadata", async () => {
    const html = await (await fetch(`${base}/r/4821`)).text();
    expect(html).toContain("&lt;tagged&gt;");
    expect(html).toContain("&amp;");
    expect(html).not.toContain(`content="A "quoted"`);
  });

  it("advertises the generated card image", async () => {
    const html = await (await fetch(`${base}/r/4821`)).text();
    expect(html).toContain(`<meta property="og:image" content="${base}/r/4821/image.png" />`);
    expect(html).toContain('content="summary_large_image"');
  });

  it("still serves the application shell, so the page works for people too", async () => {
    const html = await (await fetch(`${base}/r/4821`)).text();
    expect(html).toContain('<div id="root"></div>');
    expect(html).toContain('src="/assets/app.js"');
  });

  it("falls through to the untouched shell for a private or missing receipt", async () => {
    const html = await (await fetch(`${base}/r/4822`)).text();
    expect(html).toContain("generic site description");
    expect(html).not.toContain("Receipt #004822");
    expect(html).not.toContain("og:image");
  });

  it("gives a receipt taken down by a moderator no metadata at all", async () => {
    const html = await (await fetch(`${base}/r/4823`)).text();
    expect(html).toContain("generic site description");
    expect(html).not.toContain("Receipt #004823");
    expect(html).not.toContain("og:image");
    // The shell still renders, exactly as it does for a private receipt.
    expect(html).toContain('<div id="root"></div>');
  });

  it("falls through for a non-numeric id rather than erroring", async () => {
    const res = await fetch(`${base}/r/not-a-number`);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("generic site description");
  });
});

describe("GET /r/:id/image.png", () => {
  it("returns a PNG for a public receipt", async () => {
    const res = await fetch(`${base}/r/4821/image.png`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    const bytes = Buffer.from(await res.arrayBuffer());
    expect(bytes.subarray(0, 4)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  });

  it("is cacheable, since a crawler fetches it repeatedly", async () => {
    const res = await fetch(`${base}/r/4821/image.png`);
    expect(res.headers.get("cache-control")).toContain("max-age");
  });

  it("404s for a private or missing receipt instead of rendering one", async () => {
    expect((await fetch(`${base}/r/4822/image.png`)).status).toBe(404);
  });

  it("404s for a receipt taken down by a moderator", async () => {
    expect((await fetch(`${base}/r/4823/image.png`)).status).toBe(404);
  });

  it("rejects a malformed id", async () => {
    expect((await fetch(`${base}/r/0/image.png`)).status).toBe(400);
  });

  it("serves each requested format", async () => {
    for (const format of ["og", "story", "square"]) {
      const res = await fetch(`${base}/r/4821/image.png?format=${format}`);
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toBe("image/png");
    }
  });

  it("rejects an unknown format instead of quietly serving a link card", async () => {
    expect((await fetch(`${base}/r/4821/image.png?format=portrait`)).status).toBe(400);
    expect((await fetch(`${base}/r/4821/image.png?format=`)).status).toBe(400);
  });

  it("serves the link card when no format is asked for", async () => {
    const res = await fetch(`${base}/r/4821/image.png`);
    expect(res.status).toBe(200);
  });
});
