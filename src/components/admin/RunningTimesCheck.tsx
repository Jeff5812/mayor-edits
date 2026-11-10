"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { explainFailure } from "@/lib/media/failures";
import { readStoredVideoDuration } from "@/lib/media/frames";
import type { MeasuredRunningTime } from "@/lib/projects/action-types";
import { getAdminVideoUrl, saveRunningTimes } from "@/lib/projects/actions";

type Check = { phase: "idle" } | { phase: "checking"; done: number } | { phase: "finished"; message: string; failed?: boolean };

function outcome(total: number, corrected: number, unreadable: number): string {
  const parts = [corrected > 0 ? `${corrected} corrected` : unreadable === 0 ? `All ${total} right` : null, unreadable > 0 ? `${unreadable} unreadable` : null];
  return parts.filter(Boolean).join(", ");
}

// Measures each finished video's running time from the stored file itself, one at a time, and corrects any that are wrong or
// missing. Only the start of each file is fetched, where an MP4 keeps its length.
export function RunningTimesCheck({ videos }: { videos: { id: string; seconds: number | null }[] }) {
  const router = useRouter();
  const [check, setCheck] = useState<Check>({ phase: "idle" });

  async function run() {
    setCheck({ phase: "checking", done: 0 });
    const changed: MeasuredRunningTime[] = [];
    let unreadable = 0;
    try {
      for (const [index, video] of videos.entries()) {
        const link = await getAdminVideoUrl(video.id);
        const seconds = link.ok ? await readStoredVideoDuration(link.data.url) : null;
        if (seconds === null) unreadable += 1;
        else if (seconds !== video.seconds) changed.push({ id: video.id, seconds });
        setCheck({ phase: "checking", done: index + 1 });
      }
      let corrected = 0;
      if (changed.length > 0) {
        const result = await saveRunningTimes(changed);
        if (!result.ok) {
          setCheck({ phase: "finished", message: result.error, failed: true });
          return;
        }
        corrected = result.data.corrected;
        router.refresh();
      }
      setCheck({ phase: "finished", message: outcome(videos.length, corrected, unreadable) });
    } catch (error) {
      setCheck({ phase: "finished", message: explainFailure("The running times could not be checked.", error), failed: true });
    }
  }

  if (videos.length === 0) return null;
  return (
    <div className="mt-1.5 grid justify-items-start text-[0.8125rem] leading-snug" data-testid="running-times">
      {check.phase === "checking" ? (
        <p role="status" className="flex min-h-11 items-center text-ash">
          Checking {check.done + 1 > videos.length ? videos.length : check.done + 1} of {videos.length}
        </p>
      ) : (
        <button
          type="button"
          className="inline-flex min-h-11 cursor-pointer items-center text-ash underline underline-offset-4 transition-colors duration-200 hover:text-bone"
          onClick={() => void run()}
        >
          Re-check running times
        </button>
      )}
      {check.phase === "finished" ? (
        <p role={check.failed ? "alert" : "status"} className={check.failed ? "text-danger" : "text-bone"}>
          {check.message}
        </p>
      ) : null}
    </div>
  );
}
