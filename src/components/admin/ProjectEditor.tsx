"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, type ReactNode, useEffect, useId, useMemo, useRef, useState } from "react";
import { UNREADABLE_FILE, explainFailure, isFileReadError } from "@/lib/media/failures";
import { fingerprintFile } from "@/lib/media/fingerprint";
import { formatBytes } from "@/lib/media/format";
import { clearPendingVideo, leavePendingVideo, peekPendingVideo } from "@/lib/media/pending-files";
import { attachFirstFrame } from "@/lib/media/poster-upload";
import type { UploadServer } from "@/lib/media/upload-controller";
import { MAX_VIDEO_MB, VIDEO_ACCEPT, validateVideoFile } from "@/lib/media/validation";
import type { DuplicateProject } from "@/lib/projects/action-types";
import {
  cancelVideoUpload,
  createProject,
  failVideoUpload,
  finalizeVideoUpload,
  findDuplicateVideo,
  getAdminVideoUrl,
  prepareVideoUpload,
  setProjectPublished,
  updateProject,
} from "@/lib/projects/actions";
import { type FieldErrors, parseProjectInput } from "@/lib/projects/schema";
import type { Project } from "@/types/domain";
import { PosterPanel } from "./PosterPanel";
import {
  alertClass,
  fieldErrorClass,
  fieldLabelClass,
  fieldHintClass,
  inputClass,
  noticeClass,
  panelClass,
  primaryButtonClass,
  smallButtonClass,
  successClass,
} from "./styles";
import { SubtitlesPanel } from "./SubtitlesPanel";
import { VideoUploadPanel } from "./VideoUploadPanel";

// Suggestions only: the owner can type any category without a developer changing anything.
const CATEGORY_SUGGESTIONS = ["Brand", "Short form", "Long form", "Documentary", "Narrative", "Music video"];

interface FormValues {
  title: string;
  description: string;
  category: string;
  language: string;
  is_featured: boolean;
}

// A starting title from the file's name: "harbour_lights_final.mp4" becomes "harbour lights final".
function titleFromFile(file: File) {
  return file.name
    .replace(/\.[^.]+$/, "")
    .replace(/[-_.]+/g, " ")
    .trim()
    .slice(0, 160);
}

function initialValues(project: Project | null, video?: File): FormValues {
  return {
    title: project?.title ?? (video ? titleFromFile(video) : ""),
    description: project?.description ?? "",
    category: project?.category ?? "",
    language: project?.language ?? "",
    is_featured: project?.is_featured ?? false,
  };
}

function Field({ label, hint, error, children, id }: { label: string; hint?: string; error?: string; id: string; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className={fieldLabelClass}>
        {label}
      </label>
      {children}
      {hint ? (
        <p id={`${id}-hint`} className={fieldHintClass}>
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} className={fieldErrorClass}>
          {error}
        </p>
      ) : null}
    </div>
  );
}

