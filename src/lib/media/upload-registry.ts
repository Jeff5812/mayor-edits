// Browser only. The uploads running in this tab, one per project. An upload belongs to the tab, not to the page that started
// it: Next.js keeps the pages the owner leaves alive but hidden, and drops them later, and neither may stop an upload. So the
// owner can go back to the projects or start the next one while it runs, and a project's page shows its upload whenever it is
// open. Everything about a running upload lives here: its state for the pages, its thumbnail, its automatic subtitles, the
// screen kept awake, and the warning before the tab closes.
import { useSyncExternalStore } from "react";
import { cancelVideoUpload, failVideoUpload, finalizeVideoUpload, findDuplicateVideo, getAdminVideoUrl, prepareVideoUpload } from "@/lib/projects/actions";
import type { Project } from "@/types/domain";
import { AutoSubtitlesOff, makeAutoSubtitles } from "./auto-subtitles";
import { prepareThumbnailImage } from "./frames";
import { percentOf } from "./format";
import { attachFirstFrame, attachPoster } from "./poster-upload";
import type { SubtitleCode } from "./subtitles";
import { INITIAL_UPLOAD_STATE, UploadController, type UploadState, isUploadBusy } from "./upload-controller";

// Automatic subtitles for one project: what they are doing now, in the owner's words.
export interface SubtitleJob {
  phase: "idle" | "working" | "done" | "failed";
  step: string | null;
  error: string | null;
  saved: SubtitleCode[];
}

const NO_JOB: SubtitleJob = { phase: "idle", step: null, error: null, saved: [] };
const CANNOT_FETCH = "The stored video could not be read from this page. Choose the video file on this device instead.";

export class ProjectUpload {
  state: UploadState = INITIAL_UPLOAD_STATE;
  subtitles: SubtitleJob = NO_JOB;
  // The file this tab is sending, which a thumbnail frame and the subtitles can also be taken from.
  file: File | null = null;
  readonly controller: UploadController;
  private listeners = new Set<() => void>();
  private showProject: ((project: Project) => void) | null = null;
  // The owner chose a thumbnail, so none is taken from the video.
  private ownThumbnail = false;

  constructor(public project: Project) {
    this.controller = new UploadController({
      server: {
        findDuplicateVideo,
        prepareVideoUpload,
        finalizeVideoUpload,
        failVideoUpload,
        cancelVideoUpload,
        ensureProject: async () => this.project,
      },
      onChange: (state) => {
        this.state = state;
        this.changed();
      },
      onProject: (project) => this.attached(project),
    });
  }

  start(file: File) {
    if (this.controller.isBusy) return;
    this.file = file;
    void this.controller.choose(file, this.project.id);
  }

  // A thumbnail the owner chose with a new video, cropped to 16:9 and saved at once. The video's own frame is then not used.
  chooseThumbnail(image: File) {
    this.ownThumbnail = true;
    prepareThumbnailImage(image)
      .then((thumbnail) => attachPoster(this.project.id, thumbnail.image))
      .then((result) => {
        if (result.ok) this.update(result.data);
        else console.error("[thumbnail] could not be saved:", result.error);
      })
      .catch((error) => console.error("[thumbnail] could not be saved:", error instanceof Error ? error.message : error));
  }

  // The page showing this project hears about each change to it, even while Next.js keeps that page hidden.
  reportTo(listener: (project: Project) => void) {
    this.showProject = listener;
  }

  private update(project: Project) {
    this.project = project;
    this.showProject?.(project);
  }

  private changed() {
    this.listeners.forEach((listener) => listener());
    tabChanged();
  }

