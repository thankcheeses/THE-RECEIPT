/**
 * What is left behind when someone deletes their account.
 *
 * The account goes. Public Receipts may stay, because other people agreed,
 * disagreed, supported and wrote their own Receipts after them — that record
 * is not the deleted person's alone to erase. What goes is every thread back
 * to them: the author reference is set to NULL, not re-pointed at a stand-in.
 *
 * NULL rather than a "deleted user" row on purpose. A shared stand-in account
 * is still an account: it has an id, it joins like a user, and code can treat
 * it as one by accident. A per-person tombstone would be worse still, because
 * `receipts.userId` is returned on every public payload — any surviving id
 * would let anyone group a deleted person's Receipts by filtering on it. The
 * identifier has to actually be gone.
 */

/** Shown wherever a Receipt has outlived the account that wrote it. */
export const DELETED_AUTHOR_LABEL = "Deleted account";

/** The same idea in the monospaced, upper-case voice of the receipt card. */
export const DELETED_AUTHOR_STAMP = "DELETED ACCOUNT";

/**
 * Whether this Receipt's author is gone.
 *
 * A null `userId` can only come from deletion — creation always writes one —
 * so the Receipt row carries the signal and no extra column is needed. Rows
 * loaded from an older client cache may not carry the field at all; those are
 * treated as having an author, which is what they had.
 */
export function isAuthorDeleted(receipt: { userId?: number | null }): boolean {
  return receipt.userId === null;
}

/**
 * How to name the person who wrote a Receipt.
 *
 * One function so the feed, the detail page, the social preview and the card
 * cannot drift into describing the same Receipt three different ways.
 */
export function authorLabel(
  receipt: { userId?: number | null },
  user: { username?: string | null; name?: string | null } | null | undefined,
  fallback = "Anonymous",
): string {
  if (isAuthorDeleted(receipt)) return DELETED_AUTHOR_LABEL;
  if (user?.username) return `@${user.username}`;
  return user?.name || fallback;
}

/**
 * Whether a Receipt can still be resolved by anybody.
 *
 * Only its author may resolve a Receipt, so one with no author never will be.
 * It is left PENDING rather than given a verdict nobody reached: inventing a
 * result would be the one thing the record exists to prevent.
 */
export function isUnresolvable(receipt: { userId?: number | null; status?: string | null }): boolean {
  return isAuthorDeleted(receipt) && ["PENDING", "LOCKED"].includes(receipt.status ?? "");
}

/**
 * Usernames are compared and retired in lower case.
 *
 * MySQL's default collation is case-insensitive, so `@Nia` and `@nia` already
 * collide in the users table. Normalising here means the retired list agrees
 * with that rather than depending on the column's collation staying put.
 */
export function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}

/**
 * One message for "taken" and "retired" alike.
 *
 * Saying which would disclose something about a stranger: that they exist, or
 * that they deleted their account. Neither is the asker's business.
 */
export const USERNAME_UNAVAILABLE = "That username is not available.";
