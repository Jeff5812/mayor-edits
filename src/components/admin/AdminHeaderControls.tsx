"use client";

import Link from "next/link";
import type { FormEvent, MouseEvent } from "react";
import { signOutAction, signOutEverywhereAction } from "@/app/admin/login/actions";
import { anyUploadBusy, stopAllUploads, useUploadSummary } from "@/lib/media/upload-registry";

// The parts of the admin header that need the browser: the upload indicator, and the account menu's items.

// Keeps a running upload in sight from any admin page, and leads back to its project.
export function UploadIndicator({ className }: { className: string }) {
  const uploads = useUploadSummary();
  if (uploads.length === 0) return null;
  const [first] = uploads;
  const label =
    first.phase === "failed"
      ? "Upload stopped"
      : first.offline
        ? "Waiting for connection"
        : first.phase === "paused"
          ? "Upload paused"
          : uploads.length > 1
            ? `${uploads.length} uploads`
            : `${first.percent}%`;
  return (
    <Link href={`/admin/projects/${first.projectId}`} className={className} data-testid="upload-indicator">
      <span aria-hidden="true" className="rec-light" />
      {first.phase === "uploading" && !first.offline && uploads.length === 1 ? <span className="max-sm:sr-only">Uploading </span> : null}
      <span className="tabular-nums">{label}</span>
    </Link>
  );
}

const STOPS_UPLOAD = "A video is still uploading, and signing out stops it. Sign out anyway?";

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
