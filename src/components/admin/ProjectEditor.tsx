"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, type ReactNode, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { UNREADABLE_FILE, explainFailure, isFileReadError } from "@/lib/media/failures";
import { fingerprintFile } from "@/lib/media/fingerprint";
import { formatBytes } from "@/lib/media/format";
import { uploadFor, useProjectUpload } from "@/lib/media/upload-registry";
import { MAX_VIDEO_MB, VIDEO_ACCEPT, validateVideoFile } from "@/lib/media/validation";
import type { DuplicateProject } from "@/lib/projects/action-types";
import { createProject, findDuplicateVideo, setProjectPublished, updateProject } from "@/lib/projects/actions";
import { type FieldErrors, parseProjectInput, titleFromFileName } from "@/lib/projects/schema";
import type { Project } from "@/types/domain";
import { ExternalIcon } from "./AdminIcons";
import { PosterPanel } from "./PosterPanel";
import { StatusPill } from "./StatusPill";
import {
  alertClass,
  fieldErrorClass,
  fieldLabelClass,
  fieldHintClass,
  inputClass,
  panelClass,
  panelHintClass,
  panelTitleClass,
  primaryButtonClass,
  smallButtonClass,
  successClass,
} from "./styles";
import { SubtitlesPanel } from "./SubtitlesPanel";
import { VideoStage } from "./VideoStage";
import { VideoUploadPanel } from "./VideoUploadPanel";

interface FormValues {
  title: string;
  description: string;
  category: string;
  language: string;
  is_featured: boolean;
}

