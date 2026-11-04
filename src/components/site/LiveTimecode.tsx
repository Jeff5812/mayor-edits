"use client";

import { useEffect, useRef } from "react";

const FRAMES_PER_SECOND = 24;
// Slower than the digits appear to run, and easy on a phone. Nobody can read the last digit anyway.
const REDRAW_MS = 90;

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function timecode(elapsedMs: number) {
  const frames = Math.floor((elapsedMs / 1000) * FRAMES_PER_SECOND);
  const seconds = Math.floor(frames / FRAMES_PER_SECOND);
  return `${pad(Math.floor(seconds / 3600))}:${pad(Math.floor(seconds / 60) % 60)}:${pad(seconds % 60)}:${pad(frames % FRAMES_PER_SECOND)}`;
}

// A running timecode with a record light, the way an edit suite shows one, counting from when the page opened. It
// writes one text node directly, so nothing else on the page ever re-renders because of it.
export function LiveTimecode() {
  const digits = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const start = performance.now();
    const timer = window.setInterval(() => {
      if (digits.current) digits.current.textContent = timecode(performance.now() - start);
    }, REDRAW_MS);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <span aria-hidden="true" className="inline-flex items-center gap-2 font-time text-xs tracking-[-0.01em] text-ash">
      <span className="rec-light" />
      <span ref={digits}>00:00:00:00</span>
    </span>
  );
}
