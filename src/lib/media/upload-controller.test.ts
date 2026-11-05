import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Project } from "@/types/domain";
import type { MultipartSessionOptions } from "./multipart-session";
import { UploadController, type UploadServer, type UploadState } from "./upload-controller";

vi.mock("./frames", () => ({ readVideoDuration: vi.fn(async () => 12) }));

const PROJECT_ID = "11111111-1111-4111-8111-111111111111";
const OBJECT = `${PROJECT_ID}/22222222-2222-4222-8222-222222222222.mp4`;
const UPLOAD_ID = "upload-1";
const project = { id: PROJECT_ID, title: "Film" } as Project;

// A real MP4 begins with an ftyp box.
function mp4(size = 1024, name = "cut.mp4") {
  const bytes = new Uint8Array(size);
  bytes.set([0, 0, 0, 32, 0x66, 0x74, 0x79, 0x70]);
  return new File([bytes], name, { type: "video/mp4" });
}

function fakeServer(overrides: Partial<UploadServer> = {}): UploadServer {
  return {
    findDuplicateVideo: vi.fn(async () => ({ ok: true as const, data: { duplicate: null, isCurrentVideo: false } })),
    ensureProject: vi.fn(async () => project),
    prepareVideoUpload: vi.fn(async () => ({ ok: true as const, data: { objectName: OBJECT, uploadId: UPLOAD_ID, uploaded: [], urls: {} } })),
    finalizeVideoUpload: vi.fn(async () => ({ ok: true as const, data: { ...project, video_path: OBJECT } })),
    failVideoUpload: vi.fn(async () => ({ ok: true as const, data: undefined })),
    cancelVideoUpload: vi.fn(async () => ({ ok: true as const, data: undefined })),
    ...overrides,
  };
}

class FakeSession {
  started = 0;
  paused = 0;
  resumed = 0;
  cancelled = 0;
  objectName = OBJECT;
  uploadId = UPLOAD_ID;
  constructor(public options: MultipartSessionOptions) {}
  finish = vi.fn();
  start = vi.fn(async () => {
    this.started += 1;
  });
  pause = vi.fn(async () => {
    this.paused += 1;
  });
  resume = vi.fn(() => {
    this.resumed += 1;
  });
  cancel = vi.fn(async () => {
    this.cancelled += 1;
  });
}

function setup(server = fakeServer(), maxVideoMb = 50) {
  const states: UploadState[] = [];
  const sessions: FakeSession[] = [];
  const onProject = vi.fn();
  const controller = new UploadController({
    server,
    maxVideoMb,
    onChange: (state) => states.push(state),
    onProject,
    createSession: (options) => {
      const session = new FakeSession(options);
      sessions.push(session);
      return session as never;
    },
  });
  return { controller, server, states, sessions, onProject };
}

async function uploading(context = setup(), file = mp4()) {
  await context.controller.choose(file, PROJECT_ID);
  expect(context.controller.current.phase).toBe("uploading");
  return { ...context, session: context.sessions[0] };
}

