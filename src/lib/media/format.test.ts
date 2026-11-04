import { describe, expect, it } from "vitest";
import { formatBytes, formatClock, formatEta, nextSpeed, percentOf, remainingSeconds } from "./format";

describe("formatBytes", () => {
  it("scales to the right unit", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(1023)).toBe("1023 B");
    expect(formatBytes(1024)).toBe("1.0 KB");
    expect(formatBytes(50 * 1024 * 1024)).toBe("50.0 MB");
    expect(formatBytes(1024 * 1024 * 1024)).toBe("1.0 GB");
    expect(formatBytes(150 * 1024 * 1024)).toBe("150 MB");
  });

  it("says unknown for missing or nonsense values", () => {
    expect(formatBytes(null)).toBe("Unknown");
    expect(formatBytes(undefined)).toBe("Unknown");
    expect(formatBytes(-1)).toBe("Unknown");
    expect(formatBytes(Number.NaN)).toBe("Unknown");
  });
});

describe("formatClock", () => {
  it("formats player time", () => {
    expect(formatClock(5)).toBe("0:05");
    expect(formatClock(760)).toBe("12:40");
    expect(formatClock(3729)).toBe("1:02:09");
    expect(formatClock(59.9)).toBe("0:59");
  });

  it("falls back to zero", () => {
    expect(formatClock(null)).toBe("0:00");
    expect(formatClock(Number.POSITIVE_INFINITY)).toBe("0:00");
    expect(formatClock(-3)).toBe("0:00");
  });
});

describe("upload estimates", () => {
  it("words the time left", () => {
    expect(formatEta(null)).toBe("Estimating time");
    expect(formatEta(3)).toBe("A few seconds left");
    expect(formatEta(12)).toBe("About 15 seconds left");
    expect(formatEta(60)).toBe("About 1 minute left");
    expect(formatEta(600)).toBe("About 10 minutes left");
    expect(formatEta(3900)).toBe("About 1 h 5 min left");
  });

  it("smooths speed without being thrown by the first sample", () => {
    expect(nextSpeed(null, 100)).toBe(100);
    expect(nextSpeed(100, 200, 0.25)).toBe(125);
  });

  it("estimates the remaining time only when speed is known", () => {
    expect(remainingSeconds(50, 100, 10)).toBe(5);
    expect(remainingSeconds(50, 100, null)).toBeNull();
    expect(remainingSeconds(150, 100, 10)).toBe(0);
  });

  it("keeps percentages in range", () => {
    expect(percentOf(1, 4)).toBe(25);
    expect(percentOf(5, 0)).toBe(0);
    expect(percentOf(8, 4)).toBe(100);
  });
});
