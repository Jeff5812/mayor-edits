// The size of each film on the reel at desktop width, in reel order. The first film, the featured one, is the lead beside the
// headline. The others fill rows that are never left half empty: rows of two first, so the frames step down in size further
// down the page, then rows of three. A single other film cannot fill a row, so it takes the lead's width, beneath it.
export type ReelSize = "lead" | "wide" | "half" | "third";

export function reelSizes(films: number): ReelSize[] {
  if (films < 1) return [];
  const others = films - 1;
  if (others === 1) return ["lead", "wide"];
  const rows = Math.ceil(others / 3);
  const inPairs = (rows * 3 - others) * 2;
  return ["lead", ...Array.from({ length: others }, (_, index): ReelSize => (index < inPairs ? "half" : "third"))];
}