function initialValues(project: Project | null): FormValues {
  return {
    title: project?.title ?? "",
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

const NEXT_STEPS = [
  ["Create the draft", "It stays private. Nobody sees it until you publish it."],
  ["The video uploads", "You can keep working while it does, here or on any other page. Keep this tab open until it finishes. If the connection drops, it carries on by itself when it is back."],
  ["Poster and subtitles", "A frame from the video becomes the poster, and you can change it. Add subtitles one language at a time."],
  ["Publish", "It goes on the reel at once."],
];

// What the rest of the page will hold, so a new project's page explains itself before there is anything to show.
function NextSteps() {
  return (
    <section aria-labelledby="next-steps" className={panelClass}>
      <h2 id="next-steps" className={panelTitleClass}>
        What happens next
      </h2>
      <ol className="mt-4 grid gap-4">
        {NEXT_STEPS.map(([title, body], index) => (
          <li key={title} className="grid grid-cols-[2rem_minmax(0,1fr)] gap-x-2 border-t border-line pt-4 first:border-t-0 first:pt-0">
            <span aria-hidden="true" className="font-time text-sm text-mute">
              {String(index + 1).padStart(2, "0")}
            </span>
            <div>
              <p className="text-sm font-medium text-bone">{title}</p>
              <p className="mt-1 text-sm leading-relaxed text-ash">{body}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

// The video as it stands: playable when finished, and showing the upload while one runs.
function ProjectStage({ project }: { project: Project }) {
  const { state } = useProjectUpload(project);
  return <VideoStage key={project.video_path ?? "none"} project={project} upload={state} />;
}

// The video, its poster and its subtitles. The upload belongs to the tab, so this page only shows it.
function ProjectMedia({ project, onProject }: { project: Project; onProject: (project: Project) => void }) {
  const { upload, state } = useProjectUpload(project);
  // Hears about the video and poster an upload attaches, even while Next.js keeps this page hidden.
  useEffect(() => upload.reportTo(onProject), [upload, onProject]);
  return (
    <>
      <VideoUploadPanel project={project} upload={upload} state={state} />
      <PosterPanel project={project} localVideo={upload.file} onProject={onProject} />
      <SubtitlesPanel projectId={project.id} />
    </>
  );
}

// Used by the "new project" page and by the project page. A new project is saved as a draft first, and its upload starts
// at once and carries on in the tab while the project page opens.
export function ProjectEditor({ project: initial }: { project: Project | null }) {
  const router = useRouter();
  const [project, setProject] = useState(initial);
  // The server sends a fresh copy after any change. It wins, because it is at least as new as ours.
  const [lastInitial, setLastInitial] = useState(initial);
  if (initial !== lastInitial) {
    setLastInitial(initial);
    setProject(initial);
  }

  const [values, setValues] = useState(() => initialValues(initial));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // A new draft's own page is opening, and this one has nothing left to do.
  const [opening, setOpening] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);

  // Messages about something just done would be stale on coming back, because Next.js keeps a page it leaves.
  useLayoutEffect(
    () => () => {
      setSaved(null);
      setPublishError(null);
    },
    [],
  );

  // "New project" page: the file is checked now, and uploaded once the draft exists.
  const [newVideo, setNewVideo] = useState<File | null>(null);
  const [newVideoError, setNewVideoError] = useState<string | null>(null);
  const [newVideoDuplicate, setNewVideoDuplicate] = useState<DuplicateProject | null>(null);
  const [checkingVideo, setCheckingVideo] = useState(false);
  const [draggingVideo, setDraggingVideo] = useState(false);
  const newVideoInput = useRef<HTMLInputElement>(null);

  const idPrefix = useId();
  const id = (name: string) => `${idPrefix}-${name}`;

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
      // A new draft is edited on its own page, which opens next. Turning this one into a second copy of it would only leave
      // that copy running, hidden, in the page Next.js keeps.
      if (!project) return result.data;
      setProject(result.data);
      // What was saved, tidied the same way the server tidies it.
      setValues(initialValues(result.data));
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
    const created = !project;
    const result = await save();
    if (!result || !created) return;
    setOpening(true);
    if (newVideo) uploadFor(result).start(newVideo);
    router.replace(`/admin/projects/${result.id}`);
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
      // The file's name is a better start than an empty box, and nothing typed is ever replaced.
      setValues((previous) => (previous.title ? previous : { ...previous, title: titleFromFileName(file.name) }));
    } catch (error) {
      setNewVideoError(isFileReadError(error) ? UNREADABLE_FILE : explainFailure("The file could not be checked.", error));
    } finally {
      setCheckingVideo(false);
    }
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

  const published = project?.status === "published";
  const videoReady = Boolean(project?.video_path) && project?.upload_status === "ready";

  return (
    <div className="mt-5 grid items-start gap-5 sm:mt-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:gap-6">
      {/* The cut and its words on the left, because that is what the page is about. What goes around it is on the right. */}
      <div className="grid min-w-0 gap-5 lg:gap-6">
        {project ? <ProjectStage project={project} /> : null}

        <form onSubmit={(event) => void onSubmit(event)} noValidate className={`grid gap-5 ${panelClass}`} aria-label="Project details">
          {project ? <h2 className={panelTitleClass}>Details</h2> : null}

          {!project ? (
            <div
              className={`dropzone p-5 text-center sm:p-6 ${draggingVideo ? "is-over" : ""}`}
              onDragOver={(event) => {
                event.preventDefault();
                setDraggingVideo(true);
              }}
              onDragLeave={() => setDraggingVideo(false)}
              onDrop={(event) => {
                event.preventDefault();
                setDraggingVideo(false);
                const file = event.dataTransfer.files[0];
                if (file && !checkingVideo) void pickNewVideo(file);
              }}
            >
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
              <button type="button" className={newVideo ? smallButtonClass : primaryButtonClass} disabled={checkingVideo} onClick={() => newVideoInput.current?.click()}>
                {newVideo ? "Choose a different video" : "Choose a video file"}
              </button>
              {newVideo ? (
                <p className="mt-3 break-words text-sm text-bone">
                  {newVideo.name} ({formatBytes(newVideo.size)})
                </p>
              ) : (
                <p className={`mx-auto max-w-md ${fieldHintClass} !mt-3`}>Or drop it here. MP4 (H.264), up to {MAX_VIDEO_MB} MB. You can also add it later.</p>
              )}
              {checkingVideo ? (
                <p role="status" className="mt-3 text-sm text-bone">
                  Checking the file
                </p>
              ) : null}
              {newVideoError ? (
                <div role="alert" className={`mt-3 text-start ${alertClass}`}>
                  <p>{newVideoError}</p>
                  {newVideoDuplicate ? (
                    <p className="mt-2">
                      It belongs to{" "}
                      <Link href={`/admin/projects/${newVideoDuplicate.id}`} className="underline underline-offset-4">
                        {newVideoDuplicate.title}
                      </Link>
                      .
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}

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
                value={values.category}
                aria-invalid={Boolean(errors.category)}
                aria-describedby={describedBy(id("category"), false, errors.category)}
                className={inputClass}
                onChange={(event) => change("category", event.target.value)}
              />
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
              rows={3}
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
            Feature it: the big frame at the top of the reel. Only one film is featured at a time.
          </label>

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

          {/* A new project's longer form runs past the bottom of a short window, so its button stays in view. */}
          <div className={`${project ? "" : "sticky bottom-0 z-10"} -mx-5 -mb-5 rounded-b-[4px] border-t border-line bg-[var(--surface-1)] px-5 py-4 sm:-mx-6 sm:-mb-6 sm:px-6`}>
            <button type="submit" disabled={saving || opening || checkingVideo} className={primaryButtonClass}>
              {opening ? "Opening the project" : saving ? "Saving" : project ? "Save details" : newVideo ? "Create draft and upload" : "Create draft"}
            </button>
          </div>
        </form>
      </div>

      <div className="grid min-w-0 gap-5 lg:gap-6">
        {project ? (
          <>
            <section aria-label="Publishing" className={panelClass} data-testid="publish-panel">
              <div className="flex items-center justify-between gap-3">
                <h2 className={panelTitleClass}>Publishing</h2>
                <StatusPill status={project.status} />
              </div>
              <p className={panelHintClass}>
                {published
                  ? "It is on the reel now, for anyone to watch."
                  : videoReady
                    ? "Only you can see this. It goes on the reel when you say so."
                    : "Only you can see this. It can go on the reel once its video has finished uploading."}
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className={published || !videoReady ? smallButtonClass : primaryButtonClass}
                  disabled={publishing || (!published && !videoReady)}
                  onClick={() => void togglePublished()}
                >
                  {publishing ? "Working" : published ? "Unpublish" : "Publish"}
                </button>
                {published ? (
                  <a href="/#work" target="_blank" rel="noreferrer" className={smallButtonClass}>
                    View on the site
                    <ExternalIcon />
                    <span className="sr-only"> (opens in a new tab)</span>
                  </a>
                ) : null}
              </div>
              {publishError ? (
                <p role="alert" className={`mt-3 ${alertClass}`}>
                  {publishError}
                </p>
              ) : null}
            </section>
            <ProjectMedia project={project} onProject={setProject} />
          </>
        ) : (
          <NextSteps />
        )}
      </div>
    </div>
  );
}
