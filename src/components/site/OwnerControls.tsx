"use client";

import dynamic from "next/dynamic";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { buttonClass } from "@/components/ui/Button";
import { useIsOwner } from "@/lib/auth/owner-session";
import { VIDEO_ACCEPT } from "@/lib/media/validation";

// Everything the signed-in owner gets on top of the public reel. Each control renders nothing for anyone else. The
// upload itself is the admin area's own editor, downloaded only when the owner actually starts an upload.
const ProjectEditor = dynamic(() => import("@/components/admin/ProjectEditor").then((module) => module.ProjectEditor), { ssr: false });

// There is one dialog for the whole page, not one per frame. Publishing replaces the frame with a real card, and a
// dialog living inside that frame would vanish in the owner's face.
let openUploadDialog: ((file: File) => void) | null = null;

export function OwnerOnly({ children }: { children: ReactNode }) {
  return useIsOwner() ? children : null;
}

export function OwnerUploadButton() {
  const isOwner = useIsOwner();
  const input = useRef<HTMLInputElement>(null);
  if (!isOwner) return null;
  return (
    <div className="owner-overlay" data-testid="owner-upload">
      <input
        ref={input}
        type="file"
        accept={VIDEO_ACCEPT}
        aria-label="Video file to upload"
        data-testid="owner-video-input"
        tabIndex={-1}
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0];
          // Clearing it lets the same file be chosen again.
          event.target.value = "";
          if (file) openUploadDialog?.(file);
        }}
      />
      <button type="button" className={buttonClass("primary")} onClick={() => input.current?.click()}>
        <svg viewBox="0 0 16 16" aria-hidden="true" className="size-4 fill-none stroke-current stroke-[1.75]">
          <path d="M8 11V2.500M4.500 6 8 2.500 11.500 6M2.500 13.500h11" />
        </svg>
        {/* Just the arrow where a frame is too small for the words. */}
        <span className="sr-only @[13rem]:not-sr-only">Upload a video</span>
      </button>
    </div>
  );
}

export function OwnerEditLink({ projectId }: { projectId: string }) {
  const isOwner = useIsOwner();
  if (!isOwner) return null;
  return (
    <a href={`/admin/projects/${projectId}`} data-testid="owner-edit" className={buttonClass("outline", "owner-edit !min-h-9 !px-3.5 !py-1.5")}>
      Edit
    </a>
  );
}

export function OwnerUploadDialog() {
  const isOwner = useIsOwner();
  const [file, setFile] = useState<File | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (!isOwner) return;
    openUploadDialog = (chosen) => {
      setFile(chosen);
      dialogRef.current?.showModal();
    };
    return () => {
      openUploadDialog = null;
    };
  }, [isOwner]);

  if (!isOwner) return null;

  // Closing stops an upload, though choosing the same file again carries on from where it stopped.
  function close() {
    const uploading = dialogRef.current?.querySelector('[data-testid="upload-progress"]');
    if (uploading && !window.confirm("A video is still uploading. Close and stop it for now?")) return;
    dialogRef.current?.close();
  }

  return (
    <dialog
      ref={dialogRef}
      aria-label="Upload a video"
      data-testid="owner-upload-dialog"
      className="plate m-auto max-h-[92dvh] w-[min(72rem,94vw)] max-w-none overflow-y-auto p-5 text-bone backdrop:bg-ink/80 sm:p-8"
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      onClose={() => setFile(null)}
    >
      <div className="flex items-center justify-between gap-4">
        <p className="display text-4xl">Upload a video</p>
        <button type="button" className={buttonClass("outline", "!min-h-10 !px-4 !py-2")} onClick={close}>
          Close
        </button>
      </div>
      {file ? <ProjectEditor key={`${file.name}-${file.size}`} project={null} initialVideo={file} /> : null}
    </dialog>
  );
}
