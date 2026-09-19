import { beforeEach, describe, expect, it, vi } from "vitest";
import { SHARE_TARGETS } from "./adapters";
import { availableTargets, runShare, type ShareContext } from "./core";

const context: ShareContext = {
  url: "https://receipts.example/r/4821",
  title: "Receipt #004821 — THE RECEIPT",
  text: `I was 65% sure: “This tiny app will become the group chat's new obsession.”`,
  imageUrl: "https://receipts.example/r/4821/image.png",
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

  it("hides the image download when no card exists, as on the static demo", () => {
    expect(availableTargets(SHARE_TARGETS, { ...context, imageUrl: null }).some((t) => t.id === "save-image")).toBe(false);
    expect(availableTargets(SHARE_TARGETS, context).some((t) => t.id === "save-image")).toBe(true);
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