  private attached(project: Project) {
    this.update(project);
    // A new video gets its subtitles made straight away, from the copy already on this device.
    if (this.file) void this.makeSubtitles();
    // And its card gets a picture at once, so no published card is ever blank.
    if (project.poster_path || this.ownThumbnail || !this.file) return;
    attachFirstFrame(project.id, this.file)
      .then((result) => {
        if (result.ok) this.update(result.data);
        else console.error("[thumbnail] automatic thumbnail failed:", result.error);
      })
      // The thumbnail panel still lets the owner add one, so this is not worth interrupting them for.
      .catch((error) => console.error("[thumbnail] automatic thumbnail failed:", error instanceof Error ? error.message : error));
  }

  private setSubtitles(patch: Partial<SubtitleJob>) {
    this.subtitles = { ...this.subtitles, ...patch };
    this.changed();
  }

  // Writes subtitles from the video's speech and translates them. Uses the file given, or this tab's copy of the video, and
  // otherwise fetches the stored one first. Switched off, it does nothing and says nothing.
  async makeSubtitles(file?: File) {
    if (this.subtitles.phase === "working") return;
    this.setSubtitles({ phase: "working", step: "Getting ready", error: null, saved: [] });
    try {
      const { saved } = await makeAutoSubtitles(this.project.id, () => this.sound(file), (step) => this.setSubtitles({ step }));
      this.setSubtitles({ phase: "done", step: null, saved });
    } catch (error) {
      if (error instanceof AutoSubtitlesOff) {
        this.setSubtitles(NO_JOB);
        return;
      }
      console.error("[subtitles] automatic subtitles failed:", error instanceof Error ? error.message : error);
      this.setSubtitles({ phase: "failed", step: null, error: error instanceof Error ? error.message : "The subtitles could not be made." });
    }
  }

