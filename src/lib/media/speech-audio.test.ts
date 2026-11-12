import { describe, expect, it } from "vitest";
import { pieceBounds, wavBytes } from "./speech-audio";

const RATE = 100; // Small numbers keep the arrays small. The logic is the same at 16 kHz.

function tone(seconds: number, quietAt: number[] = []) {
  const samples = new Float32Array(seconds * RATE).fill(0.5);
  for (const second of quietAt) samples.fill(0, second * RATE, second * RATE + 10);
  return samples;
}

describe("cutting a sound track into pieces", () => {
  it("covers every sample once, with no piece longer than the limit", () => {
    const samples = tone(95);
    const bounds = pieceBounds(samples, RATE, 28, 18);
    expect(bounds[0][0]).toBe(0);
    expect(bounds.at(-1)?.[1]).toBe(samples.length);
    for (let index = 1; index < bounds.length; index += 1) expect(bounds[index][0]).toBe(bounds[index - 1][1]);
    for (const [start, end] of bounds) expect(end - start).toBeLessThanOrEqual(28 * RATE);
  });

  it("cuts in the quiet, where a word cannot be split", () => {
    const bounds = pieceBounds(tone(60, [22, 47]), RATE, 28, 18);
    expect(bounds[0][1] / RATE).toBeCloseTo(22, 0);
    expect(bounds[1][1] / RATE).toBeCloseTo(47, 0);
  });

  it("keeps a short sound track whole", () => {
    expect(pieceBounds(tone(12), RATE, 28, 18)).toEqual([[0, 12 * RATE]]);
  });
});

describe("WAV", () => {
  it("has a proper header and two bytes per sample", () => {
    const bytes = wavBytes(new Float32Array([0, 1, -1]), 16_000);
    const text = (start: number, length: number) => String.fromCharCode(...bytes.slice(start, start + length));
    const view = new DataView(bytes.buffer);
    expect(text(0, 4)).toBe("RIFF");
    expect(text(8, 4)).toBe("WAVE");
    expect(view.getUint32(24, true)).toBe(16_000);
    expect(view.getUint32(40, true)).toBe(6);
    expect(view.getInt16(46, true)).toBe(0x7fff);
    expect(view.getInt16(48, true)).toBe(-0x8000);
  });
});
