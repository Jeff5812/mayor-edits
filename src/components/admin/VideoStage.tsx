"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { DefaultFrame } from "@/components/site/DefaultFrame";
import { PlayIcon } from "@/components/video/PlayerIcons";
import { formatBytes, formatClock, percentOf } from "@/lib/media/format";
import { posterUrl } from "@/lib/media/poster-url";
import type { UploadState } from "@/lib/media/upload-controller";
import { getAdminVideoUrl } from "@/lib/projects/actions";
import type { Project } from "@/types/domain";
import { alertClass } from "./styles";

// Said over the frame while there is no video to play.
function frameNote(project: Project, upload: UploadState): string {
  const percent = `${Math.round(percentOf(upload.bytesUploaded, upload.bytesTotal))}%`;
  if (upload.phase === "checking") return "Checking the file";
  if (upload.phase === "uploading") return upload.offline ? `Waiting for the connection at ${percent}` : `Uploading ${percent}`;
  if (upload.phase === "paused") return `Upload paused at ${percent}`;
  if (upload.phase === "attaching") return "Finishing the upload";
  return project.upload_status === "uploading" || project.upload_status === "failed" ? "Upload not finished" : "No video yet";
}

// The project page's main picture: the cut itself, on the same kind of screen visitors see it on. It downloads nothing
// until the owner presses play, and it plays drafts too, which the public player will not.
export function VideoStage({ project, upload }: { project: Project; upload: UploadState }) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Next.js keeps a page the owner leaves in the document, hidden, and a hidden video keeps playing. Leaving pauses it, and
  // coming back finds it where it stopped.
  useLayoutEffect(() => {
    const video = videoRef.current;
    return () => video?.pause();
  }, [url]);

  const poster = posterUrl(project.poster_path);
  const ready = Boolean(project.video_path) && project.upload_status === "ready";

  async function open() {
    setLoading(true);
    setError(null);
    const result = await getAdminVideoUrl(project.id);
    setLoading(false);
    if (result.ok) setUrl(result.data.url);
    else setError(result.error);
  }

  return (
    <section aria-label="The video" className="plate p-1.5 sm:p-2">
      <div className="frame-stage relative aspect-video w-full">
        {url ? (
          <video
            ref={videoRef}
            src={url}
            controls
            autoPlay
            preload="metadata"
            playsInline
            className="absolute inset-0 h-full w-full rounded-[2px] bg-ink object-contain"
            // A link lasts an hour, so one opened long ago may have run out. Pressing play again fetches a fresh one.
            onError={() => {
              setUrl(null);
              setError("The video could not be loaded. Press play to try again.");
            }}
          >
            <track kind="captions" />
          </video>
        ) : (
          <>
            <div className="frame-inner">
              <DefaultFrame />
              {poster ? (
                // eslint-disable-next-line @next/next/no-img-element -- a public storage image, already sized when it was uploaded
                <img src={poster} alt="" className="frame-image" />
              ) : (
                <>
                  <span className="light-leak" />
                  <span className="leader-sweep" />
                </>
              )}
              <div className="frame-shade" />
            </div>
            {ready ? (
              <button type="button" aria-label="Watch this video" disabled={loading} className="card-press" onClick={() => void open()}>
                {loading ? <span aria-hidden="true" className="player-spinner animate-spin" /> : null}
                {loading ? null : (
                  <span aria-hidden="true" className="play-disc">
                    <PlayIcon />
                  </span>
                )}
              </button>
            ) : (
              <p className="frame-chip absolute bottom-2 left-2" data-testid="stage-note">
                {frameNote(project, upload)}
              </p>
            )}
          </>
        )}
      </div>
      {ready ? (
        <p className="flex items-baseline justify-between gap-4 px-1.5 pb-1 pt-2.5 text-sm text-ash sm:px-2">
          <span className="font-time tabular-nums">{project.duration_seconds ? formatClock(project.duration_seconds) : "Running time unknown"}</span>
          <span className="tabular-nums">{formatBytes(project.video_size_bytes)}</span>
        </p>
      ) : null}
      {error ? (
        <p role="alert" className={`m-1.5 sm:m-2 ${alertClass}`}>
          {error}
        </p>
      ) : null}
    </section>
  );
}