  private async sound(file?: File): Promise<Blob> {
    const local = file ?? this.file;
    if (local) return local;
    const link = await getAdminVideoUrl(this.project.id);
    if (!link.ok) throw new Error(link.error);
    let response: Response;
    try {
      response = await fetch(link.data.url);
    } catch {
      // Also what a storage bucket that does not let this site read its files looks like.
      throw new Error(CANNOT_FETCH);
    }
    if (!response.ok || !response.body) throw new Error(CANNOT_FETCH);
    const total = Number(response.headers.get("content-length")) || this.project.video_size_bytes || 0;
    let received = 0;
    let shown = -1;
    const counted = response.body.pipeThrough(
      new TransformStream<Uint8Array, Uint8Array>({
        transform: (chunk, controller) => {
          received += chunk.length;
          const percent = Math.round(percentOf(received, total));
          if (percent !== shown) {
            shown = percent;
            this.setSubtitles({ step: `Fetching the video: ${percent}%` });
          }
          controller.enqueue(chunk);
        },
      }),
    );
    // Gathered by the browser, which can keep a big video on disk rather than in memory.
    return new Response(counted).blob();
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  read = () => this.state;
  readSubtitles = () => this.subtitles;
}

function isWorking(upload: ProjectUpload): boolean {
  return isUploadBusy(upload.state) || upload.subtitles.phase === "working";
}

const uploads = new Map<string, ProjectUpload>();

export function uploadFor(project: Project): ProjectUpload {
  let upload = uploads.get(project.id);
  if (!upload) {
    upload = new ProjectUpload(project);
    uploads.set(project.id, upload);
  }
  return upload;
}

const readServer = () => INITIAL_UPLOAD_STATE;
const readNoJob = () => NO_JOB;

// A project's upload and its live state, for any page that shows that project.
export function useProjectUpload(project: Project): { upload: ProjectUpload; state: UploadState; subtitles: SubtitleJob } {
  const upload = uploadFor(project);
  const state = useSyncExternalStore(upload.subscribe, upload.read, readServer);
  const subtitles = useSyncExternalStore(upload.subscribe, upload.readSubtitles, readNoJob);
  return { upload, state, subtitles };
}

// Whether closing the tab now would interrupt an upload or the making of subtitles.
export function anyUploadBusy(): boolean {
  return [...uploads.values()].some(isWorking);
}

// Signing out ends every upload, keeping each resume point so the same file can carry on later.
export function stopAllUploads() {
  uploads.forEach((upload) => upload.controller.dispose());
  uploads.clear();
  tabChanged();
}

// What the admin header shows: each upload still going or stopped and waiting for the owner, and any subtitles being made.
export interface UploadSummary {
  projectId: string;
  kind: "uploading" | "paused" | "offline" | "stopped" | "subtitles";
  percent: number;
}

const NO_UPLOADS: UploadSummary[] = [];
let summary = NO_UPLOADS;
const summaryListeners = new Set<() => void>();

function summarise(): UploadSummary[] {
  const shown: UploadSummary[] = [];
  for (const [projectId, { state, subtitles }] of uploads) {
    const percent = Math.round(percentOf(state.bytesUploaded, state.bytesTotal));
    if (state.phase === "failed") shown.push({ projectId, kind: "stopped", percent });
    else if (state.phase === "paused") shown.push({ projectId, kind: "paused", percent });
    else if (isUploadBusy(state)) shown.push({ projectId, kind: state.offline ? "offline" : "uploading", percent });
    else if (subtitles.phase === "working") shown.push({ projectId, kind: "subtitles", percent: 0 });
  }
  return shown.length === 0 ? NO_UPLOADS : shown;
}

function tabChanged() {
  const next = summarise();
  // Progress arrives many times a second, so the header only hears about what it would show differently.
  if (JSON.stringify(next) !== JSON.stringify(summary)) {
    summary = next;
    summaryListeners.forEach((listener) => listener());
  }
  const busy = anyUploadBusy();
  guardTab(busy);
  void keepScreenAwake(busy);
}

export function useUploadSummary(): UploadSummary[] {
  return useSyncExternalStore(
    (listener) => {
      summaryListeners.add(listener);
      return () => {
        summaryListeners.delete(listener);
      };
    },
    () => summary,
    () => NO_UPLOADS,
  );
}

// Closing or reloading the tab is the one thing that does stop an upload, so the browser asks first.
const warnBeforeLeaving = (event: BeforeUnloadEvent) => event.preventDefault();
let guarding = false;

function guardTab(on: boolean) {
  if (on === guarding) return;
  guarding = on;
  if (on) window.addEventListener("beforeunload", warnBeforeLeaving);
  else window.removeEventListener("beforeunload", warnBeforeLeaving);
}

// A phone that dims and locks its screen also stops the page, and the upload with it, so the screen stays on while one runs.
interface ScreenLock {
  release(): Promise<void>;
  addEventListener(type: "release", listener: () => void): void;
}

let lock: ScreenLock | null = null;
let requesting = false;
let wantAwake = false;
let watchingVisibility = false;

// Acts only when uploading starts or stops, not on every bit of progress.
async function keepScreenAwake(on: boolean) {
  if (on === wantAwake) return;
  wantAwake = on;
  if (!watchingVisibility) {
    watchingVisibility = true;
    // The browser lets go whenever the tab is hidden, so the screen is held again on return.
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible" && wantAwake) void holdScreen();
    });
  }
  if (on) {
    await holdScreen();
  } else if (lock) {
    const held = lock;
    lock = null;
    await held.release().catch(() => {});
  }
}

async function holdScreen() {
  const wakeLock = (navigator as Navigator & { wakeLock?: { request(type: "screen"): Promise<ScreenLock> } }).wakeLock;
  if (!wakeLock || lock || requesting || document.visibilityState !== "visible") return;
  requesting = true;
  try {
    const held = await wakeLock.request("screen");
    if (!wantAwake) {
      await held.release();
      return;
    }
    lock = held;
    held.addEventListener("release", () => {
      if (lock === held) lock = null;
    });
  } catch {
    // The browser may refuse, as on a low battery. The upload carries on either way.
  } finally {
    requesting = false;
  }
}
