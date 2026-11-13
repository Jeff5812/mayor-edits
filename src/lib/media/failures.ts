// One place that decides what a failure is allowed to blame. "Check your connection" is only said
// when the connection is what failed, because a wrong diagnosis sends the owner off in the wrong
// direction. Pure apart from reading navigator.onLine, and safe to call anywhere.

// How browsers report a chosen file that has since become unavailable.
export const UNREADABLE_FILE =
  "This file could not be read. It may have been moved, renamed, changed or deleted since you chose it, or be on a drive that is no longer connected. Please choose it again.";

export function isFileReadError(error: unknown): boolean {
  return error instanceof DOMException && (error.name === "NotReadableError" || error.name === "NotFoundError");
}

function isOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

// What fetch throws when no answer came back: Chrome, Firefox and Safari word it differently.
export function isNetworkFailure(error: unknown): boolean {
  if (isOffline()) return true;
  return error instanceof TypeError && /failed to fetch|networkerror|load failed|network request failed/i.test(error.message);
}

// "summary" says what did not happen. The advice depends on why.
export function explainFailure(summary: string, error: unknown): string {
  if (isNetworkFailure(error)) return `${summary} Check your connection and try again.`;
  return `${summary} Please try again. If it keeps happening, refresh the page.`;
}

// Turns a failed video upload into something the owner can act on. Null means no answer came back.
export function explainUploadFailure(status: number | null): string {
  if (isOffline()) return "Your internet connection dropped. Reconnect, then choose Retry to carry on from where it stopped.";
  if (status === null) return "The upload could not reach video storage. Check your connection, then choose Retry to carry on from where it stopped.";
  if (status === 429) return "Video storage is receiving too many requests right now. Wait a minute, then choose Retry.";
  if (status >= 500) return "The video storage service had a problem. Choose Retry to carry on from where it stopped.";
  return `Video storage refused this upload (error ${status}). Choose Retry, and if it keeps happening the storage settings need checking.`;
}

export interface StorageFailure {
  message?: string;
  status?: number;
  statusCode?: string;
  originalError?: unknown;
}

// Storage reports a refused upload with its real reason in statusCode, sometimes under a status of 400.
export function explainPosterFailure(failure: StorageFailure): string {
  const code = Number(failure.statusCode) || failure.status || null;
  if (code === 401 || code === 403 || /row-level security/i.test(failure.message ?? "")) {
    return "This account is not allowed to save images, or its session has ended. Please sign in again, then try once more.";
  }
  if (code === 413) return "This image is over the 5 MB limit for thumbnails. Please choose a smaller one.";
  if (code === 415) return "Storage does not accept this image type. Please choose a JPEG, PNG or WebP image.";
  if (code !== null) return `Storage refused this image (error ${code}). Please try again.`;
  return explainFailure("The image could not be uploaded.", failure.originalError ?? failure);
}
