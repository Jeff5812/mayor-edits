"use client";

import { type KeyboardEvent, type MouseEvent, type ReactNode, useCallback, useEffect, useId, useRef, useState } from "react";
import { formatClock } from "@/lib/media/format";
import { PlaybackError, fetchPlaybackUrl, fetchSubtitleLanguages } from "@/lib/media/playback";
import { rememberSubtitle, rememberVolume, rememberedSubtitle, rememberedVolume } from "@/lib/media/player-memory";
import { type SubtitleCode, subtitleLabel } from "@/lib/media/subtitles";
import { saveWatched, watchedAt } from "@/lib/media/watch-progress";
import type { PublicProject } from "@/types/domain";
import {
  BackTenIcon,
  ForwardTenIcon,
  FullscreenIcon,
  PauseIcon,
  PictureInPictureIcon,
  PlayIcon,
  SmallPlayIcon,
  SubtitlesIcon,
  VolumeIcon,
} from "./PlayerIcons";
import { PlayerMenu } from "./PlayerMenu";
import { SeekBar, rangeStyle } from "./SeekBar";

type Stage = "idle" | "loading" | "ready" | "error";
type Side = "" | "is-left" | "is-right";
type ErrorKind = "unavailable" | "network" | "unsupported";

const SEEK_STEP_SECONDS = 5;
const SKIP_SECONDS = 10;
const VOLUME_STEP = 0.1;
const CONTROLS_HIDE_MS = 3000;
const SPEEDS = ["0.75", "1", "1.25", "1.5", "2"];
// Two taps on either side of the picture within this long skip, as on phone video apps.
const DOUBLE_TAP_MS = 300;
// While playing, where the film has got to is saved this often, so closing the tab loses little.
const SAVE_EVERY_SECONDS = 10;
// How long to wait before asking again for a subtitle file that failed, once for each extra try.
const SUBTITLE_RETRY_MS = [1500, 4000];

const ERROR_TEXT: Record<ErrorKind, { title: string; body: string }> = {
  unavailable: { title: "This cut is not available", body: "It may have been taken down. Please try again later." },
  network: { title: "This cut could not load", body: "Check your connection and try again." },
  unsupported: { title: "This cut could not play", body: "Your browser could not play this file. Try another browser." },
};

const CONTROL = "player-control size-10 shrink-0 items-center justify-center";

function remembered(languages: SubtitleCode[]): SubtitleCode | "" {
  const saved = rememberedSubtitle();
  return languages.find((code) => code === saved) ?? "";
}

// The words of the lines showing right now, without any styling tags in the file.
function activeCueText(track: TextTrack) {
  return Array.from(track.activeCues ?? [])
    .map((cue) => (cue instanceof VTTCue ? (cue.getCueAsHTML().textContent ?? "") : ""))
    .join("\n")
    .trim();
}

interface WebkitVideo extends HTMLVideoElement {
  webkitEnterFullscreen?: () => void;
}

