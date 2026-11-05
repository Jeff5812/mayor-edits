// Browser side of /api/playback/[id]. Nothing calls this until a visitor asks to watch.
import { type SubtitleCode, isSubtitleCode } from "./subtitles";

export type PlaybackFailure = "unavailable" | "network";

export class PlaybackError extends Error {
  constructor(public kind: PlaybackFailure) {
    super(kind === "unavailable" ? "This video is not available." : "The video service could not be reached.");
    this.name = "PlaybackError";
  }
}

export async function fetchPlaybackUrl(projectId: string, signal?: AbortSignal): Promise<string> {
  let response: Response;
  try {
    response = await fetch(`/api/playback/${encodeURIComponent(projectId)}`, { cache: "no-store", signal });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new PlaybackError("network");
  }
  // Any answer other than a link means the server is up and will not play this right now.
  if (!response.ok) throw new PlaybackError("unavailable");
  const body: unknown = await response.json().catch(() => null);
  const url = (body as { url?: unknown } | null)?.url;
  if (typeof url !== "string" || !url) throw new PlaybackError("unavailable");
  return url;
}

// Which languages this video has subtitles in. Separate from the video's link, so any fault here costs the visitor the
// subtitle button and never the video.
export async function fetchSubtitleLanguages(projectId: string, signal?: AbortSignal): Promise<SubtitleCode[]> {
  try {
    const response = await fetch(`/api/subtitles/${encodeURIComponent(projectId)}`, { signal });
    if (!response.ok) return [];
    const body: unknown = await response.json();
    const languages = (body as { languages?: unknown } | null)?.languages;
    return Array.isArray(languages) ? languages.filter((code): code is SubtitleCode => typeof code === "string" && isSubtitleCode(code)) : [];
  } catch {
    return [];
  }
}
