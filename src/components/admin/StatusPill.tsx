import type { ProjectStatus } from "@/types/domain";

// Whether a project is on the reel, in the same words everywhere it is shown.
export function StatusPill({ status, className = "" }: { status: ProjectStatus; className?: string }) {
  return (
    <span data-status={status} className={`status-pill ${className}`}>
      <span aria-hidden="true" className="status-dot" />
      {status === "published" ? "Published" : "Draft"}
    </span>
  );
}
