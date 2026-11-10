// Browser only. The whole journey of one video: check it, record it, send it, attach it. Written as a
// plain class with its server calls passed in, so a browser test can drive the real upload code
// against a stand-in storage server, with no administrator or live project involved.
import type { ActionResult, DuplicateProject, FinalizeVideoInput, PrepareVideoInput } from "@/lib/projects/action-types";
import type { Project } from "@/types/domain";
import { UNREADABLE_FILE, explainFailure, isFileReadError, isNetworkFailure } from "./failures";
import { fingerprintFile } from "./fingerprint";
import { readVideoDuration } from "./frames";
import { nextSpeed, remainingSeconds } from "./format";
import { MultipartSession, type MultipartSessionOptions, type UploadPlan, type UploadTarget } from "./multipart-session";
import { type VideoValidation, looksLikeMp4Bytes, playbackWarning, validateVideoFile } from "./validation";

export interface UploadServer {
  findDuplicateVideo(
    fingerprint: string,
    projectId: string | null,
  ): Promise<ActionResult<{ duplicate: DuplicateProject | null; isCurrentVideo: boolean }>>;
  // Creates the draft on first use. Null means the details need fixing first, and the form says why.
  ensureProject(): Promise<Project | null>;
  prepareVideoUpload(input: PrepareVideoInput): Promise<ActionResult<UploadPlan>>;
  finalizeVideoUpload(input: FinalizeVideoInput): Promise<ActionResult<Project>>;
  failVideoUpload(projectId: string): Promise<ActionResult>;
  cancelVideoUpload(projectId: string, target: UploadTarget | null): Promise<ActionResult>;
}

export type UploadPhase =
  | "idle"
  | "checking" // validating and fingerprinting the file
  | "uploading"
  | "paused"
  | "attaching" // the bytes arrived; recording them on the project
  | "failed"
  | "cancelling"
  | "done";

export interface UploadState {
  phase: UploadPhase;
  fileName: string | null;
  bytesUploaded: number;
  bytesTotal: number;
  bytesPerSecond: number | null;
  secondsLeft: number | null;
  error: string | null;
  warning: string | null;
  notice: string | null;
  duplicate: DuplicateProject | null;
  // True when a failed step can be tried again without choosing the file again.
  canRetry: boolean;
  // True while the connection is gone and the upload waits to carry on by itself.
  offline: boolean;
}

export const INITIAL_UPLOAD_STATE: UploadState = {
  phase: "idle",
  fileName: null,
  bytesUploaded: 0,
  bytesTotal: 0,
  bytesPerSecond: null,
  secondsLeft: null,
  error: null,
  warning: null,
  notice: null,
  duplicate: null,
  canRetry: false,
  offline: false,
};

// Phases in which leaving would interrupt something.
const BUSY_PHASES: UploadPhase[] = ["checking", "uploading", "paused", "attaching", "cancelling"];

export function isUploadBusy(state: UploadState): boolean {
  return BUSY_PHASES.includes(state.phase);
}

export interface UploadControllerOptions {
  server: UploadServer;
  maxVideoMb?: number;
  onChange: (state: UploadState) => void;
  onProject: (project: Project) => void;
  // Lets tests replace the session; everything else uses the real one.
  createSession?: (
    options: MultipartSessionOptions,
  ) => Pick<MultipartSession, "start" | "pause" | "resume" | "cancel" | "finish" | "objectName" | "uploadId">;
}

const SPEED_SAMPLE_MS = 500;
// A connection's first seconds are slow and say little about the rest, so no time is promised until these have passed.
const ESTIMATE_AFTER_MS = 6000;

async function canStillRead(file: Blob): Promise<boolean> {
  try {
    await file.slice(0, 1).arrayBuffer();
    return true;
  } catch (error) {
    return !isFileReadError(error);
  }
}

export class UploadController {
  private state: UploadState = INITIAL_UPLOAD_STATE;
  private session: ReturnType<NonNullable<UploadControllerOptions["createSession"]>> | null = null;
  private projectId: string | null = null;
  private file: File | null = null;
  private fingerprint = "";
  private durationSeconds: number | null = null;
  private sendingSince: number | null = null;
  private lastSampleAt = 0;
  private lastSampleBytes = 0;
  // Bumped by cancel and by each new file, so a late answer from an older attempt is ignored.
  private attempt = 0;

  constructor(private options: UploadControllerOptions) {}

  private set(patch: Partial<UploadState>) {
    this.state = { ...this.state, ...patch };
    this.options.onChange(this.state);
  }

  get current() {
    return this.state;
  }

  // Whether leaving the page now would interrupt something.
  get isBusy() {
    return isUploadBusy(this.state);
  }

