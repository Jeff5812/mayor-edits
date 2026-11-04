"use client";

import { useEffect } from "react";

// How far a card leans toward the pointer, in degrees.
const MAX_TILT = 3.5;

// Lets cards lean toward the pointer and catch its light. One listener serves the whole page, and it only hands
// numbers to CSS, which does all the drawing, so the cards themselves stay plain server-rendered markup. Touch
// screens and people who asked for less motion never run any of this.
export function PointerDepth() {
  useEffect(() => {
    if (!window.matchMedia("(hover: hover) and (prefers-reduced-motion: no-preference)").matches) return;

    let card: HTMLElement | null = null;
    let queued = 0;
    let x = 0;
    let y = 0;

    function release(element: HTMLElement | null) {
      ["--tilt-x", "--tilt-y", "--glare-x", "--glare-y"].forEach((name) => element?.style.removeProperty(name));
    }

    function draw() {
      queued = 0;
      if (!card) return;
      const box = card.getBoundingClientRect();
      const across = (x - box.left) / box.width;
      const down = (y - box.top) / box.height;
      card.style.setProperty("--tilt-x", `${((0.5 - down) * MAX_TILT).toFixed(2)}deg`);
      card.style.setProperty("--tilt-y", `${((across - 0.5) * MAX_TILT).toFixed(2)}deg`);
      card.style.setProperty("--glare-x", `${(across * 100).toFixed(1)}%`);
      card.style.setProperty("--glare-y", `${(down * 100).toFixed(1)}%`);
    }

    function onMove(event: PointerEvent) {
      const under = event.target instanceof Element ? event.target.closest<HTMLElement>(".card") : null;
      if (under !== card) {
        release(card);
        card = under;
      }
      x = event.clientX;
      y = event.clientY;
      if (card && !queued) queued = requestAnimationFrame(draw);
    }

    document.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      document.removeEventListener("pointermove", onMove);
      cancelAnimationFrame(queued);
      release(card);
    };
  }, []);

  return null;
}
