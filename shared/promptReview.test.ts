/**
 * The daily prompt screen.
 *
 * A prompt goes to everybody on the same day, which is what makes a bad one
 * expensive. These tests are mostly about the subjects the prompt does not go
 * near — and about the screen not pretending to be the approval, which is a
 * person's and is recorded against their account.
 */
import { describe, expect, it } from "vitest";
import { DAILY_PROMPTS } from "./seed";
import {
  PROMPT_STANDARD,
  PROMPT_WINDOW_DAYS,
  isBlocked,
  screenPrompt,
} from "./promptReview";

const codes = (prompt: string, resolutionDays?: number) =>
  screenPrompt({ prompt, resolutionDays }).map((flag) => flag.code);

describe("subjects a daily prompt does not go near", () => {
  it("blocks health and bodies", () => {
    expect(codes("Will your friend's diagnosis come back clear this week?")).toContain("HEALTH");
    expect(codes("Will you lose weight before the end of the month?")).toContain("HEALTH");
  });

  it("blocks death", () => {
    expect(codes("Will a famous person die this week?")).toContain("DEATH");
  });

  it("blocks self-harm in any framing", () => {
    expect(codes("Will anyone you know self-harm this week?")).toContain("SELF_HARM");
  });

  it("blocks pregnancy and fertility", () => {
    expect(codes("Will someone in your family announce they are pregnant?")).toContain("PREGNANCY");
  });

  it("blocks prompts that push a financial decision", () => {
    expect(codes("Should you buy the dip before the weekend?")).toContain("FINANCIAL_DECISION");
    expect(codes("Will your savings be worth more by Friday?")).toContain("FINANCIAL_DECISION");
  });

  it("blocks watching another person", () => {
    expect(codes("Will you check their phone this week?")).toContain("SURVEILLANCE");
    expect(codes("Will you track them to see where they went?")).toContain("SURVEILLANCE");
  });

  it("blocks judging somebody's honesty or feelings", () => {
    expect(codes("Is he lying about where he was on Saturday?")).toContain("JUDGING_A_PERSON");
    expect(codes("Does she really love you, or is it convenience?")).toContain("JUDGING_A_PERSON");
  });

  it("marks every one of those as a blocker, not a note", () => {
    for (const prompt of [
      "Will a famous person die this week?",
      "Will someone in your family announce they are pregnant?",
      "Is he lying about where he was on Saturday?",
    ]) {
      expect(isBlocked(screenPrompt({ prompt }))).toBe(true);
    }
  });

  it("leaves an ordinary prompt alone", () => {
    const flags = screenPrompt({
      prompt: "Will a brand launch something this week the internet calls pointless?",
      resolutionDays: 7,
    });
    expect(isBlocked(flags)).toBe(false);
  });
});

describe("house style", () => {
  it("notes a prompt that asks the answerer to go and do something", () => {
    // The daily prompt is answered by noticing, not by acting.
    expect(codes("Will you call your sister this week?", 7)).toContain("NOT_PASSIVE");
  });

  it("notes a compound prompt that could not be resolved cleanly", () => {
    expect(codes("Will it rain on Saturday and will the match be called off?", 7)).toContain("TWO_EVENTS");
  });

  it("notes a prompt with no way to tell whether it happened", () => {
    expect(codes("Will this week generally feel like a good one?", 7)).toContain("UNRESOLVABLE");
  });

  it("notes a resolution window longer than the loop is meant to be", () => {
    expect(codes("Will a film released this month pass half a billion?", 45)).toContain("OUTSIDE_WINDOW");
    expect(codes("Will a film released this week top the box office?", 7)).not.toContain("OUTSIDE_WINDOW");
  });

  it("notes a prompt that is not a question", () => {
    expect(codes("Something interesting will happen this week.", 7)).toContain("NOT_A_QUESTION");
  });

  it("notes one too short to be specific", () => {
    expect(codes("Will it rain?", 3)).toContain("TOO_SHORT");
  });

  it("keeps style notes as notes, so a reviewer can still approve them", () => {
    const flags = screenPrompt({ prompt: "Will you call your sister this week?", resolutionDays: 7 });
    expect(isBlocked(flags)).toBe(false);
    expect(flags.every((flag) => flag.severity === "REVIEW")).toBe(true);
  });

  it("lists blockers before notes, so the reviewer reads the veto first", () => {
    const flags = screenPrompt({ prompt: "Will you check their phone and will he be lying?", resolutionDays: 40 });
    expect(flags[0].severity).toBe("BLOCK");
  });
});

describe("what the screen is not", () => {
  it("approves nothing — a clean pass is an empty list, not a verdict", () => {
    // The approval is a person's, recorded with their account id against the
    // row. Nothing in this module can stand in for that.
    expect(screenPrompt({ prompt: "Will a streaming service announce a reboot this week?", resolutionDays: 7 }))
      .toEqual([]);
  });

  it("states the standard a reviewer is applying, in their own words", () => {
    expect(PROMPT_STANDARD.length).toBeGreaterThanOrEqual(5);
    for (const line of PROMPT_STANDARD) expect(line.length).toBeGreaterThan(10);
  });

  it("gives every flag a note a person can act on", () => {
    const flags = screenPrompt({ prompt: "Will a famous person die this week?" });
    for (const flag of flags) expect(flag.note.length).toBeGreaterThan(20);
  });
});

describe("the prompts already in the repository", () => {
  it("trip no blocker", () => {
    // If one ever does, that prompt is the bug — not this test.
    for (const item of DAILY_PROMPTS) {
      const flags = screenPrompt({ prompt: item.prompt });
      expect({ prompt: item.prompt, blocked: isBlocked(flags) }).toEqual({ prompt: item.prompt, blocked: false });
    }
  });

  it("are all phrased as questions", () => {
    // One of them ends on a quoted phrase — ‘who asked for this?’ — which is
    // still a question, and the screen has to agree.
    for (const item of DAILY_PROMPTS) {
      expect({ prompt: item.prompt, flags: codes(item.prompt) }).toEqual({
        prompt: item.prompt,
        flags: expect.not.arrayContaining(["NOT_A_QUESTION"]),
      });
    }
  });
});

describe("the window", () => {
  it("is about a week, so the loop is felt rather than forgotten", () => {
    expect(PROMPT_WINDOW_DAYS.max).toBeLessThanOrEqual(7);
    expect(PROMPT_WINDOW_DAYS.min).toBeGreaterThanOrEqual(1);
  });
});
