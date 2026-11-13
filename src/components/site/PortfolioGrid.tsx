import type { CSSProperties, ReactNode } from "react";
import { CardPlayer } from "@/components/video/CardPlayer";
import { formatClock } from "@/lib/media/format";
import type { PublicProject } from "@/types/domain";
import { DefaultFrame } from "./DefaultFrame";
import { type ReelSize, reelSizes } from "./reel-layout";

// The reel shows the films there are, and no stand-ins, and it is the same page for everyone: uploading and editing happen in
// the owner's area, never here. The lead, the featured film, is the one big frame on every screen. On a phone and a tablet each
// other film is a row beneath it, its frame beside its title, so no row is ever left half empty. On desktop the others fill the
// rows that reelSizes works out, and the frames of one row share one height.
const ROW_TITLE = "line-clamp-2 text-[1.375rem] leading-[1.08] sm:text-[2rem] sm:leading-9";

const SIZE: Record<ReelSize, { place: string; title: string; description: string }> = {
  lead: {
    place: "col-span-2 lg:col-span-4",
    title: "line-clamp-2 text-[2rem] leading-[1.1] sm:text-[clamp(2.25rem,3vw,3rem)]",
    description: "",
  },
  wide: {
    place: "col-span-2 lg:col-span-4 lg:col-start-3",
    title: `${ROW_TITLE} lg:text-[clamp(2.25rem,3vw,3rem)] lg:leading-[1.1]`,
    description: "max-sm:hidden",
  },
  half: { place: "col-span-2 lg:col-span-3", title: ROW_TITLE, description: "max-sm:hidden lg:hidden" },
  third: { place: "col-span-2 lg:col-span-2", title: ROW_TITLE, description: "max-sm:hidden lg:hidden" },
};

function revealClass(order: number) {
  return order < 4 ? "reveal-load" : "reveal-scroll";
}

// Holds the lead's place only while there is no film at all, so the headline is not left on its own.
function EmptySlot({ className }: { className: string }) {
  return (
    <div data-empty style={{ "--order": 0 } as CSSProperties} className={`card plate relative isolate p-1.5 sm:p-2 ${className} ${revealClass(0)}`}>
      <div className="frame-stage relative aspect-video w-full">
        <div className="frame-inner">
          <DefaultFrame />
          {/* An empty screen still runs: a slow light leak, and a film leader's sweep. */}
          <span className="light-leak" />
          <span className="leader-sweep" />
          <div className="frame-shade" />
        </div>
      </div>
    </div>
  );
}

function ProjectCard({ project, size, order }: { project: PublicProject; size: ReelSize; order: number }) {
  const row = size !== "lead";
  const details = [project.category, project.language].filter(Boolean).join(" · ");
  const clock = project.duration_seconds ? formatClock(project.duration_seconds) : null;
  return (
    <article
      data-testid="public-project"
      style={{ "--order": order } as CSSProperties}
      className={`card plate relative isolate flex flex-col p-1.5 sm:p-2 ${row ? "max-lg:flex-row max-lg:items-center max-lg:gap-3 sm:max-lg:gap-5" : ""} ${SIZE[size].place} ${revealClass(order)}`}
    >
      {project.poster_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={project.poster_url} alt="" aria-hidden="true" loading="lazy" decoding="async" className="card-glow" />
      ) : null}
      <div className={`frame-stage relative aspect-video w-full ${row ? "max-lg:w-[44%] max-lg:shrink-0 sm:max-lg:w-[42%]" : ""}`}>
        <div className="frame-inner">
          <DefaultFrame />
          {project.poster_url ? (
            // Thumbnails are sized when they are uploaded, so nothing downstream needs to re-encode them.
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
          {clock ? (
            // In the frame's corner, the way every video gallery shows a running time.
            <time dateTime={`PT${project.duration_seconds}S`} className="frame-time">
              {clock}
            </time>
          ) : null}
        </div>
        <CardPlayer project={project} />
      </div>
      <div className={`grid gap-1 px-1.5 pb-1.5 pt-3 sm:px-2 sm:pb-2 ${row ? "max-lg:min-w-0 max-lg:flex-1 max-lg:py-1 max-lg:ps-0" : ""}`}>
        <h3 dir="auto" className={`display display-small min-w-0 break-words tracking-[0.018em] ${SIZE[size].title}`}>
          {project.title}
        </h3>
        {details ? <p className="text-sm leading-5 text-mute transition-colors duration-200 [.card:hover_&]:text-ash">{details}</p> : null}
        {project.description ? (
          <p className={`mt-1 line-clamp-2 max-w-[62ch] text-sm leading-relaxed text-mute ${SIZE[size].description}`}>{project.description}</p>
        ) : null}
      </div>
    </article>
  );
}

export function PortfolioGrid({ projects, children }: { projects: PublicProject[]; children: ReactNode }) {
  const sizes = reelSizes(projects.length);
  // A lone second film sits under the lead, and the headline keeps it company down the page.
  const heroClass = sizes.includes("wide") ? "col-span-2 lg:sticky lg:top-24 lg:row-span-2 lg:self-start" : "col-span-2";
  return (
    <div className="grid grid-cols-2 items-start gap-4 sm:gap-6 lg:grid-cols-6 lg:items-stretch lg:gap-6">
      <div className={heroClass}>{children}</div>
      {projects.map((project, index) => (
        <ProjectCard key={project.id} project={project} size={sizes[index]} order={index} />
      ))}
      {projects.length === 0 ? <EmptySlot className={SIZE.lead.place} /> : null}
    </div>
  );
}
