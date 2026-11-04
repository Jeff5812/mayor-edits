"use client";

import { useRef, useState } from "react";
import { flushSync } from "react-dom";
import type { PublicProject } from "@/types/domain";
import { VideoPlayer } from "./VideoPlayer";

const STAGE = "video-stage";

// Moves one named element into another across a state change, so the card's frame grows into the player and
// shrinks back. Browsers without view transitions, and people who asked for less motion, just get the change.
function morph(update: () => void, from: () => HTMLElement | null | undefined, to: () => HTMLElement | null | undefined) {
  if (!document.startViewTransition || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    update();
    return;
  }
  const source = from();
  if (source) source.style.viewTransitionName = STAGE;
  const transition = document.startViewTransition(() => {
    if (source) source.style.viewTransitionName = "";
    update();
    const target = to();
    if (target) target.style.viewTransitionName = STAGE;
  });
  void transition.finished.finally(() => {
    const target = to();
    if (target) target.style.viewTransitionName = "";
  });
}

// A button laid over its whole card, which opens the player. Nothing is fetched until then. A native modal
// dialog traps focus and closes on Escape, and focus returns to the card afterwards. Playback starts only
// because the visitor pressed play, never by itself.
export function VideoDialog({ project }: { project: PublicProject }) {
  const [open, setOpen] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const frame = () => triggerRef.current?.parentElement?.querySelector<HTMLElement>("[data-frame-inner]");
  const player = () => dialogRef.current?.querySelector<HTMLElement>("[data-player-root]");

  function show() {
    morph(
      () => {
        flushSync(() => setOpen(true));
        dialogRef.current?.showModal();
        // Focus lands on the player and not on the close button, so Space plays and pauses.
        player()?.focus();
      },
      frame,
      player,
    );
  }

  function hide() {
    morph(
      () => {
        dialogRef.current?.close();
        flushSync(() => setOpen(false));
      },
      player,
      frame,
    );
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="dialog"
        aria-label={`Play ${project.title}`}
        data-testid="card-play"
        className="absolute inset-0 z-10 cursor-pointer outline-offset-4"
        onClick={show}
      />
      <dialog
        ref={dialogRef}
        aria-label={project.title}
        data-testid="video-dialog"
        className="cinema fixed inset-0 m-0 h-dvh max-h-none w-full max-w-none flex-col items-center justify-center gap-4 overflow-hidden bg-ink p-3 text-bone open:flex backdrop:bg-ink sm:p-6"
        onCancel={(event) => {
          // Escape: close through the same transition as the button.
          event.preventDefault();
          hide();
        }}
        onClose={() => {
          setOpen(false);
          triggerRef.current?.focus();
        }}
        onClick={(event) => {
          // A click on the empty space around the film.
          if (event.target === event.currentTarget) hide();
        }}
      >
        {open && project.poster_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={project.poster_url} alt="" aria-hidden="true" className="cinema-light" />
        ) : null}
        <div className="relative flex w-full max-w-[min(100%,calc((100dvh-8rem)*16/9))] items-end justify-between gap-4">
          <div className="min-w-0">
            <p dir="auto" className="display truncate text-[clamp(1.75rem,3vw,2.75rem)] leading-none">
              {project.title}
            </p>
            {project.category ? <p className="mt-1 truncate text-sm text-ash">{[project.category, project.language].filter(Boolean).join(" · ")}</p> : null}
          </div>
          <button
            type="button"
            data-testid="video-dialog-close"
            className="inline-flex min-h-11 shrink-0 cursor-pointer items-center gap-2 rounded-[2px] border border-white/25 px-4 text-sm font-medium text-bone transition-colors duration-200 hover:bg-white/10"
            onClick={hide}
          >
            <svg viewBox="0 0 12 12" aria-hidden="true" className="size-3 fill-none stroke-current stroke-[1.5]">
              <path d="M1.500 1.500 10.500 10.500M10.500 1.500 1.500 10.500" />
            </svg>
            Close
          </button>
        </div>
        <div className="relative w-full max-w-[min(100%,calc((100dvh-8rem)*16/9))] shadow-[0_40px_120px_-30px_rgb(0_0_0_/_0.9)]">
          {open ? <VideoPlayer project={project} autoStart /> : null}
        </div>
      </dialog>
    </>
  );
}
