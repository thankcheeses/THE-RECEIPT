import { describe, expect, it } from "vitest";
import { CATEGORIES, DAILY_PROMPTS, formatReceiptNumber, getTodayPrompt } from "@shared/seed";

describe("receipt domain seed", () => {
  it("ships a sufficiently alive daily catalog across every product category", () => {
    expect(DAILY_PROMPTS.length).toBeGreaterThanOrEqual(50);
    for (const category of CATEGORIES) {
      expect(DAILY_PROMPTS.some((prompt) => prompt.category === category)).toBe(true);
    }
    expect(getTodayPrompt().prompt.length).toBeGreaterThan(20);
  });

  it("formats receipt identifiers as six-digit numbers", () => {
    expect(formatReceiptNumber(4821)).toBe("004821");
    expect(formatReceiptNumber("receipt-19")).toBe("000019");
  });
});
