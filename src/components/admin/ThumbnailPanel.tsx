"use client";

import { type CSSProperties, useEffect, useId, useRef, useState } from "react";
import { isNetworkFailure } from "@/lib/media/failures";
import { prepareThumbnailImage, thumbnailFromVideo } from "@/lib/media/frames";
import { formatClock } from "@/lib/media/format";
import { attachPoster } from "@/lib/media/poster-upload";
import { posterUrl } from "@/lib/media/poster-url";
import { POSTER_ACCEPT, THUMBNAIL_HEIGHT, THUMBNAIL_WIDTH, VIDEO_ACCEPT, defaultFrameAt, thumbnailNote, validatePosterFile } from "@/lib/media/validation";
import { removeProjectPoster } from "@/lib/projects/actions";
import type { Project } from "@/types/domain";
import { alertClass, panelClass, panelHintClass, panelTitleClass, primaryButtonClass, smallButtonClass, successClass } from "./styles";

const CANNOT_DECODE = "This browser cannot show frames from this video, so please upload a thumbnail image instead.";
const FRAME = "aspect-video w-full rounded-[2px] shadow-[0_0_0_1px_rgb(0_0_0/0.55)]";

// The thumbnail is the card's picture on the reel, so it is shown here the size and shape it has there.
export function ThumbnailPanel({
  project,
  localVideo,
  onProject,
}: {
  project: Project;
  // The video file on this device, if this tab is uploading it or uploaded it. Frames come from it directly.
  localVideo: File | null;
  onProject: (project: Project) => void;
}) {
  const [frameSource, setFrameSource] = useState<File | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const imageInput = useRef<HTMLInputElement>(null);
  const videoInput = useRef<HTMLInputElement>(null);
  const titleId = useId();

  const source = frameSource ?? localVideo;
  const current = posterUrl(project.poster_path);

  async function run(label: string, work: () => Promise<string | null>) {
    setBusy(label);
    setError(null);
    setMessage(null);
    try {
      setMessage(await work());
    } catch (problem) {
      console.error("[thumbnail] failed:", problem instanceof Error ? problem.message : problem);
      if (isNetworkFailure(problem)) setError("That did not go through. Check your connection and try again.");
      else setError(problem instanceof Error && problem.message ? problem.message : "That did not work. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  async function attach(image: Blob, saved: string): Promise<string | null> {
    const result = await attachPoster(project.id, image);
    if (!result.ok) {
      setError(result.error);
      return null;
    }
    onProject(result.data);
    return result.notice ?? saved;
  }

  function chooseImage(file: File) {
    const check = validatePosterFile(file);
    if (!check.ok) {
      setError(check.message);
      setMessage(null);
      return;
    }
    void run("Saving the thumbnail", async () => {
      const { image, width, height } = await prepareThumbnailImage(file);
      return attach(image, thumbnailNote(width, height));
    });
  }

  return (
    <section aria-labelledby={titleId} className={panelClass} data-testid="thumbnail-panel">
      <h2 id={titleId} className={panelTitleClass}>
        Thumbnail
      </h2>
      <p className={panelHintClass}>
        The picture on the film&apos;s card, before anyone presses play. Best at {THUMBNAIL_WIDTH} × {THUMBNAIL_HEIGHT} (16:9), the size of a YouTube
        thumbnail. Other shapes are cropped to their middle.
      </p>

      {/* An image dropped on the frame is used as the thumbnail, as if it had been chosen. */}
      <div
        className={`mt-4 ${dragging ? "dropzone is-over" : ""}`}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          const file = event.dataTransfer.files[0];
          if (file && !busy) chooseImage(file);
        }}
      >
        {current ? (
          // eslint-disable-next-line @next/next/no-img-element -- admin preview of a public storage image
          <img src={current} alt="Current thumbnail" className={`${FRAME} object-cover`} />
        ) : (
          <div className={`dropzone grid place-items-center p-4 text-center text-sm text-ash ${FRAME}`}>
            <p>
              No thumbnail yet. Drop an image here,
              <br />
              or one is taken from the video after it uploads.
            </p>
          </div>
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <input
          ref={imageInput}
          type="file"
          accept={POSTER_ACCEPT}
          aria-label="Thumbnail image file"
          data-testid="thumbnail-input"
          className="sr-only"
          tabIndex={-1}
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) chooseImage(file);
          }}
        />
        <button type="button" className={current ? smallButtonClass : primaryButtonClass} disabled={Boolean(busy)} onClick={() => imageInput.current?.click()}>
          {current ? "Replace the thumbnail" : "Upload a thumbnail"}
        </button>
        {current ? (
          <button
            type="button"
            className={smallButtonClass}
            disabled={Boolean(busy)}
            onClick={() =>
              void run("Removing the thumbnail", async () => {
                const result = await removeProjectPoster(project.id);
                if (!result.ok) {
                  setError(result.error);
                  return null;
                }
                onProject(result.data);
                return "Thumbnail removed.";
              })
            }
          >
            Remove
          </button>
        ) : null}
      </div>

      <div className="mt-5 border-t border-line pt-5">
        <h3 className="text-sm font-medium text-bone">Or use a frame from the video</h3>
        {source ? (
          <FramePicker
            key={`${source.name}-${source.size}`}
            source={source}
            disabled={Boolean(busy)}
            onUse={(video) => void run("Saving the frame", async () => attach(await thumbnailFromVideo(video), "Frame saved as the thumbnail."))}
          />
        ) : (
          <div className="mt-3">
            <p className="text-sm text-ash">Choose the video file on this device to pick a moment. It is only read here, not uploaded again.</p>
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
                if (file) setFrameSource(file);
              }}
            />
            <button type="button" className={`mt-3 ${smallButtonClass}`} disabled={Boolean(busy)} onClick={() => videoInput.current?.click()}>
              Choose the video file
            </button>
          </div>
        )}
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

