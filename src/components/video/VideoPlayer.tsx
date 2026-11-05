"use client";

import { type CSSProperties, type KeyboardEvent, useCallback, useEffect, useId, useRef, useState } from "react";
import { formatClock, percentOf } from "@/lib/media/format";
import { PlaybackError, fetchPlaybackUrl, fetchSubtitleLanguages } from "@/lib/media/playback";
import { type SubtitleCode, subtitleLabel } from "@/lib/media/subtitles";
import type { PublicProject } from "@/types/domain";

type Stage = "idle" | "loading" | "ready" | "error";
type ErrorKind = "unavailable" | "network" | "unsupported";

const SEEK_STEP_SECONDS = 5;
const VOLUME_STEP = 0.1;
const CONTROLS_HIDE_MS = 3000;
// Counted up from the bottom of the picture, so subtitles sit clear of the control bar and do not jump when it hides.
const SUBTITLE_LINE = -4;

const ERROR_TEXT: Record<ErrorKind, { title: string; body: string }> = {
  unavailable: { title: "This cut is not available", body: "It may have been taken down. Please try again later." },
  network: { title: "This cut could not load", body: "Check your connection and try again." },
  unsupported: { title: "This cut could not play", body: "Your browser could not play this file. Try another browser." },
};

// The track fill is drawn on the browser's own slider parts, so keyboards and touch keep working.
// Spelled out in full because Tailwind only generates classes it can read in the source.
const rangeClass =
  "block h-8 w-full cursor-pointer appearance-none bg-transparent " +
  "[&::-webkit-slider-runnable-track]:h-1 [&::-webkit-slider-runnable-track]:bg-[linear-gradient(to_right,var(--text-1)_var(--fill),color-mix(in_srgb,var(--text-1)_28%,transparent)_var(--fill))] " +
  "[&::-webkit-slider-thumb]:-mt-1.5 [&::-webkit-slider-thumb]:size-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-bone " +
  "[&::-moz-range-track]:h-1 [&::-moz-range-track]:bg-[linear-gradient(to_right,var(--text-1)_var(--fill),color-mix(in_srgb,var(--text-1)_28%,transparent)_var(--fill))] " +
  "[&::-moz-range-thumb]:size-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-bone";
const controlClass = "inline-flex size-11 shrink-0 items-center justify-center text-bone transition-opacity duration-200 hover:opacity-70";

function fill(percent: number) {
  return { "--fill": `${percent}%` } as CSSProperties;
}

function Icon({ path }: { path: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-6 fill-current">
      <path d={path} />
    </svg>
  );
}

const PLAY = "M7 4.5v15l12.500-7.500z";
const PAUSE = "M6.500 4.500h4v15h-4zm7 0h4v15h-4z";
const VOLUME_ON = "M4 9.500v5h3.500L12 19V5L7.500 9.500zM15 8a5 5 0 0 1 0 8v-2.300a2.800 2.800 0 0 0 0-3.400zm0-4a9 9 0 0 1 0 16v-2.100a7 7 0 0 0 0-11.800z";
const VOLUME_OFF = "M4 9.500v5h3.500L12 19V5L7.500 9.500zm16.500-.300-1.400-1.400-2.300 2.300-2.300-2.300-1.400 1.400 2.300 2.300-2.300 2.300 1.400 1.400 2.300-2.300 2.300 2.300 1.400-1.400-2.300-2.300z";
const FULLSCREEN = "M4 9.500V4h5.500v2H6v3.500zm10.500-5.500H20v5.500h-2V6h-3.500zM4 14.500h2V18h3.500v2H4zm14 0h2V20h-5.500v-2H18z";
const FULLSCREEN_EXIT = "M9.500 4v5.500H4v-2h3.500V4zm5 0h2v3.500H20v2h-5.500zM4 14.500h5.500V20h-2v-3.500H4zm10.500 0H20v2h-3.500V20h-2z";

interface WebkitVideo extends HTMLVideoElement {
  webkitEnterFullscreen?: () => void;
}

