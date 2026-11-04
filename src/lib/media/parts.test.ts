import { describe, expect, it } from "vitest";
import { UPLOAD_PART_BYTES, partCount, partRange, partSize } from "./parts";

const MB = 1024 * 1024;

describe("cutting a file into parts", () => {
  it("meets R2's 5 MiB minimum part size", () => {
    expect(UPLOAD_PART_BYTES).toBeGreaterThanOrEqual(5 * MB);
  });

  it("cuts a 500 MB file into 63 parts, well inside R2's limit of 10,000", () => {
    expect(partCount(500 * MB)).toBe(63);
  });

  it("gives every part the same size except the last, and covers the whole file", () => {
    const size = 500 * MB;
    let covered = 0;
    for (let part = 1; part <= partCount(size); part += 1) {
      const { start, end } = partRange(size, part);
      expect(start).toBe(covered);
      covered = end;
      if (part < partCount(size)) expect(partSize(size, part)).toBe(UPLOAD_PART_BYTES);
    }
    expect(covered).toBe(size);
    expect(partSize(size, 63)).toBe(4 * MB);
  });

  it("handles a file smaller than one part", () => {
    expect(partCount(1024)).toBe(1);
    expect(partRange(1024, 1)).toEqual({ start: 0, end: 1024 });
  });

  it("handles a file that is an exact number of parts", () => {
    expect(partCount(2 * UPLOAD_PART_BYTES)).toBe(2);
    expect(partSize(2 * UPLOAD_PART_BYTES, 2)).toBe(UPLOAD_PART_BYTES);
  });
});
