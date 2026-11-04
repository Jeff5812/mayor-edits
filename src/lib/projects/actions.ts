"use server";

import type { SupabaseClient } from "@supabase/supabase-js";
import { revalidatePath, updateTag } from "next/cache";
import { assertAdmin } from "@/lib/auth/admin";
import type { UploadPlan, UploadTarget } from "@/lib/media/multipart-session";
import { partCount, partSize } from "@/lib/media/parts";
import {
  abortMultipartUpload,
  completeMultipartUpload,
  createMultipartUpload,
  deleteObject,
  isR2Configured,
  listObjectKeys,
  listUploadedParts,
  signGetUrl,
  signPartUrl,
  storedObjectSize,
} from "@/lib/media/r2";
import { MAX_VIDEO_BYTES, MAX_VIDEO_MB, VIDEO_MIME, buildObjectName, isUuid, objectBelongsToProject } from "@/lib/media/validation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Project } from "@/types/domain";
import type { ActionFailure, ActionResult, DuplicateProject, FinalizeVideoInput, PrepareVideoInput } from "./action-types";
import { PORTFOLIO_TAG } from "./portfolio-tag";
import { type ProjectInput, parseProjectInput } from "./schema";

const POSTER_BUCKET = "posters";
// Long enough for a 500 MB upload on a very slow connection. Each link only fits one part of one upload.
const PART_LINK_SECONDS = 24 * 60 * 60;
const PREVIEW_LINK_SECONDS = 60 * 60;

const SESSION_ENDED = "Your admin session has ended. Please sign in again.";
const NOT_FOUND = "This project no longer exists. It may have been deleted in another tab.";
const STORAGE_NOT_CONNECTED = "Video storage is not connected yet, so this cannot be done. The R2 settings need adding to the site.";
const STORAGE_UNAVAILABLE = "Video storage could not be reached. Please try again in a moment.";

type Supabase = SupabaseClient;

// Every exported action starts here, so nothing runs for anyone but an administrator.
async function asAdmin<T>(run: (supabase: Supabase) => Promise<ActionResult<T>>): Promise<ActionResult<T>> {
  try {
    await assertAdmin();
  } catch {
    return { ok: false, error: SESSION_ENDED };
  }
  try {
    return await run(await createSupabaseServerClient());
  } catch (error) {
    console.error("[admin] action failed:", error instanceof Error ? error.message : error);
    return { ok: false, error: "Something went wrong. Please try again in a moment." };
  }
}

// The public page and the admin both show fresh data straight after any change.
function refreshEverything() {
  updateTag(PORTFOLIO_TAG);
  refreshAdmin();
}

function refreshAdmin() {
  revalidatePath("/admin", "layout");
}

function failedWrite(context: string, message: string): ActionFailure {
  console.error(`[admin] ${context}:`, message);
  return { ok: false, error: `${context}. Please try again in a moment.` };
}

async function getProject(supabase: Supabase, id: string): Promise<Project | null> {
  if (!isUuid(id)) return null;
  const { data, error } = await supabase.from("projects").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return data as Project | null;
}

export async function createProject(input: ProjectInput): Promise<ActionResult<Project>> {
  return asAdmin(async (supabase) => {
    const parsed = parseProjectInput(input);
    if (!parsed.ok) return { ok: false, error: "Please fix the highlighted fields.", fieldErrors: parsed.fieldErrors };

    const { data, error } = await supabase.from("projects").insert(parsed.data).select("*").single();
    if (error) return failedWrite("The project could not be saved", error.message);

    refreshEverything();
    return { ok: true, data: data as Project };
  });
}

export async function updateProject(id: string, input: ProjectInput): Promise<ActionResult<Project>> {
  return asAdmin(async (supabase) => {
    const parsed = parseProjectInput(input);
    if (!parsed.ok) return { ok: false, error: "Please fix the highlighted fields.", fieldErrors: parsed.fieldErrors };
    if (!isUuid(id)) return { ok: false, error: NOT_FOUND };

    const { data, error } = await supabase.from("projects").update(parsed.data).eq("id", id).select("*").maybeSingle();
    if (error) return failedWrite("The project could not be saved", error.message);
    if (!data) return { ok: false, error: NOT_FOUND };

    refreshEverything();
    return { ok: true, data: data as Project };
  });
}