export function VideoPlayer({ project, autoStart = false }: { project: PublicProject; autoStart?: boolean }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<WebkitVideo>(null);
  const abortRef = useRef<AbortController | null>(null);
  const hideTimer = useRef<number | undefined>(undefined);
  const lastPointer = useRef("mouse");
  // Where to carry on, and whether to keep playing, if a signed link expires part-way through.
  const lastTime = useRef(0);
  const wantsPlay = useRef(false);
  const refreshes = useRef(0);
  const refreshedAt = useRef(0);
  const sawMetadata = useRef(false);

  const [stage, setStage] = useState<Stage>("idle");
  const [errorKind, setErrorKind] = useState<ErrorKind>("network");
  const [playing, setPlaying] = useState(false);
  const [buffering, setBuffering] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(project.duration_seconds ?? 0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [subtitleLanguages, setSubtitleLanguages] = useState<SubtitleCode[]>([]);
  const [subtitle, setSubtitle] = useState<SubtitleCode | "">("");
  const hintId = useId();

  // The player only exists once a visitor has opened it, so a page view asks for none of this.
  useEffect(() => {
    const controller = new AbortController();
    void fetchSubtitleLanguages(project.id, controller.signal).then((languages) => {
      if (!controller.signal.aborted) setSubtitleLanguages(languages);
    });
    return () => controller.abort();
  }, [project.id]);

  // Only the chosen language's file is downloaded, because the browser fetches a track once it is no longer disabled.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    for (const element of Array.from(video.querySelectorAll("track"))) {
      // Set once the file arrives, because a line already on screen does not move when its position changes.
      element.onload = () => {
        for (const cue of Array.from(element.track.cues ?? [])) {
          if (cue instanceof VTTCue) cue.line = SUBTITLE_LINE;
        }
      };
    }
    for (const track of Array.from(video.textTracks)) {
      track.mode = track.language === subtitle ? "showing" : "disabled";
    }
  }, [subtitle, subtitleLanguages]);

  const load = useCallback(async () => {
    const video = videoRef.current;
    if (!video) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setStage("loading");
    try {
      const url = await fetchPlaybackUrl(project.id, controller.signal);
      if (controller.signal.aborted) return;
      video.preload = "metadata";
      video.src = url;
      video.load();
      if (wantsPlay.current) {
        video.play().catch(() => {
          // Browsers may refuse to start with sound here. The big play button is showing, so one
          // press carries on. A refused start must not read as a broken video.
          wantsPlay.current = false;
        });
      }
    } catch (error) {
      if (controller.signal.aborted) return;
      setErrorKind(error instanceof PlaybackError ? error.kind : "network");
      setStage("error");
    }
  }, [project.id]);

  const start = useCallback(() => {
    wantsPlay.current = true;
    refreshes.current = 0;
    void load();
  }, [load]);

  // Started from a dialog, which the visitor has just opened in order to watch. React's development
  // mode mounts everything twice, so waiting a tick keeps that from fetching a link twice.
  useEffect(() => {
    if (!autoStart) return;
    const timer = window.setTimeout(start, 0);
    return () => window.clearTimeout(timer);
  }, [autoStart, start]);

  // Stops any download as soon as the player goes away.
  useEffect(() => {
    const video = videoRef.current;
    return () => {
      abortRef.current?.abort();
      if (video) {
        video.pause();
        video.removeAttribute("src");
        video.load();
      }
      window.clearTimeout(hideTimer.current);
    };
  }, []);

  useEffect(() => {
    const update = () => setFullscreen(document.fullscreenElement === rootRef.current);
    document.addEventListener("fullscreenchange", update);
    return () => document.removeEventListener("fullscreenchange", update);
  }, []);

  const showControls = useCallback(() => {
    setControlsVisible(true);
    window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => {
      if (!videoRef.current?.paused) setControlsVisible(false);
    }, CONTROLS_HIDE_MS);
  }, []);

  function togglePlay() {
    const video = videoRef.current;
    if (!video) return;
    if (stage === "idle") {
      start();
      return;
    }
    if (video.paused) {
      wantsPlay.current = true;
      video.play().catch(() => {
        wantsPlay.current = false;
      });
    } else {
      wantsPlay.current = false;
      video.pause();
    }
  }

  function seekTo(seconds: number) {
    const video = videoRef.current;
    if (!video || !Number.isFinite(video.duration)) return;
    const next = Math.min(video.duration, Math.max(0, seconds));
    video.currentTime = next;
    lastTime.current = next;
    setTime(next);
  }

  function changeVolume(next: number) {
    const video = videoRef.current;
    if (!video) return;
    const clamped = Math.min(1, Math.max(0, next));
    video.volume = clamped;
    video.muted = clamped === 0;
  }

  function toggleMute() {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    if (!video.muted && video.volume === 0) video.volume = 0.5;
  }

  function toggleFullscreen() {
    const root = rootRef.current;
    const video = videoRef.current;
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else if (root?.requestFullscreen) {
      root.requestFullscreen().catch(() => video?.webkitEnterFullscreen?.());
    } else {
      video?.webkitEnterFullscreen?.();
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const target = event.target as HTMLElement;
    // The subtitle list uses the arrow keys and Space for itself.
    if (target.tagName === "SELECT") return;
    const onButton = target.tagName === "BUTTON";
    const onVolume = target.dataset.control === "volume";
    const onSeek = target.dataset.control === "seek";
    const video = videoRef.current;
    showControls();

    switch (event.key) {
      case " ":
      case "k":
      case "K":
        // A focused button already answers Space by itself.
        if (event.key === " " && onButton) return;
        event.preventDefault();
        togglePlay();
        break;
      case "m":
      case "M":
        toggleMute();
        break;
      case "f":
      case "F":
        toggleFullscreen();
        break;
      case "ArrowLeft":
      case "ArrowRight":
        if (onVolume || !video) return;
        event.preventDefault();
        seekTo(video.currentTime + (event.key === "ArrowRight" ? SEEK_STEP_SECONDS : -SEEK_STEP_SECONDS));
        break;
      case "ArrowUp":
      case "ArrowDown":
        if (onVolume || !video) return;
        event.preventDefault();
        if (onSeek) seekTo(video.currentTime + (event.key === "ArrowUp" ? SEEK_STEP_SECONDS : -SEEK_STEP_SECONDS));
        else changeVolume(video.volume + (event.key === "ArrowUp" ? VOLUME_STEP : -VOLUME_STEP));
        break;
      case "Home":
        if (onVolume) return;
        event.preventDefault();
        seekTo(0);
        break;
      case "End":
        if (onVolume || !video) return;
        event.preventDefault();
        seekTo(video.duration);
        break;
      default:
    }
  }

  // An expired link shows up as a media error. One fresh link is tried, from the same position, before
  // telling the visitor anything. The route refuses a new link once a project is unpublished.
  function onVideoError() {
    const video = videoRef.current;
    if (!video?.error || video.error.code === MediaError.MEDIA_ERR_ABORTED) return;
    if (refreshes.current < 1) {
      refreshes.current += 1;
      refreshedAt.current = lastTime.current;
      void load();
      return;
    }
    setErrorKind(sawMetadata.current ? "network" : "unsupported");
    setStage("error");
  }

  function onLoadedMetadata() {
    const video = videoRef.current;
    if (!video) return;
    sawMetadata.current = true;
    if (Number.isFinite(video.duration)) setDuration(video.duration);
    if (lastTime.current > 0 && lastTime.current < video.duration) video.currentTime = lastTime.current;
    setStage("ready");
  }

  const percent = percentOf(time, duration);
  const volumePercent = muted ? 0 : volume * 100;
  const showBigPlay = stage === "idle" || (stage === "ready" && !playing && !buffering);
  const showSpinner = stage === "loading" || (stage === "ready" && buffering);
  const barVisible = stage === "ready" && (controlsVisible || !playing);

  return (
    <div
      ref={rootRef}
      role="region"
      tabIndex={-1}
      aria-label={`Video player: ${project.title}`}
      aria-describedby={hintId}
      data-player-root
      data-testid="video-player"
      className={`relative aspect-video w-full overflow-hidden bg-ink focus:outline-none ${fullscreen ? "h-full" : ""} ${barVisible || stage !== "ready" ? "" : "cursor-none"}`}
      onKeyDown={onKeyDown}
      onPointerMove={showControls}
      onPointerDown={(event) => {
        lastPointer.current = event.pointerType;
      }}
      onFocusCapture={showControls}
    >
      <p id={hintId} className="sr-only">
        Space or K plays and pauses. Left and right arrows skip 5 seconds. M mutes. F goes full screen.
      </p>

      {/* preload="none", and no source at all until someone presses play, so a page view downloads nothing. */}
      <video
        ref={videoRef}
        preload="none"
        playsInline
        poster={project.poster_url ?? undefined}
        data-testid="video-element"
        className="absolute inset-0 h-full w-full object-contain"
        onClick={() => {
          if (stage !== "ready") return;
          // On touch the first tap only brings the controls back.
          if (lastPointer.current === "touch" && !controlsVisible) {
            showControls();
            return;
          }
          togglePlay();
        }}
        onLoadedMetadata={onLoadedMetadata}
        onDurationChange={(event) => {
          const value = event.currentTarget.duration;
          if (Number.isFinite(value)) setDuration(value);
        }}
        onTimeUpdate={(event) => {
          const now = event.currentTarget.currentTime;
          setTime(now);
          if (now > 0) lastTime.current = now;
          // Real progress past the point of failure means the fresh link worked. A later expiry then
          // gets its own fresh link, while a file that never plays stops after one.
          if (refreshes.current > 0 && now > refreshedAt.current + 1) refreshes.current = 0;
        }}
        onPlay={() => {
          setPlaying(true);
          showControls();
        }}
        onPause={() => {
          setPlaying(false);
          setControlsVisible(true);
        }}
        onEnded={() => {
          wantsPlay.current = false;
          lastTime.current = 0;
          setPlaying(false);
          setControlsVisible(true);
        }}
        onWaiting={() => setBuffering(true)}
        onPlaying={() => setBuffering(false)}
        onCanPlay={() => setBuffering(false)}
        onVolumeChange={(event) => {
          setVolume(event.currentTarget.volume);
          setMuted(event.currentTarget.muted);
        }}
        onError={onVideoError}
      >
        {subtitleLanguages.map((code) => (
          <track key={code} kind="subtitles" src={`/api/subtitles/${project.id}/${code}`} srcLang={code} label={subtitleLabel(code)} />
        ))}
      </video>

      {showSpinner ? (
        <div role="status" className="pointer-events-none absolute inset-0 flex items-center justify-center" data-testid="player-loading">
          <span aria-hidden="true" className="size-10 animate-spin rounded-full border-2 border-bone/25 border-t-bone" />
          <span className="sr-only">{stage === "loading" ? "Loading the video" : "Buffering"}</span>
        </div>
      ) : null}

      {showBigPlay ? (
        <button
          type="button"
          aria-label={stage === "idle" ? `Play ${project.title}` : "Play"}
          data-testid="player-start"
          className="absolute left-1/2 top-1/2 flex size-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-[2px] bg-bone text-ink transition-opacity duration-200 hover:opacity-85"
          onClick={togglePlay}
        >
          <Icon path={PLAY} />
        </button>
      ) : null}

      {stage === "error" ? (
        <div role="alert" className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-ink/90 p-6 text-center" data-testid="player-error">
          <p className="text-xl font-medium tracking-tight text-bone">{ERROR_TEXT[errorKind].title}</p>
          <p className="max-w-md text-sm text-ash">{ERROR_TEXT[errorKind].body}</p>
          <button
            type="button"
            className="mt-2 inline-flex min-h-11 items-center rounded-[2px] border border-line-strong px-5 py-2 text-sm font-medium text-bone transition-colors duration-200 hover:bg-charcoal"
            onClick={start}
          >
            Try again
          </button>
        </div>
      ) : null}

      {stage === "ready" ? (
        <div
          data-testid="player-controls"
          className={`absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink/85 via-ink/40 to-transparent px-3 pb-1 pt-10 transition-opacity duration-200 sm:px-5 ${barVisible ? "opacity-100" : "opacity-0"}`}
        >
          <input
            type="range"
            min={0}
            max={duration || 0}
            step="any"
            value={Math.min(time, duration || 0)}
            aria-label="Seek"
            aria-valuetext={`${formatClock(time)} of ${formatClock(duration)}`}
            data-control="seek"
            data-testid="player-seek"
            className={rangeClass}
            style={fill(percent)}
            onChange={(event) => seekTo(Number(event.target.value))}
          />
          <div className="flex items-center gap-1">
            <button type="button" aria-label={playing ? "Pause" : "Play"} data-testid="player-toggle" className={controlClass} onClick={togglePlay}>
              <Icon path={playing ? PAUSE : PLAY} />
            </button>
            <button type="button" aria-label={muted ? "Unmute" : "Mute"} data-testid="player-mute" className={controlClass} onClick={toggleMute}>
              <Icon path={muted || volume === 0 ? VOLUME_OFF : VOLUME_ON} />
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={VOLUME_STEP}
              value={muted ? 0 : volume}
              aria-label="Volume"
              data-control="volume"
              data-testid="player-volume"
              className={`${rangeClass} hidden !w-24 sm:block`}
              style={fill(volumePercent)}
              onChange={(event) => changeVolume(Number(event.target.value))}
            />
            <span data-testid="player-time" className="ms-2 whitespace-nowrap font-time text-xs text-bone">
              {formatClock(time)} / {formatClock(duration)}
            </span>
            {subtitleLanguages.length > 0 ? (
              // The browser's own list, so it works by touch, by keyboard and in full screen with nothing to position.
              <label className={`${controlClass} relative ms-auto cursor-pointer`} title="Subtitles">
                <span
                  aria-hidden="true"
                  className={`rounded-[3px] border border-bone px-1.5 py-0.5 text-xs font-semibold ${subtitle ? "bg-bone text-ink" : "text-bone"}`}
                >
                  CC
                </span>
                <select
                  aria-label="Subtitles"
                  data-testid="player-subtitles"
                  value={subtitle}
                  className="absolute inset-0 cursor-pointer opacity-0 [color-scheme:dark]"
                  onChange={(event) => {
                    setSubtitle(event.target.value as SubtitleCode | "");
                    // Back to the player, so Space plays and pauses again.
                    rootRef.current?.focus();
                  }}
                >
                  <option value="">Off</option>
                  {subtitleLanguages.map((code) => (
                    <option key={code} value={code} lang={code}>
                      {subtitleLabel(code)}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <button
              type="button"
              aria-label={fullscreen ? "Exit full screen" : "Full screen"}
              data-testid="player-fullscreen"
              className={`${controlClass} ${subtitleLanguages.length > 0 ? "" : "ms-auto"}`}
              onClick={toggleFullscreen}
            >
              <Icon path={fullscreen ? FULLSCREEN_EXIT : FULLSCREEN} />
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
