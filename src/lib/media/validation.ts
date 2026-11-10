// Client and server safe rules for what may be uploaded. Everything here is pure and tested.
import { formatBytes } from "./format";

// Also enforced by a check on the projects table (see supabase/migrations).
export const MAX_VIDEO_MB = 500;
export const MAX_VIDEO_BYTES = MAX_VIDEO_MB * 1024 * 1024;
export const VIDEO_MIME = "video/mp4";
export const VIDEO_ACCEPT = "video/mp4,.mp4";

// Each video is one file at one quality, so its bitrate decides who can watch it smoothly. The balanced setting: warn above
// this, and suggest the export below. On a connection swinging between 1 and 8 Mbps, 2 Mbps played cleanly, 4 Mbps mostly did
// and 8 Mbps kept stalling (measured 2026-11-05).
const SMOOTH_PLAYBACK_MBPS = 5;
const SUGGESTED_EXPORT = "H.264 MP4 at about 4 Mbps";

// The posters bucket refuses anything over 5 MB (see supabase/migrations).
export const POSTER_MAX_BYTES = 5 * 1024 * 1024;
// Cards load every poster on the page, so they are kept small enough not to slow it down.
export const POSTER_TARGET_BYTES = 350 * 1024;
// Sharp in the large lead card, which is about 900 CSS pixels wide on a laptop.
export const POSTER_MAX_WIDTH = 1600;
export const POSTER_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const POSTER_ACCEPT = POSTER_TYPES.join(",");

// Cloudflare R2's free allowance. Shown on the dashboard as a guide only.
export const FREE_VIDEO_STORAGE_BYTES = 10 * 1000 * 1000 * 1000;

export function extensionOf(name: string): string {
  const match = /\.([a-z0-9]+)$/i.exec(name.trim());
  return match ? match[1].toLowerCase() : "";
}

export type VideoValidation = { ok: true } | { ok: false; code: "type" | "size" | "empty"; message: string };

export function validateVideoFile(file: { name: string; type: string; size: number }, maxMb = MAX_VIDEO_MB): VideoValidation {
  // Browsers on some systems leave file.type empty, so the extension is the fallback.
  const looksLikeMp4 =
    file.type === VIDEO_MIME || ((file.type === "" || file.type === "application/octet-stream") && extensionOf(file.name) === "mp4");
  if (!looksLikeMp4) {
    return {
      ok: false,
      code: "type",
      message: `"${file.name}" is not an MP4. Please export it as an MP4 with H.264 video, the format every browser can play.`,
    };
  }

  if (file.size === 0) {
    return { ok: false, code: "empty", message: `"${file.name}" is empty. Please choose the finished export.` };
  }

  if (file.size > maxMb * 1024 * 1024) {
    return {
      ok: false,
      code: "size",
      message: `This file is ${formatBytes(file.size)}, and the limit is ${maxMb} MB per video. Export a shorter cut or a lower-bitrate version (${SUGGESTED_EXPORT} works well), then try again.`,
    };
  }

  return { ok: true };
}

// What the upload should warn about. It still goes ahead, because the owner may know better.
export function playbackWarning(sizeBytes: number, durationSeconds: number | null): string | null {
  if (durationSeconds == null) {
    return "This browser could not read the video, so some visitors may not be able to play it. H.264 video plays everywhere, while HEVC (H.265) often does not.";
  }
  if (durationSeconds <= 0) return null;
  const mbps = (sizeBytes * 8) / durationSeconds / 1_000_000;
  if (mbps <= SMOOTH_PLAYBACK_MBPS) return null;
  return `This video runs at about ${Math.round(mbps)} Mbps, so visitors on slower connections may see it stop to buffer. An export as ${SUGGESTED_EXPORT} plays more smoothly.`;
}

// A running time worth storing: whole seconds, up to a day. Anything else from a browser counts as unknown.
export const MAX_DURATION_SECONDS = 24 * 60 * 60;

export function cleanDuration(seconds: unknown): number | null {
  if (typeof seconds !== "number" || !Number.isFinite(seconds)) return null;
  const whole = Math.round(seconds);
  return whole >= 1 && whole <= MAX_DURATION_SECONDS ? whole : null;
}

// Top-level atoms a real MP4 can start with.
const ISO_BMFF_ATOMS = new Set(["ftyp", "moov", "mdat", "free", "skip", "wide"]);

// Confirms the bytes are really an MP4, so a renamed file is caught before any upload.
export function looksLikeMp4Bytes(head: Uint8Array): boolean {
  if (head.length < 8) return false;
  return ISO_BMFF_ATOMS.has(String.fromCharCode(head[4], head[5], head[6], head[7]));
}

export type PosterValidation = { ok: true } | { ok: false; message: string };

// Size is checked after resizing, so only the type can rule an image out here.
export function validatePosterFile(file: { name: string; type: string }): PosterValidation {
  if ((POSTER_TYPES as readonly string[]).includes(file.type)) return { ok: true };
  return { ok: false, message: `"${file.name}" cannot be used as a poster. Please choose a JPEG, PNG or WebP image.` };
}

// Width and height a frame or image should be drawn at: never wider than the limit, never enlarged.
export function fitWithin(width: number, height: number, maxWidth = POSTER_MAX_WIDTH) {
  if (width <= maxWidth) return { width, height };
  return { width: maxWidth, height: Math.round((height * maxWidth) / width) };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isUuid(value: string): boolean {
  return UUID.test(value);
}

// Stored file names: <project-id>/<random-uuid>.<ext>, relative to the bucket.
export function buildObjectName(projectId: string, randomId: string, ext: string): string {
  return `${projectId}/${randomId}.${ext}`;
}

// A path only counts as belonging to a project if it has exactly that shape.
export function objectBelongsToProject(path: string, projectId: string): boolean {
  const parts = path.split("/");
  return parts.length === 2 && parts[0] === projectId && /^[0-9a-f-]{36}\.[a-z0-9]+$/i.test(parts[1]);
}
