/**
 * Renders a public receipt as a PNG social card, in a requested format.
 *
 * The image is built from the same visual language as `ReceiptPaper` in
 * client/src/App.tsx — the acid stage, warm paper, monospaced metadata, dotted
 * rules, perforated edge and status stamp — so a shared card looks like the
 * receipt it points at rather than a second, unrelated design. The tokens below
 * are the ones in client/src/index.css.
 *
 * Satori takes plain element objects (no JSX), which keeps the server a pure
 * .ts build. Rendering is CPU-bound, so results are cached briefly in memory:
 * a crawler usually fetches the same card several times in a row.
 *
 * Every dimension below is expressed against the layout's scale rather than in
 * fixed pixels, so a 9:16 story card is the same receipt at a different size
 * rather than a second design.
 */
import { Resvg } from "@resvg/resvg-js";
import fs from "node:fs";
import { createRequire } from "node:module";
import satori from "satori";
import { CARD_FORMATS, DEFAULT_CARD_FORMAT, cardLayout, type CardFormat } from "@shared/cardFormats";

const require = createRequire(import.meta.url);

// client/src/index.css
const INK = "#11110f";
const WHITE = "#fffefb";
const LINE = "#d9d4c8";
const ACID = "#c4fa57";
const MUTED = "#77746d";

const STATUS_COLORS: Record<string, string> = {
  RIGHT: "#2b7b18",
  WRONG: "#cf3e36",
  "PARTIALLY RIGHT": "#946500",
  "TOO EARLY": "#4e65ac",
};

type Element = { type: string; props: Record<string, unknown> };
const el = (type: string, style: Record<string, unknown>, children?: unknown): Element => ({
  type,
  props: children === undefined ? { style } : { style, children },
});

type SatoriFonts = Parameters<typeof satori>[1]["fonts"];

let fontCache: SatoriFonts | null = null;

function loadFonts(): SatoriFonts {
  if (fontCache) return fontCache;
  // Satori supports ttf/otf/woff — @fontsource ships woff alongside woff2.
  fontCache = [
    { name: "DM Sans", data: fs.readFileSync(require.resolve("@fontsource/dm-sans/files/dm-sans-latin-400-normal.woff")), weight: 400 as const, style: "normal" as const },
    { name: "DM Sans", data: fs.readFileSync(require.resolve("@fontsource/dm-sans/files/dm-sans-latin-700-normal.woff")), weight: 700 as const, style: "normal" as const },
    { name: "Space Grotesk", data: fs.readFileSync(require.resolve("@fontsource/space-grotesk/files/space-grotesk-latin-700-normal.woff")), weight: 700 as const, style: "normal" as const },
    { name: "DM Mono", data: fs.readFileSync(require.resolve("@fontsource/dm-mono/files/dm-mono-latin-400-normal.woff")), weight: 400 as const, style: "normal" as const },
    { name: "DM Mono", data: fs.readFileSync(require.resolve("@fontsource/dm-mono/files/dm-mono-latin-500-normal.woff")), weight: 500 as const, style: "normal" as const },
  ];
  return fontCache;
}

const shortDate = (value: Date | string) =>
  new Date(value).toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" });

const mono = (size: number, scale: number, color = INK, weight: 400 | 500 = 400) => ({
  fontFamily: "DM Mono",
  fontSize: Math.round(size * scale),
  fontWeight: weight,
  letterSpacing: 1.4 * scale,
  color,
});

/**
 * The torn edge of the paper: acid wedges biting into the white sheet, the
 * flat equivalent of the CSS gradient perforation on the web receipt. Drawn
 * with the border-triangle trick, which Satori renders reliably.
 */
function perforation(position: "top" | "bottom", scale: number, paperWidth: number) {
  const side = Math.round(9 * scale);
  const depth = Math.round(11 * scale);
  const notch = position === "top"
    ? { borderLeft: `${side}px solid transparent`, borderRight: `${side}px solid transparent`, borderTop: `${depth}px solid ${ACID}` }
    : { borderLeft: `${side}px solid transparent`, borderRight: `${side}px solid transparent`, borderBottom: `${depth}px solid ${ACID}` };
  // Keep the notches roughly the same physical rhythm at any card width.
  const count = Math.max(12, Math.round(paperWidth / 38));
  const notches = Array.from({ length: count }, () => el("div", { width: 0, height: 0, ...notch }));
  return el(
    "div",
    { display: "flex", width: "100%", height: depth, background: WHITE, justifyContent: "space-between", alignItems: position === "top" ? "flex-start" : "flex-end" },
    notches,
  );
}

// Satori supports only solid and dashed borders; dashed stands in for the
// dotted rule the CSS receipt uses.
function rule(scale: number, dashed = false) {
  return el("div", {
    display: "flex",
    width: "100%",
    height: 1,
    background: dashed ? "transparent" : LINE,
    borderTop: dashed ? `${Math.max(2, Math.round(2 * scale))}px dashed ${LINE}` : "none",
    marginTop: Math.round(18 * scale),
    marginBottom: Math.round(18 * scale),
  });
}

function field(label: string, value: string, scale: number) {
  return el("div", { display: "flex", flexDirection: "column", width: "50%", marginBottom: Math.round(16 * scale) }, [
    el("div", mono(15, scale, MUTED), label),
    el("div", { ...mono(22, scale), marginTop: Math.round(6 * scale) }, value),
  ]);
}

