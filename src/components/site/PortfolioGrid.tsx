import type { CSSProperties, ReactNode } from "react";
import { CardPlayer } from "@/components/video/CardPlayer";
import { formatClock } from "@/lib/media/format";
import type { PublicProject } from "@/types/domain";
import { DefaultFrame } from "./DefaultFrame";
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
// Smaller screens show only enough empty frames to say the reel goes on: a phone a pair, a tablet two rows. Real videos are
// never left out. Desktop shows every position, because its rows of three are complete by construction.
const PHONE_EMPTY_LIMIT = 2;
const TABLET_EMPTY_LIMIT = 4;

// The classes for one empty frame in the rows below the lead: shown or hidden at each size, and never leaving half a row.
function emptyThirdClass(index: number, empties: number, realThirds: number): string {
  const phone = Math.min(empties, PHONE_EMPTY_LIMIT);
  let tablet = Math.min(empties, TABLET_EMPTY_LIMIT);
  if ((realThirds + tablet) % 2 === 1) tablet -= 1;
  return [
    index < phone ? (phone === 1 ? "col-span-2" : "col-span-1") : "max-sm:hidden",
    index < tablet ? "sm:col-span-1" : "sm:max-lg:hidden",
    "lg:col-span-2",
  ].join(" ");
}

// Rows are always completed with default frames, so the reel never ends in a gap.
function slotsFor(projects: number): Slot[] {
  const rows = Math.ceil((Math.max(projects, MIN_SLOTS) - 1) / ROW);
  return ["first", ...Array.from({ length: rows * ROW }, (): Slot => "third")];
}

function revealClass(order: number) {
  return order < 4 ? "reveal-load" : "reveal-scroll";
}

// A position in the reel with no video yet: only the default frame, with no name or running time to invent.
function EmptySlot({ className, order }: { className: string; order: number }) {
  return (
    <div
      data-empty
      style={{ "--order": order } as CSSProperties}
      className={`card plate relative isolate p-1.5 sm:p-2 ${className} ${revealClass(order)}`}
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
  const empties = slots.length - projects.length;
  const realThirds = Math.max(0, projects.length - 1);
  return (
    <div className="grid grid-cols-2 items-start gap-4 sm:gap-6 lg:grid-cols-6 lg:gap-6">
      {children}
      {slots.map((slot, index) =>
        projects[index] ? (
          <ProjectCard key={projects[index].id} project={projects[index]} slot={slot} order={index} />
        ) : (
          <EmptySlot
            key={`empty-${index}`}
            className={slot === "first" ? SLOT_CLASS.first : emptyThirdClass(index - projects.length, empties, realThirds)}
            order={index}
          />
        ),
      )}
      {/* When every position is taken, the owner still gets one more to upload into. Visitors never see it. */}
      {projects.length >= slots.length ? (
        <OwnerOnly>
          <EmptySlot className={SLOT_CLASS.third} order={slots.length} />
        </OwnerOnly>
      ) : null}
      <OwnerUploadDialog />
    </div>
  );
}
