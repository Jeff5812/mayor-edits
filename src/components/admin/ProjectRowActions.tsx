"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { explainFailure } from "@/lib/media/failures";
import type { ActionResult } from "@/lib/projects/action-types";
import { deleteProject, setProjectFeatured, setProjectPublished } from "@/lib/projects/actions";
import type { Project } from "@/types/domain";
import { alertClass, dangerButtonClass, smallButtonClass } from "./styles";

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

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Link href={`/admin/projects/${project.id}`} className={smallButtonClass}>
          Edit<span className="sr-only"> {project.title}</span>
        </Link>
        <button type="button" disabled={pending} className={smallButtonClass} onClick={() => run(() => setProjectPublished(project.id, !published))}>
          {published ? "Unpublish" : "Publish"}
          <span className="sr-only"> {project.title}</span>
        </button>
        <button
          type="button"
          disabled={pending}
          aria-pressed={project.is_featured}
          className={smallButtonClass}
          onClick={() => run(() => setProjectFeatured(project.id, !project.is_featured))}
        >
          {project.is_featured ? "Featured" : "Feature"}
          <span className="sr-only"> {project.title}</span>
        </button>
        {confirming ? (
          <div role="group" aria-label={`Confirm deleting ${project.title}`} className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-bone">Delete it and its files for good?</span>
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
          <button ref={deleteRef} type="button" disabled={pending} className={smallButtonClass} onClick={() => setConfirming(true)}>
            Delete<span className="sr-only"> {project.title}</span>
          </button>
        )}
      </div>
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
