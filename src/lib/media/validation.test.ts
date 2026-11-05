import { describe, expect, it } from "vitest";
import {
  MAX_VIDEO_BYTES,
  buildObjectName,
  extensionOf,
  fitWithin,
  isUuid,
  looksLikeMp4Bytes,
  objectBelongsToProject,
  playbackWarning,
  validatePosterFile,
  validateVideoFile,
} from "./validation";

const MB = 1024 * 1024;

describe("validateVideoFile", () => {
  it("accepts an MP4", () => {
    expect(validateVideoFile({ name: "a.mp4", type: "video/mp4", size: MB })).toEqual({ ok: true });
  });

  it("accepts a 500 MB file and refuses anything larger", () => {
    expect(validateVideoFile({ name: "a.mp4", type: "video/mp4", size: MAX_VIDEO_BYTES })).toEqual({ ok: true });
    const result = validateVideoFile({ name: "a.mp4", type: "video/mp4", size: MAX_VIDEO_BYTES + 1 });
    expect(result).toMatchObject({ ok: false, code: "size" });
    if (!result.ok) expect(result.message).toContain("500 MB");
  });

  it("falls back to the extension when the browser gives no type", () => {
    expect(validateVideoFile({ name: "CUT.MP4", type: "", size: MB })).toEqual({ ok: true });
    expect(validateVideoFile({ name: "cut.mp4", type: "application/octet-stream", size: MB })).toEqual({ ok: true });
  });

  it("refuses other formats, and says what to export instead", () => {
    for (const file of [
      { name: "a.mov", type: "video/quicktime", size: MB },
      { name: "a.webm", type: "video/webm", size: MB },
      { name: "a.mkv", type: "", size: MB },
      { name: "a.mp4", type: "image/png", size: MB },
    ]) {
      const result = validateVideoFile(file);
      expect(result).toMatchObject({ ok: false, code: "type" });
      if (!result.ok) expect(result.message).toContain("H.264");
    }
  });

  it("refuses an empty file", () => {
    expect(validateVideoFile({ name: "a.mp4", type: "video/mp4", size: 0 })).toMatchObject({ ok: false, code: "empty" });
  });
});

describe("playbackWarning", () => {
  it("stays quiet at a balanced bitrate", () => {
    // 60 MB over 2 minutes is 4 Mbps.
    expect(playbackWarning(60_000_000, 120)).toBeNull();
  });

  it("warns above it, with the real number and what to export instead", () => {
    // 500 MB over 3 minutes is about 22 Mbps.
    expect(playbackWarning(500_000_000, 180)).toMatch(/22 Mbps/);
    // 100 MB over 2 minutes is about 7 Mbps, which stalled on a slow connection.
    expect(playbackWarning(100_000_000, 120)).toMatch(/about 4 Mbps/);
  });

  it("warns when the browser could not read the video at all", () => {
    expect(playbackWarning(1000, null)).toMatch(/H\.264/);
  });
});

describe("extensionOf", () => {
  it("reads the last extension in lower case", () => {
    expect(extensionOf("My Film.Final.MP4")).toBe("mp4");
    expect(extensionOf("noextension")).toBe("");
  });
});

describe("looksLikeMp4Bytes", () => {
  const atom = (name: string) => new Uint8Array([0, 0, 0, 32, ...new TextEncoder().encode(name), 0, 0, 0, 0]);

  it("recognises a real file", () => {
    expect(looksLikeMp4Bytes(atom("ftyp"))).toBe(true);
    expect(looksLikeMp4Bytes(atom("moov"))).toBe(true);
  });

  it("catches a renamed file", () => {
    expect(looksLikeMp4Bytes(new TextEncoder().encode("<!doctype html>"))).toBe(false);
    expect(looksLikeMp4Bytes(new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0, 0, 0, 0]))).toBe(false);
    expect(looksLikeMp4Bytes(new Uint8Array([1, 2]))).toBe(false);
  });
});

describe("validatePosterFile", () => {
  it("accepts the three image types", () => {
    for (const type of ["image/jpeg", "image/png", "image/webp"]) {
      expect(validatePosterFile({ name: "p", type })).toEqual({ ok: true });
    }
  });

  it("refuses others", () => {
    expect(validatePosterFile({ name: "p.gif", type: "image/gif" })).toMatchObject({ ok: false });
  });
});

describe("fitWithin", () => {
  it("shrinks to the width limit and never enlarges", () => {
    expect(fitWithin(3200, 1800)).toEqual({ width: 1600, height: 900 });
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 });
    expect(fitWithin(1600, 900)).toEqual({ width: 1600, height: 900 });
  });
});

describe("object names", () => {
  const project = "11111111-1111-4111-8111-111111111111";
  const file = "22222222-2222-4222-8222-222222222222";

  it("recognises a UUID", () => {
    expect(isUuid(project)).toBe(true);
    expect(isUuid("../../etc/passwd")).toBe(false);
  });

  it("builds a name that belongs to its project", () => {
    const name = buildObjectName(project, file, "mp4");
    expect(name).toBe(`${project}/${file}.mp4`);
    expect(objectBelongsToProject(name, project)).toBe(true);
  });

  it("refuses a name from another project or with an odd shape", () => {
    expect(objectBelongsToProject(`${file}/${file}.mp4`, project)).toBe(false);
    expect(objectBelongsToProject(`${project}/../${file}.mp4`, project)).toBe(false);
    expect(objectBelongsToProject(`${project}/${file}.mp4/extra`, project)).toBe(false);
    expect(objectBelongsToProject(`${project}/not-a-uuid.mp4`, project)).toBe(false);
  });
});