export type ReceiptImageInput = {
  id: number;
  prediction: string;
  category: string;
  confidence: number;
  status: string;
  createdAt: Date | string;
  resolutionDate: Date | string;
  username?: string | null;
  /** Short canonical location, e.g. `the-receipt.app/r/4821`, shown on the card. */
  canonicalLabel?: string | null;
};

/** Longer predictions get smaller type so the card never clips its own point. */
function predictionSize(text: string) {
  if (text.length > 170) return 30;
  if (text.length > 110) return 36;
  if (text.length > 60) return 42;
  return 50;
}

export async function renderReceiptSvg(receipt: ReceiptImageInput, format: CardFormat = DEFAULT_CARD_FORMAT) {
  const { width, height, paperWidth, scale, edgeScale, showBranding } = cardLayout(format);
  const status = receipt.status || "PENDING";
  const statusColor = STATUS_COLORS[status] ?? INK;
  const resolved = status in STATUS_COLORS;
  const footer = status === "WRONG" ? "WELL. THAT HAPPENED." : status === "RIGHT" ? "CALLED IT." : "NO EDITS. NO EXCUSES.";
  const pad = Math.round(54 * scale);

  const body = el(
    "div",
    { display: "flex", flexDirection: "column", width: "100%", background: WHITE, paddingLeft: pad, paddingRight: pad, paddingTop: Math.round(24 * scale), paddingBottom: Math.round(24 * scale) },
    [
      el("div", { display: "flex", justifyContent: "space-between", width: "100%" }, [
        el("div", mono(17, scale, MUTED), "THE RECEIPT"),
        el("div", mono(17, scale, MUTED), shortDate(receipt.createdAt)),
      ]),
      rule(scale, true),
      el("div", { display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%" }, [
        el("div", { ...mono(30, scale, INK, 500) }, `#${String(receipt.id).padStart(6, "0")}`),
        el(
          "div",
          {
            display: "flex",
            border: `${Math.max(2, Math.round(2 * scale))}px solid ${statusColor}`,
            paddingLeft: Math.round(14 * scale),
            paddingRight: Math.round(14 * scale),
            paddingTop: Math.round(6 * scale),
            paddingBottom: Math.round(6 * scale),
            ...mono(18, scale, statusColor, 500),
          },
          status,
        ),
      ]),
      el("div", { display: "flex", flexDirection: "column", width: "100%", marginTop: Math.round(26 * scale) }, [
        el("div", mono(15, scale, MUTED), "PREDICTION"),
        el(
          "div",
          {
            fontFamily: "DM Sans",
            fontWeight: 700,
            fontSize: Math.round(predictionSize(receipt.prediction) * scale),
            color: INK,
            marginTop: Math.round(12 * scale),
            lineHeight: 1.22,
          },
          `“${receipt.prediction}”`,
        ),
      ]),
      rule(scale),
      el("div", { display: "flex", flexWrap: "wrap", width: "100%" }, [
        field("CATEGORY", receipt.category, scale),
        field("CONFIDENCE", `${receipt.confidence}%`, scale),
        field(resolved ? "RESOLVED" : "RESOLVES", shortDate(receipt.resolutionDate), scale),
        field("CALLER", receipt.username ? `@${receipt.username}` : "ANONYMOUS", scale),
      ]),
      el("div", { display: "flex", justifyContent: "space-between", width: "100%", borderTop: `1px solid ${LINE}`, paddingTop: Math.round(16 * scale) }, [
        el("div", mono(17, scale, MUTED), footer),
        el("div", mono(17, scale, MUTED), receipt.canonicalLabel ?? ""),
      ]),
    ],
  );

  const paper = el("div", { display: "flex", flexDirection: "column", width: paperWidth }, [
    perforation("top", edgeScale, paperWidth),
    body,
    perforation("bottom", edgeScale, paperWidth),
  ]);

  // The tall and square cards have room below the receipt, and the tagline uses
  // it rather than leaving a field of empty colour. No wordmark above: the
  // receipt's own header already says THE RECEIPT, and printing it twice reads
  // as a mistake.
  const children = showBranding
    ? [paper, el("div", { ...mono(22, edgeScale, INK), marginTop: Math.round(46 * edgeScale) }, "PUT IT ON THE RECORD.")]
    : [paper];

  const tree = el(
    "div",
    { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", width, height, background: ACID, fontFamily: "DM Sans" },
    children,
  );

  // Satori's signature is typed for React elements; it accepts this plain
  // object tree at runtime, which keeps the server build free of JSX.
  return satori(tree as unknown as Parameters<typeof satori>[0], { width, height, fonts: loadFonts() });
}

const cache = new Map<string, Buffer>();
const CACHE_LIMIT = 64;

export async function renderReceiptPng(receipt: ReceiptImageInput, format: CardFormat = DEFAULT_CARD_FORMAT) {
  // The format is part of the key: the same receipt at two sizes is two cards.
  const key = `${format}:${receipt.id}:${receipt.status}:${receipt.confidence}:${receipt.canonicalLabel ?? ""}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const svg = await renderReceiptSvg(receipt, format);
  const png = new Resvg(svg, { fitTo: { mode: "width", value: CARD_FORMATS[format].width } }).render().asPng();
  if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value as string);
  cache.set(key, png);
  return png;
}

/** Link-preview dimensions, which is what og:image tags must declare. */
export const RECEIPT_IMAGE_WIDTH = CARD_FORMATS.og.width;
export const RECEIPT_IMAGE_HEIGHT = CARD_FORMATS.og.height;
