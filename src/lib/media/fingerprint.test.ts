import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { FINGERPRINT_SLICE_BYTES, fingerprintFile, hashSlices } from "./fingerprint";

function bytes(size: number, fill: number) {
  return new Uint8Array(size).fill(fill);
}

function expected(size: number, head: Uint8Array, tail: Uint8Array) {
  const hex = createHash("sha256").update(head).update(tail).digest("hex");
  return `v1:${size}:${hex}`;
}

describe("fingerprintFile", () => {
  it("is size plus SHA-256 of the first and last 2 MB", async () => {
    const head = bytes(FINGERPRINT_SLICE_BYTES, 1);
    const middle = bytes(1024, 2);
    const tail = bytes(FINGERPRINT_SLICE_BYTES, 3);
    const blob = new Blob([head, middle, tail]);
    await expect(fingerprintFile(blob)).resolves.toBe(expected(blob.size, head, tail));
  });

  it("gives the same answer for the same contents", async () => {
    const one = new Blob([bytes(5000, 7)]);
    const two = new Blob([bytes(5000, 7)]);
    expect(await fingerprintFile(one)).toBe(await fingerprintFile(two));
  });

  it("changes when the start, the end or the size changes", async () => {
    const size = FINGERPRINT_SLICE_BYTES * 3;
    const base = bytes(size, 0);
    const original = await fingerprintFile(new Blob([base]));

    const newStart = base.slice();
    newStart[0] = 9;
    expect(await fingerprintFile(new Blob([newStart]))).not.toBe(original);

    const newEnd = base.slice();
    newEnd[size - 1] = 9;
    expect(await fingerprintFile(new Blob([newEnd]))).not.toBe(original);

    expect(await fingerprintFile(new Blob([base.slice(1)]))).not.toBe(original);
  });

  it("ignores the middle, which is what keeps it fast on large files", async () => {
    const size = FINGERPRINT_SLICE_BYTES * 3;
    const base = bytes(size, 0);
    const changed = base.slice();
    changed[Math.floor(size / 2)] = 9;
    expect(await fingerprintFile(new Blob([changed]))).toBe(await fingerprintFile(new Blob([base])));
  });

  it("handles files smaller than one slice", async () => {
    const small = bytes(100, 4);
    await expect(fingerprintFile(new Blob([small]))).resolves.toBe(expected(100, small, small));
  });

  it("only reads the two slices", async () => {
    const reads: number[] = [];
    const blob = new Blob([bytes(FINGERPRINT_SLICE_BYTES * 4, 1)]);
    const spy = {
      size: blob.size,
      slice(start: number, end: number) {
        reads.push(end - start);
        return blob.slice(start, end);
      },
    } as unknown as Blob;
    await fingerprintFile(spy);
    expect(reads).toEqual([FINGERPRINT_SLICE_BYTES, FINGERPRINT_SLICE_BYTES]);
  });
});

describe("hashSlices", () => {
  it("accepts array buffers and views alike", async () => {
    const head = bytes(10, 1);
    const tail = bytes(10, 2);
    const fromViews = await hashSlices(20, head, tail);
    const fromBuffers = await hashSlices(20, head.buffer, tail.buffer);
    expect(fromBuffers).toBe(fromViews);
  });
});
