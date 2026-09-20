/**
 * Dream capture's two fiddly pure parts: turning a run of speech into a title,
 * and folding recognition events into a transcript without losing words.
 *
 * Both are tested here rather than in the browser because the thing they
 * operate on evaporates in about ninety seconds, and a bug that drops the
 * first clause is a bug that loses the dream.
 */
import { describe, expect, it } from "vitest";
import {
  DREAM_MAX_LENGTH,
  DREAM_MIN_LENGTH,
  DREAM_TITLE_MAX_LENGTH,
  applySpeechResult,
  dreamTitleFrom,
} from "./dream";

describe("titling a dream", () => {
  it("takes the first sentence", () => {
    expect(dreamTitleFrom("I was in a house I didn't recognise. Then the floor gave way."))
      .toBe("I was in a house I didn't recognise");
  });

  it("cuts at the first 'then', which is how people actually narrate", () => {
    // Speech-to-text returns one unpunctuated run far more often than not.
    expect(dreamTitleFrom("i was driving my mum's car then it turned into a boat"))
      .toBe("I was driving my mum's car");
  });

  it("capitalises the first letter, since speech arrives lower-case", () => {
    expect(dreamTitleFrom("my teeth were falling out again")[0]).toBe("M");
  });

  it("falls back to a word boundary when there is no break at all", () => {
    const title = dreamTitleFrom("word ".repeat(60));
    expect(title.length).toBeLessThanOrEqual(DREAM_TITLE_MAX_LENGTH + 1);
    expect(title).toMatch(/…$/);
    expect(title).not.toMatch(/wor…$/);
  });

  it("never returns an empty title", () => {
    expect(dreamTitleFrom("")).toBe("Untitled dream");
    expect(dreamTitleFrom("   \n  ")).toBe("Untitled dream");
  });

  it("collapses the whitespace speech recognition leaves behind", () => {
    expect(dreamTitleFrom("i   was    somewhere   else")).toBe("I was somewhere else");
  });

  it("describes, never interprets", () => {
    // The title is the dreamer's own words handed back. Nothing here
    // summarises, categorises or explains — the app has no opinion about what
    // a dream meant and must never appear to — so whatever comes out is
    // always a literal prefix of what went in.
    for (const transcript of [
      "i dreamt my grandmother was alive and we were arguing about the garden",
      "my teeth were falling out again. it was the third time this month",
      "i was late for an exam i had not studied for then the room flooded",
    ]) {
      const title = dreamTitleFrom(transcript).replace(/…$/, "");
      expect(transcript.startsWith(title.toLowerCase())).toBe(true);
    }
  });
});

describe("limits", () => {
  it("allows a rambling 4am retelling but not an essay", () => {
    expect(DREAM_MAX_LENGTH).toBeGreaterThan(1000);
    expect(DREAM_MIN_LENGTH).toBeGreaterThan(0);
  });
});

/** Shapes a browser SpeechRecognition event closely enough to fold. */
const event = (resultIndex: number, results: Array<[string, boolean]>) => ({
  resultIndex,
  results: results.map(([transcript, isFinal]) => Object.assign([{ transcript }], { isFinal })),
});

describe("folding speech into a transcript", () => {
  it("appends a final result", () => {
    const next = applySpeechResult("", event(0, [["i was in a house", true]]));
    expect(next).toEqual({ committed: "i was in a house", interim: "" });
  });

  it("keeps interim words separate so they can be replaced", () => {
    const next = applySpeechResult(
      "i was in a house",
      event(1, [["i was in a house", true], ["that i didn't", false]]),
    );
    expect(next.committed).toBe("i was in a house");
    expect(next.interim).toBe("that i didn't");
  });

  it("replaces the interim rather than appending it twice", () => {
    // The recogniser re-sends a growing guess on every event. Appending each
    // one would triple the transcript.
    let state = applySpeechResult("", event(0, [["i was", false]]));
    state = applySpeechResult(state.committed, event(0, [["i was in", false]]));
    state = applySpeechResult(state.committed, event(0, [["i was in a house", false]]));
    expect(state.committed).toBe("");
    expect(state.interim).toBe("i was in a house");
  });

  it("promotes the interim once the recogniser commits it", () => {
    let state = applySpeechResult("", event(0, [["i was in a house", false]]));
    state = applySpeechResult(state.committed, event(0, [["i was in a house", true]]));
    expect(state).toEqual({ committed: "i was in a house", interim: "" });
  });

  it("keeps everything across a long dictation", () => {
    const clauses = ["i was in a house", "the floor gave way", "then i was outside"];
    let committed = "";
    const delivered: Array<[string, boolean]> = [];
    clauses.forEach((clause, index) => {
      delivered.push([clause, true]);
      committed = applySpeechResult(committed, event(index, [...delivered])).committed;
    });
    expect(committed).toBe("i was in a house the floor gave way then i was outside");
  });

  it("handles several results arriving in one event", () => {
    const next = applySpeechResult("", event(0, [["first part", true], ["second part", false]]));
    expect(next.committed).toBe("first part");
    expect(next.interim).toBe("second part");
  });

  it("survives an event with nothing in it", () => {
    expect(applySpeechResult("kept so far", event(0, []))).toEqual({ committed: "kept so far", interim: "" });
  });
});
