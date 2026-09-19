import { describe, expect, it } from "vitest";
import { CARD_FORMATS, DEFAULT_CARD_FORMAT, cardLayout, isCardFormat, resolveCardFormat } from "./cardFormats";

describe("card formats", () => {
  it("offers a wide link card, a 9:16 story and a square", () => {
    expect(CARD_FORMATS.og).toMatchObject({ width: 1200, height: 630 });
    expect(CARD_FORMATS.story.height / CARD_FORMATS.story.width).toBeCloseTo(16 / 9, 2);
    expect(CARD_FORMATS.square.width).toBe(CARD_FORMATS.square.height);
  });

  it("defaults to the link card, which is what og:image declares", () => {
    expect(DEFAULT_CARD_FORMAT).toBe("og");
  });
});

describe("resolveCardFormat", () => {
  it("accepts every known format", () => {
    for (const format of Object.keys(CARD_FORMATS)) expect(resolveCardFormat(format)).toBe(format);
  });

  it("rejects anything else rather than trusting it", () => {
    for (const value of ["", "STORY", "portrait", null, undefined, 3, {}]) {
      expect(isCardFormat(value)).toBe(false);
      expect(resolveCardFormat(value)).toBe("og");
    }
  });
});

describe("cardLayout", () => {
  it("keeps the receipt inside the canvas at every format", () => {
    for (const format of Object.keys(CARD_FORMATS) as Array<keyof typeof CARD_FORMATS>) {
      const layout = cardLayout(format);
      expect(layout.paperWidth).toBeLessThan(layout.width);
      expect(layout.paperWidth).toBeGreaterThan(layout.width * 0.6);
    }
  });

  it("gives the tall formats a larger content scale, so the card is not adrift", () => {
    expect(cardLayout("story").scale).toBeGreaterThan(cardLayout("story").edgeScale);
    expect(cardLayout("square").scale).toBeGreaterThan(cardLayout("square").edgeScale);
  });

  it("leaves the link card unscaled, since it was tuned at that size", () => {
    const og = cardLayout("og");
    expect(og.scale).toBeCloseTo(og.edgeScale, 6);
    expect(og.paperWidth).toBe(876);
  });

  it("only brands the formats with room for it", () => {
    expect(cardLayout("og").showBranding).toBe(false);
    expect(cardLayout("story").showBranding).toBe(true);
    expect(cardLayout("square").showBranding).toBe(true);
  });
});
