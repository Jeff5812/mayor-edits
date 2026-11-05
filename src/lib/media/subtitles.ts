// Client and server safe rules for subtitle files. Everything here is pure and tested.
// Subtitles are small text files kept beside the video in R2, so deleting a project removes them with its folder.

// The list the owner picks from. Each name is written in its own language, because that is how a visitor looks for it.
export const SUBTITLE_LANGUAGES = [
  { code: "en", label: "English" },
  { code: "es", label: "Español" },
  { code: "fr", label: "Français" },
  { code: "pt", label: "Português" },
  { code: "ar", label: "العربية" },
  { code: "hi", label: "हिन्दी" },
  { code: "zh", label: "中文" },
  { code: "de", label: "Deutsch" },
  { code: "it", label: "Italiano" },
  { code: "ru", label: "Русский" },
] as const;

export type SubtitleCode = (typeof SUBTITLE_LANGUAGES)[number]["code"];

// The types as well as the extensions, because some phones grey out a file they only know by type.
export const SUBTITLE_ACCEPT = ".srt,.vtt,text/vtt,application/x-subrip";
// About two and a half hours of speech. Kept under the 1 MB that a server action accepts.
export const SUBTITLE_MAX_BYTES = 512 * 1024;

export function isSubtitleCode(code: string): code is SubtitleCode {
  return SUBTITLE_LANGUAGES.some((language) => language.code === code);
}

export function subtitleLabel(code: SubtitleCode): string {
  return SUBTITLE_LANGUAGES.find((language) => language.code === code)?.label ?? code;
}

const FOLDER = "subtitles";

export function subtitleKey(projectId: string, code: SubtitleCode): string {
  return `${projectId}/${FOLDER}/${code}.vtt`;
}

export function subtitlePrefix(projectId: string): string {
  return `${projectId}/${FOLDER}/`;
}

// The languages present, in the list's own order, from the file names stored in a project's folder.
export function subtitleCodesFromKeys(keys: string[]): SubtitleCode[] {
  const found = new Set(keys.map((key) => key.split("/").pop()?.replace(/\.vtt$/, "") ?? ""));
  return SUBTITLE_LANGUAGES.map((language) => language.code).filter((code) => found.has(code));
}

// 00:01:02,500 --> 00:01:05,000 in a .srt file. Hours are required there.
const SRT_TIMING = /^(\d{1,3}:\d{2}:\d{2}),(\d{3})\s*-->\s*(\d{1,3}:\d{2}:\d{2}),(\d{3})(.*)$/gm;
// Hours are optional in a .vtt file.
const VTT_TIMING = /^(?:\d{1,3}:)?\d{2}:\d{2}\.\d{3}\s*-->\s*(?:\d{1,3}:)?\d{2}:\d{2}\.\d{3}/m;

export type SubtitleConversion = { ok: true; vtt: string } | { ok: false; message: string };

// Takes the text of a .srt or .vtt file and returns WebVTT, the format browsers play. A file with no timed lines is
// refused here, because it would otherwise look saved and then show nothing.
export function toWebVtt(text: string): SubtitleConversion {
  const clean = text.replace(/^﻿/, "").replace(/\r\n?/g, "\n").trim();
  if (!clean) return { ok: false, message: "This subtitle file is empty." };

  const vtt = /^WEBVTT(\s|$)/.test(clean) ? clean : `WEBVTT\n\n${clean.replace(SRT_TIMING, "$1.$2 --> $3.$4$5")}`;
  if (!VTT_TIMING.test(vtt)) {
    return { ok: false, message: "This does not look like a subtitle file, because it has no timed lines. Please choose a .srt or .vtt file." };
  }
  return { ok: true, vtt: `${vtt}\n` };
}
