/**
 * The screen a daily prompt goes through before a person signs it off.
 *
 * Two things are going on here, and it matters that they stay separate:
 *
 *  - BLOCKERS are subjects the daily prompt does not go near. They are a
 *    product decision about what it is decent to ask a stranger to predict in
 *    public, not a legal judgement, and nothing here claims any law requires
 *    them. A blocker stops a prompt going live.
 *  - QUALITY checks are the house style: specific, plausible, self-resolvable,
 *    passive, one clean event, inside a week or so. A quality miss is a note
 *    for the reviewer, not a veto.
 *
 * Neither list approves anything. This is a screen that narrows what a human
 * has to read carefully; the approval itself is a person's, recorded against
 * their account. See `daily.approve` in server/routers.ts.
 */

export type PromptFlagSeverity = "BLOCK" | "REVIEW";

export type PromptFlag = {
  code: string;
  severity: PromptFlagSeverity;
  /** What a reviewer needs to know, in the words they would use. */
  note: string;
};

type Rule = { code: string; severity: PromptFlagSeverity; note: string; pattern: RegExp };

/**
 * Subjects the daily prompt stays away from.
 *
 * The reasoning is the same in every case: a prompt is shown to everybody on
 * the same day, and answering it publicly should never require someone to
 * speculate about a body, a death, a pregnancy, somebody's money, a named
 * person, or another person's inner life. These are product rules. They are
 * not, and are not claimed to be, a legal requirement.
 */
const BLOCKERS: Rule[] = [
  {
    code: "HEALTH",
    severity: "BLOCK",
    note: "Health and bodies. Nobody should be asked to predict a diagnosis, a weight, or a recovery.",
    pattern: /\b(cancer|tumou?r|diagnos\w*|symptom\w*|disease|illness|hospitali[sz]\w*|surgery|chemo\w*|overdose|BMI|weight loss|lose weight|diet)\b/i,
  },
  {
    code: "DEATH",
    severity: "BLOCK",
    note: "Death. A prompt must never invite a public bet on whether somebody dies.",
    pattern: /\b(die|dies|died|dying|death|deaths|dead|funeral|obituary|terminal|life expectancy)\b/i,
  },
  {
    code: "SELF_HARM",
    severity: "BLOCK",
    note: "Self-harm and suicide. Out of scope entirely, in any framing.",
    pattern: /\b(suicid\w*|self[- ]harm|kill (?:him|her|them|it)self|overdos\w*)\b/i,
  },
  {
    code: "PREGNANCY",
    severity: "BLOCK",
    note: "Pregnancy and fertility. Private, often painful, and not a public guessing game.",
    pattern: /\b(pregnan\w*|miscarr\w*|fertility|IVF|conceive|expecting a baby|due date)\b/i,
  },
  {
    code: "FINANCIAL_DECISION",
    severity: "BLOCK",
    note: "Financial decisions. Predicting a price is one thing; prompting somebody to act on it is another.",
    pattern: /\b(should you (?:buy|sell|invest)|invest in|buy the dip|your (?:savings|mortgage|portfolio|salary|rent)|take out a loan|get into debt)\b/i,
  },
  {
    code: "SURVEILLANCE",
    severity: "BLOCK",
    note: "Watching somebody. A prompt must not ask anyone to observe or report on another person.",
    pattern: /\b(check (?:their|his|her) (?:phone|messages|location)|track (?:them|him|her)|find out if (?:they|he|she)|spy|snoop|read (?:their|his|her) (?:texts|messages|DMs))\b/i,
  },
  {
    code: "JUDGING_A_PERSON",
    severity: "BLOCK",
    note: "Judging somebody's motives, honesty or feelings. Not a prediction — an accusation with a countdown.",
    pattern: /\b(is (?:he|she|they|your \w+) (?:lying|cheating|faking|hiding)|do(?:es)? (?:he|she|they) (?:really|actually) (?:love|like|care)|are they over you|really mean it)\b/i,
  },
];

/**
 * House style. A prompt that trips one of these is usually fixable in a word
 * or two, which is why they are notes rather than vetoes.
 */
