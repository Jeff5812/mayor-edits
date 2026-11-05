import Link from "next/link";
import type { CSSProperties } from "react";
import { DefaultFrame } from "@/components/site/DefaultFrame";
import { LiveTimecode } from "@/components/site/LiveTimecode";
import { formatBytes, formatClock, percentOf } from "@/lib/media/format";
import { posterUrl } from "@/lib/media/poster-url";
import { FREE_VIDEO_STORAGE_BYTES } from "@/lib/media/validation";
import { totalVideoBytes } from "@/lib/projects/admin-queries";
import type { Project, UploadStatus } from "@/types/domain";
import { PlusIcon, StarIcon } from "./AdminIcons";
import { PageHead } from "./PageHead";
import { ProjectRowActions } from "./ProjectRowActions";
import { StatusPill } from "./StatusPill";
import { alertClass, pageClass, primaryButtonClass } from "./styles";

// Said over the frame, because a project in one of these states cannot go on the reel yet.
const uploadProblem: Partial<Record<UploadStatus, string>> = {
  none: "No video yet",
  uploading: "Upload not finished",
  failed: "Upload failed",
};

const FREE_GB = FREE_VIDEO_STORAGE_BYTES / 1000 ** 3;

function Reading({ label, value }: { label: string; value: string }) {
  return (
    <div className="readout-cell">
      <p className="label">{label}</p>
      <p className="display mt-2.5 text-[2.75rem] leading-none tabular-nums">{value}</p>
    </div>
  );
}

// The state of the whole reel at a glance, as one instrument rather than a row of separate boxes.
function Readout({ projects }: { projects: Project[] }) {
  const used = totalVideoBytes(projects);
  const percent = percentOf(used, FREE_VIDEO_STORAGE_BYTES);
  const published = projects.filter((project) => project.status === "published").length;
  const runtime = projects.reduce((total, project) => total + (project.duration_seconds ?? 0), 0);
  return (
    <section aria-label="The reel at a glance" className="readout plate anim-rise">
      <Reading label="Published" value={String(published)} />
      <Reading label="Drafts" value={String(projects.length - published)} />
      <Reading label="Runtime" value={formatClock(runtime)} />
      <div className="readout-cell col-span-3 lg:col-span-1">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4">
          <p className="label">Video storage</p>
          <p className="text-sm tabular-nums text-ash" data-testid="storage-used">
            <span className="font-medium text-bone">{formatBytes(used)}</span> of {FREE_GB} GB free
          </p>
        </div>
        <div
          role="meter"
          aria-label="Video storage used"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(percent)}
          aria-valuetext={`${formatBytes(used)} of ${FREE_GB} GB`}
          className="meter mt-3"
        >
          <div className={`meter-fill ${percent >= 90 ? "is-full" : ""}`} style={{ inlineSize: `${percent}%` }} />
        </div>
        <p className="mt-2.5 text-[0.8125rem] leading-snug text-mute">Plays are free and never count. Past {FREE_GB} GB, about $0.015 per GB a month.</p>
      </div>
    </section>
  );
}

