/**
 * The shapes a receipt card can be rendered at.
 *
 * A link preview and an Instagram Story are not the same picture: one is wide
 * and read in a timeline, the other is a full phone screen. Rendering one size
 * and hoping meant the card was always wrong somewhere, so the renderer takes a
 * format and the layout adapts to it.
 *
 * Shared because the server renders these and the client asks for them by name.
 */
export const CARD_FORMATS = {
  /** Open Graph / Twitter link previews. The default. */
  og: { width: 1200, height: 630, label: "Link card" },
  /** 9:16 for Instagram, TikTok and Snapchat stories. */
  story: { width: 1080, height: 1920, label: "Story card" },
  /** 1:1 for an Instagram feed post. */
  square: { width: 1080, height: 1080, label: "Square card" },
} as const;

export type CardFormat = keyof typeof CARD_FORMATS;

export const DEFAULT_CARD_FORMAT: CardFormat = "og";

export function isCardFormat(value: unknown): value is CardFormat {
  return typeof value === "string" && value in CARD_FORMATS;
}

/** Narrows an untrusted value to a format, falling back to the link card. */
export function resolveCardFormat(value: unknown): CardFormat {
  return isCardFormat(value) ? value : DEFAULT_CARD_FORMAT;
}

/**
 * Geometry for one format.
 *
 * The receipt takes a larger share of the canvas on the tall and square
 * formats, where there is no horizontal room to waste, and everything inside it
 * scales from that width so the proportions hold at every size.
 */
export function cardLayout(format: CardFormat) {
  const { width, height } = CARD_FORMATS[format];
  const paperShare = format === "og" ? 0.73 : 0.86;
  const paperWidth = Math.round(width * paperShare);
  // The og card's 880px paper is the size every dimension was tuned against.
  const edgeScale = paperWidth / 880;
  // A tall card is a whole phone screen. Width alone cannot fill it, so the
  // contents are set larger, which wraps the prediction over more lines and
  // gives the receipt real presence instead of leaving it adrift.
  const contentBoost = format === "story" ? 1.34 : format === "square" ? 1.12 : 1;
  return {
    width,
    height,
    paperWidth,
    /** Scale for everything inside the paper: type, padding, rules. */
    scale: edgeScale * contentBoost,
    /** Scale for the torn edge, which belongs to the paper's width. */
    edgeScale,
    /** Whether the format has spare room for the wordmark and tagline. */
    showBranding: format !== "og",
  };
}