async function settle() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("choosing a file", () => {
  it("starts one session, tied to this file on this project", async () => {
    const { server, session } = await uploading();
    expect(session.start).toHaveBeenCalledTimes(1);
    expect(session.options.resumeKey).toMatch(new RegExp(`^${PROJECT_ID}:v1:1024:[0-9a-f]{64}$`));
    await session.options.prepare(null);
    expect(server.prepareVideoUpload).toHaveBeenCalledWith({ projectId: PROJECT_ID, sizeBytes: 1024, target: null });
  });

  it("refuses anything that is not an MP4 before anything is sent", async () => {
    const context = setup();
    await context.controller.choose(new File([new Uint8Array(64)], "cut.mov", { type: "video/quicktime" }), PROJECT_ID);
    expect(context.controller.current.error).toMatch(/not an MP4/);
    expect(context.sessions).toHaveLength(0);
  });

  it("refuses an oversized file before anything is sent", async () => {
    const context = setup(fakeServer(), 1);
    await context.controller.choose(mp4(2 * 1024 * 1024), PROJECT_ID);
    expect(context.controller.current.phase).toBe("failed");
    expect(context.controller.current.error).toContain("1 MB");
    expect(context.controller.current.canRetry).toBe(false);
    expect(context.server.findDuplicateVideo).not.toHaveBeenCalled();
    expect(context.sessions).toHaveLength(0);
  });

  it("catches a renamed file by its contents", async () => {
    const context = setup();
    const fake = new File([new TextEncoder().encode("<!doctype html><html></html>")], "cut.mp4", { type: "video/mp4" });
    await context.controller.choose(fake, PROJECT_ID);
    expect(context.controller.current.error).toMatch(/does not look like a real MP4/);
    expect(context.sessions).toHaveLength(0);
  });

  it("stops at a duplicate and names the project that has it", async () => {
    const duplicate = { id: "33333333-3333-4333-8333-333333333333", title: "Other film" };
    const context = setup(fakeServer({ findDuplicateVideo: vi.fn(async () => ({ ok: true as const, data: { duplicate, isCurrentVideo: false } })) }));
    await context.controller.choose(mp4(), PROJECT_ID);
    expect(context.controller.current).toMatchObject({ phase: "failed", duplicate, canRetry: false });
    expect(context.sessions).toHaveLength(0);
  });

  it("does nothing when the file is already this project's video", async () => {
    const context = setup(fakeServer({ findDuplicateVideo: vi.fn(async () => ({ ok: true as const, data: { duplicate: null, isCurrentVideo: true } })) }));
    await context.controller.choose(mp4(), PROJECT_ID);
    expect(context.controller.current.phase).toBe("done");
    expect(context.controller.current.notice).toMatch(/already/);
    expect(context.sessions).toHaveLength(0);
  });

  it("stops when the details need fixing first", async () => {
    const context = setup(fakeServer({ ensureProject: vi.fn(async () => null) }));
    await context.controller.choose(mp4(), null);
    expect(context.controller.current.error).toMatch(/details/);
    expect(context.sessions).toHaveLength(0);
  });

  it("warns when the bitrate would make visitors buffer, and still uploads", async () => {
    // 30 MB over the mocked 12 seconds is 20 Mbps.
    const { controller, session } = await uploading(setup(), mp4(30_000_000));
    expect(controller.current.warning).toMatch(/20 Mbps/);
    expect(session.start).toHaveBeenCalledTimes(1);
  });

  it("gives no warning at a sensible bitrate", async () => {
    const { controller } = await uploading();
    expect(controller.current.warning).toBeNull();
  });

  it("says so when the chosen file can no longer be read, without blaming the connection", async () => {
    const context = setup();
    const file = mp4();
    const unreadable = new DOMException("The requested file could not be read", "NotReadableError");
    file.slice = () => ({ arrayBuffer: () => Promise.reject(unreadable) }) as unknown as Blob;
    await context.controller.choose(file, PROJECT_ID);
    expect(context.controller.current).toMatchObject({ phase: "failed", canRetry: false });
    expect(context.controller.current.error).toMatch(/could not be read/);
    expect(context.controller.current.error).toMatch(/choose it again/);
    expect(context.controller.current.error).not.toMatch(/connection/);
    expect(context.sessions).toHaveLength(0);
  });

  it("mentions the connection when no answer came back", async () => {
    const context = setup(fakeServer({ findDuplicateVideo: vi.fn(async () => Promise.reject(new TypeError("Failed to fetch"))) }));
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    await context.controller.choose(mp4(), PROJECT_ID);
    expect(context.controller.current.phase).toBe("failed");
    expect(context.controller.current.error).toMatch(/connection/);
    logged.mockRestore();
  });

  it("does not blame the connection for any other failure", async () => {
    const context = setup(fakeServer({ findDuplicateVideo: vi.fn(async () => Promise.reject(new Error("server bug"))) }));
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    await context.controller.choose(mp4(), PROJECT_ID);
    expect(context.controller.current.phase).toBe("failed");
    expect(context.controller.current.error).not.toMatch(/connection/);
    logged.mockRestore();
  });
});

