import Link from "next/link";
import { formatBytes, percentOf } from "@/lib/media/format";
import { posterUrl } from "@/lib/media/poster-url";
import { FREE_VIDEO_STORAGE_BYTES } from "@/lib/media/validation";
import { totalVideoBytes } from "@/lib/projects/admin-queries";
import type { Project, UploadStatus } from "@/types/domain";
import { ProjectRowActions } from "./ProjectRowActions";
import { panelClass, primaryButtonClass } from "./styles";

const uploadLabels: Record<UploadStatus, string> = {
  none: "No video yet",
  uploading: "Uploading",
  ready: "Video ready",
  failed: "Upload failed",
};

function StorageMeter({ used }: { used: number }) {
  const percent = percentOf(used, FREE_VIDEO_STORAGE_BYTES);
  return (
    <section aria-label="Video storage" className={`mt-8 ${panelClass}`}>
      <p className="flex flex-wrap justify-between gap-x-4 text-sm text-bone">
        <span>Video storage used</span>
        <span className="tabular-nums" data-testid="storage-used">
          {formatBytes(used)} of {formatBytes(FREE_VIDEO_STORAGE_BYTES)} free allowance
        </span>
      </p>
      <div
        role="meter"
        aria-label="Video storage used"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(percent)}
        aria-valuetext={`${formatBytes(used)} of ${formatBytes(FREE_VIDEO_STORAGE_BYTES)}`}
        className="mt-3 h-2 w-full overflow-hidden bg-charcoal"
      >
        <div className={`h-full ${percent >= 90 ? "bg-danger" : "bg-bone"}`} style={{ width: `${Math.min(percent, 100)}%` }} />
      </div>
      <p className="mt-3 text-sm text-ash">
        This adds up the videos listed here. Plays are free and never count. Above 10 GB, Cloudflare charges about $0.015 per GB a month for the extra.
      </p>
    </section>
  );
}

function ProjectRow({ project }: { project: Project }) {
  const poster = posterUrl(project.poster_path);
  return (
    <li className={`${panelClass} grid gap-5 sm:grid-cols-[10rem_minmax(0,1fr)]`} data-testid="project-row">
      <div className="aspect-video w-40 border border-line bg-charcoal">
        {poster ? (
          // eslint-disable-next-line @next/next/no-img-element -- small admin thumbnail of a public storage image
          <img src={poster} alt="" loading="lazy" className="h-full w-full object-cover" />
        ) : null}
      </div>
      <div className="min-w-0">
        <h2 dir="auto" className="break-words text-lg font-medium text-bone">
          <Link href={`/admin/projects/${project.id}`} className="underline-offset-4 hover:underline">
            {project.title}
          </Link>
        </h2>
        <dl className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-sm">
          <div className="flex gap-2">
            <dt className="text-ash">Status</dt>
            <dd className={project.status === "published" ? "font-medium text-bone" : "text-bone"}>
              {project.status === "published" ? "Published" : "Draft"}
            </dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-ash">Category</dt>
            <dd className="break-words text-bone">{project.category}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-ash">Upload</dt>
            <dd className={project.upload_status === "failed" ? "text-danger" : "text-bone"}>{uploadLabels[project.upload_status]}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-ash">File size</dt>
            <dd className="tabular-nums text-bone">{project.video_size_bytes != null ? formatBytes(project.video_size_bytes) : "None"}</dd>
          </div>
        </dl>
        <div className="mt-4">
          <ProjectRowActions project={project} />
        </div>
      </div>
    </li>
  );
}

// The projects dashboard, given its data. The page handles who may see it and where the data comes from.
export function ProjectsDashboard({ projects }: { projects: Project[] | null }) {
  return (
    <main id="main" className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-medium tracking-tight text-bone sm:text-4xl">Projects</h1>
        <Link href="/admin/projects/new" className={primaryButtonClass}>
          Add a project
        </Link>
      </div>

      {projects === null ? (
        <p role="alert" className="mt-6 border border-danger bg-graphite p-4 text-bone">
          The projects could not be loaded. The database may be paused or unreachable. Please try again shortly.
        </p>
      ) : (
        <>
          <StorageMeter used={totalVideoBytes(projects)} />
          {projects.length === 0 ? (
            <p className={`mt-6 ${panelClass} text-bone`}>No projects yet. Add the first one to get it onto the site.</p>
          ) : (
            <ul className="mt-6 grid gap-4">
              {projects.map((project) => (
                <ProjectRow key={project.id} project={project} />
              ))}
            </ul>
          )}
        </>
      )}
    </main>
  );
}
