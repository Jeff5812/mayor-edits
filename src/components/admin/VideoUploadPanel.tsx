"use client";

import Link from "next/link";
import { type DragEvent, useEffect, useId, useRef, useState } from "react";
import { formatBytes, formatEta, percentOf } from "@/lib/media/format";
import { type UploadState, isUploadBusy } from "@/lib/media/upload-controller";
import type { ProjectUpload } from "@/lib/media/upload-registry";
import { MAX_VIDEO_MB, VIDEO_ACCEPT } from "@/lib/media/validation";
import type { Project } from "@/types/domain";
import { alertClass, noticeClass, panelClass, panelHintClass, panelTitleClass, primaryButtonClass, smallButtonClass, successClass } from "./styles";

// What the upload is doing, in the owner's words.
function uploadStatus(state: UploadState): string | null {
  if (state.phase === "uploading") return state.offline ? "Waiting for the connection" : formatEta(state.secondsLeft);
  if (state.phase === "paused") return "Paused";
  if (state.phase === "attaching") return "Finishing up";
  if (state.phase === "cancelling") return "Cancelling";
  return null;
}

// A view of the project's upload, which runs in the tab rather than on this page (see upload-registry): leaving the page
// does not stop it, and coming back shows where it has got to.
export function VideoUploadPanel({ project, upload, state }: { project: Project; upload: ProjectUpload; state: UploadState }) {
  const { controller } = upload;
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const inputId = useId();
  const hintId = useId();
  const busy = isUploadBusy(state);

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files[0];
    if (file && !busy) upload.start(file);
  }

  // On a phone the form above can push this panel off a short screen, so it comes into view when an upload starts here.
  const sectionRef = useRef<HTMLElement>(null);
  const lastPhase = useRef(state.phase);
  useEffect(() => {
    if (lastPhase.current === "idle" && state.phase !== "idle") sectionRef.current?.scrollIntoView({ block: "center" });
    lastPhase.current = state.phase;
  }, [state.phase]);

  const percent = percentOf(state.bytesUploaded, state.bytesTotal);
  const showProgress = ["uploading", "paused", "attaching", "cancelling"].includes(state.phase);
  const interrupted = state.phase === "idle" && !project.video_path && ["uploading", "failed"].includes(project.upload_status);
  const status = uploadStatus(state);

  return (
    <section ref={sectionRef} aria-labelledby={`${inputId}-title`} className={panelClass}>
      <h2 id={`${inputId}-title`} className={panelTitleClass}>
        {project.video_path ? "Replace the video" : "Add the video"}
      </h2>

      {project.video_path && project.upload_status === "ready" ? (
        <p className={panelHintClass}>The current one stays live until the new one has fully arrived, and is removed after that.</p>
      ) : null}

      {interrupted ? (
        <p className={`mt-4 ${noticeClass}`}>
          An earlier upload did not finish. Choose the same file on this device and it carries on from where it stopped.
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
              if (file) upload.start(file);
            }}
          />
          {/* The bright button when this is the next step, and a quiet one when it would only replace a finished video. */}
          <button type="button" className={project.video_path ? smallButtonClass : primaryButtonClass} onClick={() => inputRef.current?.click()}>
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
            <span role="status">{status}</span>
          </p>
          {state.offline && state.phase === "uploading" ? (
            <p className={`mt-3 ${noticeClass}`}>The connection dropped. The upload carries on by itself as soon as it is back.</p>
          ) : (
            <p className={`mt-3 ${panelHintClass}`}>You can keep working, here or on other pages. Keep this tab open until it finishes.</p>
          )}
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