export function VideoPlayer({
  project,
  autoStart = false,
  startFullscreen = false,
  onFullscreenExit,
}: {
  project: PublicProject;
  // True when the viewer has just pressed play to open this player.
  autoStart?: boolean;
  startFullscreen?: boolean;
  // Called when the viewer leaves full screen, so a touch screen's card can come back.
  onFullscreenExit?: () => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<WebkitVideo>(null);
  const abortRef = useRef<AbortController | null>(null);
  const hideTimer = useRef<number | undefined>(undefined);
  const lastPointer = useRef("mouse");
  const menusOpen = useRef(0);
  // Where to carry on: where this visitor stopped last time, then wherever a signed link expires part-way through.
  const lastTime = useRef(watchedAt(project.id));
  const savedAt = useRef(0);
  // The last tap on the picture, to tell a double tap, and a single tap held back in case it becomes one.
  const lastTap = useRef(0);
  const heldTap = useRef<number | undefined>(undefined);
  const lastLanguage = useRef<SubtitleCode | "">("");
  const wantsPlay = useRef(false);
  const refreshes = useRef(0);
  const refreshedAt = useRef(0);
  const sawMetadata = useRef(false);

  const [stage, setStage] = useState<Stage>("idle");
  const [errorKind, setErrorKind] = useState<ErrorKind>("network");
  const [playing, setPlaying] = useState(false);
  const [buffering, setBuffering] = useState(false);
  const [time, setTime] = useState(0);
  const [loadedTo, setLoadedTo] = useState(0);
  const [duration, setDuration] = useState(project.duration_seconds ?? 0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [speed, setSpeed] = useState("1");
  const [fullscreen, setFullscreen] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [subtitleLanguages, setSubtitleLanguages] = useState<SubtitleCode[]>([]);
  const [subtitle, setSubtitle] = useState<SubtitleCode | "">("");
  const [cueText, setCueText] = useState("");
  const [subtitleAttempt, setSubtitleAttempt] = useState(0);
  const [subtitleFailed, setSubtitleFailed] = useState(false);
  const [canPictureInPicture, setCanPictureInPicture] = useState(false);
  // A skip, a speed or a subtitle change just made, shown for a moment over the picture. Pausing needs none: the big play
  // button shows.
  const [flash, setFlash] = useState<{ id: number; content: ReactNode; side: Side } | null>(null);
  const hintId = useId();

  // The player only exists once a visitor has pressed play, so a page view asks for none of this.
  useEffect(() => {
    const controller = new AbortController();
    void fetchSubtitleLanguages(project.id, controller.signal).then((languages) => {
      if (controller.signal.aborted) return;
      setSubtitleLanguages(languages);
      setSubtitle(remembered(languages));
    });
    return () => controller.abort();
  }, [project.id]);

  // Only the chosen language's file is downloaded, because the browser fetches a track once it is no longer disabled.
  // The player draws the words itself, so they can sit clear of the controls. An iPhone's own full screen cannot show
  // anything drawn by the page, so there the browser draws them instead.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const tracks = Array.from(video.textTracks);
    const setChosenMode = (mode: TextTrackMode) => {
      for (const track of tracks) {
        track.mode = track.language === subtitle ? mode : "disabled";
        track.oncuechange = track.language === subtitle ? () => setCueText(activeCueText(track)) : null;
      }
    };
    setChosenMode("hidden");
    const onNativeStart = () => setChosenMode("showing");
    const onNativeEnd = () => setChosenMode("hidden");
    video.addEventListener("webkitbeginfullscreen", onNativeStart);
    video.addEventListener("webkitendfullscreen", onNativeEnd);

    // A browser never asks again for a track file that failed, and the viewer would just see nothing. A new try needs a new element.
    let retry: number | undefined;
    const onFileError = () => {
      const wait = SUBTITLE_RETRY_MS[subtitleAttempt];
      if (wait === undefined) setSubtitleFailed(true);
      else retry = window.setTimeout(() => setSubtitleAttempt((attempt) => attempt + 1), wait);
    };
    const chosenFile = Array.from(video.querySelectorAll("track")).find((file) => file.srclang === subtitle);
    chosenFile?.addEventListener("error", onFileError);

    return () => {
      window.clearTimeout(retry);
      chosenFile?.removeEventListener("error", onFileError);
      video.removeEventListener("webkitbeginfullscreen", onNativeStart);
      video.removeEventListener("webkitendfullscreen", onNativeEnd);
    };
  }, [subtitle, subtitleLanguages, subtitleAttempt]);

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

  // React's development mode mounts everything twice, so waiting a tick keeps that from fetching a link twice.
  useEffect(() => {
    if (!autoStart) return;
    // The play button that was pressed is gone, so the player takes the focus and its keys work at once.
    rootRef.current?.focus({ preventScroll: true });
    const timer = window.setTimeout(start, 0);
    return () => window.clearTimeout(timer);
  }, [autoStart, start]);

  // Still inside the press that asked for it, which is the only time a browser allows full screen.
  useEffect(() => {
    if (startFullscreen) rootRef.current?.requestFullscreen?.().catch(() => {});
  }, [startFullscreen]);

  // Stops any download as soon as the player goes away, remembering where the film got to.
  useEffect(() => {
    const video = videoRef.current;
    const timers = { hide: hideTimer, tap: heldTap };
    return () => {
      abortRef.current?.abort();
      if (video) {
        if (video.readyState > 0) saveWatched(project.id, video.currentTime, video.duration);
        video.pause();
        video.removeAttribute("src");
        video.load();
      }
      window.clearTimeout(timers.hide.current);
      window.clearTimeout(timers.tap.current);
    };
  }, [project.id]);

  useEffect(() => {
    const root = rootRef.current;
    const video = videoRef.current;
    let wasFullscreen = false;
    const update = () => {
      const now = document.fullscreenElement === root;
      setFullscreen(now);
      if (wasFullscreen && !now) onFullscreenExit?.();
      wasFullscreen = now;
    };
    // An iPhone's own full screen, the only one it has.
    const nativeEnd = () => onFullscreenExit?.();
    document.addEventListener("fullscreenchange", update);
    video?.addEventListener("webkitendfullscreen", nativeEnd);
    return () => {
      document.removeEventListener("fullscreenchange", update);
      video?.removeEventListener("webkitendfullscreen", nativeEnd);
    };
  }, [onFullscreenExit]);

  // A video should not keep talking after it has been scrolled away.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const observer = new IntersectionObserver(([entry]) => {
      // A film in full screen or in its own floating window is still being watched.
      if (entry.isIntersecting || document.fullscreenElement || document.pictureInPictureElement) return;
      wantsPlay.current = false;
      videoRef.current?.pause();
    });
    observer.observe(root);
    return () => observer.disconnect();
  }, []);

  const showControls = useCallback(() => {
    setControlsVisible(true);
    window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => {
      if (!videoRef.current?.paused && menusOpen.current === 0) setControlsVisible(false);
    }, CONTROLS_HIDE_MS);
  }, []);

  const onMenuOpenChange = useCallback(
    (open: boolean) => {
      menusOpen.current = Math.max(0, menusOpen.current + (open ? 1 : -1));
      showControls();
    },
    [showControls],
  );

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

  function showFlash(content: ReactNode, side: Side = "") {
    setFlash({ id: performance.now(), content, side });
  }

  function skip(seconds: number, side: Side = "") {
    const video = videoRef.current;
    if (!video) return;
    seekTo(video.currentTime + seconds);
    showFlash(`${seconds > 0 ? "+" : "\u2212"}${Math.abs(seconds)}s`, side);
  }

  function changeVolume(next: number) {
    const video = videoRef.current;
    if (!video) return;
    const clamped = Math.min(1, Math.max(0, next));
    video.volume = clamped;
    video.muted = clamped === 0;
    rememberVolume(clamped);
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

  function chooseSubtitle(code: string) {
    const next = code as SubtitleCode | "";
    setCueText("");
    setSubtitleAttempt(0);
    setSubtitleFailed(false);
    setSubtitle(next);
    if (next) lastLanguage.current = next;
    rememberSubtitle(next);
  }

  // C turns subtitles off, or back on in the language last chosen.
  function toggleSubtitles() {
    if (subtitleLanguages.length === 0) return;
    const next = subtitle ? "" : lastLanguage.current || remembered(subtitleLanguages) || subtitleLanguages[0];
    chooseSubtitle(next);
    showFlash(next ? subtitleLabel(next) : "Subtitles off");
  }

  function changeSpeed(value: string) {
    setSpeed(value);
    if (videoRef.current) videoRef.current.playbackRate = Number(value);
  }

  function stepSpeed(step: number) {
    const next = SPEEDS[Math.min(SPEEDS.length - 1, Math.max(0, SPEEDS.indexOf(speed) + step))];
    changeSpeed(next);
    showFlash(`${next}x`);
  }

  function togglePictureInPicture() {
    const video = videoRef.current;
    if (!video) return;
    if (document.pictureInPictureElement) void document.exitPictureInPicture().catch(() => {});
    else void video.requestPictureInPicture().catch(() => {});
  }

  // A mouse click plays and pauses. On touch, a tap brings back the controls, a second tap plays or pauses, and two quick
  // taps on either side skip, so a tap on a side waits a moment to see whether another follows.
  function onPictureClick(event: MouseEvent<HTMLVideoElement>) {
    if (stage !== "ready") return;
    if (lastPointer.current !== "touch") {
      togglePlay();
      return;
    }
    const box = event.currentTarget.getBoundingClientRect();
    const share = (event.clientX - box.left) / box.width;
    const side = share < 0.35 ? -1 : share > 0.65 ? 1 : 0;
    const quick = event.timeStamp - lastTap.current < DOUBLE_TAP_MS;
    lastTap.current = event.timeStamp;
    window.clearTimeout(heldTap.current);
    if (quick && side !== 0) {
      skip(side * SKIP_SECONDS, side < 0 ? "is-left" : "is-right");
      return;
    }
    if (!controlsVisible) {
      showControls();
      return;
    }
    if (side === 0) togglePlay();
    else heldTap.current = window.setTimeout(togglePlay, DOUBLE_TAP_MS);
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const target = event.target as HTMLElement;
    // The menus use the arrow keys and Space for themselves.
    if (target.closest("[data-player-menu]")) return;
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
      case "j":
      case "J":
        skip(-SKIP_SECONDS);
        break;
      case "l":
      case "L":
        skip(SKIP_SECONDS);
        break;
      case "c":
      case "C":
        toggleSubtitles();
        break;
      case "<":
      case ">":
        stepSpeed(event.key === ">" ? 1 : -1);
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
        skip(event.key === "ArrowRight" ? SEEK_STEP_SECONDS : -SEEK_STEP_SECONDS);
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
        // 1 to 9 jump a tenth of the way further each, and 0 back to the start.
        if (/^[0-9]$/.test(event.key) && !onVolume && video && Number.isFinite(video.duration)) {
          event.preventDefault();
          seekTo((video.duration * Number(event.key)) / 10);
        }
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
    if (lastTime.current > 0 && lastTime.current < video.duration) {
      video.currentTime = lastTime.current;
      setTime(lastTime.current);
    }
    video.playbackRate = Number(speed);
    video.volume = rememberedVolume();
    setCanPictureInPicture(document.pictureInPictureEnabled === true && !video.disablePictureInPicture);
    setStage("ready");
  }

  const volumePercent = muted ? 0 : volume * 100;
  const showBigPlay = stage === "idle" || (stage === "ready" && !playing && !buffering);
  const showSpinner = stage === "loading" || (stage === "ready" && buffering);
  const barVisible = stage === "ready" && (controlsVisible || !playing);
  const shownCue = subtitleFailed ? "These subtitles could not load. Choose them again to retry." : subtitle ? cueText : "";

  return (
    <div
      ref={rootRef}
      role="region"
      tabIndex={-1}
      aria-label={`Video player: ${project.title}`}
      aria-describedby={hintId}
      data-player-root
      data-testid="video-player"
      className={`player @container ${barVisible || stage !== "ready" ? "" : "cursor-none"}`}
      onKeyDown={onKeyDown}
      onPointerMove={showControls}
      onPointerDown={(event) => {
        lastPointer.current = event.pointerType;
      }}
      onFocusCapture={showControls}
    >
      <p id={hintId} className="sr-only">
        Space or K plays and pauses. J and L skip 10 seconds, and the left and right arrows 5. M mutes, C turns subtitles on and
        off, F goes full screen, and the numbers 0 to 9 jump through the film.
      </p>

      {/* No source at all until someone presses play. An iPhone cannot put the page itself in full screen, so a film
          asked for full screen leaves out playsInline, and the iPhone opens its own full-screen player when it starts. */}
      <video
        ref={videoRef}
        preload="none"
        playsInline={!startFullscreen}
        poster={project.poster_url ?? undefined}
        data-testid="video-element"
        className="absolute inset-0 h-full w-full rounded-[inherit] object-contain"
        onClick={onPictureClick}
        onDoubleClick={() => {
          // On touch two quick taps skip instead.
          if (lastPointer.current !== "touch") toggleFullscreen();
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
          if (Math.abs(now - savedAt.current) >= SAVE_EVERY_SECONDS) {
            savedAt.current = now;
            saveWatched(project.id, now, event.currentTarget.duration);
          }
          // Real progress past the point of failure means the fresh link worked. A later expiry then
          // gets its own fresh link, while a file that never plays stops after one.
          if (refreshes.current > 0 && now > refreshedAt.current + 1) refreshes.current = 0;
        }}
        onProgress={(event) => {
          const { buffered, currentTime } = event.currentTarget;
          for (let index = 0; index < buffered.length; index += 1) {
            if (buffered.start(index) <= currentTime && currentTime <= buffered.end(index)) setLoadedTo(buffered.end(index));
          }
        }}
        onPlay={() => {
          setPlaying(true);
          showControls();
        }}
        onPause={(event) => {
          setPlaying(false);
          setControlsVisible(true);
          saveWatched(project.id, event.currentTarget.currentTime, event.currentTarget.duration);
        }}
        onEnded={(event) => {
          wantsPlay.current = false;
          lastTime.current = 0;
          // Watched to the end, so next time it starts over.
          saveWatched(project.id, event.currentTarget.duration, event.currentTarget.duration);
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
          <track key={`${code}-${subtitleAttempt}`} kind="subtitles" src={`/api/subtitles/${project.id}/${code}`} srcLang={code} label={subtitleLabel(code)} />
        ))}
      </video>

      {fullscreen ? (
        <div className={`player-top ${barVisible ? "" : "is-hidden"}`}>
          <p dir="auto" className="display display-small line-clamp-1 text-[clamp(1.5rem,2.4vw,2.25rem)] leading-tight tracking-[0.018em]">
            {project.title}
          </p>
        </div>
      ) : null}

      {flash ? (
        <div key={flash.id} aria-hidden="true" data-testid="player-flash" className={`player-flash ${flash.side}`} onAnimationEnd={() => setFlash(null)}>
          {flash.content}
        </div>
      ) : null}

      {shownCue ? (
        <div dir="auto" lang={subtitleFailed ? undefined : subtitle} data-testid="player-subtitle" className={`player-subtitle ${barVisible ? "is-raised" : ""}`}>
          <span>{shownCue}</span>
        </div>
      ) : null}

      {showSpinner ? (
        <div role="status" className="pointer-events-none absolute inset-0 flex items-center justify-center" data-testid="player-loading">
          <span aria-hidden="true" className="player-spinner animate-spin" />
          <span className="sr-only">{stage === "loading" ? "Loading the video" : "Buffering"}</span>
        </div>
      ) : null}

      {showBigPlay ? (
        <button
          type="button"
          aria-label={stage === "idle" ? `Play ${project.title}` : "Play"}
          data-testid="player-start"
          // On a small frame the words would land on the button, and the control bar has its own play button right below.
          className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 ${shownCue ? "hidden @lg:block" : ""}`}
          onClick={togglePlay}
        >
          <span aria-hidden="true" className="play-disc">
            <PlayIcon />
          </span>
        </button>
      ) : null}

      {stage === "error" ? (
        <div role="alert" className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-ink/90 p-6 text-center" data-testid="player-error">
          <p className="text-xl font-medium tracking-tight text-bone">{ERROR_TEXT[errorKind].title}</p>
          <p className="max-w-md text-sm text-ash">{ERROR_TEXT[errorKind].body}</p>
          <button
            type="button"
            className="mt-2 inline-flex min-h-11 items-center rounded-[3px] border border-line-strong px-5 py-2 text-sm font-medium text-bone transition-colors duration-200 hover:bg-charcoal"
            onClick={start}
          >
            Try again
          </button>
        </div>
      ) : null}

      {stage === "ready" ? (
        <div data-testid="player-controls" className={`player-bar ${barVisible ? "" : "is-hidden"}`}>
          <SeekBar time={time} duration={duration} loadedTo={loadedTo} onSeek={seekTo} />
          <div className="flex items-center">
            <button type="button" aria-label={playing ? "Pause" : "Play"} title={playing ? "Pause" : "Play"} data-testid="player-toggle" className={`${CONTROL} inline-flex`} onClick={togglePlay}>
              {playing ? <PauseIcon /> : <SmallPlayIcon />}
            </button>
            <button
              type="button"
              aria-label={`Back ${SKIP_SECONDS} seconds`}
              title={`Back ${SKIP_SECONDS} seconds`}
              data-testid="player-back"
              className={`${CONTROL} hidden @sm:inline-flex`}
              onClick={() => seekTo(time - SKIP_SECONDS)}
            >
              <BackTenIcon />
            </button>
            <button
              type="button"
              aria-label={`Forward ${SKIP_SECONDS} seconds`}
              title={`Forward ${SKIP_SECONDS} seconds`}
              data-testid="player-forward"
              className={`${CONTROL} hidden @sm:inline-flex`}
              onClick={() => seekTo(time + SKIP_SECONDS)}
            >
              <ForwardTenIcon />
            </button>
            <button type="button" aria-label={muted ? "Unmute" : "Mute"} title={muted ? "Unmute" : "Mute"} data-testid="player-mute" className={`${CONTROL} inline-flex`} onClick={toggleMute}>
              <VolumeIcon muted={muted || volume === 0} />
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
              className="player-range player-volume hidden @xl:block"
              style={rangeStyle(volumePercent)}
              onChange={(event) => changeVolume(Number(event.target.value))}
            />
            <span data-testid="player-time" className="ms-2 whitespace-nowrap font-time text-xs tabular-nums text-white">
              {formatClock(time)}
              <span className="text-white/60"> / {formatClock(duration)}</span>
            </span>

            <div className="ms-auto flex items-center">
              {subtitleLanguages.length > 0 ? (
                <PlayerMenu
                  title="Subtitles"
                  testId="player-subtitles"
                  triggerTitle={subtitle ? `Subtitles: ${subtitleLabel(subtitle)}` : "Subtitles: off"}
                  triggerClass={`${CONTROL} inline-flex ${subtitle ? "is-on" : ""}`}
                  trigger={<SubtitlesIcon />}
                  options={[{ value: "", label: "Off" }, ...subtitleLanguages.map((code) => ({ value: code, label: subtitleLabel(code), lang: code }))]}
                  value={subtitle}
                  onChange={chooseSubtitle}
                  onOpenChange={onMenuOpenChange}
                />
              ) : null}
              {canPictureInPicture ? (
                <button
                  type="button"
                  aria-label="Picture in picture"
                  title="Picture in picture"
                  data-testid="player-pip"
                  className={`${CONTROL} hidden @md:inline-flex`}
                  onClick={togglePictureInPicture}
                >
                  <PictureInPictureIcon />
                </button>
              ) : null}
              <div className="hidden @md:block">
                <PlayerMenu
                  title="Speed"
                  testId="player-speed"
                  triggerTitle={`Speed: ${speed === "1" ? "normal" : `${speed} times`}`}
                  triggerClass={`${CONTROL} inline-flex font-time text-xs`}
                  trigger={`${speed}x`}
                  options={SPEEDS.map((value) => ({ value, label: value === "1" ? "Normal" : `${value}x` }))}
                  value={speed}
                  onChange={changeSpeed}
                  onOpenChange={onMenuOpenChange}
                />
              </div>
              <button
                type="button"
                aria-label={fullscreen ? "Exit full screen" : "Full screen"}
                title={fullscreen ? "Exit full screen" : "Full screen"}
                data-testid="player-fullscreen"
                className={`${CONTROL} inline-flex`}
                onClick={toggleFullscreen}
              >
                <FullscreenIcon exit={fullscreen} />
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
