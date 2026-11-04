import type { CSSProperties } from "react";
import { SITE } from "@/lib/site";

// The name closes the reel like an end title, and answers the pointer: each letter lifts and catches the light,
// and its neighbours catch a little of it. Pressing it goes back to the top. All of it is CSS.
export function EndTitle() {
  return (
    <a href="#top" aria-label={`${SITE.name}, back to top`} data-testid="end-title" className="end-title">
      {[...SITE.name].map((letter, index) =>
        letter === " " ? (
          <span key={index} aria-hidden="true" className="end-title-space" />
        ) : (
          <span key={index} aria-hidden="true" data-letter={letter} style={{ "--i": index } as CSSProperties} className="end-title-letter">
            {letter}
          </span>
        ),
      )}
    </a>
  );
}
