// Browser only. Automatic subtitles for one video: its sound is read here, sent in half-minute pieces to be heard and written
// down, then translated into the languages the other films use, and every language is saved through the same check as an
// uploaded file. Nothing here needs the owner to download or upload a subtitle file.
import { autoSubtitlePlan, hearSoundPiece, translateSubtitleLines } from "@/lib/projects/auto-subtitle-actions";
import type { ActionResult } from "@/lib/projects/action-types";
import { saveProjectSubtitle } from "@/lib/projects/subtitle-actions";
import { type Cue, TRANSLATION_FAILED, cuesFromSegments, cuesToVtt, translateLines } from "./captions";
import { SPEECH_SAMPLE_RATE, decodeSpeechAudio, pieceBounds, wavBytes } from "./speech-audio";
import { type SubtitleCode, isSubtitleCode, subtitleLabel } from "./subtitles";

export class AutoSubtitlesOff extends Error {
  constructor() {
    super("Automatic subtitles are not switched on.");
    this.name = "AutoSubtitlesOff";
  }
}

const RETRY_MS = [3000, 8000];
const ALL_THERE = "Every language is already here. To make one again, remove it first.";
const CANNOT_DECODE = "This browser could not read the video's sound. Please try again on a computer, in Chrome, Edge or Safari.";

// A moment without the service is waited out a couple of times before the owner is told.
async function patiently<T>(call: () => Promise<ActionResult<T>>): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    const result = await call();
    if (result.ok) return result.data;
    if (!result.retryable || attempt >= RETRY_MS.length) throw new Error(result.error);
    await new Promise((resolve) => setTimeout(resolve, RETRY_MS[attempt]));
  }
}

async function save(projectId: string, code: SubtitleCode, cues: Cue[]) {
  const result = await saveProjectSubtitle(projectId, code, cuesToVtt(cues));
  if (!result.ok) throw new Error(result.error);
}

export interface AutoSubtitleResult {
  // The languages saved, the spoken one first when it was missing.
  saved: SubtitleCode[];
}

export async function makeAutoSubtitles(projectId: string, sound: () => Promise<Blob>, onStep: (step: string) => void): Promise<AutoSubtitleResult> {
  const plan = await patiently(() => autoSubtitlePlan(projectId));
  if (!plan.ready) throw new AutoSubtitlesOff();
  // Only what is missing is made. A language already there may have been corrected by hand.
  const missing = plan.languages.filter((code) => !plan.present.includes(code));
  if (missing.length === 0) throw new Error(ALL_THERE);

  const source = await sound();
  onStep("Reading the sound");
  let samples: Float32Array;
  try {
    samples = await decodeSpeechAudio(source);
  } catch (error) {
    console.error("[subtitles] the sound could not be decoded:", error instanceof Error ? error.message : error);
    throw new Error(CANNOT_DECODE);
  }
  const bounds = pieceBounds(samples);

  let cues: Cue[] = [];
  let spoken: string | null = null;
  for (const [index, [start, end]] of bounds.entries()) {
    onStep(`Writing the subtitles: ${Math.round((index / bounds.length) * 100)}%`);
    const form = new FormData();
    form.append("audio", new Blob([wavBytes(samples.subarray(start, end)).buffer as ArrayBuffer], { type: "audio/wav" }), "piece.wav");
    if (spoken) form.append("language", spoken);
    const previous = cues.slice(-3).map((cue) => cue.text).join(" ");
    if (previous) form.append("prompt", previous);
    const heard = await patiently(() => hearSoundPiece(form));
    // Music or silence says little about the language, so it is taken from the first piece with words in it.
    if (!spoken && heard.segments.length > 0) spoken = heard.language;
    cues = cues.concat(cuesFromSegments(heard.segments, start / SPEECH_SAMPLE_RATE, cues.at(-1)?.end ?? 0));
  }
  if (cues.length === 0) throw new Error("No speech was heard in this video, so there is nothing to write down.");

  const saved: SubtitleCode[] = [];
  const spokenCode = spoken && isSubtitleCode(spoken) ? spoken : null;
  if (spokenCode && !plan.present.includes(spokenCode)) {
    onStep(`Saving the ${subtitleLabel(spokenCode)} subtitles`);
    await save(projectId, spokenCode, cues);
    saved.push(spokenCode);
  }
  const texts = cues.map((cue) => cue.text);
  for (const target of missing) {
    if (target === spokenCode) continue;
    onStep(`Translating into ${subtitleLabel(target)}`);
    const translated = await translateLines(texts, async (batch) => (await patiently(() => translateSubtitleLines(batch, spoken ?? "en", target))).lines).catch(
      (error: unknown) => {
        if (error instanceof Error && error.message === TRANSLATION_FAILED) {
          const done = saved.length ? ` These were saved: ${saved.map(subtitleLabel).join(", ")}.` : "";
          throw new Error(`The ${subtitleLabel(target)} translation did not work, so it was not saved.${done} Please try again later.`);
        }
        throw error;
      },
    );
    await save(projectId, target, cues.map((cue, index) => ({ ...cue, text: translated[index] })));
    saved.push(target);
  }
  return { saved };
}
