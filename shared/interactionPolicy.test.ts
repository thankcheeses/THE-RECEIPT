import { describe, expect, it } from "vitest";
import {
  COMPOSABLE_TYPES,
  INTERACTION_TYPES,
  LEGACY_SEMANTIC_TYPE,
  SEMANTIC_TYPES,
  SEMANTIC_TYPE_COPY,
  UNIVERSAL_ACTIONS,
  allowsInteraction,
  defaultSemanticTypeFor,
  interactionsFor,
  isPrivateOnlyType,
  isResolvableType,
  resolveSemanticType,
} from "./interactionPolicy";

describe("semantic types", () => {
  it("knows six kinds of receipt", () => {
    expect([...SEMANTIC_TYPES]).toEqual(["PREDICTION", "GOAL", "PERSONAL", "FUN", "MEMORY", "DREAM"]);
  });

  it("offers five of them in the compose form, never DREAM", () => {
    // A dream is captured on waking, through its own entrance. Offering it as
    // a dropdown option would produce dreams typed out hours later, which is
    // the opposite of what the type is for.
    expect([...COMPOSABLE_TYPES]).toEqual(["PREDICTION", "GOAL", "PERSONAL", "FUN", "MEMORY"]);
    expect(COMPOSABLE_TYPES as readonly string[]).not.toContain("DREAM");
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

  it("treats a silly claim as a claim", () => {
    // FUN used to offer one unnamed REACT. That was a like wearing a different
    // name, and the alternative on the table — a named reaction vocabulary —
    // is the same thing with more buttons. "My cat knocks over exactly three
    // glasses this week" is answered by reality like anything else, so it
    // takes the responses a prediction takes.
    expect([...interactionsFor("FUN")]).toEqual(["AGREE", "DISAGREE"]);
  });

  it("offers REACT on nothing any more, while keeping the name for old rows", () => {
    // Nothing new is recorded under it. The name stays in the vocabulary and
    // in the database because the rows already written under it are responses
    // real people made, and they are still counted and displayed.
    for (const type of SEMANTIC_TYPES) expect(interactionsFor(type)).not.toContain("REACT");
    expect(INTERACTION_TYPES).toContain("REACT");
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

  it("offers at least one interaction for every type reality answers", () => {
    // A claim about the world is something other people can respond to, and
    // every one of those types must offer a way to do it.
    for (const type of SEMANTIC_TYPES.filter(isResolvableType)) {
      expect(interactionsFor(type).length).toBeGreaterThan(0);
    }
  });

  it("offers none at all on a memory or a dream", () => {
    // Not an omission. There is nothing to agree or disagree with in either,
    // and the server refuses every interaction against them, so no surface can
    // quietly add one later.
    expect(interactionsFor("MEMORY")).toEqual([]);
    expect(interactionsFor("DREAM")).toEqual([]);
    for (const interaction of ["AGREE", "DISAGREE", "SUPPORT", "REACT"]) {
      expect(allowsInteraction("MEMORY", interaction)).toBe(false);
      expect(allowsInteraction("DREAM", interaction)).toBe(false);
    }
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
    for (const type of SEMANTIC_TYPES.filter(isResolvableType)) {
      expect(allowsInteraction(type, interactionsFor(type)[0])).toBe(true);
    }
  });
});
