/**
 * Sample receipts for the GitHub Pages demo.
 *
 * A first-time visitor to the static demo has an empty localStorage, so the
 * public feed would show nothing at all. These receipts fill it with a few
 * made-up entries. They are written by a sample author that is not a person,
 * and the UI labels them as sample data wherever they appear.
 *
 * Only the static demo uses this file. The server build never seeds anything.
 */
import { defaultSemanticTypeFor } from "@shared/interactionPolicy";
import type { Category, ReceiptStatus } from "@shared/seed";
import type { SemanticType } from "@shared/interactionPolicy";

/** The author id every sample receipt carries. No real account uses it. */
export const SAMPLE_AUTHOR_ID = 900_000;

/** Shaped like toPublicUser() in server/db.ts. */
export const SAMPLE_AUTHOR = {
  id: SAMPLE_AUTHOR_ID,
  username: null,
  name: "Sample data (fictional)",
  avatar: null,
  currentStreak: 0,
  longestStreak: 0,
  accuracy: 0,
  createdAt: new Date(0),
};

/**
 * Sample ids sit below the first id the demo hands out (4822), so a receipt
 * the visitor writes can never collide with one of these.
 */
export const FIRST_VISITOR_RECEIPT_ID = 4822;

export type SampleReceipt = {
  id: number;
  userId: number | null;
  prediction: string;
  category: string;
  confidence: number;
  createdAt: Date;
  resolutionDate: Date | null;
  status: ReceiptStatus;
  result: string | null;
  visibility: "PUBLIC" | "PRIVATE";
  challengeUserId: number | null;
  dailyChallengeId: number | null;
  resolvedAt: Date | null;
  semanticType: SemanticType | null;
  title: string | null;
  derivedFromId: number | null;
  moderationStatus: "VISIBLE";
};

const DAY_MS = 86_400_000;

type Sample = {
  id: number;
  prediction: string;
  category: Category;
  confidence: number;
  status: ReceiptStatus;
  result?: string;
  /** Days relative to `now`. Negative is the past. */
  createdDays: number;
  resolvesDays: number;
  resolvedDays?: number;
};

const SAMPLES: Sample[] = [
  { id: 4801, prediction: "I will not buy another notebook this month.", category: "ABSURD", confidence: 95, status: "WRONG", result: "Bought two.", createdDays: -40, resolvesDays: -10, resolvedDays: -9 },
  { id: 4802, prediction: "The office kickball team wins at least half its games this season.", category: "SPORTS", confidence: 55, status: "RIGHT", createdDays: -60, resolvesDays: -5, resolvedDays: -4 },
  { id: 4803, prediction: "The balcony tomato plant gives at least ten tomatoes.", category: "SCIENCE", confidence: 50, status: "PARTIALLY RIGHT", result: "Seven tomatoes.", createdDays: -50, resolvesDays: -7, resolvedDays: -6 },
  { id: 4804, prediction: "I finish the book on my nightstand before the library wants it back.", category: "LIFE", confidence: 60, status: "PENDING", createdDays: -6, resolvesDays: 9 },
  { id: 4805, prediction: "The group chat gives me a new nickname within a week.", category: "INTERNET", confidence: 70, status: "PENDING", createdDays: -2, resolvesDays: 5 },
  { id: 4806, prediction: "I set up the new laptop without calling anyone for help.", category: "TECH", confidence: 40, status: "PENDING", createdDays: -1, resolvesDays: 20 },
];

/** Builds the sample receipts with dates relative to `now`. */
export function buildSampleReceipts(now: Date = new Date()): SampleReceipt[] {
  const at = (days: number) => new Date(now.getTime() + days * DAY_MS);
  return SAMPLES.map((sample) => ({
    id: sample.id,
    userId: SAMPLE_AUTHOR_ID,
    prediction: sample.prediction,
    category: sample.category,
    confidence: sample.confidence,
    createdAt: at(sample.createdDays),
    resolutionDate: at(sample.resolvesDays),
    status: sample.status,
    result: sample.result ?? null,
    visibility: "PUBLIC",
    challengeUserId: null,
    dailyChallengeId: null,
    resolvedAt: sample.resolvedDays === undefined ? null : at(sample.resolvedDays),
    semanticType: defaultSemanticTypeFor(sample.category),
    title: null,
    derivedFromId: null,
    moderationStatus: "VISIBLE",
  }));
}

/** Whether a receipt is one of the samples above. */
export function isSampleAuthor(receipt: { userId?: number | null }): boolean {
  return receipt.userId === SAMPLE_AUTHOR_ID;
}
