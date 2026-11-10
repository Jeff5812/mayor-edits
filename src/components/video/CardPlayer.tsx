"use client";

import { type PointerEvent, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { fetchPlaybackUrl } from "@/lib/media/playback";
import type { PublicProject } from "@/types/domain";
import { FullscreenIcon, PlayIcon } from "./PlayerIcons";
import { VideoPlayer } from "./VideoPlayer";

// A pause first, so sweeping the pointer across the page does not start every video on the way.
const PREVIEW_DELAY_MS = 300;
const PREVIEW_SECONDS = 8;
// Later than the opening, which is often a title or a fade, but never far in on a long film.
const PREVIEW_START_SHARE = 0.1;
const PREVIEW_START_MAX_SECONDS = 30;

// "touch" is full screen that gives the card back when the viewer leaves it.
type Mode = "idle" | "inline" | "fullscreen" | "touch";

// Only one video on the page plays at a time.
let stopCurrent: (() => void) | null = null;

function canPreview() {
  const { connection } = navigator as Navigator & { connection?: { saveData?: boolean } };
  return window.matchMedia("(hover: hover) and (prefers-reduced-motion: no-preference)").matches && !connection?.saveData;
}

// A touch screen has no pointer to hover with, and a phone's frames are too small to watch a film in.
function playsFullscreen() {
  return window.matchMedia("(hover: none)").matches;
}

// The frame of a video card. At rest it is only the poster and downloads nothing. Pointing at it shows the play button
// and a few silent seconds of the video. Pressing play starts it right here, like any media player, with sound and full
// controls. On a touch screen it opens full screen instead, and leaving full screen puts the card back. Nothing here
// ever starts by itself.
export function CardPlayer({ project }: { project: PublicProject }) {
  const [mode, setMode] = useState<Mode>("idle");
  const close = useCallback(() => setMode("idle"), []);
  const [previewStage, setPreviewStage] = useState<"off" | "waiting" | "showing">("off");
  const preview = useRef<HTMLVideoElement>(null);
  const timer = useRef<number | undefined>(undefined);
  const abort = useRef<AbortController | null>(null);
  const link = useRef<string | null>(null);
  const startedAt = useRef(0);

  const stopPreview = useCallback(() => {
    window.clearTimeout(timer.current);
    abort.current?.abort();
    setPreviewStage("off");
    const video = preview.current;
    if (video?.hasAttribute("src")) {
      video.pause();
      video.removeAttribute("src");
      video.load();
    }
  }, []);

  useEffect(() => stopPreview, [stopPreview]);

  // Next.js keeps a page it leaves in the document, hidden, and a hidden video keeps playing. The card goes back to its poster
  // instead, and pressing play again carries on from where the film was left.
  useLayoutEffect(() => () => setMode("idle"), []);

  function startPreview(event: PointerEvent) {
    if (event.pointerType === "touch" || !canPreview()) return;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      const controller = new AbortController();
      abort.current = controller;
      // A long film's index alone can take seconds on a slow connection, so the frame shows the pointer was noticed.
      setPreviewStage("waiting");
      void (async () => {
        try {
          link.current ??= await fetchPlaybackUrl(project.id, controller.signal);
          const video = preview.current;
          if (!video || controller.signal.aborted) return;
          video.src = link.current;
          video.load();
        } catch {
          // Only a preview: the poster simply stays, and the play button still works.
          setPreviewStage("off");
        }
      })();
    }, PREVIEW_DELAY_MS);
  }

  function play(next: Exclude<Mode, "idle">) {
    stopPreview();
    stopCurrent?.();
    stopCurrent = () => setMode("idle");
    setMode(next);
  }

  if (mode !== "idle") {
    return <VideoPlayer project={project} autoStart startFullscreen={mode !== "inline"} onFullscreenExit={mode === "touch" ? close : undefined} />;
  }

  return (
    <div className="absolute inset-0" onPointerEnter={startPreview} onPointerLeave={stopPreview}>
      <video
        ref={preview}
        muted
        playsInline
        preload="none"
        disablePictureInPicture
        aria-hidden="true"
        tabIndex={-1}
        data-testid="card-preview"
        className={`frame-preview ${previewStage === "showing" ? "is-showing" : ""}`}
        onLoadedMetadata={(event) => {
          const video = event.currentTarget;
          startedAt.current = Math.min(video.duration * PREVIEW_START_SHARE, PREVIEW_START_MAX_SECONDS);
          video.currentTime = startedAt.current;
          video.play().catch(() => setPreviewStage("off"));
        }}
        onPlaying={() => setPreviewStage("showing")}
        onTimeUpdate={(event) => {
          const video = event.currentTarget;
          if (video.currentTime - startedAt.current < PREVIEW_SECONDS) return;
          video.pause();
          setPreviewStage("off");
        }}
        onError={() => {
          // A link can expire, so the next hover asks for a fresh one.
          link.current = null;
          setPreviewStage("off");
        }}
      />
      <span className={`scrub ${previewStage === "waiting" ? "is-waiting" : ""}`} />
      <button type="button" aria-label={`Play ${project.title}`} data-testid="card-play" className="card-press" onClick={() => play(playsFullscreen() ? "touch" : "inline")}>
        <span aria-hidden="true" className="play-disc">
          <PlayIcon />
        </span>
      </button>
      <button
        type="button"
        aria-label={`Play ${project.title} in full screen`}
        title="Full screen"
        data-testid="card-fullscreen"
        className="card-expand"
        onClick={() => play("fullscreen")}
      >
        <FullscreenIcon />
      </button>
    </div>
  );
}