// The video itself, cropped the way the card crops it, with a slider to find the moment. Moving the slider only seeks, so
// finding the frame costs nothing until it is used.
function FramePicker({ source, disabled, onUse }: { source: File; disabled: boolean; onUse: (video: HTMLVideoElement) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [length, setLength] = useState(0);
  const [at, setAt] = useState(0);
  const [failed, setFailed] = useState(false);

  // The file is read through an object URL, let go of when the file changes or Next.js hides the page.
  useEffect(() => {
    const element = video.current;
    if (!element) return;
    const url = URL.createObjectURL(source);
    element.src = url;
    return () => {
      element.removeAttribute("src");
      element.load();
      URL.revokeObjectURL(url);
    };
  }, [source]);

  function seek(seconds: number) {
    setAt(seconds);
    if (video.current) video.current.currentTime = seconds;
  }

  return (
    <div className="mt-3 grid gap-3">
      <video
        ref={video}
        muted
        playsInline
        preload="auto"
        aria-label="The frame that would be used"
        data-testid="frame-preview"
        className={`${FRAME} bg-black object-cover`}
        onLoadedMetadata={(event) => {
          const seconds = Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : 0;
          setLength(seconds);
          // Where an automatic thumbnail would be taken from.
          seek(defaultFrameAt(seconds));
        }}
        onError={() => setFailed(true)}
      />
      {failed ? (
        <p role="alert" className={alertClass}>
          {CANNOT_DECODE}
        </p>
      ) : (
        <>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={0}
              max={length || 0}
              step="any"
              value={Math.min(at, length || 0)}
              aria-label="Moment in the video"
              aria-valuetext={formatClock(at)}
              data-testid="frame-moment"
              className="player-range min-w-0 flex-1"
              style={{ "--fill": `${length ? (at / length) * 100 : 0}%`, "--loaded": "100%" } as CSSProperties}
              disabled={!length}
              onChange={(event) => seek(Number(event.target.value))}
            />
            <span className="shrink-0 font-time text-xs tabular-nums text-bone">
              {formatClock(at)}
              <span className="text-mute"> / {formatClock(length)}</span>
            </span>
          </div>
          <div>
            <button type="button" className={primaryButtonClass} disabled={disabled || !length} onClick={() => video.current && onUse(video.current)}>
              Use this frame as the thumbnail
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// The New project form's own thumbnail, chosen with the video and saved as soon as the draft exists.
export function ThumbnailField({ file, onChoose, disabled }: { file: File | null; onChoose: (file: File | null) => void; disabled: boolean }) {
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const preview = useRef<HTMLImageElement>(null);
  const id = useId();

  // Shown through an object URL, let go of when the image changes or Next.js hides the page.
  useEffect(() => {
    const element = preview.current;
    if (!file || !element) return;
    const url = URL.createObjectURL(file);
    element.src = url;
    return () => {
      element.removeAttribute("src");
      URL.revokeObjectURL(url);
    };
  }, [file]);

  function choose(next: File) {
    const check = validatePosterFile(next);
    if (!check.ok) {
      setError(check.message);
      return;
    }
    setError(null);
    onChoose(next);
  }

  return (
    <div>
      <p id={`${id}-label`} className="block text-sm font-medium text-bone">
        Thumbnail (optional)
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        {file ? (
          // eslint-disable-next-line @next/next/no-img-element -- local preview from an object URL
          <img ref={preview} alt="Chosen thumbnail" className="aspect-video w-40 rounded-[2px] object-cover shadow-[0_0_0_1px_rgb(0_0_0/0.55)]" />
        ) : null}
        <input
          ref={input}
          type="file"
          accept={POSTER_ACCEPT}
          aria-labelledby={`${id}-label`}
          data-testid="new-thumbnail-input"
          className="sr-only"
          tabIndex={-1}
          onChange={(event) => {
            const next = event.target.files?.[0];
            event.target.value = "";
            if (next) choose(next);
          }}
        />
        <div className="flex flex-wrap gap-2">
          <button type="button" className={smallButtonClass} disabled={disabled} onClick={() => input.current?.click()}>
            {file ? "Choose a different one" : "Choose a thumbnail"}
          </button>
          {file ? (
            <button type="button" className={smallButtonClass} disabled={disabled} onClick={() => onChoose(null)}>
              Remove
            </button>
          ) : null}
        </div>
      </div>
      <p className="mt-2 text-sm text-ash">
        Best at {THUMBNAIL_WIDTH} × {THUMBNAIL_HEIGHT} (16:9). Without one, a frame from the video is used.
      </p>
      {error ? (
        <p role="alert" className="mt-1 text-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
