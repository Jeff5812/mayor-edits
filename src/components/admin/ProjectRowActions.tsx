"use client";

import Link from "next/link";
import { useEffect, useLayoutEffect, useRef, useState, useTransition } from "react";
import { explainFailure } from "@/lib/media/failures";
import type { ActionResult } from "@/lib/projects/action-types";
import { deleteProject, setProjectFeatured, setProjectPublished } from "@/lib/projects/actions";
import type { Project } from "@/types/domain";
import { StarIcon, TrashIcon } from "./AdminIcons";
import { alertClass, dangerButtonClass, iconButtonClass, primaryButtonClass, smallButtonClass } from "./styles";

export function ProjectRowActions({ project }: { project: Project }) {
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const deleteRef = useRef<HTMLButtonElement>(null);

  // The safe choice takes focus, so pressing Enter twice cannot delete anything by accident.
  useEffect(() => {
    if (confirming) cancelRef.current?.focus();
  }, [confirming]);

  // Next.js keeps a page the owner leaves, so a half-made choice or an old message would still be there on coming back.
  useLayoutEffect(
    () => () => {
      setConfirming(false);
      setError(null);
      setNotice(null);
    },
    [],
  );

  function run(action: () => Promise<ActionResult<unknown>>) {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      try {
        const result = await action();
        if (!result.ok) setError(result.error);
        else if (result.notice) setNotice(result.notice);
      } catch (problem) {
        setError(explainFailure("That did not go through.", problem));
      }
    });
  }

  const published = project.status === "published";
  const videoReady = Boolean(project.video_path) && project.upload_status === "ready";
  // A finished draft has one obvious next step, so that button is the bright one. One without its video cannot go on the reel.
  const readyToPublish = !published && videoReady;
  const featureName = project.is_featured ? "Featured" : "Feature";

  return (
    <div className="grid gap-3">
      {confirming ? (
        <div role="group" aria-label={`Confirm deleting ${project.title}`} className="flex flex-wrap items-center gap-2">
          <p className="me-1 text-sm text-bone">Delete it and its files?</p>
          <button type="button" disabled={pending} className={dangerButtonClass} onClick={() => run(() => deleteProject(project.id))}>
            {pending ? "Deleting" : "Yes, delete"}
          </button>
          <button
            ref={cancelRef}
            type="button"
            disabled={pending}
            className={smallButtonClass}
            onClick={() => {
              setConfirming(false);
              requestAnimationFrame(() => deleteRef.current?.focus());
            }}
          >
            Cancel
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <Link href={`/admin/projects/${project.id}`} className={smallButtonClass}>
            Edit<span className="sr-only"> {project.title}</span>
          </Link>
          <button
            type="button"
            disabled={pending || (!published && !videoReady)}
            title={!published && !videoReady ? "It can be published once its video has finished uploading" : undefined}
            className={readyToPublish ? primaryButtonClass : smallButtonClass}
            onClick={() => run(() => setProjectPublished(project.id, !published))}
          >
            {published ? "Unpublish" : "Publish"}
            <span className="sr-only"> {project.title}</span>
          </button>
          <div className="ms-auto flex gap-2">
            <button
              type="button"
              disabled={pending}
              aria-pressed={project.is_featured}
              aria-label={`${featureName} ${project.title}`}
              title={project.is_featured ? "Featured: the big frame on the reel. Press to undo." : "Feature: make this the big frame on the reel, in place of any other"}
              className={iconButtonClass}
              onClick={() => run(() => setProjectFeatured(project.id, !project.is_featured))}
            >
              <StarIcon filled={project.is_featured} />
            </button>
            <button ref={deleteRef} type="button" disabled={pending} aria-label={`Delete ${project.title}`} title="Delete" className={iconButtonClass} onClick={() => setConfirming(true)}>
              <TrashIcon />
            </button>
          </div>
        </div>
      )}
      {error ? (
        <p role="alert" className={alertClass}>
          {error}
        </p>
      ) : null}
      {notice ? (
        <p role="status" className="text-sm text-bone">
          {notice}
        </p>
      ) : null}
    </div>
  );
}
