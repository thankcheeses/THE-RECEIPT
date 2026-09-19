import { describe, expect, it } from "vitest";
import {
  INTERACTION_TYPES,
  LEGACY_SEMANTIC_TYPE,
  SEMANTIC_TYPES,
  SEMANTIC_TYPE_COPY,
  UNIVERSAL_ACTIONS,
  allowsInteraction,
  defaultSemanticTypeFor,
  interactionsFor,
  resolveSemanticType,
} from "./interactionPolicy";

describe("semantic types", () => {
  it("offers exactly the four author-selectable kinds", () => {
    expect([...SEMANTIC_TYPES]).toEqual(["PREDICTION", "GOAL", "PERSONAL", "FUN"]);
  });

  it("gives every type human-readable copy, never a database name", () => {
    for (const type of SEMANTIC_TYPES) {
      const copy = SEMANTIC_TYPE_COPY[type];
      expect(copy.label).not.toMatch(/[A-Z]{4,}/);
      expect(copy.blurb.length).toBeGreaterThan(20);
    }
  });
});

describe("interaction policy", () => {
  it("lets people agree or disagree with a contestable prediction", () => {
    expect([...interactionsFor("PREDICTION")]).toEqual(["AGREE", "DISAGREE"]);
  });

  it("does not let anyone disagree with a goal", () => {
    expect([...interactionsFor("GOAL")]).toEqual(["SUPPORT"]);
    expect(allowsInteraction("GOAL", "DISAGREE")).toBe(false);
    expect(allowsInteraction("GOAL", "AGREE")).toBe(false);
  });

  it("does not let anyone disagree with a personal prediction", () => {
    expect([...interactionsFor("PERSONAL")]).toEqual(["SUPPORT"]);
    expect(allowsInteraction("PERSONAL", "DISAGREE")).toBe(false);
  });

  it("gives fun receipts a single reaction and no vocabulary to argue about", () => {
    expect([...interactionsFor("FUN")]).toEqual(["REACT"]);
  });

  it("keeps SUPPORT and AGREE as distinct interactions", () => {
    expect(INTERACTION_TYPES).toContain("SUPPORT");
    expect(INTERACTION_TYPES).toContain("AGREE");
    expect(allowsInteraction("PREDICTION", "SUPPORT")).toBe(false);
    expect(allowsInteraction("GOAL", "SUPPORT")).toBe(true);
  });

  it("never treats ME TOO as a recorded interaction", () => {
    expect(INTERACTION_TYPES as readonly string[]).not.toContain("ME_TOO");
    expect(UNIVERSAL_ACTIONS).toContain("ME_TOO");
    for (const type of SEMANTIC_TYPES) {
      expect(interactionsFor(type) as readonly string[]).not.toContain("ME_TOO");
    }
  });

  it("offers at least one interaction for every type, so no receipt is inert", () => {
    for (const type of SEMANTIC_TYPES) expect(interactionsFor(type).length).toBeGreaterThan(0);
  });
});

describe("legacy receipts", () => {
  it("reads a receipt with no stored type as the kind the old form produced", () => {
    expect(resolveSemanticType(null)).toBe(LEGACY_SEMANTIC_TYPE);
    expect(resolveSemanticType(undefined)).toBe("PREDICTION");
  });

  it("ignores a value that is not a known type rather than trusting it", () => {
    expect(resolveSemanticType("WHATEVER")).toBe("PREDICTION");
  });

  it("returns a stored type unchanged", () => {
    for (const type of SEMANTIC_TYPES) expect(resolveSemanticType(type)).toBe(type);
  });
});

describe("category defaults", () => {
  it("only suggests, and suggests something sensible", () => {
    expect(defaultSemanticTypeFor("LIFE")).toBe("PERSONAL");
    expect(defaultSemanticTypeFor("ABSURD")).toBe("FUN");
    expect(defaultSemanticTypeFor("SPORTS")).toBe("PREDICTION");
    expect(defaultSemanticTypeFor("TECH")).toBe("PREDICTION");
  });

  it("falls back safely for a category it has never seen", () => {
    expect(defaultSemanticTypeFor("SOMETHING_NEW")).toBe("PREDICTION");
  });

  it("does not let a category determine the answer, only the starting point", () => {
    // The same category must be able to carry every type — that is the whole
    // reason the author chooses.
    for (const type of SEMANTIC_TYPES) {
      expect(allowsInteraction(type, interactionsFor(type)[0])).toBe(true);
    }
  });
});
