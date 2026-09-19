/**
 * Renders a public receipt as a 1200x630 PNG for social cards.
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
 */
import { Resvg } from "@resvg/resvg-js";
import fs from "node:fs";
import { createRequire } from "node:module";
import satori from "satori";

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

const WIDTH = 1200;
const HEIGHT = 630;

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

const mono = (size: number, color = INK, weight: 400 | 500 = 400) => ({
  fontFamily: "DM Mono",
  fontSize: size,
  fontWeight: weight,
  letterSpacing: 1.4,
  color,
});

/**
 * The torn edge of the paper: acid wedges biting into the white sheet, the
 * flat equivalent of the CSS gradient perforation on the web receipt. Drawn
 * with the border-triangle trick, which Satori renders reliably.
 */
function perforation(position: "top" | "bottom") {
  const notch = position === "top"
    ? { borderLeft: "9px solid transparent", borderRight: "9px solid transparent", borderTop: `11px solid ${ACID}` }
    : { borderLeft: "9px solid transparent", borderRight: "9px solid transparent", borderBottom: `11px solid ${ACID}` };
  const notches = Array.from({ length: 24 }, () => el("div", { width: 0, height: 0, ...notch }));
  return el(
    "div",
    { display: "flex", width: "100%", height: 11, background: WHITE, justifyContent: "space-between", alignItems: position === "top" ? "flex-start" : "flex-end" },
    notches,
  );
}

// Satori supports only solid and dashed borders; dashed stands in for the
// dotted rule the CSS receipt uses.
function rule(dashed = false) {
  return el("div", {
    display: "flex",
    width: "100%",
    height: 1,
    background: dashed ? "transparent" : LINE,
    borderTop: dashed ? `2px dashed ${LINE}` : "none",
    marginTop: 18,
    marginBottom: 18,
  });
}

function field(label: string, value: string) {
  return el("div", { display: "flex", flexDirection: "column", width: "50%", marginBottom: 16 }, [
    el("div", mono(15, MUTED), label),
    el("div", { ...mono(22), marginTop: 6 }, value),
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

export async function renderReceiptSvg(receipt: ReceiptImageInput) {
  const status = receipt.status || "PENDING";
  const statusColor = STATUS_COLORS[status] ?? INK;
  const resolved = status in STATUS_COLORS;
  const footer = status === "WRONG" ? "WELL. THAT HAPPENED." : status === "RIGHT" ? "CALLED IT." : "NO EDITS. NO EXCUSES.";

  const body = el(
    "div",
    { display: "flex", flexDirection: "column", width: "100%", background: WHITE, paddingLeft: 54, paddingRight: 54, paddingTop: 24, paddingBottom: 24 },
    [
      el("div", { display: "flex", justifyContent: "space-between", width: "100%" }, [
        el("div", mono(17, MUTED), "THE RECEIPT"),
        el("div", mono(17, MUTED), shortDate(receipt.createdAt)),
      ]),
      rule(true),
      el("div", { display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%" }, [
        el("div", { ...mono(30, INK, 500) }, `#${String(receipt.id).padStart(6, "0")}`),
        el(
          "div",
          { display: "flex", border: `2px solid ${statusColor}`, paddingLeft: 14, paddingRight: 14, paddingTop: 6, paddingBottom: 6, ...mono(18, statusColor, 500) },
          status,
        ),
      ]),
      el("div", { display: "flex", flexDirection: "column", width: "100%", marginTop: 26 }, [
        el("div", mono(15, MUTED), "PREDICTION"),
        el(
          "div",
          { fontFamily: "DM Sans", fontWeight: 700, fontSize: predictionSize(receipt.prediction), color: INK, marginTop: 12, lineHeight: 1.22 },
          `“${receipt.prediction}”`,
        ),
      ]),
      rule(),
      el("div", { display: "flex", flexWrap: "wrap", width: "100%" }, [
        field("CATEGORY", receipt.category),
        field("CONFIDENCE", `${receipt.confidence}%`),
        field(resolved ? "RESOLVED" : "RESOLVES", shortDate(receipt.resolutionDate)),
        field("CALLER", receipt.username ? `@${receipt.username}` : "ANONYMOUS"),
      ]),
      el("div", { display: "flex", justifyContent: "space-between", width: "100%", borderTop: `1px solid ${LINE}`, paddingTop: 16 }, [
        el("div", mono(17, MUTED), footer),
        el("div", mono(17, MUTED), receipt.canonicalLabel ?? ""),
      ]),
    ],
  );

  const paper = el("div", { display: "flex", flexDirection: "column", width: 880 }, [
    perforation("top"),
    body,
    perforation("bottom"),
  ]);

  const tree = el(
    "div",
    { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", width: WIDTH, height: HEIGHT, background: ACID, fontFamily: "DM Sans" },
    [paper],
  );

  // Satori's signature is typed for React elements; it accepts this plain
  // object tree at runtime, which keeps the server build free of JSX.
  return satori(tree as unknown as Parameters<typeof satori>[0], {
    width: WIDTH,
    height: HEIGHT,
    fonts: loadFonts(),
  });
}

const cache = new Map<string, Buffer>();
const CACHE_LIMIT = 64;

export async function renderReceiptPng(receipt: ReceiptImageInput) {
  const key = `${receipt.id}:${receipt.status}:${receipt.confidence}:${receipt.canonicalLabel ?? ""}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const svg = await renderReceiptSvg(receipt);
  const png = new Resvg(svg, { fitTo: { mode: "width", value: WIDTH } }).render().asPng();
  if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value as string);
  cache.set(key, png);
  return png;
}

export const RECEIPT_IMAGE_WIDTH = WIDTH;
export const RECEIPT_IMAGE_HEIGHT = HEIGHT;
