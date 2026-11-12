"use client";

import { type CSSProperties, useState } from "react";
import { formatClock, percentOf } from "@/lib/media/format";

// A range drawn as a fine line, filled to what has played and shaded to what has loaded.
export function rangeStyle(fill: number, loaded = fill) {
  return { "--fill": `${fill}%`, "--loaded": `${loaded}%` } as CSSProperties;
}

// The seek line. Pointing along it shows the time at that spot above it, as in most players.
export function SeekBar({ time, duration, loadedTo, onSeek }: { time: number; duration: number; loadedTo: number; onSeek: (seconds: number) => void }) {
  const [pointing, setPointing] = useState<number | null>(null);
  return (
    <div className="relative">
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
        className="player-range"
        style={rangeStyle(percentOf(time, duration), percentOf(loadedTo, duration))}
        onChange={(event) => onSeek(Number(event.target.value))}
        onPointerMove={(event) => {
          if (event.pointerType !== "mouse" || !duration) return;
          const box = event.currentTarget.getBoundingClientRect();
          setPointing(Math.min(1, Math.max(0, (event.clientX - box.left) / box.width)));
        }}
        onPointerLeave={() => setPointing(null)}
      />
      {pointing !== null ? (
        <span aria-hidden="true" data-testid="player-scrub-time" className="player-scrub-time" style={{ "--at": `${pointing * 100}%` } as CSSProperties}>
          {formatClock(pointing * duration)}
        </span>
      ) : null}
    </div>
  );
}
