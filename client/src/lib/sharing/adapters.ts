/**
 * Platform adapters.
 *
 * Each entry is one of three honest things:
 *
 *  1. A browser capability — the Web Share API, or the clipboard.
 *  2. A public web intent — a documented URL that opens the platform's own
 *     composer with text prefilled. The user still presses post. These need no
 *     API key, no OAuth, and no server involvement.
 *  3. A rendered card, for platforms with no web intent at all.
 *
 * Instagram and TikTok are case 3. Neither publishes a post from a web page:
 * Instagram's Content Publishing API and TikTok's Content Posting API both
 * require a registered app, platform review, an eligible business or creator
 * account, and server-held credentials. A one-tap "post to Instagram" here
 * would be a lie, so they get a correctly shaped card and a note saying so.
 *
 * Targets carry a platform, so one platform can offer several destinations —
 * Instagram's story and feed cards are different shapes of the same receipt.
 */
import { copyToClipboard, openIntent, type ShareContext, type ShareTarget } from "./core";
import { CARD_FORMATS, type CardFormat } from "@shared/cardFormats";

const caption = (context: ShareContext) => context.text;

/** A card destination: renders nothing itself, just hands over the right shape. */
function cardTarget(config: {
  id: string;
  platform: ShareTarget["platform"];
  action: string;
  format: CardFormat;
  note: string;
}): ShareTarget {
  return {
    id: config.id,
    platform: config.platform,
    action: config.action,
    kind: "download",
    note: config.note,
    format: config.format,
    isAvailable: (context) => Boolean(context.cardUrl?.(config.format)),
    run: async (context) => {
      const href = context.cardUrl?.(config.format);
      if (!href) return { ok: false, message: "No card is available for this receipt.", method: config.id };
      const link = document.createElement("a");
      link.href = href;
      link.download = `receipt-${context.receiptId}-${config.format}.png`;
      link.rel = "noopener";
      document.body.appendChild(link);
      link.click();
      link.remove();
      const { width, height } = CARD_FORMATS[config.format];
      return { ok: true, message: `Saved a ${width}×${height} card.`, method: config.id };
    },
  };
}

/** The OS share sheet. The only target that can hand over a real file. */
const webShare: ShareTarget = {
  id: "web-share",
  platform: "device",
  action: "Share sheet",
  kind: "native",
  note: "Opens your device's own share sheet.",
  isAvailable: () => typeof navigator !== "undefined" && typeof navigator.share === "function",
  run: async (context) => {
    await navigator.share({ title: context.title, text: caption(context), url: context.url });
    return { ok: true, message: "Shared.", method: "web-share" };
  },
};

const copyLink: ShareTarget = {
  id: "copy",
  platform: "link",
  action: "Copy link",
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
  platform: "x",
  action: "Post",
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
  platform: "bluesky",
  action: "Post",
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
  platform: "reddit",
  action: "Post",
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

/**
 * wa.me opens a chat. WhatsApp Status has no web intent, so it is not offered
 * here — the story card covers that case instead.
 */
const whatsapp: ShareTarget = {
  id: "whatsapp",
  platform: "whatsapp",
  action: "Send to a chat",
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
  platform: "facebook",
  action: "Share",
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

const instagramStory = cardTarget({
  id: "instagram-story",
  platform: "instagram",
  action: "Story card",
  format: "story",
  note: "Saves a 9:16 card for your story. Instagram does not let a website post for you.",
});

const instagramFeed = cardTarget({
  id: "instagram-feed",
  platform: "instagram",
  action: "Feed card",
  format: "square",
  note: "Saves a square card for a feed post. You upload it yourself.",
});

const tiktokStory = cardTarget({
  id: "tiktok-story",
  platform: "tiktok",
  action: "Story card",
  format: "story",
  note: "Saves a 9:16 card. TikTok does not let a website post for you.",
});

const saveLinkCard = cardTarget({
  id: "save-og",
  platform: "save",
  action: "Link card",
  format: "og",
  note: "Saves the wide card used for link previews.",
});

export const SHARE_TARGETS: ShareTarget[] = [
  webShare,
  copyLink,
  x,
  bluesky,
  whatsapp,
  reddit,
  facebook,
  instagramStory,
  instagramFeed,
  tiktokStory,
  saveLinkCard,
];
