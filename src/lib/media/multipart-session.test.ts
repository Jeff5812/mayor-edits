import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MultipartSession, type MultipartSessionOptions, type PlanResult, type UploadTarget } from "./multipart-session";
import { UPLOAD_PART_BYTES } from "./parts";

const TARGET: UploadTarget = { objectName: "p/f.mp4", uploadId: "u1" };
// Two full parts and a shorter last one.
const FILE_SIZE = 2 * UPLOAD_PART_BYTES + 1024;
const file = new Blob([new Uint8Array(FILE_SIZE)]);

type Behaviour = "ok" | "network" | number | "hang";

// Stands in for the browser's request object, so the real session code runs with no network.
class FakeRequest {
  static sent: { url: string; size: number }[] = [];
  static behaviour: (part: number, attempt: number) => Behaviour = () => "ok";
  static attempts = new Map<number, number>();

  upload: { onprogress: ((event: { loaded: number }) => void) | null } = { onprogress: null };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  ontimeout: (() => void) | null = null;
  onabort: (() => void) | null = null;
  status = 0;
  private url = "";

  open(_method: string, url: string) {
    this.url = url;
  }

  send(body: Blob) {
    const part = Number(new URL(this.url).searchParams.get("part"));
    const attempt = FakeRequest.attempts.get(part) ?? 0;
    FakeRequest.attempts.set(part, attempt + 1);
    FakeRequest.sent.push({ url: this.url, size: body.size });
    const outcome = FakeRequest.behaviour(part, attempt);
    setTimeout(() => {
      if (outcome === "hang") return;
      if (outcome === "network") {
        this.onerror?.();
        return;
      }
      this.upload.onprogress?.({ loaded: body.size });
      this.status = outcome === "ok" ? 200 : outcome;
      this.onload?.();
    }, 0);
  }

  abort() {
    this.onabort?.();
  }
}

function urlsFor(parts: number[]) {
  return Object.fromEntries(parts.map((part) => [part, `https://r2.test/put?part=${part}`]));
}

function plan(uploaded: number[], missing: number[]): PlanResult {
  return { ok: true, data: { ...TARGET, uploaded, urls: urlsFor(missing) } };
}

function setup(overrides: Partial<MultipartSessionOptions> = {}) {
  const progress: number[] = [];
  const onSuccess = vi.fn();
  const onError = vi.fn();
  const prepare = vi.fn(async (): Promise<PlanResult> => plan([], [1, 2, 3]));
  const session = new MultipartSession({
    file,
    resumeKey: "project:file",
    prepare,
    onProgress: (uploaded) => progress.push(uploaded),
    onSuccess,
    onError,
    retryDelays: [0, 0],
    createRequest: () => new FakeRequest() as unknown as XMLHttpRequest,
    ...overrides,
  });
  return { session, prepare, progress, onSuccess, onError };
}

const saved = new Map<string, string>();
// What the browser would call when the connection comes back.
const onlineListeners = new Set<() => void>();
let connection = { onLine: true };

