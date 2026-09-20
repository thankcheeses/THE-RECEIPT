/**
 * The Privacy Policy and Terms.
 *
 * These are DRAFTS. They describe what the software actually does — every
 * statement below was written against the code in this repository, and where
 * the code changes, this has to change with it. They have not been reviewed by
 * a lawyer, and they are marked as drafts in the product for that reason.
 *
 * What is deliberately absent, and must stay absent until it is true:
 *
 *   - any claim of compliance with GDPR, CCPA, COPPA or any other regime
 *   - any certification, audit, accreditation or security guarantee
 *   - any statement about a minimum age, which is a legal question nobody has
 *     answered yet (see AGE_POSITION below)
 *
 * Writing "we comply with" is a claim about a legal state of affairs, not a
 * description of software, and nothing in this repository establishes it.
 */

export const LEGAL_STATUS =
  "Draft. This describes how the software behaves today. It has not been reviewed by a lawyer.";

export type LegalSection = { heading: string; body: string[] };

export type LegalDocument = {
  title: string;
  updated: string;
  intro: string[];
  sections: LegalSection[];
};

/** Bumped by hand whenever the text below changes. */
const UPDATED = "20 September 2026";

export const PRIVACY_POLICY: LegalDocument = {
  title: "Privacy",
  updated: UPDATED,
  intro: [
    "THE RECEIPT keeps what you write, on purpose. That is the product: a record that is still there later. This page is about what we hold, who can see it, and what happens when you want it gone.",
    "It describes the software as it is actually built. Where it is vague, that is because the answer is genuinely undecided, and it says so rather than guessing.",
  ],
  sections: [
    {
      heading: "What we hold",
      body: [
        "Your account: the identifier your sign-in provider gives us, your display name, an email address if your provider supplies one, which method you signed in with, and your chosen username.",
        "Your receipts: what you wrote, the category, your confidence, the type you chose, the dates, whether you made it public or private, and — once you resolve it — the result and any note you left.",
        "Your responses to other people's receipts: one per receipt, and which kind.",
        "Your activity: the days you answered the daily prompt, your streak, and a small analytics table recording that an event happened (a receipt was created, a card was shared) with the event's shape but not its contents.",
        "Reports and moderation decisions, if you report something or if something of yours is reported.",
      ],
    },
    {
      heading: "What is public, and what is not",
      body: [
        "A receipt you mark PUBLIC is public: it has a shareable link, it appears in the feed and on your profile, and it can be rendered as an image card. Anyone can read it, signed in or not.",
        "A receipt you mark PRIVATE is not shown to anyone else, anywhere.",
        "A dream is always private. There is no setting that makes one public, the server refuses to store one as public, and every public surface in the application excludes dreams by type as well as by visibility.",
        "Your archive and its search are yours alone. There is no public version of either.",
      ],
    },
    {
      heading: "Dreams",
      body: [
        "Dreams are captured by voice in your browser. The audio is never uploaded and is never stored — speech recognition runs in your browser and only the resulting text is sent to us. If your browser cannot do that, you type it instead, and the same thing is stored.",
        "We do not interpret dreams. The application will not tell you what a dream meant, and will never suggest that a dream predicted or caused anything.",
        "A dream's title is generated from the first words of your own transcript. You can rename it. The transcript itself cannot be edited, like every other receipt.",
        "When you delete your account, every dream is deleted outright — not anonymised, not retained in any form.",
      ],
    },
    {
      heading: "Deleting your account",
      body: [
        "You can delete your account from your profile. It is immediate and cannot be undone.",
        "Your private receipts are deleted. Your dreams are deleted. Your notifications are deleted, as are notifications about you in anybody else's inbox.",
        "Your public receipts are kept, with your name removed. They stop being connected to you: the author becomes nobody, and nothing links them back to a person. They are kept rather than deleted because other people responded to them and, in some cases, wrote their own receipts after them — deleting yours would silently change their record too.",
        "A private receipt that another person's challenge, or a moderation decision, depends on is kept in the same way: detached, still private, and absent from every public surface.",
        "Your username is retired permanently and can never be claimed again, including by you. If it were released, every old link and screenshot naming it would start pointing at somebody else.",
        "Reports and moderation decisions are kept with your identity removed. They are evidence about other people's content and outlive any one account.",
      ],
    },
    {
      heading: "Moderation",
      body: [
        "A receipt cannot be edited or deleted — not by its author, and not by an administrator. Moderation changes whether a receipt is shown, never what it says.",
        "Reporting requires an account, so that one report per person per receipt can be enforced. If you do not have an account, the abuse contact in the footer is the way to reach us, where one is published.",
        "Every moderation decision is recorded, including a decision to leave something up.",
      ],
    },
    {
      heading: "Notifications",
      body: [
        "You are notified when a receipt of yours reaches its resolution date, and when somebody challenges you or accepts your challenge. A receipt generates a resolution notification once, ever.",
        "There is no marketing email, and nothing is sent to an address you did not give us.",
      ],
    },
    {
      heading: "Analytics",
      body: [
        "We record that certain events happened, tied to your account id, from a fixed list of event names. The contents of what you write are not recorded — a dream capture records only its length, never a word of it, and an archive search records that a search happened and how many results it had, never the term you typed.",
        "When you delete your account, these rows are kept with your id removed, so counts do not silently change.",
        "If an external analytics script is configured for a deployment, it is named in that deployment's environment. There is none in the source.",
      ],
    },
    {
      heading: "Other services",
      body: [
        "Sign-in is handled by an external identity provider, which is what tells us who you are.",
        "Sharing a receipt to another platform opens that platform. What happens after that is between you and them.",
        "Speech recognition for dreams is a capability of your browser. Some browsers implement it locally and some send audio to their own vendor's service; which one yours does is a property of your browser, not of this application, and we have no access either way.",
      ],
    },
    {
      heading: "What this page does not claim",
      body: [
        "It does not claim compliance with any privacy law or regulation, because no such assessment has been done.",
        "It does not claim any certification, audit or security guarantee.",
        "It does not state a minimum age. That is a legal question that has not been answered for this product, and inventing an answer would be worse than admitting it is open.",
      ],
    },
  ],
};

