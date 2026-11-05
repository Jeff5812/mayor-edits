import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { posterUrl } from "@/lib/media/poster-url";
import { createSupabasePublicClient } from "@/lib/supabase/server";
import type { PublicProject } from "@/types/domain";
import { PORTFOLIO_TAG } from "./portfolio-tag";

// Never add video_path here: the public page receives only what is listed, and playback goes through
// /api/playback/[id].
const PUBLIC_COLUMNS = "id, title, description, category, language, duration_seconds, is_featured, poster_path";

const QUERY_TIMEOUT_MS = 8_000;

interface PublicProjectRow extends Omit<PublicProject, "poster_url"> {
  poster_path: string | null;
}

// For the routes that serve a project's extras. RLS exposes only published rows, so unpublishing stops them at once.
export async function isPublishedProject(id: string): Promise<boolean> {
  const { data, error } = await createSupabasePublicClient().from("projects").select("id").eq("id", id).eq("status", "published").maybeSingle();
  if (error) throw new Error(error.message);
  return Boolean(data);
}

// Rejects on failure, so an outage shows an error state and never an empty portfolio. Cached until an
// admin change expires the tag, which also means ordinary visits never touch the database.
export async function getPublishedProjects(): Promise<PublicProject[]> {
  "use cache";
  cacheLife("max");
  cacheTag(PORTFOLIO_TAG);

  const { data, error } = await createSupabasePublicClient()
    .from("projects")
    .select(PUBLIC_COLUMNS)
    .eq("status", "published")
    .order("is_featured", { ascending: false })
    .order("created_at", { ascending: false })
    .abortSignal(AbortSignal.timeout(QUERY_TIMEOUT_MS));
  if (error) throw new Error(`The portfolio could not be loaded: ${error.message}`);

  return (data as PublicProjectRow[]).map(({ poster_path, ...row }) => ({ ...row, poster_url: posterUrl(poster_path) }));
}
