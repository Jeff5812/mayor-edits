import type { CSSProperties, ReactNode } from "react";
import { VideoDialog } from "@/components/video/VideoDialog";
import { formatClock } from "@/lib/media/format";
import type { PublicProject } from "@/types/domain";
import { BrandMark } from "./BrandMark";
import { OwnerEditLink, OwnerOnly, OwnerUploadButton, OwnerUploadDialog } from "./OwnerControls";

// The reel always shows at least this many frames: the lead and a row of three. Positions without a video show
// the default frame and no text, and the signed-in owner can hover one to upload.
const MIN_SLOTS = 4;

type Slot = "first" | "bigLeft" | "bigRight" | "stack" | "third" | "half";

const SLOT_CLASS: Record<Slot, string> = {
  first: "sm:col-span-2 lg:col-span-4",
  bigLeft: "sm:col-span-2 lg:col-span-4 lg:row-span-2",
  bigRight: "sm:col-span-2 lg:col-span-4 lg:col-start-3 lg:row-span-2",
  stack: "lg:col-span-2",
  third: "lg:col-span-2",
  half: "lg:col-span-3",
};

const LARGE: Slot[] = ["first", "bigLeft", "bigRight"];

// The work is hung as a composition, not a grid of equal boxes: the lead beside the headline, three across, then
// a large frame with two stacked beside it, alternating sides. A leftover project stays an ordinary card.
function slotsFor(count: number): Slot[] {
  const slots: Slot[] = ["first"];
  for (let group = 0; slots.length < count; group += 1) {
    const left = count - slots.length;
    if (left === 1) slots.push("third");
    else if (left === 2) slots.push("half", "half");
    else if (group % 2 === 0) slots.push("third", "third", "third");
    else slots.push(group % 4 === 1 ? "bigRight" : "bigLeft", "stack", "stack");
  }
  return slots;
}

function revealClass(order: number) {
  return order < 4 ? "reveal-load" : "reveal-scroll";
}

// The stand-in on every frame, under any poster: a film leader carrying the playhead. It is what shows before a
// position has a video, while a poster loads, and if one ever fails, so no frame is ever an empty box.
function DefaultFrame() {
  return (
    <svg viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true" className="frame-default">
      <g fill="none" stroke="currentColor">
        <path d="M0 450H550M1050 450H1600M800 0V200M800 700V900" vectorEffect="non-scaling-stroke" />
        <circle cx="800" cy="450" r="250" vectorEffect="non-scaling-stroke" />
        <circle cx="800" cy="450" r="310" vectorEffect="non-scaling-stroke" />
        {/* A viewfinder's corner marks. */}
        <path d="M60 140V60H140M1460 60H1540V140M1540 760V840H1460M140 840H60V760" strokeWidth="2" vectorEffect="non-scaling-stroke" />
      </g>
      <BrandMark x="745" y="395" width="110" height="110" className="text-white/25" />
    </svg>
  );
}

function PlayMark() {
  return (
    <span aria-hidden="true" className="frame-play btn-primary">
      <svg viewBox="0 0 20 20" className="size-3.5 fill-current">
        <path d="M5 3 L17 10 L5 17 Z" />
      </svg>
      <span className="frame-play-label">Play</span>
    </span>
  );
}

// A position in the reel with no video yet: only the default frame, with no name or running time to invent.
function EmptySlot({ slot, order }: { slot: Slot; order: number }) {
  return (
    <div data-empty style={{ "--order": order } as CSSProperties} className={`card plate relative isolate p-1.5 sm:p-2 ${SLOT_CLASS[slot]} ${revealClass(order)}`}>
      <div className="relative aspect-video w-full">
        <div className="frame-inner">
          <DefaultFrame />
          {/* An empty screen still runs: a slow light leak, and a film leader's sweep. */}
          <span className="light-leak" />
          <span className="leader-sweep" />
          <div className="frame-shade" />
        </div>
        <OwnerUploadButton />
      </div>
    </div>
  );
}

function ProjectCard({ project, slot, order }: { project: PublicProject; slot: Slot; order: number }) {
  const large = LARGE.includes(slot);
  const details = [project.category, project.language].filter(Boolean).join(" · ");
  return (
    <article
      data-testid="public-project"
      style={{ "--order": order } as CSSProperties}
      className={`card plate relative isolate flex flex-col p-1.5 sm:p-2 ${SLOT_CLASS[slot]} ${revealClass(order)}`}
    >
      {project.poster_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={project.poster_url} alt="" aria-hidden="true" loading="lazy" decoding="async" className="card-glow" />
      ) : null}
      <div className="relative aspect-video w-full">
        <div data-frame-inner className="frame-inner">
          <DefaultFrame />
          {project.poster_url ? (
            // Posters are sized when they are uploaded, so nothing downstream needs to re-encode them.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={project.poster_url}
              alt=""
              loading={order < 4 ? "eager" : "lazy"}
              fetchPriority={order === 0 ? "high" : "auto"}
              decoding="async"
              className="frame-image"
            />
          ) : null}
          <div className="frame-shade" />
          <span className="scrub" />
          <PlayMark />
        </div>
      </div>
      <div className="grid gap-1 px-1.5 pb-1.5 pt-3 sm:px-2 sm:pb-2">
        <div className="flex items-baseline justify-between gap-4">
          <h3 dir="auto" className={`display display-small min-w-0 break-words tracking-[0.018em] ${large ? "text-[clamp(2.25rem,3vw,3rem)] leading-[1.1]" : "text-[2rem] leading-9"}`}>
            {project.title}
          </h3>
          {project.duration_seconds ? (
            <time dateTime={`PT${project.duration_seconds}S`} className="shrink-0 font-time text-sm leading-none tracking-[-0.01em] text-ash">
              {formatClock(project.duration_seconds)}
            </time>
          ) : null}
        </div>
        {details ? <p className="text-sm leading-5 text-mute transition-colors duration-200 [.card:hover_&]:text-ash">{details}</p> : null}
        {large && project.description ? <p className="mt-1 line-clamp-2 max-w-[62ch] text-sm leading-relaxed text-mute">{project.description}</p> : null}
      </div>
      <VideoDialog project={project} />
      <OwnerEditLink projectId={project.id} />
    </article>
  );
}

export function PortfolioGrid({ projects, children }: { projects: PublicProject[]; children: ReactNode }) {
  const slots = slotsFor(Math.max(projects.length, MIN_SLOTS));
  return (
    <div className="grid items-start gap-x-4 gap-y-5 sm:grid-cols-2 lg:grid-cols-6 lg:gap-x-6 lg:gap-y-7 lg:[grid-auto-flow:dense]">
      {children}
      {slots.map((slot, index) =>
        projects[index] ? (
          <ProjectCard key={projects[index].id} project={projects[index]} slot={slot} order={index} />
        ) : (
          <EmptySlot key={`empty-${index}`} slot={slot} order={index} />
        ),
      )}
      {/* When every position is taken, the owner still gets one more to upload into. Visitors never see it. */}
      {projects.length >= MIN_SLOTS ? (
        <OwnerOnly>
          <EmptySlot slot="third" order={slots.length} />
        </OwnerOnly>
      ) : null}
      <OwnerUploadDialog />
    </div>
  );
}
