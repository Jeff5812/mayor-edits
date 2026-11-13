"use client";

import { useEffect, useId, useRef, useState } from "react";
import { UNREADABLE_FILE, explainFailure, isFileReadError } from "@/lib/media/failures";
import { SUBTITLE_ACCEPT, SUBTITLE_LANGUAGES, SUBTITLE_MAX_BYTES, type SubtitleCode, subtitleLabel, toWebVtt } from "@/lib/media/subtitles";
import { CANNOT_FETCH, type ProjectUpload, type SubtitleJob } from "@/lib/media/upload-registry";
import { VIDEO_ACCEPT } from "@/lib/media/validation";
import { autoSubtitlePlan } from "@/lib/projects/auto-subtitle-actions";
import { listProjectSubtitles, removeProjectSubtitle, saveProjectSubtitle } from "@/lib/projects/subtitle-actions";
import { CloseIcon } from "./AdminIcons";
import { alertClass, fieldLabelClass, inputClass, panelClass, panelHintClass, panelTitleClass, primaryButtonClass, smallButtonClass, successClass } from "./styles";

function listOf(codes: SubtitleCode[]): string {
  return codes.map(subtitleLabel).join(", ");
}

export function SubtitlesPanel({ projectId, upload, job, hasVideo }: { projectId: string; upload: ProjectUpload; job: SubtitleJob; hasVideo: boolean }) {
  const [present, setPresent] = useState<SubtitleCode[]>([]);
  const [listed, setListed] = useState(false);
  const [automatic, setAutomatic] = useState<SubtitleCode[] | null>(null);
  const [language, setLanguage] = useState<SubtitleCode>("en");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const videoInput = useRef<HTMLInputElement>(null);
  const titleId = useId();
  const languageId = useId();

  // Listed again whenever automatic subtitles stop, finished or not, so every language they saved appears at once.
  const finished = job.phase === "done" || job.phase === "failed" ? `${job.phase} ${job.saved.join()} ${job.error ?? ""}` : "";
  useEffect(() => {
    let current = true;
    listProjectSubtitles(projectId)
      .then((result) => {
        if (!current) return;
        if (result.ok) setPresent(result.data);
        else setError(result.error);
      })
      .catch((problem) => {
        if (current) setError(explainFailure("The subtitles could not be listed.", problem));
      })
      .finally(() => {
        if (current) setListed(true);
      });
    return () => {
      current = false;
    };
  }, [projectId, finished]);

  // Whether automatic subtitles are switched on, and which languages they would make.
  useEffect(() => {
    let current = true;
    autoSubtitlePlan(projectId)
      .then((result) => {
        if (current && result.ok && result.data.ready) setAutomatic(result.data.languages);
      })
      .catch(() => {});
    return () => {
      current = false;
    };
  }, [projectId]);

  async function addFile(file: File) {
    setError(null);
    setSaved(null);
    if (file.size > SUBTITLE_MAX_BYTES) {
      setError("This subtitle file is too large. Please check that it is the right file.");
      return;
    }
    setBusy(true);
    try {
      const converted = toWebVtt(await file.text());
      if (!converted.ok) {
        setError(converted.message);
        return;
      }
      const result = await saveProjectSubtitle(projectId, language, converted.vtt);
      if (result.ok) {
        setPresent(result.data);
        setSaved(`${subtitleLabel(language)} subtitles saved.`);
      } else {
        setError(result.error);
      }
    } catch (problem) {
      setError(isFileReadError(problem) ? UNREADABLE_FILE : explainFailure("The subtitles could not be saved.", problem));
    } finally {
      setBusy(false);
    }
  }

  async function remove(code: SubtitleCode) {
    setError(null);
    setSaved(null);
    setBusy(true);
    try {
      const result = await removeProjectSubtitle(projectId, code);
      if (result.ok) {
        setPresent(result.data);
        setSaved(`${subtitleLabel(code)} subtitles removed.`);
      } else {
        setError(result.error);
      }
    } catch (problem) {
      setError(explainFailure("The subtitles could not be removed.", problem));
    } finally {
      setBusy(false);
    }
  }

  const working = job.phase === "working";
  // Automatic subtitles only add what is missing, so nothing corrected by hand is ever replaced.
  const missing = automatic?.filter((code) => !present.includes(code)) ?? [];

  return (
    <section aria-labelledby={titleId} className={panelClass} data-testid="subtitles-panel">
      <h2 id={titleId} className={panelTitleClass}>
        Subtitles
      </h2>
      <p className={panelHintClass}>Visitors turn these on in the player, in the language they choose.</p>

      {/* Takes a moment on a slow line, and an empty list would look as if there were none. */}
      {!listed ? (
        <p role="status" className="mt-4 text-sm text-mute">
          Looking for subtitles
        </p>
      ) : null}

      {present.length > 0 ? (
        <ul className="mt-4 grid grid-cols-2 gap-2">
          {present.map((code) => (
            <li key={code} className="well flex items-center justify-between gap-1 ps-3 text-sm text-bone">
              <span lang={code} dir="auto" className="min-w-0 truncate">
                {subtitleLabel(code)}
              </span>
              <button
                type="button"
                aria-label={`Remove ${subtitleLabel(code)} subtitles`}
                title="Remove"
                disabled={busy || working}
                className="inline-flex size-11 shrink-0 cursor-pointer items-center justify-center text-ash transition-colors duration-200 hover:text-bone disabled:cursor-not-allowed disabled:opacity-60"
                onClick={() => void remove(code)}
              >
                <CloseIcon />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {automatic && hasVideo ? (
        <div className="mt-5 border-t border-line pt-5" data-testid="auto-subtitles">
          <h3 className="text-sm font-medium text-bone">Make them automatically</h3>
          {missing.length > 0 || working ? (
            <p className="mt-1 text-sm leading-relaxed text-ash">
              Writes subtitles from what is said in the video, in {listOf(missing)}. It takes a few minutes, and you can keep working meanwhile.
              It also runs by itself after each new upload, and never replaces a language that is already here.
            </p>
          ) : (
            <p className="mt-1 text-sm leading-relaxed text-ash">
              Every language the other films have is here. To make one again automatically, remove it first.
            </p>
          )}
          {working ? (
            <p role="status" className="mt-3 flex items-center gap-3 text-sm text-bone">
              <span aria-hidden="true" className="player-spinner !size-5 animate-spin" />
              {job.step ?? "Working"}
            </p>
          ) : missing.length > 0 ? (
            <button type="button" className={`mt-3 ${present.length === 0 ? primaryButtonClass : smallButtonClass}`} disabled={busy || !listed} onClick={() => void upload.makeSubtitles()}>
              {present.length === 0 ? "Make subtitles automatically" : "Make the missing ones automatically"}
            </button>
          ) : null}
          {job.phase === "done" && job.saved.length > 0 ? <p className={`mt-3 ${successClass}`}>Made: {listOf(job.saved)}.</p> : null}
          {job.phase === "failed" && job.error ? (
            <p role="alert" className={`mt-3 ${alertClass}`}>
              {job.error}
            </p>
          ) : null}
          {job.phase === "failed" && job.error === CANNOT_FETCH ? (
            <div>
              {/* The same work from the file on this device, for when the stored copy cannot be read here. */}
              <input
                ref={videoInput}
                type="file"
                accept={VIDEO_ACCEPT}
                aria-label="Video file to make subtitles from"
                className="sr-only"
                tabIndex={-1}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (file) void upload.makeSubtitles(file);
                }}
              />
              <button type="button" className={`mt-3 ${smallButtonClass}`} onClick={() => videoInput.current?.click()}>
                Use the video file on this device
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className={automatic && hasVideo ? "mt-5 border-t border-line pt-5" : "mt-4"}>
        {automatic && hasVideo ? <h3 className="mb-3 text-sm font-medium text-bone">Or add a subtitle file</h3> : null}
        <div className="flex flex-wrap items-end gap-x-2 gap-y-3">
          <div className="min-w-40 flex-1">
            <label htmlFor={languageId} className={fieldLabelClass}>
              Language
            </label>
            <select id={languageId} value={language} className={inputClass} onChange={(event) => setLanguage(event.target.value as SubtitleCode)}>
              {SUBTITLE_LANGUAGES.map(({ code, label }) => (
                <option key={code} value={code}>
                  {label}
                  {present.includes(code) ? " (replace)" : ""}
                </option>
              ))}
            </select>
          </div>
          <input
            ref={fileInput}
            type="file"
            accept={SUBTITLE_ACCEPT}
            aria-label="Subtitle file"
            data-testid="subtitle-input"
            tabIndex={-1}
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0];
              // Clearing it lets the same file be chosen again after a failure.
              event.target.value = "";
              if (file) void addFile(file);
            }}
          />
          <button type="button" className={smallButtonClass} disabled={busy || working} onClick={() => fileInput.current?.click()}>
            {busy ? "Working" : "Choose a subtitle file"}
          </button>
        </div>
      </div>

      {error ? (
        <p role="alert" className={`mt-3 ${alertClass}`}>
          {error}
        </p>
      ) : null}
      {saved ? (
        <p role="status" className="mt-3 text-sm text-bone">
          {saved}
        </p>
      ) : null}
    </section>
  );
}