function ProjectCard({ project, order }: { project: Project; order: number }) {
  const poster = posterUrl(project.poster_path);
  const problem = uploadProblem[project.upload_status];
  const details = [project.category, project.language, project.video_size_bytes != null ? formatBytes(project.video_size_bytes) : null].filter(Boolean).join(" · ");
  const editHref = `/admin/projects/${project.id}`;
  return (
    <li data-testid="project-row" style={{ "--order": order } as CSSProperties} className="card plate reveal-load relative isolate flex flex-col p-1.5 sm:p-2">
      {poster ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={poster} alt="" aria-hidden="true" loading="lazy" decoding="async" className="card-glow" />
      ) : null}
      <div className="frame-stage relative aspect-video w-full">
        <div className="frame-inner">
          <DefaultFrame />
          {poster ? (
            // eslint-disable-next-line @next/next/no-img-element -- a public storage image, already sized when it was uploaded
            <img src={poster} alt="" loading="lazy" decoding="async" className="frame-image" />
          ) : (
            <>
              <span className="light-leak" />
              <span className="leader-sweep" />
            </>
          )}
          <div className="frame-shade" />
        </div>
        {/* The whole picture opens the project. The Edit button says the same thing to keyboards and screen readers. */}
        <Link href={editHref} tabIndex={-1} aria-hidden="true" className="absolute inset-0" />
        <div className="pointer-events-none absolute inset-x-2 top-2 flex items-start justify-between gap-2">
          <StatusPill status={project.status} />
          {project.is_featured ? (
            <span className="frame-chip">
              <StarIcon filled small />
              Featured
            </span>
          ) : null}
        </div>
        {problem ? <p className="frame-chip pointer-events-none absolute bottom-2 left-2">{problem}</p> : null}
        {project.duration_seconds ? (
          <time dateTime={`PT${project.duration_seconds}S`} className="frame-chip pointer-events-none absolute bottom-2 right-2 font-time !font-normal !normal-case !tracking-normal">
            {formatClock(project.duration_seconds)}
          </time>
        ) : null}
      </div>
      <div className="grid gap-1 px-1.5 pt-3 sm:px-2">
        <h2 dir="auto" className="display display-small break-words text-[1.875rem] leading-[1.08] tracking-[0.018em]">
          <Link href={editHref} className="transition-colors duration-200 hover:text-ash">
            {project.title}
          </Link>
        </h2>
        {details ? <p className="break-words text-sm leading-5 text-mute transition-colors duration-200 [.card:hover_&]:text-ash">{details}</p> : null}
      </div>
      <div className="mt-auto px-1.5 pb-1.5 pt-3.5 sm:px-2 sm:pb-2">
        <ProjectRowActions project={project} />
      </div>
    </li>
  );
}

// The next empty frame on the reel: always there, so the list never ends in a gap and adding the next cut is one press away.
function NewProjectTile({ order }: { order: number }) {
  return (
    <li data-empty style={{ "--order": order } as CSSProperties} className="card plate reveal-load relative isolate flex flex-col p-1.5 sm:p-2">
      <div className="frame-stage relative aspect-video w-full">
        <div className="frame-inner">
          <DefaultFrame mark={false} />
          <span className="light-leak" />
          <span className="leader-sweep" />
          <div className="frame-shade" />
        </div>
        <Link href="/admin/projects/new" aria-label="New project" className="absolute inset-0 z-10 flex items-center justify-center">
          <span aria-hidden="true" className="play-disc">
            <PlusIcon className="play-glyph fill-none stroke-current stroke-[1.25] [stroke-linecap:round]" />
          </span>
        </Link>
      </div>
      <div className="grid gap-1 px-1.5 pb-1.5 pt-3 sm:px-2 sm:pb-2">
        <p aria-hidden="true" className="display display-small text-[1.875rem] leading-[1.08] tracking-[0.018em]">
          New project
        </p>
        <p className="text-sm leading-5 text-mute">The next cut for the reel.</p>
      </div>
    </li>
  );
}

function Eyebrow() {
  return (
    <div className="flex items-center gap-4">
      <p className="label">The cutting room</p>
      <LiveTimecode />
    </div>
  );
}

// The projects dashboard, given its data. The page handles who may see it and where the data comes from.
export function ProjectsDashboard({ projects }: { projects: Project[] | null }) {
  return (
    <main id="main" className={pageClass}>
      <PageHead
        eyebrow={<Eyebrow />}
        title="Projects"
        action={
          <Link href="/admin/projects/new" className={primaryButtonClass}>
            <PlusIcon />
            Add a project
          </Link>
        }
      />

      {projects === null ? (
        <p role="alert" className={`mt-6 ${alertClass}`}>
          The projects could not be loaded. The database may be paused or unreachable. Please try again shortly.
        </p>
      ) : (
        <>
          <div className="mt-5 sm:mt-6">
            <Readout projects={projects} />
          </div>
          {projects.length === 0 ? <p className="mt-6 text-sm text-ash">No projects yet. Add the first one to get it onto the site.</p> : null}
          <ul className="mt-4 grid gap-4 sm:mt-5 sm:grid-cols-2 sm:gap-5 lg:mt-6 lg:grid-cols-3 lg:gap-6">
            {projects.map((project, index) => (
              <ProjectCard key={project.id} project={project} order={index} />
            ))}
            <NewProjectTile order={projects.length} />
          </ul>
        </>
      )}
    </main>
  );
}