beforeEach(() => {
  FakeRequest.sent = [];
  FakeRequest.attempts = new Map();
  FakeRequest.behaviour = () => "ok";
  saved.clear();
  onlineListeners.clear();
  connection = { onLine: true };
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (key: string) => saved.get(key) ?? null,
      setItem: (key: string, value: string) => saved.set(key, value),
      removeItem: (key: string) => saved.delete(key),
    },
    addEventListener: (type: string, listener: () => void) => {
      if (type === "online") onlineListeners.add(listener);
    },
    removeEventListener: (type: string, listener: () => void) => {
      if (type === "online") onlineListeners.delete(listener);
    },
  });
  vi.stubGlobal("navigator", connection);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("sending a file", () => {
  it("sends every part at the right size, reaches 100% and reports success once", async () => {
    const { session, progress, onSuccess, onError } = setup();
    await session.start();
    expect(FakeRequest.sent.map((request) => request.size).sort((a, b) => a - b)).toEqual([1024, UPLOAD_PART_BYTES, UPLOAD_PART_BYTES]);
    expect(progress.at(-1)).toBe(FILE_SIZE);
    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();
    expect(session.objectName).toBe(TARGET.objectName);
    expect(session.uploadId).toBe(TARGET.uploadId);
  });

  it("sends only what is missing, and counts the rest as already done", async () => {
    const { session, progress, prepare, onSuccess } = setup();
    prepare.mockResolvedValueOnce(plan([1, 2], [3]));
    await session.start();
    expect(FakeRequest.sent).toHaveLength(1);
    expect(FakeRequest.sent[0].size).toBe(1024);
    expect(progress[0]).toBe(2 * UPLOAD_PART_BYTES);
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });

  it("finishes straight away when nothing is left to send", async () => {
    const { session, prepare, onSuccess } = setup();
    prepare.mockResolvedValueOnce(plan([1, 2, 3], []));
    await session.start();
    expect(FakeRequest.sent).toHaveLength(0);
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });
});

describe("when something goes wrong", () => {
  it("retries a dropped part by itself", async () => {
    FakeRequest.behaviour = (part, attempt) => (part === 2 && attempt === 0 ? "network" : "ok");
    const { session, onSuccess, onError } = setup();
    await session.start();
    expect(FakeRequest.attempts.get(2)).toBe(2);
    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();
  });

  it("retries a server error by itself", async () => {
    FakeRequest.behaviour = (part, attempt) => (part === 1 && attempt === 0 ? 503 : "ok");
    const { session, onSuccess } = setup();
    await session.start();
    expect(FakeRequest.attempts.get(1)).toBe(2);
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });

  it("gives up after the retries, and says to check the connection", async () => {
    FakeRequest.behaviour = (part) => (part === 2 ? "network" : "ok");
    const { session, onSuccess, onError } = setup();
    await session.start();
    expect(FakeRequest.attempts.get(2)).toBe(3);
    expect(onSuccess).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0]).toMatch(/connection/);
  });

  it("asks for fresh links once when one has expired", async () => {
    FakeRequest.behaviour = (part, attempt) => (part === 3 && attempt === 0 ? 403 : "ok");
    const { session, prepare, onSuccess, onError } = setup();
    prepare.mockResolvedValueOnce(plan([1, 2], [3])).mockResolvedValueOnce(plan([1, 2], [3]));
    await session.start();
    expect(prepare).toHaveBeenCalledTimes(2);
    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();
  });

  it("stops if fresh links are refused too, with no endless loop", async () => {
    FakeRequest.behaviour = () => 403;
    const { session, prepare, onSuccess, onError } = setup();
    prepare.mockResolvedValue(plan([1, 2], [3]));
    await session.start();
    expect(prepare).toHaveBeenCalledTimes(2);
    expect(onSuccess).not.toHaveBeenCalled();
    expect(onError.mock.calls[0][0]).toMatch(/403/);
  });

  it("passes on the server's own reason when it refuses", async () => {
    const { session, prepare, onError } = setup();
    prepare.mockResolvedValueOnce({ ok: false, error: "Your admin session has ended." });
    await session.start();
    expect(onError).toHaveBeenCalledWith("Your admin session has ended.");
    expect(FakeRequest.sent).toHaveLength(0);
  });

  it("asks the server again when no answer came back, and carries on", async () => {
    const { session, prepare, onSuccess, onError } = setup();
    prepare.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await session.start();
    expect(prepare).toHaveBeenCalledTimes(2);
    expect(onError).not.toHaveBeenCalled();
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });

  it("asks again when storage was out of reach for a moment", async () => {
    const { session, prepare, onSuccess } = setup();
    prepare.mockResolvedValueOnce({ ok: false, error: "Video storage could not be reached.", retryable: true });
    await session.start();
    expect(prepare).toHaveBeenCalledTimes(2);
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });

  it("reports a failure to reach the server once asking again has not helped", async () => {
    const { session, prepare, onError } = setup();
    prepare.mockRejectedValue(new TypeError("Failed to fetch"));
    await session.start();
    expect(prepare).toHaveBeenCalledTimes(3);
    expect(onError.mock.calls[0][0]).toMatch(/connection/);
  });
});