  async choose(file: File, currentProjectId: string | null): Promise<void> {
    if (this.isBusy) return;
    const attempt = ++this.attempt;
    const stale = () => attempt !== this.attempt;

    this.session = null;
    this.projectId = null;
    this.state = { ...INITIAL_UPLOAD_STATE, phase: "checking", fileName: file.name, bytesTotal: file.size };
    this.options.onChange(this.state);

    const validation: VideoValidation = validateVideoFile(file, this.options.maxVideoMb);
    if (!validation.ok) {
      this.set({ phase: "failed", error: validation.message });
      return;
    }

    try {
      const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
      if (!looksLikeMp4Bytes(head)) {
        this.set({
          phase: "failed",
          error: `"${file.name}" does not look like a real MP4 file, even though it is named like one. Please export it again.`,
        });
        return;
      }

      const fingerprint = await fingerprintFile(file);
      if (stale()) return;
      const check = await this.options.server.findDuplicateVideo(fingerprint, currentProjectId);
      if (stale()) return;
      if (!check.ok) {
        this.set({ phase: "failed", error: check.error });
        return;
      }
      if (check.data.isCurrentVideo) {
        this.set({ phase: "done", notice: "This file is already this project's video, so there was nothing to upload." });
        return;
      }
      if (check.data.duplicate) {
        this.set({ phase: "failed", duplicate: check.data.duplicate, error: "This video has already been uploaded." });
        return;
      }

      const project = await this.options.server.ensureProject();
      if (stale()) return;
      if (!project) {
        this.set({ phase: "failed", error: "Please fix the highlighted details first, then choose the video again." });
        return;
      }

      this.file = file;
      this.fingerprint = fingerprint;
      this.projectId = project.id;
      this.durationSeconds = await readVideoDuration(file);
      if (stale()) return;
      this.set({ warning: playbackWarning(file.size, this.durationSeconds) });

      this.startSession();
    } catch (error) {
      if (stale()) return;
      if (isFileReadError(error)) {
        this.set({ phase: "failed", error: UNREADABLE_FILE, canRetry: false });
        return;
      }
      console.error("[upload] could not start:", error instanceof Error ? error.message : error);
      this.set({
        phase: "failed",
        error: explainFailure("The upload could not be started.", error),
        canRetry: false,
      });
    }
  }

  private startSession() {
    const file = this.file;
    const projectId = this.projectId;
    if (!file || !projectId) return;
    const attempt = this.attempt;
    const create = this.options.createSession ?? ((options: MultipartSessionOptions) => new MultipartSession(options));

    this.sendingSince = null;
    this.set({ phase: "uploading", bytesUploaded: 0, bytesPerSecond: null, secondsLeft: null, error: null, canRetry: false, offline: false });

    const session = create({
      file,
      resumeKey: `${projectId}:${this.fingerprint}`,
      prepare: (target) => this.options.server.prepareVideoUpload({ projectId, sizeBytes: file.size, target }),
      onProgress: (uploaded, total) => {
        if (attempt === this.attempt) this.recordProgress(uploaded, total);
      },
      onSuccess: () => {
        if (attempt === this.attempt) void this.attach();
      },
      onError: (message) => {
        if (attempt === this.attempt) void this.handleFailure(message);
      },
      onConnection: (connected) => {
        if (attempt !== this.attempt) return;
        // The time without a connection says nothing about the speed, so the estimate starts again.
        this.sendingSince = null;
        this.set({ offline: !connected, bytesPerSecond: null, secondsLeft: null });
      },
    });
    this.session = session;
    session.start().catch((error: unknown) => {
      console.error("[upload] session failed to start:", error instanceof Error ? error.message : error);
      if (attempt === this.attempt) void this.handleFailure("The upload could not be started. Please choose Retry.");
    });
  }

  private recordProgress(uploaded: number, total: number) {
    const now = performance.now();
    // Preparing is not sending, so the clock starts with the first report. That report also carries whatever an
    // earlier attempt delivered, which this one did not send.
    if (this.sendingSince === null) {
      this.sendingSince = now;
      this.lastSampleAt = now;
      this.lastSampleBytes = uploaded;
    }
    // Resuming restarts from what storage confirmed, which can be lower than the bar had reached.
    // The speed only counts bytes moving forward, so that step back does not distort the estimate.
    const elapsed = now - this.lastSampleAt;
    let speed = this.state.bytesPerSecond;
    if (elapsed >= SPEED_SAMPLE_MS) {
      const moved = uploaded - this.lastSampleBytes;
      if (moved >= 0) speed = nextSpeed(speed, (moved / elapsed) * 1000);
      this.lastSampleAt = now;
      this.lastSampleBytes = uploaded;
    }
    this.set({
      bytesUploaded: uploaded,
      bytesTotal: total,
      bytesPerSecond: speed,
      secondsLeft: now - this.sendingSince >= ESTIMATE_AFTER_MS ? remainingSeconds(uploaded, total, speed) : null,
    });
  }

