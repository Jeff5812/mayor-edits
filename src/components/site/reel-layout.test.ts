import { describe, expect, it } from "vitest";
import { reelSizes } from "./reel-layout";

// Columns each size takes in the six-column desktop grid.
const COLUMNS = { lead: 4, wide: 4, half: 3, third: 2 } as const;

describe("reelSizes", () => {
  it("has nothing to place without films", () => {
    expect(reelSizes(0)).toEqual([]);
  });

  it("puts a single film beside the headline", () => {
    expect(reelSizes(1)).toEqual(["lead"]);
  });

  it("gives a lone second film the lead's width, beneath it", () => {
    expect(reelSizes(2)).toEqual(["lead", "wide"]);
  });

  it("never leaves a row part-empty, and only steps down in size", () => {
    for (let films = 3; films <= 40; films += 1) {
      const others = reelSizes(films).slice(1);
      expect(others).toHaveLength(films - 1);
      expect(others).not.toContain("wide");

      let filled = 0;
      for (const size of others) {
        filled += COLUMNS[size];
        expect(filled).toBeLessThanOrEqual(6);
        if (filled === 6) filled = 0;
      }
      expect(filled).toBe(0);

      const firstThird = others.indexOf("third");
      if (firstThird !== -1) expect(others.slice(firstThird)).not.toContain("half");
    }
  });
});
