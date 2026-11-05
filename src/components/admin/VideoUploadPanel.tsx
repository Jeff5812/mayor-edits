"use client";

import Link from "next/link";
import { type DragEvent, useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { formatBytes, formatEta, percentOf } from "@/lib/media/format";
import { INITIAL_UPLOAD_STATE, UploadController, type UploadServer, type UploadState } from "@/lib/media/upload-controller";
import { MAX_VIDEO_MB, VIDEO_ACCEPT } from "@/lib/media/validation";
import type { Project } from "@/types/domain";
import { alertClass, noticeClass, panelClass, panelHintClass, panelTitleClass, primaryButtonClass, smallButtonClass, successClass } from "./styles";

const LEAVE_WARNING = "A video is still uploading. If you leave now it stops, and you will need to choose the file again to continue.";

class ControllerStore {
  private listeners = new Set<() => void>();
  state: UploadState = INITIAL_UPLOAD_STATE;
  controller: UploadController;
  private onProject: (project: Project) => void = () => {};

  constructor(server: UploadServer) {
    this.controller = new UploadController({
      server,
      onChange: (state) => {
        this.state = state;
        this.listeners.forEach((listener) => listener());
      },
      onProject: (project) => this.onProject(project),
    });
  }

  listenForProject(listener: (project: Project) => void) {
    this.onProject = listener;
  }

  // React's development mode unmounts and remounts every component once, straight after it first
  // appears. Waiting a tick means only a real departure stops the upload.
  private disposeTimer: number | undefined;

  scheduleDispose() {
    this.disposeTimer = window.setTimeout(() => this.controller.dispose(), 0);
  }

  cancelDispose() {
    window.clearTimeout(this.disposeTimer);
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  read = () => this.state;
  readServer = () => INITIAL_UPLOAD_STATE;
}

export function VideoUploadPanel({
  project,
  server,
  initialFile = null,
  onProject,
  onFile,
}: {
  project: Project | null;
  server: UploadServer;
  // A file chosen before this page opened: the upload starts straight away.
  initialFile?: File | null;
  onProject: (project: Project) => void;
  onFile?: (file: File) => void;
}) {
  const [store] = useState(() => new ControllerStore(server));
  useEffect(() => {
    store.listenForProject(onProject);
  });

  const state = useSyncExternalStore(store.subscribe, store.read, store.readServer);
  const controller = store.controller;

  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const inputId = useId();
  const hintId = useId();

  const busy = ["checking", "uploading", "paused", "attaching", "cancelling"].includes(state.phase);

  function start(file: File) {
    onFile?.(file);
    void controller.choose(file, project?.id ?? null);
  }

  // A file left by the "new project" page. The ref keeps React's double effects from starting it twice.
  const startedInitial = useRef(false);
  useEffect(() => {
    if (!initialFile || startedInitial.current) return;
    startedInitial.current = true;
    onFile?.(initialFile);
    void controller.choose(initialFile, project?.id ?? null);
    // Runs once, for the file this page opened with.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialFile, controller]);

  // Closing the tab or following a link would stop the upload, so both ask first.
  useEffect(() => {
    if (!busy) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => event.preventDefault();
    const onClick = (event: MouseEvent) => {
      const anchor = (event.target as Element | null)?.closest?.("a[href]");
      if (!anchor || anchor.getAttribute("target") === "_blank") return;
      if (!window.confirm(LEAVE_WARNING)) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, [busy]);

  // Leaving keeps the resume point, so choosing the same file later carries on from there.
  useEffect(() => {
    store.cancelDispose();
    return () => store.scheduleDispose();
  }, [store]);

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files[0];
    if (file && !busy) start(file);
  }

  // The form sits above this panel on a phone, and can push it off a short screen, so the owner is brought here as soon as
  // anything starts. Otherwise a running upload looks like nothing happening.
  const sectionRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (state.phase !== "idle") sectionRef.current?.scrollIntoView({ block: "center" });
  }, [state.phase]);

  const percent = percentOf(state.bytesUploaded, state.bytesTotal);
  const showProgress = ["uploading", "paused", "attaching", "cancelling"].includes(state.phase);
  const interrupted =
    state.phase === "idle" && project && !project.video_path && ["uploading", "failed"].includes(project.upload_status);

  return (
    <section ref={sectionRef} aria-labelledby={`${inputId}-title`} className={panelClass}>
      <h2 id={`${inputId}-title`} className={panelTitleClass}>
        {project?.video_path ? "Replace the video" : "Add the video"}
      </h2>

      {project?.video_path && project.upload_status === "ready" ? (
        <p className={panelHintClass}>The current one stays live until the new one has fully arrived, and is removed after that.</p>
      ) : null}

      {interrupted ? (
        <p className={`mt-4 ${noticeClass}`}>
          An earlier upload did not finish. Choose the same file on this computer and it continues from where it stopped.
        </p>
      ) : null}

      {!showProgress && state.phase !== "checking" ? (
        <div
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={`dropzone mt-4 p-5 text-center sm:p-6 ${dragging ? "is-over" : ""}`}
        >
          <input
            ref={inputRef}
            id={inputId}
            type="file"
            accept={VIDEO_ACCEPT}
            aria-describedby={hintId}
            data-testid="video-input"
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0];
              // Clearing it lets the same file be chosen again after a failure.
              event.target.value = "";
              if (file) start(file);
            }}
          />
          {/* The bright button when this is the next step, and a quiet one when it would only replace a finished video. */}
          <button type="button" className={project?.video_path ? smallButtonClass : primaryButtonClass} onClick={() => inputRef.current?.click()}>
            Choose a video file
          </button>
          <p id={hintId} className="mt-3 text-sm text-ash">
            Or drop it here. MP4 (H.264), up to {MAX_VIDEO_MB} MB.
          </p>
        </div>
      ) : null}

      {state.phase === "checking" ? (
        <p role="status" className="mt-4 text-sm text-bone">
          Checking {state.fileName}
        </p>
      ) : null}

      {state.warning && state.phase !== "idle" ? <p className={`mt-4 ${noticeClass}`}>{state.warning}</p> : null}

      {showProgress ? (
        <div className="mt-4" data-testid="upload-progress">
          <p className="break-words text-sm text-bone">{state.fileName}</p>
          <div
            role="progressbar"
            aria-label="Upload progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(percent)}
            aria-valuetext={`${Math.round(percent)} percent`}
            className="meter mt-3"
          >
            <div className="meter-fill" style={{ inlineSize: `${percent}%` }} />
          </div>
          <p className="mt-2 flex flex-wrap justify-between gap-x-4 text-sm tabular-nums text-ash">
            <span data-testid="upload-percent">{Math.round(percent)}%</span>
            <span>
              {formatBytes(state.bytesUploaded)} of {formatBytes(state.bytesTotal)}
            </span>
            <span role="status">
              {state.phase === "uploading" ? formatEta(state.secondsLeft) : null}
              {state.phase === "paused" ? "Paused" : null}
              {state.phase === "attaching" ? "Finishing up" : null}
              {state.phase === "cancelling" ? "Cancelling" : null}
            </span>
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            {state.phase === "uploading" ? (
              <button type="button" className={smallButtonClass} onClick={() => void controller.pause()}>
                Pause
              </button>
            ) : null}
            {state.phase === "paused" ? (
              <button type="button" className={smallButtonClass} onClick={() => controller.resume()}>
                Resume
              </button>
            ) : null}
            {state.phase === "uploading" || state.phase === "paused" ? (
              <button type="button" className={smallButtonClass} onClick={() => void controller.cancel()}>
                Cancel upload
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {state.phase === "failed" && state.error ? (
        <div className="mt-4 grid gap-3">
          <div role="alert" className={alertClass}>
            <p>{state.error}</p>
            {state.duplicate ? (
              <p className="mt-2">
                It belongs to{" "}
                <Link href={`/admin/projects/${state.duplicate.id}`} className="underline underline-offset-4">
                  {state.duplicate.title}
                </Link>
                .
              </p>
            ) : null}
          </div>
          {state.canRetry ? (
            <div className="flex flex-wrap gap-3">
              <button type="button" className={smallButtonClass} onClick={() => controller.retry()}>
                Retry
              </button>
              <button type="button" className={smallButtonClass} onClick={() => void controller.cancel()}>
                Cancel upload
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {state.phase === "done" ? (
        <div role="status" className={`mt-4 ${successClass}`} data-testid="upload-success">
          <p>{state.notice && state.bytesUploaded === 0 ? state.notice : `Upload complete. ${state.fileName} is attached to this project.`}</p>
          {state.notice && state.bytesUploaded > 0 ? <p className="mt-2">{state.notice}</p> : null}
        </div>
      ) : null}
    </section>
  );
}
