/**
 * Dreams.
 *
 * A dream is the only Receipt that is captured rather than written. You wake
 * up, you tap once, you talk, and it is on the record before it evaporates.
 * Everything here exists to keep that path short and to keep what comes out of
 * it private.
 *
 * What this module deliberately does NOT do:
 *
 *  - interpret. There is no "your dream means X", and there is never "your
 *    dream predicted this". A dream is a record of what you remembered, not
 *    evidence about the world, and the product must not imply otherwise.
 *  - keep audio. The transcript is the artefact. The recording is not
 *    uploaded anywhere and is discarded the moment speech recognition is done
 *    with it — see the capture UI.
 *  - accept responses. See PRIVATE_ONLY_TYPES and POLICY in
 *    ./interactionPolicy.ts; a dream takes no interaction of any kind.
 */

/** Longest transcript we will store. Long enough for a rambling 4am retelling. */
export const DREAM_MAX_LENGTH = 4000;

/** Shortest thing we will call a dream. Below this it is a slip of the thumb. */
export const DREAM_MIN_LENGTH = 4;

/** Titles are a label on the record, not the record. */
export const DREAM_TITLE_MAX_LENGTH = 120;

/**
 * The first clause of a transcript, as a title.
 *
 * Speech-to-text arrives as one long unpunctuated run more often than not, so
 * this cuts at the first sentence break if there is one and falls back to a
 * word boundary. It is a readable label for the archive — nothing reads it as
 * meaning, and the author can rename it.
 */
export function dreamTitleFrom(transcript: string): string {
  const text = transcript.replace(/\s+/g, " ").trim();
  if (!text) return "Untitled dream";

  // First sentence break, if the transcript has one early enough to be a title.
  const sentence = text.match(/^(.{4,80}?)(?:[.!?]|,\s|\s—\s|\bthen\b|\band then\b)/i);
  const candidate = (sentence?.[1] ?? text).trim();
  if (candidate.length <= DREAM_TITLE_MAX_LENGTH) return capitalize(candidate);

  // No usable break: cut at a word boundary rather than mid-word.
  const clipped = candidate.slice(0, DREAM_TITLE_MAX_LENGTH - 1);
  const lastSpace = clipped.lastIndexOf(" ");
  return capitalize((lastSpace > 20 ? clipped.slice(0, lastSpace) : clipped).trim()) + "…";
}

function capitalize(text: string): string {
  return text ? text[0].toUpperCase() + text.slice(1) : text;
}

/**
 * Whether the browser can capture a dream by voice.
 *
 * Speech recognition is a browser capability, not a service we run: nothing is
 * uploaded, no model of ours sees it, and there is no third party to name in
 * the privacy policy for the typed fallback. Where it is missing — Firefox, and
 * any browser with the permission denied — the capture screen falls back to
 * typing, which records exactly the same thing.
 */
export function speechRecognitionCtor(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** The slice of the Web Speech API this app uses. */
export interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechResultEventLike) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
}

export interface SpeechResultEventLike {
  resultIndex: number;
  results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>;
}

/**
 * Folds a speech-recognition event into the transcript so far.
 *
 * Interim results are replaced on every event; final ones are appended. Kept
 * pure so the fiddly part of the capture screen is testable without a browser.
 */
export function applySpeechResult(
  committed: string,
  event: SpeechResultEventLike,
): { committed: string; interim: string } {
  let nextCommitted = committed;
  let interim = "";
  for (let i = event.resultIndex; i < event.results.length; i++) {
    const result = event.results[i];
    const text = result[0]?.transcript ?? "";
    if (result.isFinal) nextCommitted = `${nextCommitted} ${text}`.replace(/\s+/g, " ").trim();
    else interim = `${interim} ${text}`.replace(/\s+/g, " ").trim();
  }
  return { committed: nextCommitted, interim };
}
