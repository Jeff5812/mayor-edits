/**
 * The contract between the portfolio UI and the data layer.
 *
 * Cards and the player read these types, never a database row. Changes go through the lead.
 */

/** Client to confirm. Adding or renaming one also touches `categories` in messages/en.json. */
export const PROJECT_CATEGORIES = [
  "brand",
  "short-form",
  "long-form",
  "documentary",
  "narrative",
  "music-video",
] as const;

export type ProjectCategory = (typeof PROJECT_CATEGORIES)[number];

export type PublicationStatus = "draft" | "published";

/** An image already sized for the web. Nothing downstream re-encodes it. */
export interface ThumbnailImage {
  /** Fallback for anything ignoring srcSet: a mid-size file, not the largest. */
  src: string;
  /** Pre-generated widths, for example "/a-480.webp 480w, /a-800.webp 800w". */
  srcSet: string;
  /** Pixel size of the largest file. Reserves the aspect ratio before the image arrives. */
  width: number;
  height: number;
  /** Dominant colour as "#rrggbb", darkened to suit the dark UI. Paints before the image arrives. */
  dominantColor: string;
  /** Focal point within this image in percent, for object-position. Always present: 50 if unset. */
  focusX: number;
  focusY: number;
}

export interface SubtitleTrack {
  id: string;
  /** BCP 47 language of the subtitle text, for example "fr". */
  language: string;
  /** Same-origin URL of a WebVTT file. Fetched only when the track is turned on. */
  src: string;
}

export interface VideoAsset {
  /**
   * Stable same-origin URL, safe in listing data. Never a signed URL. Never set on a <video> until the visitor
   * presses play. Demo: /demo/<slug>/video.mp4. Supabase: /api/playback/<versionId>, which redirects to a short-lived
   * signed URL.
   */
  src: string;
  mimeType: string;
  width?: number;
  height?: number;
  sizeBytes?: number;
}

/**
 * What `ProjectVersion.language` claims.
 * spoken: the audio is in this language.
 * subtitled: the language reaches the viewer through subtitles only. Never implies a dub.
 * none: no dialogue. `language` is "zxx".
 */
export type VersionLanguageMode = "spoken" | "subtitled" | "none";

/**
 * One uploaded cut of a project.
 *
 * `language` is about the video. It has nothing to do with the interface language the visitor is browsing in.
 */
export interface ProjectVersion {
  id: string;
  /** BCP 47, for example "en", "fr", "pt-BR". "zxx" when the cut has no dialogue. */
  language: string;
  languageMode: VersionLanguageMode;
  video: VideoAsset;
  /** Wide still for the player when this version is selected. Falls back to Project.poster. */
  poster?: ThumbnailImage;
  subtitles: SubtitleTrack[];
  /** Whole seconds. */
  durationSeconds?: number;
  metadata?: Record<string, string>;
}

export interface Project {
  id: string;
  /** Stable and URL-safe, matching ^[a-z0-9-]+$. Used for /work/[slug]. */
  slug: string;
  /** Shown as the owner wrote it. Not translated. */
  title: string;
  /** Shown as the owner wrote it. Not translated. */
  description: string;
  category: ProjectCategory;
  /** Card art, pre-cut to the card ratio at widths 480, 800 and 1200 where the source allows. Colour comes from the crop. */
  thumbnail: ThumbnailImage;
  /** Wide frame at the video's ratio for the player, at widths 1280 and 1920 where the source allows. */
  poster: ThumbnailImage;
  isFeatured: boolean;
  status: PublicationStatus;
  /** True for sample content, which must be labelled wherever it appears. */
  isDemo: boolean;
  /** Ready versions only, in the owner's order. At least one. The first is the default; the interface locale never picks. */
  versions: ProjectVersion[];
  createdAt: string;
  updatedAt: string;
}

/** Everything the public site needs. Demo and Supabase implementations are interchangeable. */
export interface PortfolioRepository {
  /** Rejects on failure. A failed read must never become an empty or sample portfolio. */
  listPublished(): Promise<Project[]>;
  /** Resolves to null only when the project truly does not exist or is unpublished. */
  getPublishedBySlug(slug: string): Promise<Project | null>;
}
