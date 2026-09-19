/**
 * Moderation vocabulary, shared by the client and the server.
 *
 * A Receipt cannot be edited or deleted by its author — that immutability is
 * the product. Moderation therefore never rewrites or removes a Receipt: it
 * changes whether the Receipt is *shown* on public surfaces, and records who
 * decided that and why. The statement survives; its distribution does not.
 *
 * Reporting and resolution are separate concerns. Hiding a Receipt does not
 * resolve it, and resolving one does not un-hide it.
 */

/** Whether a Receipt appears on public surfaces. Never a delete. */
export const MODERATION_STATUSES = ["VISIBLE", "HIDDEN"] as const;
export type ModerationStatus = (typeof MODERATION_STATUSES)[number];

export const DEFAULT_MODERATION_STATUS: ModerationStatus = "VISIBLE";

/**
 * Receipts written before moderation existed have no stored status. They were
 * never reviewed, and treating an absent value as VISIBLE is what keeps the
 * existing public record intact.
 */
export function resolveModerationStatus(value: string | null | undefined): ModerationStatus {
  return (MODERATION_STATUSES as readonly string[]).includes(value ?? "")
    ? (value as ModerationStatus)
    : DEFAULT_MODERATION_STATUS;
}

/** Whether a Receipt row may be shown to the public. */
export function isPubliclyVisible(receipt: {
  visibility?: string | null;
  moderationStatus?: string | null;
}): boolean {
  return receipt.visibility === "PUBLIC" && resolveModerationStatus(receipt.moderationStatus) === "VISIBLE";
}

/**
 * Why someone is reporting a Receipt.
 *
 * A closed list, for the same reason the analytics events are closed: an open
 * text field cannot be counted, triaged, or reasoned about later. `OTHER`
 * exists so a real problem that does not fit is still reportable, and it is
 * the one reason where the free-text detail carries the meaning.
 */
export const REPORT_REASONS = [
  "HARASSMENT",
  "HATE",
  "VIOLENCE",
  "SEXUAL",
  "SELF_HARM",
  "PRIVACY",
  "IMPERSONATION",
  "SPAM",
  "ILLEGAL",
  "OTHER",
] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

export const REPORT_REASON_COPY: Record<ReportReason, { label: string; blurb: string }> = {
  HARASSMENT: { label: "Harassment", blurb: "Targets or bullies a specific person." },
  HATE: { label: "Hate", blurb: "Attacks people over who they are." },
  VIOLENCE: { label: "Violence or threats", blurb: "Threatens harm, or wishes it on someone." },
  SEXUAL: { label: "Sexual content", blurb: "Sexually explicit, or sexualises a minor." },
  SELF_HARM: { label: "Self-harm", blurb: "Encourages suicide, self-injury, or an eating disorder." },
  PRIVACY: { label: "Private information", blurb: "Exposes someone's personal details without consent." },
  IMPERSONATION: { label: "Impersonation", blurb: "Pretends to be someone else." },
  SPAM: { label: "Spam or scam", blurb: "Advertising, a scam, or repetitive junk." },
  ILLEGAL: { label: "Illegal content", blurb: "Breaks the law." },
  OTHER: { label: "Something else", blurb: "Tell us what is wrong in your own words." },
};

/** Where a report sits in triage. Every report ends at ACTIONED or DISMISSED. */
export const REPORT_STATUSES = ["OPEN", "ACTIONED", "DISMISSED"] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

/**
 * What a moderator did. Every one of these writes an audit row — including
 * DISMISS, because "we looked and left it up" is a decision worth keeping.
 */
export const MODERATION_ACTIONS = ["HIDE", "RESTORE", "DISMISS"] as const;
export type ModerationAction = (typeof MODERATION_ACTIONS)[number];

export const MODERATION_ACTION_COPY: Record<ModerationAction, { label: string; blurb: string }> = {
  HIDE: { label: "Hide", blurb: "Removes it from public surfaces. The receipt itself is kept." },
  RESTORE: { label: "Restore", blurb: "Puts it back on public surfaces." },
  DISMISS: { label: "Dismiss", blurb: "Closes the reports and leaves the receipt visible." },
};

/** The moderation status an action leaves the Receipt in, or null to leave it. */
export function statusAfter(action: ModerationAction): ModerationStatus | null {
  if (action === "HIDE") return "HIDDEN";
  if (action === "RESTORE") return "VISIBLE";
  return null;
}

/** The report status an action closes outstanding reports with. */
export function reportStatusAfter(action: ModerationAction): ReportStatus {
  return action === "HIDE" ? "ACTIONED" : "DISMISSED";
}

/**
 * How many Receipts one person may report in a day.
 *
 * One report per person per Receipt is enforced by a unique index, so this
 * exists for the other shape of abuse: reporting many Receipts to bury
 * somebody. High enough that nobody reporting in good faith will ever meet it.
 */
export const MAX_REPORTS_PER_DAY = 20;

/** Longest free-text a reporter may attach. Context, not an essay. */
export const MAX_REPORT_DETAIL = 500;
