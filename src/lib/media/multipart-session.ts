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

// A refusal can say it is worth asking again in a moment, as when the server could not reach storage.
export type PlanResult = { ok: true; data: UploadPlan } | { ok: false; error: string; retryable?: boolean };

export interface MultipartSessionOptions {
  file: Blob;
  // Identifies this file on this project, so a saved upload is only ever resumed for the same pair.
  resumeKey: string;
  // Asks the server what is left to send. Passing a target carries on with that upload if it still exists.
  prepare: (target: UploadTarget | null) => Promise<PlanResult>;
  onProgress: (bytesUploaded: number, bytesTotal: number) => void;
  onSuccess: () => void;
  onError: (message: string) => void;
  // False while the browser has no connection at all and the upload is waiting for it, true once it carries on.
  onConnection?: (connected: boolean) => void;
  // Only the tests set these.
  retryDelays?: number[];
  stallMs?: number;
  createRequest?: () => XMLHttpRequest;
}

const PARALLEL_PARTS = 3;
const RETRY_DELAYS = [1000, 3000, 5000, 10000, 20000, 30000];
// Asking what to send fails now and then on a shaky line, and the next try usually works, so it is asked twice more first.
const PREPARE_DELAYS = [2000, 5000];
// A request can hang with no error at all, as when a phone moves between Wi-Fi and mobile data. A part that has made no
// progress for this long is treated as dropped, and sent again.
const STALL_MS = 60_000;
// Browsers announce a returning connection, and this is the fallback for one that does not.
const CONNECTION_CHECK_MS = 3000;
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

function isOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

function whenOnline(): Promise<void> {
  return new Promise((resolve) => {
    const check = () => {
      if (isOffline()) return;
      clearInterval(timer);
      window.removeEventListener?.("online", check);
      resolve();
    };
    const timer = setInterval(check, CONNECTION_CHECK_MS);
    window.addEventListener?.("online", check);
  });
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
  // Shared by every part waiting for the connection, so the owner hears about it once.
  private reconnecting: Promise<void> | null = null;

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

  // Asks the server what is left to send. No answer at all, or storage out of reach for a moment, is asked again a couple of
  // times, and a missing connection is waited for, before the owner is told. Null means it was reported, or the run is over.
  private async plan(stale: () => boolean): Promise<UploadPlan | null> {
    const delays = this.options.retryDelays ? this.options.retryDelays.slice(0, PREPARE_DELAYS.length) : PREPARE_DELAYS;
    let attempt = 0;
    for (;;) {
      let result: PlanResult | null;
      try {
        result = await this.options.prepare(this.target);
      } catch {
        result = null;
      }
      if (stale()) return null;
      if (result?.ok) return result.data;
      const worthAgain = result === null || result.retryable === true;
      if (worthAgain && isOffline()) {
        await this.waitForConnection();
      } else if (worthAgain && attempt < delays.length) {
        await new Promise((resolve) => setTimeout(resolve, delays[attempt]));
        attempt += 1;
      } else {
        this.options.onError(result ? result.error : explainUploadFailure(null));
        return null;
      }
      if (stale()) return null;
    }
  }

  private async send(allowNewLinks = true): Promise<void> {
    const run = ++this.run;
    const stale = () => run !== this.run;

    const plan = await this.plan(stale);
    if (!plan || stale()) return;

    const { objectName, uploadId, uploaded, urls } = plan;
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
    let attempt = 0;
    for (;;) {
      try {
        await this.put(part, url);
        return;
      } catch (error) {
        const failure = error instanceof PartFailure ? error : new PartFailure(null);
        if (!isRetryable(failure) || stale()) throw failure;
        // The bar steps back by this part, because the retry sends all of it again.
        this.sentBytes.set(part, 0);
        this.report();
        if (isOffline()) {
          // With no connection at all, waiting costs nothing, so it waits as long as that takes and spends no retries.
          await this.waitForConnection();
        } else {
          if (attempt >= delays.length) throw failure;
          await new Promise((resolve) => setTimeout(resolve, delays[attempt]));
          attempt += 1;
        }
        if (stale()) throw new PartFailure(null, true);
      }
    }
  }

  private waitForConnection(): Promise<void> {
    if (!this.reconnecting) {
      this.options.onConnection?.(false);
      this.reconnecting = whenOnline().then(() => {
        this.reconnecting = null;
        this.options.onConnection?.(true);
      });
    }
    return this.reconnecting;
  }

  private put(part: number, url: string): Promise<void> {
    const { file, createRequest } = this.options;
    const { start, end } = partRange(file.size, part);
    const quiet = this.options.stallMs ?? STALL_MS;
    return new Promise((resolve, reject) => {
      const request = createRequest?.() ?? new XMLHttpRequest();
      this.active.add(request);
      let stalled = false;
      let watchdog: ReturnType<typeof setTimeout> | undefined;
      const watch = () => {
        clearTimeout(watchdog);
        watchdog = setTimeout(() => {
          stalled = true;
          request.abort();
        }, quiet);
      };
      const settle = (after: () => void) => {
        clearTimeout(watchdog);
        this.active.delete(request);
        after();
      };
      request.open("PUT", url);
      request.upload.onprogress = (event) => {
        watch();
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
      // A pause aborts on purpose. A stall is a dropped part, so it is sent again.
      request.onabort = () => settle(() => reject(new PartFailure(null, !stalled)));
      request.send(file.slice(start, end));
      watch();
    });
  }
}
