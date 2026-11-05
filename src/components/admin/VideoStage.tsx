"use client";

import { useState } from "react";
import { DefaultFrame } from "@/components/site/DefaultFrame";
import { PlayIcon } from "@/components/video/PlayerIcons";
import { formatBytes, formatClock } from "@/lib/media/format";
import { posterUrl } from "@/lib/media/poster-url";
import { getAdminVideoUrl } from "@/lib/projects/actions";
import type { Project } from "@/types/domain";
import { alertClass } from "./styles";

// The project page's main picture: the cut itself, on the same kind of screen visitors see it on. It downloads nothing
// until the owner presses play, and it plays drafts too, which the public player will not.
export function VideoStage({ project }: { project: Project }) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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
          <video src={url} controls autoPlay preload="metadata" playsInline className="absolute inset-0 h-full w-full rounded-[2px] bg-ink object-contain">
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
              <p className="frame-chip absolute bottom-2 left-2">{project.upload_status === "uploading" ? "Upload not finished" : "No video yet"}</p>
            )}
          </>
        )}
      </div>
      {ready ? (
        <p className="flex items-baseline justify-between gap-4 px-1.5 pb-1 pt-2.5 text-sm text-ash sm:px-2">
          <span className="font-time tabular-nums">{formatClock(project.duration_seconds)}</span>
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
