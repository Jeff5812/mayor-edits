import type { ReactNode } from "react";

// The player's icons, drawn as one set: the same 24-unit box, the same line weight, the same rounded ends.
const STROKE = { fill: "none", stroke: "currentColor", strokeWidth: 1.75, strokeLinecap: "round", strokeLinejoin: "round" } as const;

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-[1.375rem]">
      {children}
    </svg>
  );
}

export function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="play-glyph">
      <path fill="currentColor" d="M8 5.14v13.72c0 .79.87 1.27 1.54.84l10.78-6.86a1 1 0 0 0 0-1.68L9.54 4.3A1 1 0 0 0 8 5.14Z" />
    </svg>
  );
}

export function SmallPlayIcon() {
  return (
    <Icon>
      <path fill="currentColor" d="M8 5.14v13.72c0 .79.87 1.27 1.54.84l10.78-6.86a1 1 0 0 0 0-1.68L9.54 4.3A1 1 0 0 0 8 5.14Z" />
    </Icon>
  );
}

// A small screen inside a big one: keep watching in a floating window.
export function PictureInPictureIcon() {
  return (
    <Icon>
      <rect {...STROKE} x="3" y="5" width="18" height="14" rx="2" />
      <rect x="12" y="11.25" width="6.5" height="5.25" rx="1" fill="currentColor" />
    </Icon>
  );
}

export function PauseIcon() {
  return (
    <Icon>
      <rect x="6.5" y="5" width="4" height="14" rx="1.1" fill="currentColor" />
      <rect x="13.5" y="5" width="4" height="14" rx="1.1" fill="currentColor" />
    </Icon>
  );
}

function TenLabel() {
  return (
    <text x="12" y="16.1" textAnchor="middle" fill="currentColor" fontSize="6.75" fontWeight="600">
      10
    </text>
  );
}

export function BackTenIcon() {
  return (
    <Icon>
      <path {...STROKE} d="M12 5.5a7.5 7.5 0 1 1-7.1 5.1M12 2.75 9 5.5l3 2.75" />
      <TenLabel />
    </Icon>
  );
}

export function ForwardTenIcon() {
  return (
    <Icon>
      <path {...STROKE} d="M12 5.5a7.5 7.5 0 1 0 7.1 5.1M12 2.75l3 2.75-3 2.75" />
      <TenLabel />
    </Icon>
  );
}

export function VolumeIcon({ muted }: { muted: boolean }) {
  return (
    <Icon>
      <path
        fill="currentColor"
        d="M3.5 9.75v4.5c0 .41.34.75.75.75H7l4.2 3.6c.49.42 1.25.07 1.25-.57V6a.75.75 0 0 0-1.25-.57L7 9H4.25a.75.75 0 0 0-.75.75Z"
      />
      {muted ? <path {...STROKE} d="m16 9.75 4.5 4.5M20.5 9.75l-4.5 4.5" /> : <path {...STROKE} d="M15.75 9.25a4 4 0 0 1 0 5.5M18.25 6.75a7.5 7.5 0 0 1 0 10.5" />}
    </Icon>
  );
}

export function SubtitlesIcon() {
  return (
    <Icon>
      <rect {...STROKE} x="3.25" y="5.25" width="17.5" height="13.5" rx="2.75" />
      <path {...STROKE} d="M7 11.5h2.5M12 11.5h5M7 15h6.5M16 15h1" />
    </Icon>
  );
}

export function FullscreenIcon({ exit = false }: { exit?: boolean }) {
  return (
    <Icon>
      <path
        {...STROKE}
        d={
          exit
            ? "M9 4.5V8a1 1 0 0 1-1 1H4.5M15 4.5V8a1 1 0 0 0 1 1h3.5M19.5 15H16a1 1 0 0 0-1 1v3.5M4.5 15H8a1 1 0 0 1 1 1v3.5"
            : "M4.5 9V5.5a1 1 0 0 1 1-1H9M15 4.5h3.5a1 1 0 0 1 1 1V9M19.5 15v3.5a1 1 0 0 1-1 1H15M9 19.5H5.5a1 1 0 0 1-1-1V15"
        }
      />
    </Icon>
  );
}

export function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4">
      <path {...STROKE} strokeWidth={2.25} d="m5 12.5 4.75 4.75L19 7.5" />
    </svg>
  );
}
