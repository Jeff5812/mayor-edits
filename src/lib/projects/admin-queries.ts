import "server-only";
import { isUuid } from "@/lib/media/validation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Project } from "@/types/domain";

// Reads for admin pages. They run as the signed-in user, so RLS applies to every one of them.
export async function listAllProjects(): Promise<Project[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("projects")
    .select("*")
    .order("is_featured", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data as Project[];
}

export async function getProjectForAdmin(id: string): Promise<Project | null> {
  if (!isUuid(id)) return null;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("projects").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return data as Project | null;
}

export function totalVideoBytes(projects: Pick<Project, "video_size_bytes">[]): number {
  return projects.reduce((sum, project) => sum + (project.video_size_bytes ?? 0), 0);
}
