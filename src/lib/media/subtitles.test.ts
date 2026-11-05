import { describe, expect, it } from "vitest";
import { isSubtitleCode, subtitleCodesFromKeys, subtitleKey, subtitleLabel, subtitlePrefix, toWebVtt } from "./subtitles";

const SRT = `1
00:00:01,000 --> 00:00:03,500
Hello there.

2
00:01:02,250 --> 00:01:04,000
Second line.
`;

describe("toWebVtt", () => {
  it("turns a .srt file into WebVTT, changing only what must change", () => {
    const result = toWebVtt(SRT);
    expect(result).toEqual({
      ok: true,
      vtt: "WEBVTT\n\n1\n00:00:01.000 --> 00:00:03.500\nHello there.\n\n2\n00:01:02.250 --> 00:01:04.000\nSecond line.\n",
    });
  });

  it("copes with Windows line endings and a byte order mark", () => {
    const result = toWebVtt(`﻿${SRT.replaceAll("\n", "\r\n")}`);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.vtt.startsWith("WEBVTT\n\n1\n00:00:01.000")).toBe(true);
      expect(result.vtt).not.toContain("\r");
    }
  });

  it("leaves a .vtt file as it is", () => {
    const vtt = "WEBVTT\n\n00:01.000 --> 00:03.000\nHola.\n";
    expect(toWebVtt(vtt)).toEqual({ ok: true, vtt });
  });

  it("keeps text in any script", () => {
    const result = toWebVtt("1\n00:00:01,000 --> 00:00:02,000\nمرحبا بالعالم\n");
    expect(result.ok && result.vtt).toContain("مرحبا بالعالم");
  });

  it("does not touch a comma in the words", () => {
    const result = toWebVtt("1\n00:00:01,000 --> 00:00:02,000\nAt 00:00:05,000 he left, she said.\n");
    expect(result.ok && result.vtt).toContain("At 00:00:05,000 he left, she said.");
  });

  it("refuses an empty file", () => {
    expect(toWebVtt("  \n ")).toMatchObject({ ok: false, message: expect.stringContaining("empty") });
  });

  it("refuses a file with no timed lines, in either format", () => {
    expect(toWebVtt("just some notes")).toMatchObject({ ok: false, message: expect.stringContaining("no timed lines") });
    expect(toWebVtt("WEBVTT\n\nno cues here")).toMatchObject({ ok: false });
  });
});

describe("subtitle names", () => {
  it("knows which language codes are allowed", () => {
    expect(isSubtitleCode("es")).toBe(true);
    expect(isSubtitleCode("../../secret")).toBe(false);
    expect(isSubtitleCode("")).toBe(false);
  });

  it("names a language in its own script", () => {
    expect(subtitleLabel("es")).toBe("Español");
    expect(subtitleLabel("ar")).toBe("العربية");
  });

  it("keeps subtitle files inside the project's folder", () => {
    expect(subtitleKey("project-1", "fr")).toBe("project-1/subtitles/fr.vtt");
    expect(subtitleKey("project-1", "fr").startsWith(subtitlePrefix("project-1"))).toBe(true);
  });

  it("reads the languages back from stored names, in the list's order, ignoring anything else", () => {
    const keys = ["p/subtitles/fr.vtt", "p/subtitles/en.vtt", "p/subtitles/notes.txt", "p/subtitles/xx.vtt"];
    expect(subtitleCodesFromKeys(keys)).toEqual(["en", "fr"]);
  });
});
