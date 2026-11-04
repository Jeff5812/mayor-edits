"use client";

import { useEffect, useId, useRef, useState } from "react";
import { isNetworkFailure } from "@/lib/media/failures";
import { UndecodableVideoError, captureVideoFrame, preparePosterImage } from "@/lib/media/frames";
import { attachPoster } from "@/lib/media/poster-upload";
import { posterUrl } from "@/lib/media/poster-url";
import { POSTER_ACCEPT, POSTER_MAX_BYTES, VIDEO_ACCEPT, validatePosterFile } from "@/lib/media/validation";
import { removeProjectPoster } from "@/lib/projects/actions";
import type { Project } from "@/types/domain";
import { alertClass, panelClass, primaryButtonClass, smallButtonClass, successClass } from "./styles";

const CANNOT_DECODE = "This browser cannot read frames from this video, so please upload a poster image instead.";

export function PosterPanel({
  project,
  localVideo,
  onProject,
}: {
  project: Project;
  // The video file on this computer, if one was chosen on this page. Frames come from it directly.
  localVideo: File | null;
  onProject: (project: Project) => void;
}) {
  const [frameSource, setFrameSource] = useState<File | null>(null);
  const [frame, setFrame] = useState<{ blob: Blob; url: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [frameAt, setFrameAt] = useState(5);
  const imageInput = useRef<HTMLInputElement>(null);
  const videoInput = useRef<HTMLInputElement>(null);
  const titleId = useId();

  const source = frameSource ?? localVideo;
  const current = posterUrl(project.poster_path);

  // The preview uses an object URL, which must be let go when it is replaced or the page closes.
  const frameUrl = frame?.url;
  useEffect(() => {
    if (!frameUrl) return;
    return () => URL.revokeObjectURL(frameUrl);
  }, [frameUrl]);

  async function attach(image: Blob) {
    const result = await attachPoster(project.id, image);
    if (!result.ok) {
      setError(result.error);
      return false;
    }
    onProject(result.data);
    setMessage(result.notice ?? "Poster saved.");
    return true;
  }

  async function run(label: string, work: () => Promise<void>) {
    setBusy(label);
    setError(null);
    setMessage(null);
    try {
      await work();
    } catch (problem) {
      console.error("[poster] failed:", problem instanceof Error ? problem.message : problem);
      if (isNetworkFailure(problem)) setError("That did not go through. Check your connection and try again.");
      else setError(problem instanceof Error && problem.message ? problem.message : "That did not work. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  function chooseImage(file: File) {
    const check = validatePosterFile(file);
    if (!check.ok) {
      setError(check.message);
      setMessage(null);
      return;
    }
    void run("Uploading the image", async () => {
      await attach(await preparePosterImage(file));
    });
  }

  function grabFrame(file: File, seconds: number) {
    void run("Reading the frame", async () => {
      try {
        const blob = await captureVideoFrame(file, seconds);
        setFrame({ blob, url: URL.createObjectURL(blob) });
      } catch (problem) {
        if (problem instanceof UndecodableVideoError) {
          setError(CANNOT_DECODE);
          return;
        }
        throw problem;
      }
    });
  }

  return (
    <section aria-labelledby={titleId} className={panelClass}>
      <h2 id={titleId} className="text-lg font-medium text-bone">
        Poster
      </h2>
      <p className="mt-2 text-sm text-ash">
        Shown on the project&apos;s card. A frame from the video is saved automatically after an upload, and you can replace it here.
      </p>

      {current ? (
        // eslint-disable-next-line @next/next/no-img-element -- admin preview of a public storage image
        <img src={current} alt="Current poster" className="mt-4 aspect-video w-64 max-w-full border border-line object-cover" />
      ) : null}

      <div className="mt-4 flex flex-wrap gap-3">
        <input
          ref={imageInput}
          type="file"
          accept={POSTER_ACCEPT}
          aria-label="Poster image file"
          data-testid="poster-input"
          className="sr-only"
          tabIndex={-1}
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) chooseImage(file);
          }}
        />
        <button type="button" className={smallButtonClass} disabled={Boolean(busy)} onClick={() => imageInput.current?.click()}>
          Upload an image
        </button>
        {current ? (
          <button
            type="button"
            className={smallButtonClass}
            disabled={Boolean(busy)}
            onClick={() =>
              void run("Removing the poster", async () => {
                const result = await removeProjectPoster(project.id);
                if (!result.ok) {
                  setError(result.error);
                  return;
                }
                onProject(result.data);
                setMessage("Poster removed.");
              })
            }
          >
            Remove poster
          </button>
        ) : null}
      </div>

      <div className="mt-5 border-t border-line pt-5">
        <h3 className="text-sm font-medium text-bone">Use a frame from the video</h3>
        {source ? (
          <div className="mt-3 grid gap-3">
            <label className="text-sm text-ash">
              Seconds into the video
              <input
                type="number"
                min={0}
                step={1}
                value={frameAt}
                onChange={(event) => setFrameAt(Math.max(0, Number(event.target.value) || 0))}
                className="ms-3 w-24 border border-line-strong bg-ink px-2 py-1 text-bone"
              />
            </label>
            <div>
              <button type="button" className={smallButtonClass} disabled={Boolean(busy)} onClick={() => grabFrame(source, frameAt)}>
                Show this frame
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-3">
            <p className="text-sm text-ash">Choose the video file on this computer to pick a frame. It is only read here, not uploaded.</p>
            <input
              ref={videoInput}
              type="file"
              accept={VIDEO_ACCEPT}
              aria-label="Video file to take a frame from"
              className="sr-only"
              tabIndex={-1}
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) {
                  setFrameSource(file);
                  grabFrame(file, frameAt);
                }
              }}
            />
            <button type="button" className={`mt-3 ${smallButtonClass}`} disabled={Boolean(busy)} onClick={() => videoInput.current?.click()}>
              Choose video file
            </button>
          </div>
        )}

        {frame ? (
          <div className="mt-4 grid gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element -- local preview from an object URL */}
            <img src={frame.url} alt="Chosen frame" className="w-full max-w-sm border border-line" />
            <div>
              <button
                type="button"
                className={primaryButtonClass}
                disabled={Boolean(busy) || frame.blob.size > POSTER_MAX_BYTES}
                onClick={() =>
                  void run("Saving the frame", async () => {
                    if (await attach(frame.blob)) setFrame(null);
                  })
                }
              >
                Use this frame as the poster
              </button>
            </div>
          </div>
        ) : null}
      </div>

      <div aria-live="polite" className="mt-4 empty:hidden">
        {busy ? <p className="text-sm text-bone">{busy}</p> : null}
        {message ? <p className={successClass}>{message}</p> : null}
      </div>
      {error ? (
        <p role="alert" className={`mt-4 ${alertClass}`}>
          {error}
        </p>
      ) : null}
    </section>
  );
}