export const TERMS: LegalDocument = {
  title: "Terms",
  updated: UPDATED,
  intro: [
    "Short version: write what you actually think, you cannot take it back, and do not use this to go after anybody.",
  ],
  sections: [
    {
      heading: "What you are agreeing to",
      body: [
        "Using THE RECEIPT means accepting what is on this page. If you do not, do not use it.",
        "This is software under active development. It can change, break, or lose data, and it is offered as it is.",
      ],
    },
    {
      heading: "Receipts are permanent",
      body: [
        "Once you lock a receipt you cannot edit it and you cannot delete it individually. This is the point of the product, not an oversight.",
        "Deleting your account is the one way out, and it works as described on the privacy page: private receipts and dreams go, public receipts stay with your name removed.",
        "If that is not what you want for a particular thought, mark it private, or do not write it.",
      ],
    },
    {
      heading: "What you write",
      body: [
        "What you write stays yours. By making a receipt public you are asking us to show it publicly — on the feed, at its link, on your profile and as a generated image card — and to keep showing it.",
        "Do not post someone else's private information. Do not harass, threaten or impersonate anyone. Do not use a receipt as a way to make an accusation about a named person.",
        "Do not post anything illegal, and do not use the daily prompt or a receipt to organise harm.",
      ],
    },
    {
      heading: "Responses and ME TOO",
      body: [
        "Responding to a receipt records one response, which you can change or withdraw.",
        "ME TOO is not a response. It writes a new receipt, authored by you, locked on your own terms, that records which receipt you wrote it after. You are responsible for what yours says.",
      ],
    },
    {
      heading: "Moderation",
      body: [
        "We can hide a receipt from public surfaces. We cannot, and will not, edit one.",
        "We can suspend or remove an account that is being used to harass people.",
        "Reports are read. Not every report results in a takedown, and a decision not to act is recorded as a decision.",
      ],
    },
    {
      heading: "No guarantees",
      body: [
        "Nothing here is advice — not financial, legal, medical or otherwise. A receipt is somebody's guess, including when it turns out to be right.",
        "There is no money in this product. No prizes, no wagering, no payouts, and no scoring you can cash.",
        "We do not guarantee that the service will be available, that your data will survive, or that a feature will still exist next month.",
      ],
    },
    {
      heading: "What this page does not claim",
      body: [
        "These terms have not been reviewed by a lawyer. They describe how the product behaves and what we ask of you; they are not a substitute for legal advice, and anything in them may need to change once somebody qualified has read them.",
      ],
    },
  ],
};

/**
 * The age question, stated as the open decision it is.
 *
 * Shown in the product rather than hidden in a comment, because a product with
 * no stated age floor should at least be honest that it has none yet.
 */
export const AGE_POSITION =
  "We have not set a minimum age. Doing so properly means checking what actually applies where this is used, and nobody has done that yet — so rather than print a number that sounds official and is not, this says plainly that the question is open.";
