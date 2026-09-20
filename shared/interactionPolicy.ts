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

export const SEMANTIC_TYPES = ["PREDICTION", "GOAL", "PERSONAL", "FUN", "MEMORY", "DREAM"] as const;
export type SemanticType = (typeof SEMANTIC_TYPES)[number];

/**
 * The types a person can pick when writing an ordinary Receipt.
 *
 * DREAM is absent on purpose: it is not written, it is captured, and it has
 * its own entry point. Offering it in the compose form would produce dreams
 * that were typed out hours later, which is the opposite of what it is for.
 */
export const COMPOSABLE_TYPES = ["PREDICTION", "GOAL", "PERSONAL", "FUN", "MEMORY"] as const;

/** The words shown to people. Database names never reach the UI. */
export const SEMANTIC_TYPE_COPY: Record<SemanticType, { label: string; blurb: string }> = {
  PREDICTION: { label: "Prediction", blurb: "I'm making a claim about what will happen." },
  GOAL: { label: "Goal", blurb: "I'm putting a personal goal on the record." },
  PERSONAL: { label: "Personal", blurb: "I'm predicting something about my own life." },
  FUN: { label: "Fun", blurb: "This is ridiculous, funny, weird, or just for fun." },
  MEMORY: { label: "Memory", blurb: "Something just happened. I don't know yet what it will mean." },
  DREAM: { label: "Dream", blurb: "I just woke up and I want it down before it goes." },
};

/** Interactions that are recorded against a Receipt, one per person. */
/**
 * REACT is retired: no type offers it any more, so nothing new is recorded
 * under it. It stays here, and in the database enum, because the rows already
 * written under it are responses real people made and are still displayed.
 * Deleting the name would orphan them.
 */
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
  // A silly claim is still a claim: "my cat knocks over exactly three glasses
  // this week" is answered by reality like anything else, so FUN takes the
  // same responses a prediction does.
  //
  // It used to offer a single unnamed REACT. That was a like wearing a
  // different name — the one thing this product has consistently refused to
  // build — and the alternative on the table, a named reaction vocabulary, is
  // the same thing with more buttons. So the reaction is retired rather than
  // expanded. REACT stays in the vocabulary below and in the database because
  // rows recorded under it are real responses people made and are still
  // counted; nothing new is written under it.
  FUN: ["AGREE", "DISAGREE"],
  // A memory is not a claim, so there is nothing to agree or disagree with,
  // and "support" would be answering a question nobody asked. ME TOO still
  // works: writing your own memory after someone else's is authorship.
  MEMORY: [],
  // Structurally interaction-free. Not "we did not build the buttons" — the
  // server refuses every interaction against a dream, so no surface can add
  // one later by accident.
  DREAM: [],
};

/**
 * Types whose Receipts are answered by reality, and so can be resolved
 * RIGHT / WRONG / PARTIALLY RIGHT / TOO EARLY.
 *
 * MEMORY and DREAM are not in this list and that is the whole point. A memory
 * is not right or wrong, and neither is a dream. The existing resolution
 * vocabulary cannot describe what either of them came to mean, so they are not
 * forced through it — they are locked, kept, and resurfaced instead. See
 * `isResolvableType` below for the single check every resolution path uses.
 *
 * On MEMORY having no terminal state at all: that was looked at deliberately
 * and left alone. RIGHT / WRONG / PARTIALLY RIGHT / TOO EARLY is the whole
 * vocabulary this product has, and exactly one of the four (TOO EARLY) could
 * honestly be applied to a memory. Inventing a fifth — REMEMBERED, MEANT
 * SOMETHING, CHANGED — would be adding a word nobody has defined in order to
 * fill a column, and the archive already does the job a terminal state would
 * be reaching for: a memory comes back on its anniversary, which is what
 * "what will this mean later" actually cashes out to. If a real vocabulary
 * for this ever exists, it arrives as a product decision, not as a default.
 */
const RESOLVABLE_TYPES: readonly SemanticType[] = ["PREDICTION", "GOAL", "PERSONAL", "FUN"];

/** Whether reality ever answers a Receipt of this type. */
export function isResolvableType(value: string | null | undefined): boolean {
  return RESOLVABLE_TYPES.includes(resolveSemanticType(value));
}

/**
 * Types that may never be made public, whatever the author picks.
 *
 * A dream is the most involuntary thing a person will ever put in this app.
 * It is private at rest, and the server clamps it rather than trusting a
 * visibility field that arrived over the wire.
 */
const PRIVATE_ONLY_TYPES: readonly SemanticType[] = ["DREAM"];

export function isPrivateOnlyType(value: string | null | undefined): boolean {
  return PRIVATE_ONLY_TYPES.includes(resolveSemanticType(value));
}

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
