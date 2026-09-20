/**
 * Server-rendered social preview metadata for public receipts.
 *
 * The client is a single-page app, so a crawler fetching /r/:id would otherwise
 * receive an empty shell with the site's generic tags. The production Express
 * process already serves index.html for that route, so it injects the real
 * receipt's metadata on the way out. Nothing new is hosted and no build step
 * changes: the tags are read live, so a receipt created a minute ago previews
 * correctly.
 *
 * The static GitHub Pages demo keeps the generic tags. It has no server, and
 * its receipts live in one browser's localStorage — they are not reachable by
 * anyone else, so there is nothing there for a crawler to preview.
 */
import type { Express, Request } from "express";
import fs from "node:fs";
import path from "node:path";
import { getPublicReceipt } from "./db";
import { RECEIPT_IMAGE_HEIGHT, RECEIPT_IMAGE_WIDTH, renderReceiptPng } from "./receiptImage";
import { isCardFormat, resolveCardFormat } from "@shared/cardFormats";
import { authorLabel } from "@shared/accountDeletion";

const SITE_NAME = "THE RECEIPT";
const TAGLINE = "Put it on the record.";

/** Escapes text destined for an HTML attribute. Predictions are user-written. */
export function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function formatReceiptNumber(id: number) {
  return String(id).padStart(6, "0");
}

const shortDate = (value: Date | string) =>
  new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

type PreviewReceipt = {
  id: number;
  /** Null once the author deleted their account. */
  userId?: number | null;
  prediction: string;
  category: string;
  confidence: number;
  status: string;
  resolutionDate: Date | string | null;
};

type PreviewUser = { username?: string | null; name?: string | null } | null | undefined;

/**
 * The sentence a crawler shows under the title. Resolved receipts lead with the
 * verdict, because that is the interesting part once reality has answered.
 */
export function buildReceiptDescription(receipt: PreviewReceipt, user: PreviewUser) {
  const who = authorLabel(receipt, user, "Someone");
  const resolved = ["RIGHT", "WRONG", "PARTIALLY RIGHT", "TOO EARLY"].includes(receipt.status);
  const verdict = resolved
    ? `${receipt.status}.`
    : receipt.resolutionDate
      ? `Resolves ${shortDate(receipt.resolutionDate)}.`
      : "Still open.";
  return `${who} was ${receipt.confidence}% sure: “${receipt.prediction}” ${verdict} No edits. No excuses.`;
}

export function buildReceiptTitle(receipt: PreviewReceipt) {
  return `Receipt #${formatReceiptNumber(receipt.id)} — ${SITE_NAME}`;
}

/**
 * Open Graph + Twitter tags for one public receipt.
 *
 * `imageUrl` is optional: without a generated image the card degrades to
 * Twitter's `summary` form rather than claiming a large image that does not
 * exist.
 */
export function buildReceiptMetaTags(
  receipt: PreviewReceipt,
  user: PreviewUser,
  canonicalUrl: string,
  imageUrl?: string,
) {
  const title = escapeHtml(buildReceiptTitle(receipt));
  const description = escapeHtml(buildReceiptDescription(receipt, user));
  const url = escapeHtml(canonicalUrl);
  const tags = [
    `<title>${title}</title>`,
    `<link rel="canonical" href="${url}" />`,
    `<meta name="description" content="${description}" />`,
    `<meta property="og:type" content="article" />`,
    `<meta property="og:site_name" content="${SITE_NAME}" />`,
    `<meta property="og:title" content="${title}" />`,
    `<meta property="og:description" content="${description}" />`,
    `<meta property="og:url" content="${url}" />`,
    `<meta name="twitter:title" content="${title}" />`,
    `<meta name="twitter:description" content="${description}" />`,
  ];
  if (imageUrl) {
    const image = escapeHtml(imageUrl);
    tags.push(
      `<meta property="og:image" content="${image}" />`,
      `<meta property="og:image:width" content="${RECEIPT_IMAGE_WIDTH}" />`,
      `<meta property="og:image:height" content="${RECEIPT_IMAGE_HEIGHT}" />`,
      `<meta property="og:image:alt" content="${escapeHtml(`Receipt #${formatReceiptNumber(receipt.id)}: ${receipt.prediction}`)}" />`,
      `<meta name="twitter:card" content="summary_large_image" />`,
      `<meta name="twitter:image" content="${image}" />`,
    );
  } else {
    tags.push(`<meta name="twitter:card" content="summary" />`);
  }
  return tags.join("\n    ");
}

/**
 * Replaces the document's existing title/description with receipt-specific tags.
 * The rest of the shell is untouched, so the same bundle boots as always.
 */
export function injectMetaTags(html: string, tags: string) {
  const withoutDefaults = html
    .replace(/<title>[\s\S]*?<\/title>\s*/i, "")
    .replace(/<meta\s+name="description"[^>]*>\s*/i, "");
  return withoutDefaults.replace(/<\/head>/i, `  ${tags}\n  </head>`);
}

/** Absolute origin for canonical URLs, honouring a terminating proxy. */
export function originFor(req: Request) {
  const forwardedProto = String(req.headers["x-forwarded-proto"] ?? "").split(",")[0].trim();
  const protocol = forwardedProto || req.protocol || "https";
  const host = req.get("host");
  return `${protocol}://${host}`;
}

/**
 * Serves /r/:id with per-receipt metadata. Registered before the static
 * handler so it wins for that route; anything it cannot resolve — a bad id, a
 * private receipt, a missing shell — falls through to the untouched SPA, which
 * is also what keeps private receipts out of public metadata.
 */
export function registerReceiptPreview(app: Express, distPath: string) {
  // The card image for a public receipt. Private and missing receipts 404
  // rather than falling through, so nothing renders an image of a receipt the
  // requester is not allowed to see.
  app.get("/r/:id/image.png", async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).end();
    // An unknown format is rejected rather than quietly served as a link card,
    // so a caller never receives a shape it did not ask for.
    if (req.query.format !== undefined && !isCardFormat(req.query.format)) return res.status(400).end();
    const format = resolveCardFormat(req.query.format);
    try {
      const result = await getPublicReceipt(id);
      if (!result?.receipt) return res.status(404).end();
      const png = await renderReceiptPng({
        ...result.receipt,
        username: result.user?.username ?? result.user?.name ?? null,
        canonicalLabel: `${originFor(req).replace(/^https?:\/\//, "")}/r/${id}`,
      }, format);
      res.setHeader("Content-Type", "image/png");
      res.setHeader("Cache-Control", "public, max-age=300");
      res.end(png);
    } catch (error) {
      console.warn("[Preview] Failed to render receipt image:", error);
      res.status(500).end();
    }
  });

  app.get("/r/:id", async (req, res, next) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return next();
    try {
      const result = await getPublicReceipt(id);
      if (!result?.receipt) return next();
      const indexPath = path.resolve(distPath, "index.html");
      if (!fs.existsSync(indexPath)) return next();
      const html = await fs.promises.readFile(indexPath, "utf-8");
      const origin = originFor(req);
      const tags = buildReceiptMetaTags(
        result.receipt,
        result.user,
        `${origin}/r/${id}`,
        `${origin}/r/${id}/image.png`,
      );
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.send(injectMetaTags(html, tags));
    } catch (error) {
      console.warn("[Preview] Failed to render receipt metadata:", error);
      next();
    }
  });
}

export const PREVIEW_SITE_NAME = SITE_NAME;
export const PREVIEW_TAGLINE = TAGLINE;
