import { signGetUrl } from "@/lib/media/r2";
import { isUuid } from "@/lib/media/validation";
import { createSupabasePublicClient } from "@/lib/supabase/server";

// Long enough to watch the longest video without interruption. The player fetches a new link if one
// expires, for example after a long pause, and only ever while the project is published.
const SIGNED_URL_SECONDS = 60 * 60;
const NO_STORE = { "Cache-Control": "private, no-store, max-age=0" };

function notFound() {
  return Response.json({ error: "not_found" }, { status: 404, headers: NO_STORE });
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) return notFound();

  try {
    // The anonymous client: RLS exposes only published rows, so unpublishing stops new links at once.
    const { data: project, error } = await createSupabasePublicClient()
      .from("projects")
      .select("video_path")
      .eq("id", id)
      .eq("status", "published")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!project?.video_path) return notFound();

    const url = await signGetUrl(project.video_path, SIGNED_URL_SECONDS);
    return Response.json({ url, expiresAt: new Date(Date.now() + SIGNED_URL_SECONDS * 1000).toISOString() }, { headers: NO_STORE });
  } catch (error) {
    console.error("[playback] could not sign video:", error instanceof Error ? error.message : error);
    return Response.json({ error: "unavailable" }, { status: 503, headers: NO_STORE });
  }
}