describe("an unreliable connection", () => {
  it("waits for a lost connection to come back instead of using up its retries, then carries on", async () => {
    connection.onLine = false;
    FakeRequest.behaviour = (part, attempt) => (part === 2 && attempt === 0 ? "network" : "ok");
    const reported: boolean[] = [];
    const { session, onSuccess, onError } = setup({ retryDelays: [], onConnection: (connected) => reported.push(connected) });
    const finished = session.start();

    await vi.waitFor(() => expect(reported).toEqual([false]));
    expect(onError).not.toHaveBeenCalled();

    connection.onLine = true;
    onlineListeners.forEach((listener) => listener());
    await finished;
    expect(reported).toEqual([false, true]);
    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(FakeRequest.attempts.get(2)).toBe(2);
  });

  it("treats a part that stops making progress as dropped, and sends it again", async () => {
    FakeRequest.behaviour = (part, attempt) => (part === 1 && attempt === 0 ? "hang" : "ok");
    const { session, onSuccess, onError } = setup({ stallMs: 20 });
    await session.start();
    expect(onError).not.toHaveBeenCalled();
    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(FakeRequest.attempts.get(1)).toBe(2);
  });
});

describe("pausing and resuming", () => {
  it("stops sending, ignores late answers, then carries on from what R2 holds", async () => {
    FakeRequest.behaviour = (part, attempt) => (attempt === 0 && part !== 1 ? "hang" : "ok");
    const { session, prepare, onSuccess, onError } = setup();
    const running = session.start();
    await vi.waitFor(() => expect(FakeRequest.sent.length).toBeGreaterThanOrEqual(3));
    await session.pause();
    await running;
    expect(onSuccess).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();

    prepare.mockResolvedValueOnce(plan([1], [2, 3]));
    session.resume();
    await vi.waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
    expect(prepare).toHaveBeenLastCalledWith(TARGET);
  });
});

describe("the resume point", () => {
  it("carries on with a saved upload for the same file", async () => {
    saved.set("mayor-edits:upload:project:file", JSON.stringify({ ...TARGET, savedAt: Date.now() }));
    const { session, prepare } = setup();
    await session.start();
    expect(prepare).toHaveBeenCalledWith(TARGET);
  });

  it("starts fresh when nothing is saved, then saves the new upload", async () => {
    const { session, prepare } = setup();
    await session.start();
    expect(prepare).toHaveBeenCalledWith(null);
    expect(JSON.parse(saved.get("mayor-edits:upload:project:file") as string)).toMatchObject(TARGET);
  });

  it("does not bother with one too old for R2 to still have", async () => {
    const eightDaysAgo = Date.now() - 8 * 24 * 60 * 60 * 1000;
    saved.set("mayor-edits:upload:project:file", JSON.stringify({ ...TARGET, savedAt: eightDaysAgo }));
    const { session, prepare } = setup();
    await session.start();
    expect(prepare).toHaveBeenCalledWith(null);
  });

  it("survives a damaged saved value", async () => {
    saved.set("mayor-edits:upload:project:file", "{not json");
    const { session, prepare, onSuccess } = setup();
    await session.start();
    expect(prepare).toHaveBeenCalledWith(null);
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });

  it("is forgotten once the file is attached, or the upload is cancelled", async () => {
    const { session } = setup();
    await session.start();
    expect(saved.size).toBe(1);
    session.finish();
    expect(saved.size).toBe(0);

    const other = setup();
    await other.session.start();
    expect(saved.size).toBe(1);
    await other.session.cancel();
    expect(saved.size).toBe(0);
  });
});
