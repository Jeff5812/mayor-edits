// Browser only. Posters go straight to the public bucket as the signed-in owner, and row-level security
// decides whether that is allowed. Afterwards the project is pointed at the new image.
import { setProjectPoster } from "@/lib/projects/actions";
import type { ActionResult } from "@/lib/projects/action-types";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import type { Project } from "@/types/domain";
import { explainPosterFailure } from "./failures";
import { captureVideoFrame } from "./frames";

const EXTENSIONS: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

export async function attachPoster(projectId: string, image: Blob): Promise<ActionResult<Project>> {
  const ext = EXTENSIONS[image.type] ?? "jpg";
  const path = `${projectId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await createSupabaseBrowserClient()
    .storage.from("posters")
    .upload(path, image, { contentType: image.type || "image/jpeg", cacheControl: "31536000", upsert: false });
  if (error) return { ok: false, error: explainPosterFailure(error) };
  return setProjectPoster(projectId, path);
}

// Gives a new video's card its first image, so no published card is left blank.
export async function attachFirstFrame(projectId: string, video: File): Promise<ActionResult<Project>> {
  return attachPoster(projectId, await captureVideoFrame(video));
}