describe("while uploading", () => {
  it("reports real progress and an estimate", async () => {
    const { controller, session } = await uploading();
    session.options.onProgress(256, 1024);
    expect(controller.current).toMatchObject({ phase: "uploading", bytesUploaded: 256, bytesTotal: 1024 });
    expect(controller.isBusy).toBe(true);
  });

  it("waits for real sending before estimating, so a slow start cannot promise hours", async () => {
    const clock = vi.spyOn(performance, "now").mockReturnValue(0);
    const { controller, session } = await uploading();
    // Preparing took half a minute, and the first bytes have only just gone.
    clock.mockReturnValue(30_000);
    session.options.onProgress(1_000, 100_000_000);
    expect(controller.current.secondsLeft).toBeNull();
    clock.mockReturnValue(33_000);
    session.options.onProgress(3_001_000, 100_000_000);
    expect(controller.current.secondsLeft).toBeNull();
    clock.mockReturnValue(37_000);
    session.options.onProgress(7_001_000, 100_000_000);
    // A megabyte a second, with 93 MB to go.
    expect(controller.current.secondsLeft).toBeCloseTo(93, 0);
    clock.mockRestore();
  });

  it("does not count what an earlier attempt delivered as speed", async () => {
    const clock = vi.spyOn(performance, "now").mockReturnValue(0);
    const { controller, session } = await uploading();
    await controller.pause();
    controller.resume();
    // Half arrived before the pause, and storage confirms it in the first report.
    clock.mockReturnValue(10_000);
    session.options.onProgress(50_000_000, 100_000_000);
    expect(controller.current.bytesPerSecond).toBeNull();
    clock.mockReturnValue(20_000);
    session.options.onProgress(60_000_000, 100_000_000);
    expect(controller.current.bytesPerSecond).toBe(1_000_000);
    expect(controller.current.secondsLeft).toBe(40);
    clock.mockRestore();
  });

  it("pauses and resumes the same session", async () => {
    const { controller, session } = await uploading();
    await controller.pause();
    expect(controller.current.phase).toBe("paused");
    expect(session.pause).toHaveBeenCalledTimes(1);
    controller.resume();
    expect(controller.current.phase).toBe("uploading");
    expect(session.resume).toHaveBeenCalledTimes(1);
  });

  it("ignores a second file while one is busy", async () => {
    const { controller, sessions } = await uploading();
    await controller.choose(mp4(2048, "other.mp4"), PROJECT_ID);
    expect(sessions).toHaveLength(1);
    expect(controller.current.fileName).toBe("cut.mp4");
  });
});

describe("finishing", () => {
  it("attaches the file with everything the database stores", async () => {
    const { controller, server, session, onProject } = await uploading();
    session.options.onSuccess();
    await settle();
    expect(server.finalizeVideoUpload).toHaveBeenCalledWith({
      projectId: PROJECT_ID,
      objectName: OBJECT,
      uploadId: UPLOAD_ID,
      sizeBytes: 1024,
      fingerprint: session.options.resumeKey.slice(PROJECT_ID.length + 1),
      durationSeconds: 12,
    });
    expect(controller.current.phase).toBe("done");
    expect(controller.isBusy).toBe(false);
    expect(onProject).toHaveBeenCalledTimes(1);
    expect(session.finish).toHaveBeenCalledTimes(1);
  });

  it("keeps the resume point until the file is attached", async () => {
    const server = fakeServer({ finalizeVideoUpload: vi.fn(async () => ({ ok: false as const, error: "Database is down." })) });
    const { session } = await uploading(setup(server));
    session.options.onSuccess();
    await settle();
    expect(session.finish).not.toHaveBeenCalled();
  });

  it("sends the rest when the server finds part of the file missing", async () => {
    const finalize = vi.fn<UploadServer["finalizeVideoUpload"]>().mockResolvedValueOnce({ ok: false, error: "Some has not arrived.", resend: true });
    const { controller, session } = await uploading(setup(fakeServer({ finalizeVideoUpload: finalize })));
    session.options.onProgress(1024, 1024);
    session.options.onSuccess();
    await settle();
    expect(controller.current).toMatchObject({ phase: "failed", canRetry: true, bytesUploaded: 0 });

    controller.retry();
    expect(controller.current.phase).toBe("uploading");
    expect(session.resume).toHaveBeenCalledTimes(1);
  });

  it("passes on a notice, such as an old file that could not be removed", async () => {
    const server = fakeServer({
      finalizeVideoUpload: vi.fn(async () => ({ ok: true as const, data: project, notice: "Old file stayed." })),
    });
    const { controller, session } = await uploading(setup(server));
    session.options.onSuccess();
    await settle();
    expect(controller.current).toMatchObject({ phase: "done", notice: "Old file stayed." });
  });

  it("retries only the attach step when the file has already arrived", async () => {
    const finalize = vi
      .fn<UploadServer["finalizeVideoUpload"]>()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({ ok: true, data: project });
    const { controller, session, sessions } = await uploading(setup(fakeServer({ finalizeVideoUpload: finalize })));
    session.options.onSuccess();
    await settle();
    expect(controller.current).toMatchObject({ phase: "failed", canRetry: true });

    controller.retry();
    await settle();
    expect(controller.current.phase).toBe("done");
    expect(session.resumed).toBe(0);
    expect(sessions).toHaveLength(1);
  });

  it("shows a duplicate caught at the last moment, with no retry", async () => {
    const duplicate = { id: "33333333-3333-4333-8333-333333333333", title: "Other film" };
    const server = fakeServer({ finalizeVideoUpload: vi.fn(async () => ({ ok: false as const, error: "Already used.", duplicate })) });
    const { controller, session } = await uploading(setup(server));
    session.options.onSuccess();
    await settle();
    expect(controller.current).toMatchObject({ phase: "failed", duplicate, canRetry: false });
  });
});

