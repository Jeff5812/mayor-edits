import type { UploadTarget } from "@/lib/media/multipart-session";
import type { FieldErrors } from "./schema";

export interface ActionFailure {
  ok: false;
  error: string;
  fieldErrors?: FieldErrors;
  duplicate?: DuplicateProject;
  // Some of the file never arrived, so Retry has to send it rather than only attach it.
  resend?: boolean;
}

// What every admin server action returns. Actions never throw into the UI.
export type ActionResult<T = undefined> = { ok: true; data: T; notice?: string } | ActionFailure;

export interface DuplicateProject {
  id: string;
  title: string;
}

export interface PrepareVideoInput {
  projectId: string;
  sizeBytes: number;
  target: UploadTarget | null;
}

export interface FinalizeVideoInput extends UploadTarget {
  projectId: string;
  sizeBytes: number;
  fingerprint: string;
  durationSeconds: number | null;
}