  private async attach() {
    const file = this.file;
    const projectId = this.projectId;
    const objectName = this.session?.objectName;
    const uploadId = this.session?.uploadId;
    if (!file || !projectId || !objectName || !uploadId) return;
    const attempt = this.attempt;

    this.set({ phase: "attaching", bytesUploaded: file.size, secondsLeft: 0, error: null, canRetry: false });
    try {
      const result = await this.options.server.finalizeVideoUpload({
        projectId,
        objectName,
        uploadId,
        sizeBytes: file.size,
        fingerprint: this.fingerprint,
        durationSeconds: this.durationSeconds,
      });
      if (attempt !== this.attempt) return;
      if (!result.ok) {
        if (result.duplicate) {
          this.session?.finish();
          this.session = null;
          this.set({ phase: "failed", error: result.error, duplicate: result.duplicate, canRetry: false });
          return;
        }
        // Retry sends the rest when something is missing, and otherwise only attaches.
        this.set({ phase: "failed", error: result.error, canRetry: true, bytesUploaded: result.resend ? 0 : this.state.bytesUploaded });
        return;
      }
      this.session?.finish();
      this.options.onProject(result.data);
      this.set({ phase: "done", notice: result.notice ?? null, error: null, canRetry: false });
    } catch (error) {
      if (attempt !== this.attempt) return;
      // The file is safely in storage, so Retry only has to attach it.
      const advice = isNetworkFailure(error) ? "Check your connection, then choose Retry." : "Choose Retry in a moment.";
      this.set({
        phase: "failed",
        error: `The video arrived, but the site could not be told. ${advice} It will not upload again.`,
        canRetry: true,
      });
    }
  }

  private async handleFailure(message: string) {
    const attempt = this.attempt;
    this.set({ phase: "failed", error: message, canRetry: true });
    // A file that vanished mid-upload looks like a network failure from here, and Retry cannot help.
    if (this.file && !(await canStillRead(this.file)) && attempt === this.attempt) {
      this.set({ error: UNREADABLE_FILE, canRetry: false });
    }
    if (!this.projectId) return;
    try {
      const result = await this.options.server.failVideoUpload(this.projectId);
      if (!result.ok) console.error("[upload] could not record the failure:", result.error);
    } catch (error) {
      console.error("[upload] could not record the failure:", error instanceof Error ? error.message : error);
    }
  }

  async pause() {
    if (this.state.phase !== "uploading" || !this.session) return;
    this.set({ phase: "paused", bytesPerSecond: null, secondsLeft: null });
    await this.session.pause();
  }

  resume() {
    if (this.state.phase !== "paused" || !this.session) return;
    this.sendingSince = null;
    this.set({ phase: "uploading", error: null });
    this.session.resume();
  }

  // Carries on from where it stopped: the attach step if the bytes all arrived, otherwise the upload.
  retry() {
    if (this.state.phase !== "failed" || !this.state.canRetry || !this.session) return;
    if (this.state.bytesTotal > 0 && this.state.bytesUploaded >= this.state.bytesTotal) {
      void this.attach();
      return;
    }
    this.sendingSince = null;
    this.set({ phase: "uploading", bytesPerSecond: null, secondsLeft: null, error: null, canRetry: false });
    this.session.resume();
  }

  async cancel() {
    if (!["uploading", "paused", "failed", "attaching"].includes(this.state.phase)) return;
    this.attempt += 1;
    const session = this.session;
    const projectId = this.projectId;
    const target = session?.objectName && session.uploadId ? { objectName: session.objectName, uploadId: session.uploadId } : null;
    this.set({ phase: "cancelling", error: null });

    let problem: string | null = null;
    try {
      await session?.cancel();
    } catch (error) {
      // R2 drops unfinished uploads by itself after 7 days, so this is not fatal.
      console.error("[upload] storage did not confirm the cancel:", error instanceof Error ? error.message : error);
    }
    if (projectId) {
      try {
        const result = await this.options.server.cancelVideoUpload(projectId, target);
        if (!result.ok) problem = result.error;
      } catch {
        problem = "The upload stopped, but the project could not be reset. Refresh the page and check its upload state.";
      }
    }

    this.session = null;
    this.file = null;
    this.state = { ...INITIAL_UPLOAD_STATE, phase: problem ? "failed" : "idle", error: problem };
    this.options.onChange(this.state);
  }

  // The page is going away: stop sending, and keep the resume point so the same file can continue.
  dispose() {
    this.attempt += 1;
    void this.session?.pause();
    this.session = null;
  }
}
