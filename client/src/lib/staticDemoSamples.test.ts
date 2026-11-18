import { describe, expect, it } from "vitest";
import { CATEGORIES } from "@shared/seed";
import { isResolvableType } from "@shared/interactionPolicy";
import { isPubliclyVisible } from "@shared/moderation";
import { FIRST_VISITOR_RECEIPT_ID, SAMPLE_AUTHOR, SAMPLE_AUTHOR_ID, buildSampleReceipts, isSampleAuthor } from "./staticDemoSamples";

const now = new Date("2026-06-01T12:00:00Z");
const samples = buildSampleReceipts(now);

describe("static demo sample receipts", () => {
  it("are public, visible and written by the sample author", () => {
    expect(samples.length).toBeGreaterThan(0);
    for (const receipt of samples) {
      expect(isPubliclyVisible(receipt)).toBe(true);
      expect(receipt.userId).toBe(SAMPLE_AUTHOR_ID);
      expect(isSampleAuthor(receipt)).toBe(true);
    }
  });

  it("use unique ids below the first id a visitor's receipt gets", () => {
    const ids = samples.map((receipt) => receipt.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toBeLessThan(FIRST_VISITOR_RECEIPT_ID);
  });

  it("pass the same checks receipts.create applies", () => {
    for (const receipt of samples) {
      expect(CATEGORIES).toContain(receipt.category);
      expect(receipt.prediction.length).toBeGreaterThanOrEqual(8);
      expect(receipt.prediction.length).toBeLessThanOrEqual(280);
      expect(isResolvableType(receipt.semanticType)).toBe(true);
      expect(receipt.resolutionDate).not.toBeNull();
      expect(receipt.createdAt.getTime()).toBeLessThan(now.getTime());
    }
  });

  it("are open until their date, and resolved only after it", () => {
    const open = samples.filter((receipt) => receipt.status === "PENDING" || receipt.status === "LOCKED");
    const resolved = samples.filter((receipt) => !open.includes(receipt));
    expect(open.length).toBeGreaterThan(0);
    expect(resolved.length).toBeGreaterThan(0);
    for (const receipt of open) {
      expect(receipt.resolvedAt).toBeNull();
      expect(receipt.resolutionDate!.getTime()).toBeGreaterThan(now.getTime());
    }
    for (const receipt of resolved) {
      expect(receipt.resolvedAt).not.toBeNull();
      expect(receipt.resolvedAt!.getTime()).toBeGreaterThanOrEqual(receipt.resolutionDate!.getTime());
      expect(receipt.resolvedAt!.getTime()).toBeLessThanOrEqual(now.getTime());
    }
  });

  it("are labelled as sample data and never attributed to a real account", () => {
    expect(SAMPLE_AUTHOR.name).toMatch(/sample/i);
    // No username, so no surface can link to a profile that does not exist.
    expect(SAMPLE_AUTHOR.username).toBeNull();
    expect(isSampleAuthor({ userId: 1 })).toBe(false);
    expect(isSampleAuthor({ userId: null })).toBe(false);
  });
});
