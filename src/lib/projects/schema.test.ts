import { describe, expect, it } from "vitest";
import { parseProjectInput, titleFromFileName } from "./schema";

describe("a title from a file name", () => {
  it("reads underscores, and the dots or hyphens of a name with no spaces, as gaps", () => {
    expect(titleFromFileName("JADE_TRISTEN_BENNING.mp4")).toBe("JADE TRISTEN BENNING");
    expect(titleFromFileName("harbour-lights-final.mp4")).toBe("harbour lights final");
    expect(titleFromFileName("harbour.lights.final.mp4")).toBe("harbour lights final");
  });

  it("keeps the dots and hyphens of a name that already has spaces", () => {
    expect(titleFromFileName("EE.UU. trial day 2.mp4")).toBe("EE.UU. trial day 2");
    expect(titleFromFileName("Tony Carruthers - final cut.mp4")).toBe("Tony Carruthers - final cut");
  });
});

describe("project details", () => {
  it("are tidied the same way whoever sends them", () => {
    const parsed = parseProjectInput({
      title: "  JASMINE__JAZZY_PACE ",
      category: " True   Crime ",
      language: "",
      description: " Line one\nline two ",
      is_featured: true,
    });
    expect(parsed).toEqual({
      ok: true,
      data: { title: "JASMINE JAZZY PACE", category: "True Crime", language: "", description: "Line one\nline two", is_featured: true },
    });
  });

  it("still need a title and a category", () => {
    const parsed = parseProjectInput({ title: " _ ", category: "  " });
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(Object.keys(parsed.fieldErrors).sort()).toEqual(["category", "title"]);
  });
});