function describedBy(id: string, hint: boolean, error: string | undefined) {
  return [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(" ") || undefined;
}

function AdminPreview({ projectId }: { projectId: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function open() {
    setLoading(true);
    setError(null);
    const result = await getAdminVideoUrl(projectId);
    setLoading(false);
    if (result.ok) setUrl(result.data.url);
    else setError(result.error);
  }

  if (url) {
    return (
      <video src={url} controls preload="metadata" playsInline className="mt-4 aspect-video w-full bg-ink">
        <track kind="captions" />
      </video>
    );
  }
  return (
    <div className="mt-4">
      <button type="button" className={smallButtonClass} disabled={loading} onClick={() => void open()}>
        {loading ? "Getting the video" : "Watch this video"}
      </button>
      {error ? (
        <p role="alert" className={`mt-3 ${alertClass}`}>
          {error}
        </p>
      ) : null}
    </div>
  );
}

// Used by the "new project" page and by the project page. A new project is saved as a draft first,
// and the project page then runs the upload, so the upload never spans a change of address.
// `initialVideo` is the same form opened over the public page with a file already chosen: it stays where it is
// and runs the upload right there, because there is no change of address to protect against.
export function ProjectEditor({ project: initial, initialVideo }: { project: Project | null; initialVideo?: File }) {
  const router = useRouter();
  const [project, setProject] = useState(initial);
  // The server sends a fresh copy after any change. It wins, because it is at least as new as ours.
  const [lastInitial, setLastInitial] = useState(initial);
  if (initial !== lastInitial) {
    setLastInitial(initial);
    setProject(initial);
  }

  const [values, setValues] = useState(() => initialValues(initial, initialVideo));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);

  // Video chosen on this page.
  const [localVideo, setLocalVideo] = useState<File | null>(null);
  const [pendingFile] = useState<File | null>(() => (initial ? peekPendingVideo(initial.id) : null));
  const initialId = initial?.id;
  useEffect(() => {
    if (initialId) clearPendingVideo(initialId);
  }, [initialId]);

  // "New project" page: the file is checked now, and uploaded once the draft exists.
  const [newVideo, setNewVideo] = useState<File | null>(null);
  const [newVideoError, setNewVideoError] = useState<string | null>(null);
  const [newVideoDuplicate, setNewVideoDuplicate] = useState<DuplicateProject | null>(null);
  const [checkingVideo, setCheckingVideo] = useState(false);
  const newVideoInput = useRef<HTMLInputElement>(null);
  const [uploadHere, setUploadHere] = useState<File | null>(null);

  const idPrefix = useId();
  const id = (name: string) => `${idPrefix}-${name}`;
  const suggestionsId = id("category-suggestions");

  function change<K extends keyof FormValues>(key: K, value: FormValues[K]) {
    setValues((previous) => ({ ...previous, [key]: value }));
    setSaved(null);
  }

  async function save(): Promise<Project | null> {
    const parsed = parseProjectInput(values);
    if (!parsed.ok) {
      setErrors(parsed.fieldErrors);
      setFormError("Please fix the highlighted fields.");
      return null;
    }
    setErrors({});
    setFormError(null);
    setSaved(null);
    setSaving(true);
    try {
      const result = project ? await updateProject(project.id, parsed.data) : await createProject(parsed.data);
      if (!result.ok) {
        setErrors(result.fieldErrors ?? {});
        setFormError(result.error);
        return null;
      }
      setProject(result.data);
      setSaved("Saved.");
      return result.data;
    } catch (error) {
      setFormError(explainFailure("The details could not be saved.", error));
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (checkingVideo) return;
    const hadProject = Boolean(project);
    const result = await save();
    if (result && !hadProject) {
      if (initialVideo) {
        setUploadHere(newVideo);
        return;
      }
      if (newVideo) leavePendingVideo(result.id, newVideo);
      router.replace(`/admin/projects/${result.id}`);
    }
  }

  async function pickNewVideo(file: File) {
    setNewVideo(null);
    setNewVideoError(null);
    setNewVideoDuplicate(null);
    const validation = validateVideoFile(file);
    if (!validation.ok) {
      setNewVideoError(validation.message);
      return;
    }
    setCheckingVideo(true);
    try {
      const check = await findDuplicateVideo(await fingerprintFile(file), null);
      if (!check.ok) {
        setNewVideoError(check.error);
        return;
      }
      if (check.data.duplicate) {
        setNewVideoError("This video has already been uploaded.");
        setNewVideoDuplicate(check.data.duplicate);
        return;
      }
      setNewVideo(file);
    } catch (error) {
      setNewVideoError(isFileReadError(error) ? UNREADABLE_FILE : explainFailure("The file could not be checked.", error));
    } finally {
      setCheckingVideo(false);
    }
  }

  // A file chosen before the form opened goes through the same checks as one chosen in the form.
  const checkedInitialVideo = useRef(false);
  useEffect(() => {
    if (!initialVideo || checkedInitialVideo.current) return;
    checkedInitialVideo.current = true;
    void pickNewVideo(initialVideo);
  }, [initialVideo]);

  // The upload's server calls, stable for the life of this page.
  const projectForUpload = useRef(project);
  useEffect(() => {
    projectForUpload.current = project;
  }, [project]);
  const uploadServer = useMemo<UploadServer>(
    () => ({
      findDuplicateVideo,
      prepareVideoUpload,
      finalizeVideoUpload,
      failVideoUpload,
      cancelVideoUpload,
      ensureProject: async () => projectForUpload.current,
    }),
    [],
  );

  function onUploadedProject(next: Project) {
    setProject(next);
    if (next.poster_path || !localVideo) return;
    attachFirstFrame(next.id, localVideo)
      .then((result) => {
        if (result.ok) setProject(result.data);
        else console.error("[poster] automatic poster failed:", result.error);
      })
      // The poster panel still lets the owner add one, so this is not worth interrupting them for.
      .catch((error) => console.error("[poster] automatic poster failed:", error instanceof Error ? error.message : error));
  }

  async function togglePublished() {
    if (!project) return;
    setPublishing(true);
    setPublishError(null);
    try {
      const result = await setProjectPublished(project.id, project.status !== "published");
      if (result.ok) setProject(result.data);
      else setPublishError(result.error);
    } catch (error) {
      setPublishError(explainFailure("The project could not be updated.", error));
    } finally {
      setPublishing(false);
    }
  }

  return (
    <div className="mt-8 grid items-start gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <form onSubmit={(event) => void onSubmit(event)} noValidate className={`grid gap-5 ${panelClass}`} aria-label="Project details">
        <Field id={id("title")} label="Title" error={errors.title}>
          <input
            id={id("title")}
            name="title"
            required
            maxLength={160}
            value={values.title}
            aria-invalid={Boolean(errors.title)}
            aria-describedby={describedBy(id("title"), false, errors.title)}
            className={inputClass}
            onChange={(event) => change("title", event.target.value)}
          />
        </Field>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field id={id("category")} label="Category" error={errors.category}>
            <input
              id={id("category")}
              name="category"
              required
              maxLength={60}
              list={suggestionsId}
              value={values.category}
              aria-invalid={Boolean(errors.category)}
              aria-describedby={describedBy(id("category"), false, errors.category)}
              className={inputClass}
              onChange={(event) => change("category", event.target.value)}
            />
            <datalist id={suggestionsId}>
              {CATEGORY_SUGGESTIONS.map((category) => (
                <option key={category} value={category} />
              ))}
            </datalist>
          </Field>
          <Field id={id("language")} label="Language (optional)" hint="The language spoken in the video." error={errors.language}>
            <input
              id={id("language")}
              name="language"
              maxLength={60}
              value={values.language}
              aria-invalid={Boolean(errors.language)}
              aria-describedby={describedBy(id("language"), true, errors.language)}
              className={inputClass}
              onChange={(event) => change("language", event.target.value)}
            />
          </Field>
        </div>

        <Field id={id("description")} label="Short description (optional)" error={errors.description}>
          <textarea
            id={id("description")}
            name="description"
            rows={4}
            maxLength={2000}
            value={values.description}
            aria-invalid={Boolean(errors.description)}
            aria-describedby={describedBy(id("description"), false, errors.description)}
            className={inputClass}
            onChange={(event) => change("description", event.target.value)}
          />
        </Field>

        <label className="flex min-h-11 items-center gap-3 text-sm text-bone">
          <input
            type="checkbox"
            name="is_featured"
            checked={values.is_featured}
            className="size-5 accent-bone"
            onChange={(event) => change("is_featured", event.target.checked)}
          />
          Feature it: show this first in the portfolio
        </label>

        {!project ? (
          <div className="border-t border-line pt-5">
            <p className={fieldLabelClass}>Video</p>
            <p className={fieldHintClass}>MP4 (H.264), up to {MAX_VIDEO_MB} MB. The upload starts as soon as the draft is created. You can also add it later.</p>
            <input
              ref={newVideoInput}
              type="file"
              accept={VIDEO_ACCEPT}
              aria-label="Video file"
              data-testid="new-video-input"
              className="sr-only"
              tabIndex={-1}
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) void pickNewVideo(file);
              }}
            />
            <button type="button" className={`mt-3 ${smallButtonClass}`} disabled={checkingVideo} onClick={() => newVideoInput.current?.click()}>
              {newVideo ? "Choose a different video" : "Choose a video file"}
            </button>
            {checkingVideo ? (
              <p role="status" className="mt-3 text-sm text-bone">
                Checking the file
              </p>
            ) : null}
            {newVideo ? (
              <p className="mt-3 break-words text-sm text-bone">
                {newVideo.name} ({formatBytes(newVideo.size)})
              </p>
            ) : null}
            {newVideoError ? (
              <div role="alert" className={`mt-3 ${alertClass}`}>
                <p>{newVideoError}</p>
                {newVideoDuplicate ? (
                  <p className="mt-2">
                    It belongs to{" "}
                    <a href={`/admin/projects/${newVideoDuplicate.id}`} className="underline underline-offset-4">
                      {newVideoDuplicate.title}
                    </a>
                    .
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}

        {formError ? (
          <p role="alert" className={alertClass}>
            {formError}
          </p>
        ) : null}
        {saved ? (
          <p role="status" className={successClass}>
            {saved}
          </p>
        ) : null}

        {/* Stays in view on short screens, where the form runs past the bottom of the window or dialog. */}
        <div className="sticky bottom-0 z-10 -mx-5 -mb-5 rounded-b-[4px] border-t border-line bg-[var(--surface-1)] px-5 py-4 sm:-mx-6 sm:-mb-6 sm:px-6">
          <button type="submit" disabled={saving || checkingVideo} className={primaryButtonClass}>
            {saving ? "Saving" : project ? "Save details" : newVideo ? "Create draft and upload" : "Create draft"}
          </button>
        </div>
      </form>

      <div className="grid gap-6">
        {project ? (
          <>
            <section aria-label="Publishing" className={panelClass} data-testid="publish-panel">
              <p className="text-sm text-bone">
                Status: <strong>{project.status === "published" ? "Published" : "Draft"}</strong>
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <button type="button" className={smallButtonClass} disabled={publishing} onClick={() => void togglePublished()}>
                  {publishing ? "Working" : project.status === "published" ? "Unpublish" : "Publish"}
                </button>
                {project.status === "published" ? (
                  <a href="/#work" target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center text-sm text-bone underline underline-offset-4">
                    View on the site<span className="sr-only"> (opens in a new tab)</span>
                  </a>
                ) : null}
              </div>
              {publishError ? (
                <p role="alert" className={`mt-3 ${alertClass}`}>
                  {publishError}
                </p>
              ) : null}
              {project.video_path && project.upload_status === "ready" ? <AdminPreview key={project.video_path} projectId={project.id} /> : null}
            </section>
            <VideoUploadPanel
              project={project}
              server={uploadServer}
              initialFile={pendingFile ?? uploadHere}
              onProject={onUploadedProject}
              onFile={setLocalVideo}
            />
            <PosterPanel project={project} localVideo={localVideo} onProject={setProject} />
            <SubtitlesPanel projectId={project.id} />
          </>
        ) : (
          <p className={noticeClass}>The poster and publishing controls appear once the draft is created.</p>
        )}
      </div>
    </div>
  );
}
