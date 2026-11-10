// Browser only. The uploads running in this tab, one per project. An upload belongs to the tab, not to the page that started
// it: Next.js keeps the pages the owner leaves alive but hidden, and drops them later, and neither may stop an upload. So the
// owner can go back to the projects or start the next one while it runs, and a project's page shows its upload whenever it is
// open. Everything about a running upload lives here: its state for the pages, the poster from its first frame, the screen
// kept awake, and the warning before the tab closes.
import { useSyncExternalStore } from "react";
import { cancelVideoUpload, failVideoUpload, finalizeVideoUpload, findDuplicateVideo, prepareVideoUpload } from "@/lib/projects/actions";
import type { Project } from "@/types/domain";
import { percentOf } from "./format";
import { attachFirstFrame } from "./poster-upload";
import { INITIAL_UPLOAD_STATE, UploadController, type UploadPhase, type UploadState, isUploadBusy } from "./upload-controller";

export class ProjectUpload {
  state: UploadState = INITIAL_UPLOAD_STATE;
  // The file this tab is sending, which a poster frame can also be taken from.
  file: File | null = null;
  readonly controller: UploadController;
  private listeners = new Set<() => void>();
  private showProject: ((project: Project) => void) | null = null;

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
        this.listeners.forEach((listener) => listener());
        tabChanged();
      },
      onProject: (project) => this.attached(project),
    });
  }

  start(file: File) {
    if (this.controller.isBusy) return;
    this.file = file;
    void this.controller.choose(file, this.project.id);
  }

  // The page showing this project hears about each change to it, even while Next.js keeps that page hidden.
  reportTo(listener: (project: Project) => void) {
    this.showProject = listener;
  }

  private update(project: Project) {
    this.project = project;
    this.showProject?.(project);
  }

  private attached(project: Project) {
    this.update(project);
    // A new video's card gets an image at once, so no published card is ever blank.
    if (project.poster_path || !this.file) return;
    attachFirstFrame(project.id, this.file)
      .then((result) => {
        if (result.ok) this.update(result.data);
        else console.error("[poster] automatic poster failed:", result.error);
      })
      // The poster panel still lets the owner add one, so this is not worth interrupting them for.
      .catch((error) => console.error("[poster] automatic poster failed:", error instanceof Error ? error.message : error));
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  read = () => this.state;
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

// A project's upload and its live state, for any page that shows that project.
export function useProjectUpload(project: Project): { upload: ProjectUpload; state: UploadState } {
  const upload = uploadFor(project);
  const state = useSyncExternalStore(upload.subscribe, upload.read, readServer);
  return { upload, state };
}

export function anyUploadBusy(): boolean {
  return [...uploads.values()].some((upload) => isUploadBusy(upload.state));
}

// Signing out ends every upload, keeping each resume point so the same file can carry on later.
export function stopAllUploads() {
  uploads.forEach((upload) => upload.controller.dispose());
  uploads.clear();
  tabChanged();
}

// What the admin header shows: each upload still going, or stopped and waiting for the owner.
export interface UploadSummary {
  projectId: string;
  phase: UploadPhase;
  percent: number;
  offline: boolean;
}

const NO_UPLOADS: UploadSummary[] = [];
let summary = NO_UPLOADS;
const summaryListeners = new Set<() => void>();

function summarise(): UploadSummary[] {
  const shown = [...uploads.entries()]
    .filter(([, upload]) => isUploadBusy(upload.state) || upload.state.phase === "failed")
    .map(([projectId, { state }]) => ({
      projectId,
      phase: state.phase,
      percent: Math.round(percentOf(state.bytesUploaded, state.bytesTotal)),
      offline: state.offline,
    }));
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
