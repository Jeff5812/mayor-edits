import type { CSSProperties, ReactNode } from "react";
import { CardPlayer } from "@/components/video/CardPlayer";
import { formatClock } from "@/lib/media/format";
import type { PublicProject } from "@/types/domain";
import { BrandMark } from "./BrandMark";
import { OwnerEditLink, OwnerOnly, OwnerUploadButton, OwnerUploadDialog } from "./OwnerControls";

// The reel always shows at least this many frames: the lead beside the headline, then two even rows of three.
// Positions without a video show the default frame and no text, and the signed-in owner can hover one to upload.
const MIN_SLOTS = 7;
const ROW = 3;

type Slot = "first" | "third";

const SLOT_CLASS: Record<Slot, string> = {
  first: "col-span-2 lg:col-span-4",
  third: "col-span-2 sm:col-span-1 lg:col-span-2",
};
// A frame with nothing to show takes half the width on a phone, so a new reel is not a long scroll past empty frames.
const EMPTY_SLOT_CLASS: Record<Slot, string> = { ...SLOT_CLASS, third: "col-span-1 lg:col-span-2" };

// Rows are always completed with default frames, so the reel never ends in a gap.
function slotsFor(projects: number): Slot[] {
  const rows = Math.ceil((Math.max(projects, MIN_SLOTS) - 1) / ROW);
  return ["first", ...Array.from({ length: rows * ROW }, (): Slot => "third")];
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

// A position in the reel with no video yet: only the default frame, with no name or running time to invent.
function EmptySlot({ slot, order }: { slot: Slot; order: number }) {
  return (
    <div
      data-empty
      data-pair={slot === "third" ? "" : undefined}
      style={{ "--order": order } as CSSProperties}
      className={`card plate relative isolate p-1.5 sm:p-2 ${EMPTY_SLOT_CLASS[slot]} ${revealClass(order)}`}
    >
      <div className="frame-stage relative aspect-video w-full">
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
  const large = slot === "first";
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
      <div className="frame-stage relative aspect-video w-full">
        <div className="frame-inner">
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
        </div>
        <CardPlayer project={project} />
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
      <OwnerEditLink projectId={project.id} />
    </article>
  );
}

export function PortfolioGrid({ projects, children }: { projects: PublicProject[]; children: ReactNode }) {
  const slots = slotsFor(projects.length);
  return (
    <div className="grid grid-cols-2 items-start gap-4 sm:gap-5 lg:grid-cols-6 lg:gap-6">
      {children}
      {slots.map((slot, index) =>
        projects[index] ? (
          <ProjectCard key={projects[index].id} project={projects[index]} slot={slot} order={index} />
        ) : (
          <EmptySlot key={`empty-${index}`} slot={slot} order={index} />
        ),
      )}
      {/* When every position is taken, the owner still gets one more to upload into. Visitors never see it. */}
      {projects.length >= slots.length ? (
        <OwnerOnly>
          <EmptySlot slot="third" order={slots.length} />
        </OwnerOnly>
      ) : null}
      <OwnerUploadDialog />
    </div>
  );
}
