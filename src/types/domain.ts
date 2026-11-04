// Shared data contract. Mirrors supabase/migrations/.
export type ProjectStatus = "draft" | "published";
export type UploadStatus = "none" | "uploading" | "ready" | "failed";

export interface Project {
  id: string;
  title: string;
  description: string;
  category: string;
  language: string;
  duration_seconds: number | null;
  is_featured: boolean;
  status: ProjectStatus;
  upload_status: UploadStatus;
  video_path: string | null;
  video_mime: string | null;
  video_size_bytes: number | null;
  video_fingerprint: string | null;
  poster_path: string | null;
  created_at: string;
  updated_at: string;
}

// What the public page receives: never the video's storage key.
export type PublicProject = Pick<Project, "id" | "title" | "description" | "category" | "language" | "duration_seconds" | "is_featured"> & {
  poster_url: string | null;
};