export async function setProjectPublished(id: string, publish: boolean): Promise<ActionResult<Project>> {
  return asAdmin(async (supabase) => {
    const project = await getProject(supabase, id);
    if (!project) return { ok: false, error: NOT_FOUND };

    const needsVideo = "This project needs a finished video before it can be published. Upload one and wait for it to finish.";
    if (publish && (!project.video_path || project.upload_status !== "ready")) return { ok: false, error: needsVideo };

    const { data, error } = await supabase
      .from("projects")
      .update({ status: publish ? "published" : "draft" })
      .eq("id", id)
      .select("*")
      .single();
    if (error) {
      // The database enforces the same rule, in case the upload state changed a moment ago.
      if (error.code === "23514") return { ok: false, error: needsVideo };
      return failedWrite("The project could not be updated", error.message);
    }

    refreshEverything();
    return { ok: true, data: data as Project };
  });
}

export async function setProjectFeatured(id: string, featured: boolean): Promise<ActionResult> {
  return asAdmin(async (supabase) => {
    if (!isUuid(id)) return { ok: false, error: NOT_FOUND };
    const { error } = await supabase.from("projects").update({ is_featured: featured }).eq("id", id);
    if (error) return failedWrite("The project could not be updated", error.message);
    refreshEverything();
    return { ok: true, data: undefined };
  });
}

// Everything stored under a project's folder in the posters bucket, including replaced images.
async function listPosters(supabase: Supabase, projectId: string): Promise<string[]> {
  const { data, error } = await supabase.storage.from(POSTER_BUCKET).list(projectId, { limit: 1000 });
  if (error) throw new Error(`posters: ${error.message}`);
  return (data ?? []).filter((item) => item.id !== null).map((item) => `${projectId}/${item.name}`);
}

// Removes posters and then looks again, because storage reports no error for files it skipped.
async function removePosters(supabase: Supabase, projectId: string, paths: string[]): Promise<string[]> {
  if (paths.length === 0) return [];
  const { error } = await supabase.storage.from(POSTER_BUCKET).remove(paths);
  if (error) return paths;
  const remaining = new Set(await listPosters(supabase, projectId));
  return paths.filter((path) => remaining.has(path));
}

export async function deleteProject(id: string): Promise<ActionResult> {
  return asAdmin(async (supabase) => {
    const project = await getProject(supabase, id);
    if (!project) return { ok: false, error: NOT_FOUND };
    if (project.video_path && !isR2Configured()) return { ok: false, error: STORAGE_NOT_CONNECTED };

    // Take it off the public page first, so no visitor sees a card with a missing video.
    if (project.status === "published") {
      const { error } = await supabase.from("projects").update({ status: "draft" }).eq("id", id);
      if (error) return failedWrite("The project could not be taken offline", error.message);
      refreshEverything();
    }

    try {
      if (isR2Configured()) {
        const videos = new Set(await listObjectKeys(`${id}/`));
        if (project.video_path) videos.add(project.video_path);
        await Promise.all([...videos].map((key) => deleteObject(key)));
      }
      const posters = new Set(await listPosters(supabase, id));
      if (project.poster_path) posters.add(project.poster_path);
      const left = await removePosters(supabase, id, [...posters]);
      if (left.length > 0) throw new Error(`posters left behind: ${left.join(", ")}`);
    } catch (error) {
      console.error("[admin] file cleanup failed:", error instanceof Error ? error.message : error);
      return { ok: false, error: "The project's files could not all be removed, so it was kept as a draft. Please try again." };
    }

    const { error } = await supabase.from("projects").delete().eq("id", id);
    if (error) return failedWrite("The files were removed but the project could not be deleted", error.message);

    refreshEverything();
    return { ok: true, data: undefined };
  });
}

export async function findDuplicateVideo(
  fingerprint: string,
  projectId: string | null,
): Promise<ActionResult<{ duplicate: DuplicateProject | null; isCurrentVideo: boolean }>> {
  return asAdmin<{ duplicate: DuplicateProject | null; isCurrentVideo: boolean }>(async (supabase) => {
    const { data, error } = await supabase.from("projects").select("id, title").eq("video_fingerprint", fingerprint).maybeSingle();
    if (error) return failedWrite("The file could not be checked against existing videos", error.message);
    if (!data) return { ok: true, data: { duplicate: null, isCurrentVideo: false } };
    if (data.id === projectId) return { ok: true, data: { duplicate: null, isCurrentVideo: true } };
    return { ok: true, data: { duplicate: data as DuplicateProject, isCurrentVideo: false } };
  });
}