describe("when the upload fails", () => {
  it("records the failure, explains it, and offers a retry that resumes", async () => {
    const { controller, server, session } = await uploading();
    session.options.onProgress(512, 1024);
    session.options.onError("Connection dropped.");
    await settle();
    expect(controller.current).toMatchObject({ phase: "failed", error: "Connection dropped.", canRetry: true });
    expect(server.failVideoUpload).toHaveBeenCalledWith(PROJECT_ID);

    controller.retry();
    expect(controller.current.phase).toBe("uploading");
    expect(session.resume).toHaveBeenCalledTimes(1);
  });

  it("replaces a network message when the file vanished mid-upload, and offers no retry", async () => {
    const file = mp4();
    const { controller, session } = await uploading(setup(), file);
    file.slice = () => ({ arrayBuffer: () => Promise.reject(new DOMException("gone", "NotFoundError")) }) as unknown as Blob;
    session.options.onError("The upload could not reach storage.");
    await settle();
    expect(controller.current).toMatchObject({ phase: "failed", canRetry: false });
    expect(controller.current.error).toMatch(/could not be read/);
  });

  it("still shows the real error if the failure cannot be recorded", async () => {
    const server = fakeServer({ failVideoUpload: vi.fn(async () => Promise.reject(new Error("offline"))) });
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const { controller, session } = await uploading(setup(server));
    session.options.onError("Connection dropped.");
    await settle();
    expect(controller.current.error).toBe("Connection dropped.");
    logged.mockRestore();
  });
});

describe("cancelling", () => {
  it("tells storage, cleans up the project and returns to the start", async () => {
    const { controller, server, session } = await uploading();
    await controller.cancel();
    expect(session.cancel).toHaveBeenCalledTimes(1);
    expect(server.cancelVideoUpload).toHaveBeenCalledWith(PROJECT_ID, { objectName: OBJECT, uploadId: UPLOAD_ID });
    expect(controller.current.phase).toBe("idle");
    expect(controller.isBusy).toBe(false);
  });

  it("still resets the project if storage does not confirm", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const { controller, server, session } = await uploading();
    session.cancel.mockRejectedValueOnce(new Error("offline"));
    await controller.cancel();
    expect(server.cancelVideoUpload).toHaveBeenCalled();
    expect(controller.current.phase).toBe("idle");
    logged.mockRestore();
  });

  it("reports a failed clean-up instead of hiding it", async () => {
    const server = fakeServer({ cancelVideoUpload: vi.fn(async () => ({ ok: false as const, error: "File stayed behind." })) });
    const { controller } = await uploading(setup(server));
    await controller.cancel();
    expect(controller.current).toMatchObject({ phase: "failed", error: "File stayed behind." });
  });

  it("ignores late events from the cancelled upload", async () => {
    const { controller, server, session } = await uploading();
    await controller.cancel();
    session.options.onSuccess();
    session.options.onProgress(1024, 1024);
    session.options.onError("late");
    await settle();
    expect(server.finalizeVideoUpload).not.toHaveBeenCalled();
    expect(controller.current.phase).toBe("idle");
  });
});

describe("leaving the page", () => {
  let context: Awaited<ReturnType<typeof uploading>>;
  beforeEach(async () => {
    context = await uploading();
  });

  it("stops sending but keeps the resume point", () => {
    context.controller.dispose();
    expect(context.session.pause).toHaveBeenCalledTimes(1);
    expect(context.session.cancel).not.toHaveBeenCalled();
  });
});
