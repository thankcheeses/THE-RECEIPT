/**
 * One interface for sharing a receipt, with a platform adapter behind each
 * target. Components ask for the available targets and run one; they never
 * contain platform URLs or platform-specific branching.
 *
 * Every target here is either a browser capability or a documented, public
 * web intent. None of them post on the user's behalf: an intent opens the
 * platform's own composer with text prefilled, and the user decides whether to
 * publish. Nothing stores or requires platform credentials.
 *
 * Direct API publishing (Instagram, TikTok) is deliberately absent — see
 * `adapters.ts` for what those platforms actually require.
 */

/** What a share is about. Always anchored to the canonical receipt URL. */
export type ShareContext = {
  /** Canonical `/r/:id` URL. Every share points here. */
  url: string;
  title: string;
  /** Short caption text, without the URL — adapters append it where relevant. */
  text: string;
  /** Absolute URL of the generated receipt card, when one is available. */
  imageUrl?: string | null;
  receiptId: number | string;
};

export type ShareOutcome = {
  ok: boolean;
  /** Shown to the user. Says what actually happened, not what was attempted. */
  message: string;
  /** Recorded as the `method` property on the receipt_shared event. */
  method: string;
};

/**
 * How a target behaves, so the UI can describe it truthfully:
 * - `native`     hands off to the operating system's share sheet
 * - `clipboard`  copies to the clipboard
 * - `intent`     opens the platform's composer with text prefilled; the user posts
 * - `download`   saves the receipt image for the user to upload themselves
 */
export type ShareKind = "native" | "clipboard" | "intent" | "download";

export type ShareTarget = {
  id: string;
  label: string;
  kind: ShareKind;
  /** One line explaining what running this actually does. */
  note: string;
  isAvailable: (context: ShareContext) => boolean;
  run: (context: ShareContext) => Promise<ShareOutcome>;
};

/** Opens a composer in a new tab. Never a background post. */
export function openIntent(url: string) {
  window.open(url, "_blank", "noopener,noreferrer");
}

export async function copyToClipboard(value: string) {
  if (!navigator.clipboard?.writeText) return false;
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    return false;
  }
}

/** Targets usable in the current browser for this receipt, in display order. */
export function availableTargets(targets: ShareTarget[], context: ShareContext) {
  return targets.filter((target) => target.isAvailable(context));
}

export async function runShare(target: ShareTarget, context: ShareContext): Promise<ShareOutcome> {
  try {
    return await target.run(context);
  } catch (error) {
    // A cancelled native share sheet rejects; that is not a failure to report.
    if (error instanceof DOMException && error.name === "AbortError") {
      return { ok: false, message: "", method: target.id };
    }
    return { ok: false, message: "That share did not go through.", method: target.id };
  }
}
