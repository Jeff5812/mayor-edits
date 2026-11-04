// Browser only. Sends one file straight to R2 in numbered parts, using signed links from the server, so
// the video never passes through Vercel. R2 remembers which parts arrived, which is what lets an upload
// carry on after a dropped connection, a pause, or the tab being closed.
import { explainUploadFailure } from "./failures";
import { partRange } from "./parts";

export interface UploadTarget {
  objectName: string;
  uploadId: string;
}

export interface UploadPlan extends UploadTarget {
  // Parts R2 already holds.
  uploaded: number[];
  // A signed link for each part still to send.
  urls: Record<number, string>;
}

export type PlanResult = { ok: true; data: UploadPlan } | { ok: false; error: string };

export interface MultipartSessionOptions {
  file: Blob;
  // Identifies this file on this project, so a saved upload is only ever resumed for the same pair.
  resumeKey: string;
  // Asks the server what is left to send. Passing a target carries on with that upload if it still exists.
  prepare: (target: UploadTarget | null) => Promise<PlanResult>;
  onProgress: (bytesUploaded: number, bytesTotal: number) => void;
  onSuccess: () => void;
  onError: (message: string) => void;
  // Only the tests set these.
  retryDelays?: number[];
  createRequest?: () => XMLHttpRequest;
}

const PARALLEL_PARTS = 3;
const RETRY_DELAYS = [1000, 3000, 5000, 10000, 20000, 30000];
// R2 drops unfinished uploads after 7 days, so an older saved upload is not worth asking about.
const RESUME_WINDOW_MS = 6 * 24 * 60 * 60 * 1000;
const STORAGE_PREFIX = "mayor-edits:upload:";

class PartFailure extends Error {
  constructor(
    readonly status: number | null,
    readonly aborted = false,
  ) {
    super(aborted ? "aborted" : `part failed with ${status ?? "no response"}`);
  }
}

function isRetryable(failure: PartFailure): boolean {
  return !failure.aborted && (failure.status === null || failure.status === 408 || failure.status === 429 || failure.status >= 500);
}

function readSavedTarget(key: string): UploadTarget | null {
  try {
    const saved = JSON.parse(window.localStorage.getItem(STORAGE_PREFIX + key) ?? "null");
    if (!saved?.objectName || !saved?.uploadId || Date.now() - saved.savedAt > RESUME_WINDOW_MS) return null;
    return { objectName: saved.objectName, uploadId: saved.uploadId };
  } catch {
    return null;
  }
}

function saveTarget(key: string, target: UploadTarget) {
  try {
    window.localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify({ ...target, savedAt: Date.now() }));
  } catch {
    // Private browsing can refuse this. The upload still works; it just cannot survive a closed tab.
  }
}

function forgetTarget(key: string) {
  try {
    window.localStorage.removeItem(STORAGE_PREFIX + key);
  } catch {
    // Nothing was saved, so there is nothing to forget.
  }
}

export class MultipartSession {
  private target: UploadTarget | null = null;
  private active = new Set<XMLHttpRequest>();
  private sentBytes = new Map<number, number>();
  // Bumped by every run and pause, so a late answer from an older run is ignored.
  private run = 0;

  constructor(private options: MultipartSessionOptions) {}

  get objectName() {
    return this.target?.objectName ?? null;
  }

  get uploadId() {
    return this.target?.uploadId ?? null;
  }

  async start() {
    this.target = readSavedTarget(this.options.resumeKey);
    await this.send();
  }

  resume() {
    void this.send();
  }

  async pause() {
    this.stopRequests();
  }

  // Stops sending and forgets the resume point. The caller tells the server to discard what arrived.
  async cancel() {
    this.stopRequests();
    forgetTarget(this.options.resumeKey);
  }

  // The file is attached to its project, so there is nothing left to resume.
  finish() {
    forgetTarget(this.options.resumeKey);
  }

  private stopRequests() {
    this.run += 1;
    for (const request of this.active) request.abort();
    this.active.clear();
  }

  private report() {
    let sent = 0;
    for (const bytes of this.sentBytes.values()) sent += bytes;
    this.options.onProgress(sent, this.options.file.size);
  }

  private async send(allowNewLinks = true): Promise<void> {
    const run = ++this.run;
    const stale = () => run !== this.run;

    let plan: PlanResult;
    try {
      plan = await this.options.prepare(this.target);
    } catch {
      if (!stale()) this.options.onError(explainUploadFailure(null));
      return;
    }
    if (stale()) return;
    if (!plan.ok) {
      this.options.onError(plan.error);
      return;
    }

    const { objectName, uploadId, uploaded, urls } = plan.data;
    this.target = { objectName, uploadId };
    saveTarget(this.options.resumeKey, this.target);

    this.sentBytes.clear();
    for (const part of uploaded) {
      const { start, end } = partRange(this.options.file.size, part);
      this.sentBytes.set(part, end - start);
    }
    this.report();

    const queue = Object.keys(urls)
      .map(Number)
      .sort((a, b) => a - b);
    let failure: PartFailure | null = null;

    const worker = async () => {
      while (!stale() && !failure && queue.length > 0) {
        const part = queue.shift() as number;
        try {
          await this.sendPart(part, urls[part], stale);
        } catch (error) {
          const problem = error instanceof PartFailure ? error : new PartFailure(null);
          if (!problem.aborted && !failure) failure = problem;
        }
      }
    };
    await Promise.all(Array.from({ length: PARALLEL_PARTS }, worker));
    if (stale()) return;

    const final = failure as PartFailure | null;
    if (final) {
      this.stopRequests();
      // A link can expire during a very long upload, so ask for fresh ones once before giving up.
      if ((final.status === 401 || final.status === 403) && allowNewLinks) return this.send(false);
      this.options.onError(explainUploadFailure(final.status));
      return;
    }
    this.options.onSuccess();
  }

  private async sendPart(part: number, url: string, stale: () => boolean): Promise<void> {
    const delays = this.options.retryDelays ?? RETRY_DELAYS;
    for (let attempt = 0; ; attempt += 1) {
      try {
        await this.put(part, url);
        return;
      } catch (error) {
        const failure = error instanceof PartFailure ? error : new PartFailure(null);
        if (!isRetryable(failure) || attempt >= delays.length || stale()) throw failure;
        // The bar steps back by this part, because the retry sends all of it again.
        this.sentBytes.set(part, 0);
        this.report();
        await new Promise((resolve) => setTimeout(resolve, delays[attempt]));
        if (stale()) throw new PartFailure(null, true);
      }
    }
  }

  private put(part: number, url: string): Promise<void> {
    const { file, createRequest } = this.options;
    const { start, end } = partRange(file.size, part);
    return new Promise((resolve, reject) => {
      const request = createRequest?.() ?? new XMLHttpRequest();
      this.active.add(request);
      const settle = (after: () => void) => {
        this.active.delete(request);
        after();
      };
      request.open("PUT", url);
      request.upload.onprogress = (event) => {
        this.sentBytes.set(part, event.loaded);
        this.report();
      };
      request.onload = () =>
        settle(() => {
          if (request.status >= 200 && request.status < 300) {
            this.sentBytes.set(part, end - start);
            this.report();
            resolve();
          } else {
            reject(new PartFailure(request.status));
          }
        });
      request.onerror = () => settle(() => reject(new PartFailure(null)));
      request.ontimeout = () => settle(() => reject(new PartFailure(null)));
      request.onabort = () => settle(() => reject(new PartFailure(null, true)));
      request.send(file.slice(start, end));
    });
  }
}
