/**
 * What the legal pages are, and — mostly — what they must never become.
 *
 * These documents are the one place in the product where it would be easy to
 * write something reassuring and untrue. Every assertion below is about a
 * claim nobody has established: compliance, certification, encryption,
 * auditing, or a legal conclusion about the age floor. A future edit that adds
 * one of those has to delete a test to do it.
 */
import { describe, expect, it } from "vitest";
import {
  AGE_NOTICE,
  AGE_POLICY,
  LEGAL_STATUS,
  MINIMUM_AGE,
  PRIVACY_POLICY,
  TERMS,
  type LegalDocument,
} from "./legal";

const DOCUMENTS: Array<[string, LegalDocument]> = [
  ["privacy", PRIVACY_POLICY],
  ["terms", TERMS],
];

/** Everything either document says, as one lower-cased string. */
const fullText = (document: LegalDocument) =>
  [...document.intro, ...document.sections.flatMap((section) => [section.heading, ...section.body])]
    .join("\n")
    .toLowerCase();

describe("both documents are still marked as drafts", () => {
  it("says so, in the words a reader would understand", () => {
    expect(LEGAL_STATUS.toLowerCase()).toContain("draft");
    expect(LEGAL_STATUS.toLowerCase()).toContain("lawyer");
  });

  it.each(DOCUMENTS)("%s has a title, a date and sections with bodies", (_name, document) => {
    expect(document.title.length).toBeGreaterThan(0);
    expect(document.updated.length).toBeGreaterThan(0);
    expect(document.sections.length).toBeGreaterThan(3);
    for (const section of document.sections) {
      expect(section.heading.length).toBeGreaterThan(0);
      expect(section.body.length).toBeGreaterThan(0);
    }
  });
});

/**
 * The claims that would each be a lie today. Written as a list rather than one
 * assertion so a failure names the exact phrase that crept in.
 */
const FORBIDDEN_CLAIMS = [
  "gdpr compliant",
  "ccpa compliant",
  "coppa compliant",
  "hipaa",
  "soc 2",
  "soc2",
  "iso 27001",
  "certified",
  "accredited",
  "audited",
  "penetration test",
  "bank-level",
  "military-grade",
  "end-to-end encrypted",
  "fully secure",
  "we comply with",
  "in compliance with",
  "legally compliant",
];

describe("claims nothing in this repository establishes", () => {
  it.each(DOCUMENTS)("%s makes none of them", (_name, document) => {
    const text = fullText(document);
    for (const claim of FORBIDDEN_CLAIMS) {
      expect({ claim, present: text.includes(claim) }).toEqual({ claim, present: false });
    }
  });

  it("privacy says outright that it claims no compliance", () => {
    const text = fullText(PRIVACY_POLICY);
    expect(text).toContain("does not claim compliance");
  });
});

describe("the age floor", () => {
  it("is thirteen", () => {
    expect(MINIMUM_AGE).toBe(13);
  });

  it("is stated plainly enough to act on", () => {
    expect(AGE_NOTICE).toContain("13");
    expect(AGE_NOTICE.toLowerCase()).toContain("older");
  });

  it("appears in both documents", () => {
    for (const [, document] of DOCUMENTS) {
      expect(document.sections.map((section) => section.heading)).toContain("Age");
      expect(fullText(document)).toContain("13");
    }
  });

  it("is presented as a product rule, never as a legal conclusion", () => {
    // Saying "you must be 13" is a rule. Saying "so we are COPPA compliant",
    // or "so COPPA does not apply", would be a finding about the law that
    // nobody here is in a position to make.
    const age = AGE_POLICY.toLowerCase();
    expect(age).toMatch(/rule we set|our rule/);
    expect(age).not.toContain("coppa");
    expect(age).not.toContain("compliant");
    expect(age).not.toContain("legally");
  });

  it("does not promise verification the product does not do", () => {
    // Nothing checks anybody's age, and the documents must not imply it does.
    for (const [, document] of DOCUMENTS) {
      const text = fullText(document);
      expect(text).toMatch(/do not ask|do not check|do not verify/);
      expect(text).not.toContain("verified your age");
      expect(text).not.toContain("age verification");
    }
  });

  it("does not ask for a date of birth anywhere in what it describes", () => {
    for (const [, document] of DOCUMENTS) {
      const text = fullText(document);
      // Mentioned only in the negative — "we do not ask for your date of
      // birth" — never as something collected.
      if (text.includes("date of birth")) {
        expect(text).toMatch(/do not ask (for )?your date of birth|do not ask your date of birth/);
      }
    }
  });
});

describe("what the privacy page says about dreams", () => {
  const dreams = PRIVACY_POLICY.sections.find((section) => section.heading === "Dreams");
  const text = (dreams?.body ?? []).join("\n").toLowerCase();

  it("has a section at all", () => {
    expect(dreams).toBeDefined();
  });

  it("says THE RECEIPT never receives the audio", () => {
    // The implementation sends only the transcript. A policy that said or
    // implied otherwise would be describing a product we did not build.
    expect(text).toContain("never receives");
    expect(text).toMatch(/audio/);
  });

  it("does not claim the transcription always happens on the device", () => {
    // It happens in the browser, which is not the same thing: some browsers
    // send the audio to their own vendor. Claiming "on your device" would be
    // the single most tempting inaccuracy in this document.
    expect(text).not.toContain("on your device only");
    expect(text).not.toContain("never leaves your device");
  });

  it("names the browser/vendor distinction explicitly", () => {
    expect(text).toMatch(/vendor|google/);
    expect(text).toContain("browser");
  });

  it("says dreams are deleted with the account", () => {
    expect(text).toContain("delete your account");
    expect(text).toMatch(/deleted/);
  });

  it("promises no interpretation", () => {
    expect(text).toMatch(/do not interpret|not interpret/);
  });
});

describe("what the privacy page says about deletion", () => {
  const deletion = PRIVACY_POLICY.sections.find((section) => section.heading === "Deleting your account");
  const text = (deletion?.body ?? []).join("\n").toLowerCase();

  it("describes the split the code actually implements", () => {
    // Private receipts and dreams go; public receipts are anonymised and kept.
    expect(text).toContain("private receipts are deleted");
    expect(text).toContain("dreams are deleted");
    expect(text).toMatch(/public receipts are kept/);
  });

  it("says the username is retired permanently", () => {
    expect(text).toMatch(/retired permanently|never be claimed again/);
  });

  it("does not promise that everything disappears", () => {
    expect(text).not.toContain("everything is deleted");
    expect(text).not.toContain("all your data is deleted");
  });
});

describe("coverage of what the product actually does", () => {
  const privacy = fullText(PRIVACY_POLICY);

  it.each([
    ["archive search", /archive/],
    ["resurfacing", /anniversary/],
    ["me too", /me too/],
    ["moderation", /moderation/],
    ["notifications", /notification/],
    ["analytics", /analytics/],
    ["public cards", /image card/],
    ["sharing", /sharing|another platform/],
    ["sign-in provider", /identity provider|sign-in/],
    ["usernames", /username/],
  ])("privacy describes %s", (_label, pattern) => {
    expect(privacy).toMatch(pattern);
  });
});
