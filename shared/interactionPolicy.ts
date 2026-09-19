/**
 * What people can do with a Receipt depends on what kind of Receipt it is.
 *
 * You can disagree with a claim about the world. You cannot meaningfully
 * disagree with someone's goal — the useful response there is support. So the
 * available interactions are driven by a semantic type the author chooses when
 * they write the Receipt, not by its category and not by reading its text.
 *
 * Category and semantic type are independent: one category holds several types.
 * "I predict Mom is making spaghetti tonight" and "I predict I'll buy my first
 * house in 2027" can both be LIFE, and they are not the same kind of statement.
 *
 * This policy is shared by the client (which buttons to render) and the server
 * (which interactions to accept), so the two can never drift apart. The server
 * is authoritative.
 */
import type { Category } from "./seed";

export const SEMANTIC_TYPES = ["PREDICTION", "GOAL", "PERSONAL", "FUN"] as const;
export type SemanticType = (typeof SEMANTIC_TYPES)[number];

/** The words shown to people. Database names never reach the UI. */
export const SEMANTIC_TYPE_COPY: Record<SemanticType, { label: string; blurb: string }> = {
  PREDICTION: { label: "Prediction", blurb: "I'm making a claim about what will happen." },
  GOAL: { label: "Goal", blurb: "I'm putting a personal goal on the record." },
  PERSONAL: { label: "Personal", blurb: "I'm predicting something about my own life." },
  FUN: { label: "Fun", blurb: "This is ridiculous, funny, weird, or just for fun." },
};

/** Interactions that are recorded against a Receipt, one per person. */
export const INTERACTION_TYPES = ["AGREE", "DISAGREE", "SUPPORT", "REACT"] as const;
export type InteractionType = (typeof INTERACTION_TYPES)[number];

export const INTERACTION_COPY: Record<InteractionType, { label: string; plural: string }> = {
  AGREE: { label: "I agree", plural: "agree" },
  DISAGREE: { label: "I disagree", plural: "disagree" },
  SUPPORT: { label: "Support", plural: "support this" },
  REACT: { label: "React", plural: "reacted" },
};

/**
 * SUPPORT and AGREE are deliberately distinct and stored distinctly. "147
 * people support this goal" and "147 people agree this will happen" are
 * different facts, and collapsing them into one count destroys the difference
 * permanently.
 */
const POLICY: Record<SemanticType, readonly InteractionType[]> = {
  PREDICTION: ["AGREE", "DISAGREE"],
  GOAL: ["SUPPORT"],
  PERSONAL: ["SUPPORT"],
  // Kept to a single unnamed reaction on purpose. A reaction vocabulary is its
  // own design problem and is not being decided here.
  FUN: ["REACT"],
};

/**
 * Receipts written before semantic types existed have none stored. Every one of
 * them was created by a form that offered only one kind of statement, so they
 * are read as PREDICTION at render time. Nothing is written back: the column
 * stays null rather than recording a classification the author never made.
 */
export const LEGACY_SEMANTIC_TYPE: SemanticType = "PREDICTION";

export function resolveSemanticType(value: string | null | undefined): SemanticType {
  return (SEMANTIC_TYPES as readonly string[]).includes(value ?? "")
    ? (value as SemanticType)
    : LEGACY_SEMANTIC_TYPE;
}

/** The recorded interactions offered for a Receipt of this type. */
export function interactionsFor(value: string | null | undefined): readonly InteractionType[] {
  return POLICY[resolveSemanticType(value)];
}

/** Whether an interaction may be recorded against a Receipt of this type. */
export function allowsInteraction(value: string | null | undefined, interaction: string): boolean {
  return (interactionsFor(value) as readonly string[]).includes(interaction);
}

/**
 * A starting point only. Categories hint at a type; the author decides, and
 * their choice is what gets stored.
 */
const CATEGORY_DEFAULTS: Partial<Record<Category, SemanticType>> = {
  LIFE: "PERSONAL",
  ABSURD: "FUN",
};

export function defaultSemanticTypeFor(category: string): SemanticType {
  return CATEGORY_DEFAULTS[category as Category] ?? "PREDICTION";
}

/**
 * ME TOO and SHARE are available on every Receipt and are not interactions.
 * ME TOO authors a new Receipt; SHARE leaves the app. Neither is a counter.
 */
export const UNIVERSAL_ACTIONS = ["ME_TOO", "SHARE"] as const;
