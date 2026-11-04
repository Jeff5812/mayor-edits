import type { SVGProps } from "react";

// The playhead: the marker every editor watches all day, dropping into the top of a frame. It reads as an M.
export function BrandMark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 20 20" width="20" height="20" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M1 2H5L9 7.6V18H1Z" />
      <path d="M19 2H15L11 7.6V18H19Z" />
    </svg>
  );
}
