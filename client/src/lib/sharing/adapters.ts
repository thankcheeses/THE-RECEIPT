/**
 * Platform adapters.
 *
 * Each entry is one of three honest things:
 *
 *  1. A browser capability — the Web Share API, or the clipboard.
 *  2. A public web intent — a documented URL that opens the platform's own
 *     composer with text prefilled. The user still presses post. These need no
 *     API key, no OAuth, and no server involvement.
 *  3. Saving the generated card, for platforms with no web intent at all.
 *
 * Instagram and TikTok are intentionally case 3. Neither publishes a post from
 * a web page: Instagram's Content Publishing API and TikTok's Content Posting
 * API both require a registered app, platform review, an eligible business or
 * creator account, and server-held credentials. Offering a one-tap "post to
 * Instagram" here would be a lie, so the product offers the card instead and
 * says what it is doing.
 */
import { copyToClipboard, openIntent, type ShareContext, type ShareTarget } from "./core";

const caption = (context: ShareContext) => context.text;

/** The OS share sheet. The only target that can hand over a real file. */
const webShare: ShareTarget = {
  id: "web-share",
  label: "Share…",
  kind: "native",
  note: "Opens your device's share sheet.",
  isAvailable: () => typeof navigator !== "undefined" && typeof navigator.share === "function",
  run: async (context) => {
    await navigator.share({ title: context.title, text: caption(context), url: context.url });
    return { ok: true, message: "Shared.", method: "web-share" };
  },
};

const copyLink: ShareTarget = {
  id: "copy",
  label: "Copy link",
  kind: "clipboard",
  note: "Copies the receipt's canonical link.",
  isAvailable: () => typeof navigator !== "undefined" && Boolean(navigator.clipboard?.writeText),
  run: async (context) => {
    const ok = await copyToClipboard(context.url);
    return ok
      ? { ok: true, message: "Receipt link copied.", method: "copy" }
      : { ok: false, message: "Your browser blocked the clipboard.", method: "copy" };
  },
};

const x: ShareTarget = {
  id: "x",
  label: "X",
  kind: "intent",
  note: "Opens X with the post written. You send it.",
  isAvailable: () => true,
  run: async (context) => {
    const url = new URL("https://x.com/intent/tweet");
    url.searchParams.set("text", caption(context));
    url.searchParams.set("url", context.url);
    openIntent(url.toString());
    return { ok: true, message: "Opened X. Press post when you're ready.", method: "x" };
  },
};

const bluesky: ShareTarget = {
  id: "bluesky",
  label: "Bluesky",
  kind: "intent",
  note: "Opens Bluesky with the post written. You send it.",
  isAvailable: () => true,
  run: async (context) => {
    const url = new URL("https://bsky.app/intent/compose");
    // Bluesky's intent takes a single text field, so the link goes inside it.
    url.searchParams.set("text", `${caption(context)} ${context.url}`);
    openIntent(url.toString());
    return { ok: true, message: "Opened Bluesky. Press post when you're ready.", method: "bluesky" };
  },
};

const reddit: ShareTarget = {
  id: "reddit",
  label: "Reddit",
  kind: "intent",
  note: "Opens Reddit's submit form. You choose the community.",
  isAvailable: () => true,
  run: async (context) => {
    const url = new URL("https://www.reddit.com/submit");
    url.searchParams.set("url", context.url);
    url.searchParams.set("title", context.title);
    openIntent(url.toString());
    return { ok: true, message: "Opened Reddit. Pick a community and post.", method: "reddit" };
  },
};

const whatsapp: ShareTarget = {
  id: "whatsapp",
  label: "WhatsApp",
  kind: "intent",
  note: "Opens WhatsApp with the message written. You pick the chat.",
  isAvailable: () => true,
  run: async (context) => {
    const url = new URL("https://wa.me/");
    url.searchParams.set("text", `${caption(context)} ${context.url}`);
    openIntent(url.toString());
    return { ok: true, message: "Opened WhatsApp. Pick a chat and send.", method: "whatsapp" };
  },
};

const facebook: ShareTarget = {
  id: "facebook",
  label: "Facebook",
  kind: "intent",
  note: "Opens Facebook's share dialog, which builds the preview from the link. You post it.",
  isAvailable: () => true,
  run: async (context) => {
    // Facebook strips prefilled text from the sharer; the link's Open Graph
    // tags are what produce the preview, so only the URL is sent.
    const url = new URL("https://www.facebook.com/sharer/sharer.php");
    url.searchParams.set("u", context.url);
    openIntent(url.toString());
    return { ok: true, message: "Opened Facebook. Press post when you're ready.", method: "facebook" };
  },
};

/**
 * Instagram and TikTok have no web intent that composes a post. The useful,
 * truthful action is to hand over the card so the user can post it themselves.
 */
const saveCard: ShareTarget = {
  id: "save-image",
  label: "Save receipt image",
  kind: "download",
  note: "Downloads the card for Instagram, TikTok, or anywhere else. Neither lets a website post for you.",
  isAvailable: (context) => Boolean(context.imageUrl),
  run: async (context) => {
    const link = document.createElement("a");
    link.href = context.imageUrl!;
    link.download = `receipt-${context.receiptId}.png`;
    link.rel = "noopener";
    document.body.appendChild(link);
    link.click();
    link.remove();
    return { ok: true, message: "Receipt image saved.", method: "save-image" };
  },
};

/** Display order: the two everyday actions first, then composers, then the card. */
export const SHARE_TARGETS: ShareTarget[] = [webShare, copyLink, x, bluesky, whatsapp, reddit, facebook, saveCard];