// Says what is left to send, with a signed link for each part: the whole file for a new upload, or only
// the missing parts when carrying on with one R2 still has.
// A project that already has a video keeps its state, because that video stays live until the new one
// has fully arrived. (A published row could not be marked 'uploading' anyway: the database requires
// published projects to be 'ready'.)
export async function prepareVideoUpload(input: PrepareVideoInput): Promise<ActionResult<UploadPlan>> {
  return asAdmin(async (supabase) => {
    const { projectId, sizeBytes, target } = input;
    if (!isR2Configured()) return { ok: false, error: STORAGE_NOT_CONNECTED };
    if (!Number.isSafeInteger(sizeBytes) || sizeBytes <= 0 || sizeBytes > MAX_VIDEO_BYTES) {
      return { ok: false, error: `Videos can be up to ${MAX_VIDEO_MB} MB.` };
    }
    const project = await getProject(supabase, projectId);
    if (!project) return { ok: false, error: NOT_FOUND };

    if (!project.video_path && project.upload_status !== "uploading") {
      const { error } = await supabase.from("projects").update({ upload_status: "uploading" }).eq("id", projectId);
      if (error) return failedWrite("The upload could not be started", error.message);
      refreshAdmin();
    }

    try {
      const existing =
        target && objectBelongsToProject(target.objectName, projectId) ? await listUploadedParts(target.objectName, target.uploadId) : null;

      let current: UploadTarget;
      if (target && existing) {
        current = { objectName: target.objectName, uploadId: target.uploadId };
      } else {
        const objectName = buildObjectName(projectId, crypto.randomUUID(), "mp4");
        current = { objectName, uploadId: await createMultipartUpload(objectName, VIDEO_MIME) };
      }

      const uploaded = (existing ?? []).filter((part) => part.size === partSize(sizeBytes, part.partNumber)).map((part) => part.partNumber);
      const held = new Set(uploaded);
      const urls: Record<number, string> = {};
      for (let part = 1; part <= partCount(sizeBytes); part += 1) {
        if (!held.has(part)) urls[part] = await signPartUrl(current.objectName, current.uploadId, part, PART_LINK_SECONDS);
      }
      return { ok: true, data: { ...current, uploaded, urls } };
    } catch (error) {
      console.error("[upload] could not prepare:", error instanceof Error ? error.message : error);
      return { ok: false, error: STORAGE_UNAVAILABLE };
    }
  });
}

export async function finalizeVideoUpload(input: FinalizeVideoInput): Promise<ActionResult<Project>> {
  return asAdmin(async (supabase) => {
    const { projectId, objectName, uploadId, sizeBytes, fingerprint, durationSeconds } = input;
    if (!objectBelongsToProject(objectName, projectId)) {
      return { ok: false, error: "The upload details did not match this project, so it was not attached." };
    }
    if (!isR2Configured()) return { ok: false, error: STORAGE_NOT_CONNECTED };
    const project = await getProject(supabase, projectId);
    if (!project) return { ok: false, error: NOT_FOUND };

    // Only trust the browser's word once storage confirms the file arrived in full. A file already
    // there means an earlier attempt finished it and only the database step failed.
    let storedSize: number | null;
    try {
      storedSize = await storedObjectSize(objectName);
      if (storedSize === null) {
        const parts = await listUploadedParts(objectName, uploadId);
        if (!parts) {
          return { ok: false, error: "Storage no longer has this upload. Please cancel and choose the video again." };
        }
        const complete = parts.length === partCount(sizeBytes) && parts.every((part) => part.size === partSize(sizeBytes, part.partNumber));
        if (!complete) return { ok: false, error: "Some of the video has not arrived. Choose Retry to send the rest.", resend: true };
        await completeMultipartUpload(objectName, uploadId, parts);
        storedSize = await storedObjectSize(objectName);
      }
    } catch (error) {
      console.error("[upload] could not finish:", error instanceof Error ? error.message : error);
      return { ok: false, error: STORAGE_UNAVAILABLE };
    }

    if (storedSize !== sizeBytes) {
      await deleteObject(objectName);
      return { ok: false, error: "The stored file is a different size from the original, so it was discarded. Please cancel and choose the video again." };
    }

    const { data, error } = await supabase
      .from("projects")
      .update({
        video_path: objectName,
        video_mime: VIDEO_MIME,
        video_size_bytes: sizeBytes,
        video_fingerprint: fingerprint,
        upload_status: "ready",
        duration_seconds: durationSeconds ?? project.duration_seconds,
      })
      .eq("id", projectId)
      .select("*")
      .single();

    if (error) {
      if (error.code === "23505" && error.message.includes("fingerprint")) {
        await deleteObject(objectName);
        await supabase
          .from("projects")
          .update({ upload_status: project.video_path ? "ready" : "none" })
          .eq("id", projectId);
        const { data: existing } = await supabase.from("projects").select("id, title").eq("video_fingerprint", fingerprint).maybeSingle();
        return {
          ok: false,
          error: "This video is already used by another project, so this copy was removed.",
          duplicate: (existing as DuplicateProject | null) ?? undefined,
        };
      }
      return failedWrite("The video arrived but could not be attached to the project", error.message);
    }

    refreshEverything();

    // The new video is live, so the old file can go now. A failure here must not look like a failed upload.
    if (project.video_path && project.video_path !== objectName) {
      try {
        await deleteObject(project.video_path);
      } catch (cleanupError) {
        console.error("[upload] old file left behind:", cleanupError instanceof Error ? cleanupError.message : cleanupError);
        return { ok: true, data: data as Project, notice: "The new video is live, but the old file could not be removed from storage." };
      }
    }

    return { ok: true, data: data as Project };
  });
}

