import { describe, expect, it } from "vitest";
import {
  MAX_VIDEO_BYTES,
  buildObjectName,
  cleanDuration,
  extensionOf,
  isThumbnailShape,
  isUuid,
  looksLikeMp4Bytes,
  objectBelongsToProject,
  playbackWarning,
  thumbnailCrop,
  thumbnailNote,
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

describe("cleanDuration", () => {
  it("keeps a real running time, in whole seconds", () => {
    expect(cleanDuration(1131.6)).toBe(1132);
    expect(cleanDuration(5)).toBe(5);
  });

  it("treats anything else a browser might send as unknown", () => {
    for (const value of [null, undefined, Number.NaN, Number.POSITIVE_INFINITY, -5, 0, 0.4, "90", 90_000]) {
      expect(cleanDuration(value)).toBeNull();
    }
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

describe("thumbnails", () => {
  it("takes the 16:9 middle of any image, at 1280 x 720", () => {
    // A tall phone picture keeps its middle band.
    expect(thumbnailCrop(1080, 1920)).toEqual({ sx: 0, sy: 656, sw: 1080, sh: 608, width: 1080, height: 608 });
    // A wide one keeps its middle.
    expect(thumbnailCrop(4000, 1000)).toEqual({ sx: 1111, sy: 0, sw: 1778, sh: 1000, width: 1280, height: 720 });
    // A 4K frame is only made smaller.
    expect(thumbnailCrop(3840, 2160)).toEqual({ sx: 0, sy: 0, sw: 3840, sh: 2160, width: 1280, height: 720 });
  });

  it("never enlarges a small image", () => {
    expect(thumbnailCrop(640, 360)).toMatchObject({ width: 640, height: 360 });
  });

  it("keeps an image that is already the right shape and size", () => {
    expect(isThumbnailShape(1280, 720)).toBe(true);
    expect(isThumbnailShape(1920, 1080)).toBe(false);
    expect(isThumbnailShape(1280, 960)).toBe(false);
  });

  it("tells the owner the size saved, any crop, and when it is too small to look sharp", () => {
    expect(thumbnailNote(1920, 1080)).toBe("Thumbnail saved at 1280 × 720.");
    expect(thumbnailNote(1080, 1920)).toBe("Thumbnail saved at 1080 × 608, cropped to 16:9 to fit the cards.");
    expect(thumbnailNote(640, 360)).toBe("Thumbnail saved at 640 × 360. It is on the small side, so it may look soft in the big frame. 1280 × 720 is best.");
    // A pixel off 16:9 is not worth calling a crop.
    expect(thumbnailNote(1280, 721)).toBe("Thumbnail saved at 1280 × 720.");
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
