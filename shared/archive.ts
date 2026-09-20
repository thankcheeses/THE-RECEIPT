/**
 * The archive: finding what you wrote, and being handed it back at the moment
 * it means something.
 *
 * This is the layer the whole product compounds into. A receipt is worth
 * something the day you write it; it is worth much more the day it comes back
 * to you. Everything here is deliberately plain — text matching and date
 * arithmetic, no model, no embedding, no inference. The value is in the
 * returning, not in the cleverness of the retrieval, and a search that is
 * merely *usually* right is worse than useless against your own memory.
 */

/** Words too common to narrow anything down. Kept small on purpose. */
const STOP_WORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "been", "but", "by", "for", "from", "going",
  "had", "has", "have", "i", "if", "in", "is", "it", "its", "just", "me", "my", "of", "on", "or",
  "our", "that", "the", "their", "them", "then", "there", "they", "this", "to", "was", "we",
  "were", "will", "with", "would", "you", "your",
]);

/**
 * The content words of a piece of text, lower-cased and de-duplicated.
 *
 * Used for "you wrote something similar before". Short tokens and stop words
 * are dropped so two receipts are not called similar because they both say
 * "I think that the".
 */
export function contentTokens(text: string): string[] {
  const seen: Record<string, true> = Object.create(null);
  const tokens: string[] = [];
  // Split on anything that is not a letter, digit or apostrophe. Written as a
  // negated class rather than a Unicode property escape so it compiles under
  // the repository's existing TypeScript target.
  for (const word of text.toLowerCase().split(/[^0-9a-z\u00c0-\u024f\u0400-\u04ff']+/)) {
    if (word.length > 2 && !STOP_WORDS.has(word) && !seen[word]) {
      seen[word] = true;
      tokens.push(word);
    }
  }
  return tokens;
}

/**
 * How much two pieces of text have in common, 0 to 1 (Jaccard overlap of
 * content words).
 *
 * Chosen because it is explainable. The product only ever claims "you wrote
 * something similar" — a claim this measure can actually support — and never
 * that one receipt caused, predicted or explains another.
 */
export function similarity(a: string, b: string): number {
  const left = contentTokens(a);
  const right = contentTokens(b);
  if (!left.length || !right.length) return 0;
  const rightIndex: Record<string, true> = Object.create(null);
  for (const token of right) rightIndex[token] = true;
  let shared = 0;
  for (const token of left) if (rightIndex[token]) shared += 1;
  return shared / (left.length + right.length - shared);
}

/**
 * Below this, two receipts are not similar enough to be worth interrupting
 * somebody with. Tuned to be quiet rather than chatty: a false "you said this
 * before" is far more annoying than a missed one.
 */
export const SIMILARITY_THRESHOLD = 0.34;

/** Splits a search box into terms, honouring "quoted phrases". */
export function parseSearchQuery(raw: string): string[] {
  const terms: string[] = [];
  const pattern = /"([^"]+)"|(\S+)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(raw)) !== null) {
    const term = (match[1] ?? match[2] ?? "").trim();
    if (term.length >= 2) terms.push(term);
  }
  return terms.slice(0, 8);
}

/** Anniversaries worth surfacing, longest first so the oldest one wins. */
export const RESURFACE_YEARS = [5, 3, 2, 1] as const;

/**
 * Whether `then` falls on today's date in a previous year.
 *
 * Deliberately compares calendar day and month rather than a 365-day window:
 * "a year ago today" has to actually mean today, or the line is a lie. Feb 29
 * resurfaces on Mar 1 in common years, which is the conventional fallback.
 */
export function yearsAgoToday(then: Date, now: Date): number | null {
  const years = now.getFullYear() - then.getFullYear();
  if (!(RESURFACE_YEARS as readonly number[]).includes(years)) return null;
  if (then.getMonth() === now.getMonth() && then.getDate() === now.getDate()) return years;
  const isLeapDay = then.getMonth() === 1 && then.getDate() === 29;
  if (isLeapDay && now.getMonth() === 2 && now.getDate() === 1) return years;
  return null;
}

/**
 * At most one resurfacing per person per day.
 *
 * Handing somebody three memories at once turns the archive into a feed, and
 * a feed is exactly what this product is not. One is an event; three is noise.
 */
export const MAX_RESURFACED_PER_DAY = 1;
