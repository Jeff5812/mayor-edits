"use client";

import Link from "next/link";
import type { FormEvent, MouseEvent } from "react";
import { signOutAction, signOutEverywhereAction } from "@/app/admin/login/actions";
import { type UploadSummary, anyUploadBusy, stopAllUploads, useUploadSummary } from "@/lib/media/upload-registry";

// The parts of the admin header that need the browser: the upload indicator, and the account menu's items.

const SAID: Record<Exclude<UploadSummary["kind"], "uploading">, string> = {
  paused: "Upload paused",
  offline: "Waiting for connection",
  stopped: "Upload stopped",
  subtitles: "Making subtitles",
};

// Keeps a running upload, or subtitles being made, in sight from any admin page, and leads back to its project.
export function UploadIndicator({ className }: { className: string }) {
  const uploads = useUploadSummary();
  if (uploads.length === 0) return null;
  const [first] = uploads;
  const sending = first.kind === "uploading" && uploads.length === 1;
  const label = first.kind === "uploading" ? (uploads.length > 1 ? `${uploads.length} uploads` : `${first.percent}%`) : SAID[first.kind];
  return (
    <Link href={`/admin/projects/${first.projectId}`} className={className} data-testid="upload-indicator">
      <span aria-hidden="true" className="rec-light" />
      {sending ? <span className="max-sm:sr-only">Uploading </span> : null}
      <span className="tabular-nums">{label}</span>
    </Link>
  );
}

const STOPS_UPLOAD = "A video is still uploading or getting its subtitles, and signing out stops it. Sign out anyway?";

function signingOut(event: FormEvent) {
  if (anyUploadBusy() && !window.confirm(STOPS_UPLOAD)) {
    event.preventDefault();
    return;
  }
  stopAllUploads();
}

// Next.js keeps the admin's frame when the owner moves to the password page, so the menu closes itself first rather than
// still being open on coming back.
function closeMenu(event: MouseEvent<HTMLElement>) {
  event.currentTarget.closest<HTMLElement>("[popover]")?.hidePopover();
}

export function AccountMenuItems({ itemClass }: { itemClass: string }) {
  return (
    <>
      <Link href="/admin/login?flow=set-password" className={itemClass} onClick={closeMenu}>
        Change password
      </Link>
      <form action={signOutAction} onSubmit={signingOut}>
        <button type="submit" className={itemClass}>
          Sign out
        </button>
      </form>
      <form action={signOutEverywhereAction} onSubmit={signingOut}>
        <button type="submit" className={itemClass}>
          Sign out on all devices
        </button>
      </form>
    </>
  );
}
