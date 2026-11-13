// Subtitles made from what a speech model heard: timed lines turned into WebVTT, and their text translated in batches.
// Pure and tested. The model calls themselves are passed in.

export interface Cue {
  start: number;
  end: number;
  text: string;
}

export interface HeardSegment {
  start: number;
  end: number;
  text: string;
}

// Short enough to read in a glance, and to fit two lines on a phone.
const LONGEST_CUE_CHARACTERS = 84;
const LINE_CHARACTERS = 42;
const SHORTEST_CUE_SECONDS = 0.8;

function tidy(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

// Cuts a long line near its middle, at a space, sharing its time by the length of each half.
function split(cue: Cue): Cue[] {
  if (cue.text.length <= LONGEST_CUE_CHARACTERS) return [cue];
  const middle = Math.floor(cue.text.length / 2);
  const before = cue.text.lastIndexOf(" ", middle);
  const after = cue.text.indexOf(" ", middle);
  const at = before === -1 ? after : after === -1 || middle - before <= after - middle ? before : after;
  if (at <= 0) return [cue];
  const first = cue.text.slice(0, at).trim();
  const second = cue.text.slice(at + 1).trim();
  const turn = cue.start + ((cue.end - cue.start) * first.length) / (first.length + second.length);
  return [...split({ start: cue.start, end: turn, text: first }), ...split({ start: turn, end: cue.end, text: second })];
}

// One piece's segments as cues on the film's own clock: moved by where the piece starts, cleaned, split when long, and
// never starting before the previous cue ends.
export function cuesFromSegments(segments: HeardSegment[], offset: number, previousEnd = 0): Cue[] {
  const cues: Cue[] = [];
  let floor = previousEnd;
  for (const segment of segments) {
    const text = tidy(segment.text ?? "");
    if (!text || !Number.isFinite(segment.start) || !Number.isFinite(segment.end)) continue;
    const start = Math.max(floor, offset + segment.start);
    const end = Math.max(start + SHORTEST_CUE_SECONDS, offset + segment.end);
    for (const part of split({ start, end, text })) cues.push(part);
    floor = end;
  }
  return cues;
}

// 01:02:03.450
export function vttTime(seconds: number): string {
  const whole = Math.max(0, Math.round(seconds * 1000));
  const hours = Math.floor(whole / 3_600_000);
  const minutes = Math.floor((whole % 3_600_000) / 60_000);
  const secs = Math.floor((whole % 60_000) / 1000);
  const millis = whole % 1000;
  const two = (value: number) => String(value).padStart(2, "0");
  return `${two(hours)}:${two(minutes)}:${two(secs)}.${String(millis).padStart(3, "0")}`;
}

// At most two lines, broken at the space nearest the middle.
function lines(text: string): string {
  if (text.length <= LINE_CHARACTERS) return text;
  const middle = Math.floor(text.length / 2);
  const before = text.lastIndexOf(" ", middle);
  const after = text.indexOf(" ", middle);
  const at = before === -1 ? after : after === -1 || middle - before <= after - middle ? before : after;
  return at <= 0 ? text : `${text.slice(0, at)}\n${text.slice(at + 1)}`;
}

export function cuesToVtt(cues: Cue[]): string {
  const body = cues.map((cue) => `${vttTime(cue.start)} --> ${vttTime(cue.end)}\n${lines(cue.text)}`).join("\n\n");
  return `WEBVTT\n\n${body}\n`;
}

// Translates lines in batches, keeping them in step with their cues. A batch that comes back with the wrong number of lines
// is asked again in halves, down to single lines, and a single line that still fails keeps its original words.
export const TRANSLATION_FAILED = "The translation did not come back right.";

export async function translateLines(
  texts: string[],
  translate: (batch: string[]) => Promise<(string | null)[] | null>,
  batchSize = 40,
): Promise<string[]> {
  // A line or two may keep its own words, but a service that keeps failing is not translating at all, and its file would be
  // the original under another language's name. So it stops instead.
  const allowed = Math.max(3, Math.floor(texts.length * 0.05));
  let kept = 0;
  async function attempt(batch: string[]): Promise<string[]> {
    const result = await translate(batch);
    const usable = result && result.length === batch.length ? result : null;
    const missing = usable ? batch.map((_, index) => index).filter((index) => !tidy(usable[index] ?? "")) : [];
    if (usable && missing.length === 0) return usable.map((line) => tidy(line ?? ""));
    if (batch.length === 1) {
      kept += 1;
      if (kept > allowed) throw new Error(TRANSLATION_FAILED);
      return batch;
    }
    // The lines that came back are kept and only the missing ones are asked again. A reply with none is asked again in halves.
    if (usable && missing.length < batch.length) {
      const again = await attempt(missing.map((index) => batch[index]));
      const merged = usable.map((line) => tidy(line ?? ""));
      missing.forEach((index, at) => {
        merged[index] = again[at];
      });
      return merged;
    }
    const half = Math.ceil(batch.length / 2);
    return [...(await attempt(batch.slice(0, half))), ...(await attempt(batch.slice(half)))];
  }
  const translated: string[] = [];
  for (let start = 0; start < texts.length; start += batchSize) translated.push(...(await attempt(texts.slice(start, start + batchSize))));
  return translated;
}
