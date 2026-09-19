import { beforeEach, describe, expect, it, vi } from "vitest";
import { SHARE_TARGETS } from "./adapters";
import { PLATFORM_ORDER, SHARE_PLATFORMS, availableTargets, groupedTargets, runShare, type ShareContext } from "./core";
import { CARD_FORMATS } from "@shared/cardFormats";

const context: ShareContext = {
  url: "https://receipts.example/r/4821",
  title: "Receipt #004821 — THE RECEIPT",
  text: `I was 65% sure: “This tiny app will become the group chat's new obsession.”`,
  cardUrl: (format: string) => `https://receipts.example/r/4821/image.png?format=${format}`,
  receiptId: 4821,
};

const opened: string[] = [];

beforeEach(() => {
  opened.length = 0;
  vi.stubGlobal("window", { open: (url: string) => opened.push(url), location: { origin: "https://receipts.example" } });
  vi.stubGlobal("navigator", { clipboard: { writeText: async () => undefined } });
});

const byId = (id: string) => SHARE_TARGETS.find((target) => target.id === id)!;

describe("share target registry", () => {
  it("has unique ids", () => {
    const ids = SHARE_TARGETS.map((target) => target.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("describes every target honestly with a note and a kind", () => {
    for (const target of SHARE_TARGETS) {
      expect(target.note.length).toBeGreaterThan(10);
      expect(["native", "clipboard", "intent", "download"]).toContain(target.kind);
    }
  });

  it("assigns every target to a known platform with an action label", () => {
    for (const target of SHARE_TARGETS) {
      expect(SHARE_PLATFORMS).toHaveProperty(target.platform);
      expect(PLATFORM_ORDER).toContain(target.platform);
      expect(target.action.length).toBeGreaterThan(2);
    }
  });

  it("never describes a target as posting automatically", () => {
    for (const target of SHARE_TARGETS) {
      expect(target.note.toLowerCase()).not.toContain("automatically");
    }
  });

  it("tells the user they are the one who posts, on every composer target", () => {
    for (const target of SHARE_TARGETS.filter((t) => t.kind === "intent")) {
      // Each intent note must hand the final action to the reader.
      expect(target.note).toMatch(/\bYou\b/);
    }
  });

  it("hides the native sheet when the browser has no share API", () => {
    vi.stubGlobal("navigator", {});
    expect(availableTargets(SHARE_TARGETS, context).some((t) => t.id === "web-share")).toBe(false);
  });

  it("hides every card destination when nothing renders cards, as on the static demo", () => {
    const withoutCards = availableTargets(SHARE_TARGETS, { ...context, cardUrl: () => null });
    expect(withoutCards.some((t) => t.kind === "download")).toBe(false);
    // The composers still work without a renderer behind them.
    expect(withoutCards.some((t) => t.kind === "intent")).toBe(true);
    expect(availableTargets(SHARE_TARGETS, context).some((t) => t.kind === "download")).toBe(true);
  });

  it("asks for a real, known card format on every card destination", () => {
    for (const target of SHARE_TARGETS.filter((t) => t.kind === "download")) {
      expect(target.format).toBeDefined();
      expect(CARD_FORMATS).toHaveProperty(target.format!);
    }
  });
});

describe("platform grouping", () => {
  it("groups destinations under their platform, in display order", () => {
    const groups = groupedTargets(SHARE_TARGETS, context);
    const ids = groups.map((group) => group.platform.id);
    expect(ids).toEqual(PLATFORM_ORDER.filter((id) => ids.includes(id)));
  });

  it("lets one platform carry several destinations", () => {
    const instagram = groupedTargets(SHARE_TARGETS, context).find((g) => g.platform.id === "instagram");
    expect(instagram?.targets.map((t) => t.action)).toEqual(["Story card", "Feed card"]);
  });

  it("gives Instagram a 9:16 story and a 1:1 feed card", () => {
    const instagram = groupedTargets(SHARE_TARGETS, context).find((g) => g.platform.id === "instagram")!;
    const formats = instagram.targets.map((t) => t.format);
    expect(formats).toEqual(["story", "square"]);
    expect(CARD_FORMATS.story.height).toBeGreaterThan(CARD_FORMATS.story.width);
    expect(CARD_FORMATS.square.width).toBe(CARD_FORMATS.square.height);
  });

  it("drops a platform entirely when none of its destinations are usable", () => {
    const groups = groupedTargets(SHARE_TARGETS, { ...context, cardUrl: () => null });
    expect(groups.some((g) => g.platform.id === "instagram")).toBe(false);
    expect(groups.some((g) => g.platform.id === "tiktok")).toBe(false);
    expect(groups.some((g) => g.platform.id === "x")).toBe(true);
  });

  it("never returns an empty group", () => {
    for (const group of groupedTargets(SHARE_TARGETS, context)) {
      expect(group.targets.length).toBeGreaterThan(0);
    }
  });
});

describe("card destinations", () => {
  it("requests the format its platform actually wants", async () => {
    const requested: string[] = [];
    const clicked: string[] = [];
    vi.stubGlobal("document", {
      createElement: () => ({ set href(v: string) { clicked.push(v); }, download: "", rel: "", click() {}, remove() {} }),
      body: { appendChild: () => {} },
    });
    const ctx = { ...context, cardUrl: (f: string) => { requested.push(f); return `https://x.test/c.png?format=${f}`; } };
    await runShare(byId("instagram-story"), ctx as never);
    await runShare(byId("tiktok-story"), ctx as never);
    await runShare(byId("save-og"), ctx as never);
    // isAvailable also probes, so check membership rather than exact order.
    expect(clicked).toEqual([
      "https://x.test/c.png?format=story",
      "https://x.test/c.png?format=story",
      "https://x.test/c.png?format=og",
    ]);
    expect(new Set(requested)).toEqual(new Set(["story", "og"]));
  });

  it("reports a failure rather than pretending when no card comes back", async () => {
    const outcome = await runShare(byId("instagram-story"), { ...context, cardUrl: () => null } as never);
    expect(outcome.ok).toBe(false);
    expect(outcome.message).toContain("No card");
  });
});

describe("intents point at the canonical receipt", () => {
  it("X carries the text and the canonical url", async () => {
    await runShare(byId("x"), context);
    const url = new URL(opened[0]);
    expect(url.origin + url.pathname).toBe("https://x.com/intent/tweet");
    expect(url.searchParams.get("url")).toBe(context.url);
    expect(url.searchParams.get("text")).toBe(context.text);
  });

  it("Bluesky puts the link inside its single text field", async () => {
    await runShare(byId("bluesky"), context);
    const url = new URL(opened[0]);
    expect(url.origin + url.pathname).toBe("https://bsky.app/intent/compose");
    expect(url.searchParams.get("text")).toContain(context.url);
  });

  it("Reddit submits the canonical url with a title", async () => {
    await runShare(byId("reddit"), context);
    const url = new URL(opened[0]);
    expect(url.searchParams.get("url")).toBe(context.url);
    expect(url.searchParams.get("title")).toBe(context.title);
  });

  it("WhatsApp sends text plus the canonical url", async () => {
    await runShare(byId("whatsapp"), context);
    expect(new URL(opened[0]).searchParams.get("text")).toContain(context.url);
  });

  it("Facebook sends only the url, since it strips prefilled text", async () => {
    await runShare(byId("facebook"), context);
    const url = new URL(opened[0]);
    expect(url.searchParams.get("u")).toBe(context.url);
    expect(url.searchParams.get("quote")).toBeNull();
    expect(url.searchParams.get("text")).toBeNull();
  });

  it("every intent target opens exactly one composer and posts nothing", async () => {
    for (const target of SHARE_TARGETS.filter((t) => t.kind === "intent")) {
      opened.length = 0;
      const outcome = await runShare(target, context);
      expect(opened).toHaveLength(1);
      expect(outcome.ok).toBe(true);
      expect(outcome.method).toBe(target.id);
    }
  });
});

describe("runShare", () => {
  it("reports a clipboard failure rather than claiming success", async () => {
    vi.stubGlobal("navigator", { clipboard: { writeText: async () => { throw new Error("blocked"); } } });
    const outcome = await runShare(byId("copy"), context);
    expect(outcome.ok).toBe(false);
    expect(outcome.message).toContain("clipboard");
  });

  it("stays silent when the user cancels the native sheet", async () => {
    vi.stubGlobal("navigator", { share: async () => { throw new DOMException("cancelled", "AbortError"); } });
    const outcome = await runShare(byId("web-share"), context);
    expect(outcome.ok).toBe(false);
    expect(outcome.message).toBe("");
  });
});
