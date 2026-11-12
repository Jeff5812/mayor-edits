"use server";

import { type HeardPiece, hearSpeech, isAiConfigured, translateLines } from "@/lib/ai/workers-ai";
import { isR2Configured, listObjectKeys } from "@/lib/media/r2";
import { type SubtitleCode, isSubtitleCode, subtitleCodesFromKeys, subtitlePrefix } from "@/lib/media/subtitles";
import { isUuid } from "@/lib/media/validation";
import type { ActionResult } from "./action-types";
import { asAdmin } from "./as-admin";

// Automatic subtitles. The owner's browser reads the sound and calls these one piece at a time, so the AI token never
// leaves the server. Saving the result goes through saveProjectSubtitle, the same check as an uploaded file.

// Used when no film has subtitles yet to copy the languages of.
const DEFAULT_LANGUAGES: SubtitleCode[] = ["en", "es", "fr", "pt"];
// A 28-second piece of 16 kHz WAV is about 900 KB.
const MAX_PIECE_BYTES = 1_000_000;
const MAX_LINES = 60;
const LANGUAGE = /^[a-z]{2,3}$/;
const SERVICE_DOWN = "The subtitle service could not be reached. Please try again in a moment.";

export interface AutoSubtitlePlan {
  ready: boolean;
  // The languages to make: those of the featured film, or else the first film that has subtitles.
  languages: SubtitleCode[];
  // The languages this film has already. These are never replaced, because the owner may have corrected them by hand.
  present: SubtitleCode[];
}

export async function autoSubtitlePlan(projectId: string): Promise<ActionResult<AutoSubtitlePlan>> {
  return asAdmin<AutoSubtitlePlan>(async (supabase) => {
    if (!isUuid(projectId)) return { ok: false, error: "This project no longer exists." };
    if (!isAiConfigured() || !isR2Configured()) return { ok: true, data: { ready: false, languages: [], present: [] } };
    const present = subtitleCodesFromKeys(await listObjectKeys(subtitlePrefix(projectId)));

    const { data, error } = await supabase
      .from("projects")
      .select("id")
      .neq("id", projectId)
      .order("is_featured", { ascending: false })
      .order("created_at", { ascending: true })
      .limit(12);
    if (error) throw new Error(error.message);
    for (const { id } of data ?? []) {
      const languages = subtitleCodesFromKeys(await listObjectKeys(subtitlePrefix(id)));
      if (languages.length > 0) return { ok: true, data: { ready: true, languages, present } };
    }
    return { ok: true, data: { ready: true, languages: DEFAULT_LANGUAGES, present } };
  });
}

// One piece of sound to timed text. The form holds "audio" (WAV), and may hold "language" and "prompt", the end of the
// previous piece, which helps the words carry on across the cut.
export async function hearSoundPiece(form: FormData): Promise<ActionResult<HeardPiece>> {
  return asAdmin(async () => {
    if (!isAiConfigured()) return { ok: false, error: "Automatic subtitles are not switched on." };
    const audio = form.get("audio");
    if (!(audio instanceof Blob) || audio.size === 0 || audio.size > MAX_PIECE_BYTES) return { ok: false, error: "That piece of sound could not be read." };
    const language = String(form.get("language") ?? "");
    const prompt = String(form.get("prompt") ?? "").slice(0, 400);
    try {
      return { ok: true, data: await hearSpeech(await audio.arrayBuffer(), { language: LANGUAGE.test(language) ? language : undefined, prompt }) };
    } catch (error) {
      console.error("[subtitles] speech failed:", error instanceof Error ? error.message : error);
      return { ok: false, error: SERVICE_DOWN, retryable: true };
    }
  });
}

// A batch of lines into another language. Null lines means the model did not keep them in step, and the browser asks again
// in smaller batches.
export async function translateSubtitleLines(lines: string[], from: string, to: string): Promise<ActionResult<{ lines: string[] | null }>> {
  return asAdmin(async () => {
    if (!isAiConfigured()) return { ok: false, error: "Automatic subtitles are not switched on." };
    const valid = Array.isArray(lines) && lines.length > 0 && lines.length <= MAX_LINES && lines.every((line) => typeof line === "string" && line.length <= 400);
    if (!valid || !LANGUAGE.test(from) || !isSubtitleCode(to)) return { ok: false, error: "Those lines could not be translated." };
    try {
      return { ok: true, data: { lines: await translateLines(lines, from, to) } };
    } catch (error) {
      console.error("[subtitles] translation failed:", error instanceof Error ? error.message : error);
      return { ok: false, error: SERVICE_DOWN, retryable: true };
    }
  });
}
