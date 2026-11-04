// Browser only. A chosen file cannot pass through a page change, so the "new project" page leaves it
// here for the project page to pick up. It is only a handle: no file contents are read or kept.
const pending = new Map<string, File>();

export function leavePendingVideo(projectId: string, file: File) {
  pending.set(projectId, file);
}

// Reading leaves it in place, because React can render a page more than once before showing it.
export function peekPendingVideo(projectId: string): File | null {
  return pending.get(projectId) ?? null;
}

export function clearPendingVideo(projectId: string) {
  pending.delete(projectId);
}