const QUALITY: Rule[] = [
  {
    code: "NAMED_PERSON",
    severity: "REVIEW",
    note: "Looks like it names a specific person. Prompts are about events, not individuals — check this is a public role, not a private human.",
    pattern: /\b(?:will|has|did)\s+(?:Mr|Mrs|Ms|Dr)\.?\s+[A-Z]|\b[A-Z][a-z]+\s+[A-Z][a-z]+\s+(?:will|is going to|says)\b/,
  },
  {
    code: "NOT_PASSIVE",
    severity: "REVIEW",
    note: "Asks the answerer to do something rather than to notice something. The daily prompt is answered by watching, not acting.",
    pattern: /\b(?:will you (?:go|try|buy|call|text|ask|tell|make|start|stop|send)|should you\b)/i,
  },
  {
    code: "TWO_EVENTS",
    severity: "REVIEW",
    note: "Looks like two events in one question. Split it: a compound prompt cannot be resolved cleanly.",
    pattern: /\b(?:and (?:also|then)\b|\band will\b|, and will\b)/i,
  },
  {
    code: "UNRESOLVABLE",
    severity: "REVIEW",
    note: "No clear way to tell later whether it happened. Every prompt has to be answerable by the person who wrote it, without research.",
    pattern: /\b(?:feel like|vibe|seem|probably|might|could|somehow|generally)\b/i,
  },
];

/** The window a daily prompt should resolve inside, in days. */
export const PROMPT_WINDOW_DAYS = { min: 1, max: 7 } as const;

/** Prompts shorter than this are too vague to resolve; longer are unreadable. */
export const PROMPT_LENGTH = { min: 20, max: 160 } as const;

/**
 * Screens one prompt. Returns every flag it trips, blockers first.
 *
 * Returning nothing does not mean the prompt is good. It means nothing
 * automatic objected, and a person still has to read it.
 */
export function screenPrompt(input: { prompt: string; resolutionDays?: number }): PromptFlag[] {
  const flags: PromptFlag[] = [];
  const text = input.prompt.trim();

  for (const rule of [...BLOCKERS, ...QUALITY]) {
    if (rule.pattern.test(text)) flags.push({ code: rule.code, severity: rule.severity, note: rule.note });
  }

  if (text.length < PROMPT_LENGTH.min) {
    flags.push({ code: "TOO_SHORT", severity: "REVIEW", note: "Too short to be specific enough to resolve." });
  }
  if (text.length > PROMPT_LENGTH.max) {
    flags.push({ code: "TOO_LONG", severity: "REVIEW", note: "Too long. A daily prompt is read in one breath." });
  }
  // A trailing quotation mark still ends a question: one of the shipped
  // prompts finishes on ‘who asked for this?’
  if (!/\?["'”’)\]]*$/.test(text)) {
    flags.push({ code: "NOT_A_QUESTION", severity: "REVIEW", note: "Not phrased as a question. The daily prompt is answered YES or NO." });
  }

  const days = input.resolutionDays;
  if (typeof days === "number" && (days < PROMPT_WINDOW_DAYS.min || days > PROMPT_WINDOW_DAYS.max)) {
    flags.push({
      code: "OUTSIDE_WINDOW",
      severity: "REVIEW",
      note: `Resolves in ${days} days. The daily prompt is meant to close inside about a week, so the loop is felt rather than forgotten.`,
    });
  }

  return flags.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "BLOCK" ? -1 : 1));
}

/** Whether the automatic screen objects outright. Never an approval. */
export function isBlocked(flags: PromptFlag[]): boolean {
  return flags.some((flag) => flag.severity === "BLOCK");
}

/**
 * What the reviewer is signing off on, spelled out.
 *
 * Shown next to the approve button so the standard is in front of the person
 * applying it rather than in a document nobody reopens.
 */
export const PROMPT_STANDARD = [
  "Specific enough that two people would agree on the answer.",
  "Plausible — it could genuinely go either way.",
  "Self-resolvable: the answerer will know, without having to go and research it.",
  "Passive. It asks them to notice something, not to go and do something.",
  "One clean event, not two.",
  "Closes inside about a week.",
] as const;
