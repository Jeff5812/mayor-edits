import { describe, expect, it, vi } from "vitest";
import { cuesFromSegments, cuesToVtt, translateLines, vttTime } from "./captions";
import { toWebVtt } from "./subtitles";

describe("cues from what was heard", () => {
  it("moves a piece's segments onto the film's clock, cleaned", () => {
    const cues = cuesFromSegments([{ start: 1, end: 3.5, text: "  Hello   there. " }], 56);
    expect(cues).toEqual([{ start: 57, end: 59.5, text: "Hello there." }]);
  });

  it("never lets a cue start before the one before it ends", () => {
    const cues = cuesFromSegments([{ start: 0.2, end: 2, text: "Next line." }], 10, 10.9);
    expect(cues[0].start).toBe(10.9);
  });

  it("splits a long line in two, sharing its time", () => {
    const long = "This is a very long sentence that keeps going well past what anyone could read in one short glance at the screen.";
    const cues = cuesFromSegments([{ start: 0, end: 10, text: long }], 0);
    expect(cues).toHaveLength(2);
    expect(cues[0].end).toBe(cues[1].start);
    expect(cues.map((cue) => cue.text).join(" ")).toBe(long);
  });

  it("skips empty segments", () => {
    expect(cuesFromSegments([{ start: 0, end: 1, text: "  " }], 0)).toEqual([]);
  });
});

describe("WebVTT", () => {
  it("writes times the way players read them", () => {
    expect(vttTime(3723.45)).toBe("01:02:03.450");
    expect(vttTime(0)).toBe("00:00:00.000");
  });

  it("is a file the site's own subtitle check accepts", () => {
    const vtt = cuesToVtt([
      { start: 1, end: 2.5, text: "First line." },
      { start: 3, end: 6, text: "A second line that is long enough to need breaking over two lines." },
    ]);
    expect(toWebVtt(vtt).ok).toBe(true);
    expect(vtt).toContain("00:00:01.000 --> 00:00:02.500\nFirst line.");
    expect(vtt.split("\n").every((line) => line.length <= 42 || line.includes("-->"))).toBe(true);
  });
});

describe("translating in batches", () => {
  it("keeps every line in step with its cue", async () => {
    const translate = vi.fn(async (batch: string[]) => batch.map((line) => `«${line}»`));
    const result = await translateLines(["a", "b", "c"], translate, 2);
    expect(result).toEqual(["«a»", "«b»", "«c»"]);
    expect(translate).toHaveBeenCalledTimes(2);
  });

  it("asks again in halves when a batch comes back with the wrong number of lines", async () => {
    const translate = vi.fn(async (batch: string[]) => (batch.length > 1 ? ["merged"] : [`«${batch[0]}»`]));
    expect(await translateLines(["a", "b", "c", "d"], translate, 4)).toEqual(["«a»", "«b»", "«c»", "«d»"]);
  });

  it("asks again only for the lines that came back missing", async () => {
    const translate = vi.fn(async (batch: string[]) => batch.map((line) => (line === "b" && batch.length > 1 ? null : `«${line}»`)));
    expect(await translateLines(["a", "b", "c"], translate, 3)).toEqual(["«a»", "«b»", "«c»"]);
    expect(translate.mock.calls.map(([batch]) => batch)).toEqual([["a", "b", "c"], ["b"]]);
  });

  it("stops, rather than save the original under another language's name, when nothing translates", async () => {
    const translate = vi.fn(async () => null);
    const lines = Array.from({ length: 100 }, (_, index) => `line ${index}`);
    await expect(translateLines(lines, translate, 50)).rejects.toThrow("did not come back right");
    // It gives up early instead of asking about every line one by one.
    expect(translate.mock.calls.length).toBeLessThan(30);
  });

  it("keeps the original words of a line that will not translate", async () => {
    expect(await translateLines(["a"], async () => null)).toEqual(["a"]);
  });
});