export async function failVideoUpload(projectId: string): Promise<ActionResult> {
  return asAdmin(async (supabase) => {
    const project = await getProject(supabase, projectId);
    if (!project) return { ok: false, error: NOT_FOUND };
    if (!project.video_path) {
      const { error } = await supabase.from("projects").update({ upload_status: "failed" }).eq("id", projectId);
      if (error) return failedWrite("The upload state could not be saved", error.message);
    }
    refreshAdmin();
    return { ok: true, data: undefined };
  });
}

// Discards what a cancelled upload sent and puts the project back as it was.
export async function cancelVideoUpload(projectId: string, target: UploadTarget | null): Promise<ActionResult> {
  return asAdmin(async (supabase) => {
    const project = await getProject(supabase, projectId);
    if (!project) return { ok: false, error: NOT_FOUND };

    let problem = false;
    if (target && objectBelongsToProject(target.objectName, projectId) && target.objectName !== project.video_path && isR2Configured()) {
      try {
        await abortMultipartUpload(target.objectName, target.uploadId);
        await deleteObject(target.objectName);
      } catch (error) {
        // R2 drops unfinished uploads by itself after 7 days, so this is not fatal.
        console.error("[upload] storage did not confirm the cancel:", error instanceof Error ? error.message : error);
        problem = true;
      }
    }

    const { error } = await supabase
      .from("projects")
      .update({ upload_status: project.video_path ? "ready" : "none" })
      .eq("id", projectId);
    if (error) return failedWrite("The upload state could not be reset", error.message);

    refreshAdmin();
    if (problem) return { ok: true, data: undefined, notice: "The upload stopped. Storage will discard the unfinished file by itself within 7 days." };
    return { ok: true, data: undefined };
  });
}

export async function setProjectPoster(projectId: string, posterPath: string): Promise<ActionResult<Project>> {
  return asAdmin(async (supabase) => {
    if (!objectBelongsToProject(posterPath, projectId)) {
      return { ok: false, error: "The poster details did not match this project, so it was not attached." };
    }
    const project = await getProject(supabase, projectId);
    if (!project) return { ok: false, error: NOT_FOUND };

    const { data, error } = await supabase.from("projects").update({ poster_path: posterPath }).eq("id", projectId).select("*").single();
    if (error) return failedWrite("The poster could not be saved", error.message);

    refreshEverything();

    if (project.poster_path && project.poster_path !== posterPath) {
      const left = await removePosters(supabase, projectId, [project.poster_path]);
      if (left.length > 0) {
        return { ok: true, data: data as Project, notice: "The new poster is live, but the old image could not be removed." };
      }
    }
    return { ok: true, data: data as Project };
  });
}

export async function removeProjectPoster(projectId: string): Promise<ActionResult<Project>> {
  return asAdmin(async (supabase) => {
    const project = await getProject(supabase, projectId);
    if (!project) return { ok: false, error: NOT_FOUND };
    if (!project.poster_path) return { ok: true, data: project };

    const left = await removePosters(supabase, projectId, [project.poster_path]);
    if (left.length > 0) return { ok: false, error: "The poster could not be removed. Please try again." };
    const { data, error } = await supabase.from("projects").update({ poster_path: null }).eq("id", projectId).select("*").single();
    if (error) return failedWrite("The poster could not be removed", error.message);

    refreshEverything();
    return { ok: true, data: data as Project };
  });
}

// Lets the admin watch a draft. Reads only, but it still exposes an unpublished video, so it is guarded too.
export async function getAdminVideoUrl(projectId: string): Promise<ActionResult<{ url: string }>> {
  return asAdmin(async (supabase) => {
    const project = await getProject(supabase, projectId);
    if (!project?.video_path) return { ok: false, error: "This project has no finished video yet." };
    if (!isR2Configured()) return { ok: false, error: STORAGE_NOT_CONNECTED };
    try {
      return { ok: true, data: { url: await signGetUrl(project.video_path, PREVIEW_LINK_SECONDS) } };
    } catch (error) {
      console.error("[admin] could not sign a preview:", error instanceof Error ? error.message : error);
      return { ok: false, error: STORAGE_UNAVAILABLE };
    }
  });
}
