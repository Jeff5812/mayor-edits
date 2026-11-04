import { supabaseUrl } from "@/lib/supabase/env";

// Posters sit in a public bucket, so their address is safe to build anywhere.
export function posterUrl(posterPath: string | null): string | null {
  if (!posterPath || !supabaseUrl) return null;
  const encoded = posterPath.split("/").map(encodeURIComponent).join("/");
  return `${supabaseUrl.replace(/\/$/, "")}/storage/v1/object/public/posters/${encoded}`;
}
