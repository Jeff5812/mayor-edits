"use client";

import { useEffect, useId, useRef, useState } from "react";
import { UNREADABLE_FILE, explainFailure, isFileReadError } from "@/lib/media/failures";
import { SUBTITLE_ACCEPT, SUBTITLE_LANGUAGES, SUBTITLE_MAX_BYTES, type SubtitleCode, subtitleLabel, toWebVtt } from "@/lib/media/subtitles";
import { listProjectSubtitles, removeProjectSubtitle, saveProjectSubtitle } from "@/lib/projects/subtitle-actions";
import { alertClass, fieldHintClass, fieldLabelClass, inputClass, panelClass, smallButtonClass } from "./styles";

export function SubtitlesPanel({ projectId }: { projectId: string }) {
  const [present, setPresent] = useState<SubtitleCode[]>([]);
  const [language, setLanguage] = useState<SubtitleCode>("en");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const titleId = useId();
  const languageId = useId();

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
      });
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

  return (
    <section aria-labelledby={titleId} className={panelClass} data-testid="subtitles-panel">
      <h2 id={titleId} className="text-lg font-medium text-bone">
        Subtitles
      </h2>
      <p className="mt-2 text-sm text-ash">Visitors can turn these on in the player. Add one .srt or .vtt file for each language.</p>

      {present.length > 0 ? (
        <ul className="mt-4 grid gap-2">
          {present.map((code) => (
            <li key={code} className="flex min-h-11 items-center justify-between gap-3 border-b border-line pb-2 text-sm text-bone">
              <span>{subtitleLabel(code)}</span>
              <button type="button" className={smallButtonClass} disabled={busy} onClick={() => void remove(code)}>
                Remove<span className="sr-only"> {subtitleLabel(code)} subtitles</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-4">
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
        <p className={fieldHintClass}>Choosing a language that already has subtitles replaces them.</p>
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
      <button type="button" className={`mt-3 ${smallButtonClass}`} disabled={busy} onClick={() => fileInput.current?.click()}>
        {busy ? "Working" : "Choose a subtitle file"}
      </button>

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
