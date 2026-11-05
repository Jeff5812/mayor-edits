import { BrandMark } from "./BrandMark";

// The stand-in on every frame, under any poster: a film leader carrying the playhead. It is what shows before a
// position has a video, while a poster loads, and if one ever fails, so no frame is ever an empty box.
export function DefaultFrame({ mark = true }: { mark?: boolean }) {
  return (
    <svg viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true" className="frame-default">
      <g fill="none" stroke="currentColor">
        <path d="M0 450H550M1050 450H1600M800 0V200M800 700V900" vectorEffect="non-scaling-stroke" />
        <circle cx="800" cy="450" r="250" vectorEffect="non-scaling-stroke" />
        <circle cx="800" cy="450" r="310" vectorEffect="non-scaling-stroke" />
        {/* A viewfinder's corner marks. */}
        <path d="M60 140V60H140M1460 60H1540V140M1540 760V840H1460M140 840H60V760" strokeWidth="2" vectorEffect="non-scaling-stroke" />
      </g>
      {mark ? <BrandMark x="745" y="395" width="110" height="110" className="text-white/25" /> : null}
    </svg>
  );
}
