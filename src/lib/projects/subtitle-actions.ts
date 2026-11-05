"use server";

import { deleteObject, isR2Configured, listObjectKeys, putTextObject } from "@/lib/media/r2";
import { SUBTITLE_MAX_BYTES, type SubtitleCode, isSubtitleCode, subtitleCodesFromKeys, subtitleKey, subtitlePrefix, toWebVtt } from "@/lib/media/subtitles";
import { isUuid } from "@/lib/media/validation";
import type { ActionResult } from "./action-types";
import { asAdmin } from "./as-admin";

const NOT_FOUND = "This project no longer exists. It may have been deleted in another tab.";
const NOT_CONNECTED = "Video storage is not connected yet, so subtitles cannot be changed.";
const UNAVAILABLE = "Video storage could not be reached. Please try again in a moment.";

async function presentLanguages(projectId: string): Promise<SubtitleCode[]> {
  return subtitleCodesFromKeys(await listObjectKeys(subtitlePrefix(projectId)));
}

export async function listProjectSubtitles(projectId: string): Promise<ActionResult<SubtitleCode[]>> {
  return asAdmin(async () => {
    if (!isUuid(projectId)) return { ok: false, error: NOT_FOUND };
    if (!isR2Configured()) return { ok: true, data: [] };
    try {
      return { ok: true, data: await presentLanguages(projectId) };
    } catch (error) {
      console.error("[subtitles] could not list:", error instanceof Error ? error.message : error);
      return { ok: false, error: UNAVAILABLE };
    }
  });
}

// Choosing a language that already has subtitles replaces them.
export async function saveProjectSubtitle(projectId: string, code: string, text: string): Promise<ActionResult<SubtitleCode[]>> {
  return asAdmin(async (supabase) => {
    if (!isSubtitleCode(code)) return { ok: false, error: "That language is not on the list." };
    if (!isUuid(projectId)) return { ok: false, error: NOT_FOUND };
    if (!isR2Configured()) return { ok: false, error: NOT_CONNECTED };

    // The browser checks this first for a quick answer, but only this check counts.
    const converted = toWebVtt(text);
    if (!converted.ok) return { ok: false, error: converted.message };
    if (new TextEncoder().encode(converted.vtt).length > SUBTITLE_MAX_BYTES) {
      return { ok: false, error: "This subtitle file is too large. Please check that it is the right file." };
    }

    const { data, error } = await supabase.from("projects").select("id").eq("id", projectId).maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return { ok: false, error: NOT_FOUND };

    try {
      await putTextObject(subtitleKey(projectId, code), converted.vtt, "text/vtt; charset=utf-8");
      return { ok: true, data: await presentLanguages(projectId) };
    } catch (problem) {
      console.error("[subtitles] could not save:", problem instanceof Error ? problem.message : problem);
      return { ok: false, error: UNAVAILABLE };
    }
  });
}

export async function removeProjectSubtitle(projectId: string, code: string): Promise<ActionResult<SubtitleCode[]>> {
  return asAdmin(async () => {
    if (!isSubtitleCode(code)) return { ok: false, error: "That language is not on the list." };
    if (!isUuid(projectId)) return { ok: false, error: NOT_FOUND };
    if (!isR2Configured()) return { ok: false, error: NOT_CONNECTED };
    try {
      await deleteObject(subtitleKey(projectId, code));
      return { ok: true, data: await presentLanguages(projectId) };
    } catch (problem) {
      console.error("[subtitles] could not remove:", problem instanceof Error ? problem.message : problem);
      return { ok: false, error: UNAVAILABLE };
    }
  });
}
