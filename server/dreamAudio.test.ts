/**
 * The privacy page makes one claim the rest of the code cannot enforce on its
 * own: "THE RECEIPT never receives your microphone audio and never stores it."
 *
 * That is true because of an absence — there is no route that accepts audio —
 * and absences rot. `server/_core/voiceTranscription.ts` ships with this
 * project template: it uploads an audio file to a Whisper API and is, at the
 * time of writing, imported by nothing. Its own header comment invites a
 * future developer to wire it to a `voice.transcribe` procedure. If anybody
 * ever does, the privacy page becomes false the same day, silently.
 *
 * So the absence is asserted here. These tests read the router and the client
 * as text, which is unusual, but the claim being defended is a claim about the
 * shape of the codebase rather than about the behaviour of one function.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

const ROUTERS = read("server/routers.ts");
const CLIENT = read("client/src/App.tsx");
const DREAM = read("shared/dream.ts");

describe("no route accepts audio", () => {
  it("the server-side transcription helper is wired to nothing", () => {
    // The moment this import appears, a dream's audio can reach our servers
    // and the privacy page needs rewriting before the feature ships.
    expect(ROUTERS).not.toContain("voiceTranscription");
    expect(ROUTERS).not.toContain("transcribeAudio");
  });

  it("there is no voice router", () => {
    expect(ROUTERS).not.toMatch(/\bvoice:\s*router\(/);
  });

  it("the dreams router takes a transcript and nothing else", () => {
    const dreams = ROUTERS.slice(ROUTERS.indexOf("dreams: router({"));
    const capture = dreams.slice(0, dreams.indexOf("rename:"));
    expect(capture).toContain("transcript");
    for (const field of ["audio", "audioUrl", "recording", "blob", "mimeType", "file"]) {
      expect({ field, present: capture.includes(field) }).toEqual({ field, present: false });
    }
  });
});

describe("the browser never uploads the recording", () => {
  it("the capture screen does not record audio to a buffer", () => {
    // Web Speech API listens and returns text. MediaRecorder would produce a
    // file, and a file is a thing that can be uploaded.
    for (const api of ["MediaRecorder", "getUserMedia", "AudioContext", "createMediaStreamSource"]) {
      expect({ api, present: CLIENT.includes(api) }).toEqual({ api, present: false });
    }
  });

  it("the capture screen posts no multipart body", () => {
    expect(CLIENT).not.toContain("FormData");
    expect(CLIENT).not.toContain("audio/webm");
  });

  it("the dream module offers no upload helper to be tempted by", () => {
    // Its prose says the word "upload" — in the negative — so this looks for
    // the machinery rather than the word.
    expect(DREAM).not.toContain("fetch(");
    expect(DREAM).not.toContain("FormData");
    expect(DREAM).not.toMatch(/function\s+upload|const\s+upload/i);
  });
});

describe("what the recogniser is allowed to be", () => {
  it("is the browser's own, not a service we call", () => {
    // If this ever becomes a network call, the privacy page's browser/vendor
    // paragraph stops describing the product.
    expect(DREAM).toContain("SpeechRecognition");
    expect(DREAM).toContain("webkitSpeechRecognition");
  });

  it("is documented as a browser capability rather than ours", () => {
    expect(DREAM.toLowerCase()).toContain("browser capability");
  });
});
