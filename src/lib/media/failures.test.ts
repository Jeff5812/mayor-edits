import { afterEach, describe, expect, it, vi } from "vitest";
import { explainFailure, explainPosterFailure, isFileReadError, isNetworkFailure } from "./failures";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("isFileReadError", () => {
  it("recognises a file that became unavailable", () => {
    expect(isFileReadError(new DOMException("could not be read", "NotReadableError"))).toBe(true);
    expect(isFileReadError(new DOMException("gone", "NotFoundError"))).toBe(true);
  });

  it("leaves other errors alone", () => {
    expect(isFileReadError(new DOMException("stopped", "AbortError"))).toBe(false);
    expect(isFileReadError(new TypeError("Failed to fetch"))).toBe(false);
    expect(isFileReadError(new Error("could not be read"))).toBe(false);
  });
});

describe("isNetworkFailure", () => {
  it.each(["Failed to fetch", "NetworkError when attempting to fetch resource.", "Load failed"])("recognises %s", (message) => {
    expect(isNetworkFailure(new TypeError(message))).toBe(true);
  });

  it("does not blame the network for a server or code error", () => {
    expect(isNetworkFailure(new Error("An unexpected response was received from the server."))).toBe(false);
    expect(isNetworkFailure(new TypeError("x is not a function"))).toBe(false);
    expect(isNetworkFailure(new DOMException("could not be read", "NotReadableError"))).toBe(false);
  });

  it("treats anything as a network failure while the browser is offline", () => {
    vi.stubGlobal("navigator", { onLine: false });
    expect(isNetworkFailure(new Error("anything"))).toBe(true);
  });
});

describe("explainFailure", () => {
  it("only mentions the connection when that is what failed", () => {
    expect(explainFailure("It was not saved.", new TypeError("Failed to fetch"))).toBe("It was not saved. Check your connection and try again.");
    const other = explainFailure("It was not saved.", new Error("boom"));
    expect(other).toContain("It was not saved.");
    expect(other).not.toMatch(/connection/i);
  });
});

describe("explainPosterFailure", () => {
  it("says a refused upload is about the account, including how storage words row-level security", () => {
    for (const failure of [
      { message: "new row violates row-level security policy", status: 400, statusCode: "403" },
      { message: "new row violates row-level security policy" },
      { message: "Unauthorized", status: 401, statusCode: "401" },
    ]) {
      const message = explainPosterFailure(failure);
      expect(message).toMatch(/sign in again/i);
      expect(message).not.toMatch(/connection/i);
    }
  });

  it("explains size and type refusals", () => {
    expect(explainPosterFailure({ status: 400, statusCode: "413", message: "too big" })).toMatch(/5 MB/);
    expect(explainPosterFailure({ status: 400, statusCode: "415", message: "bad type" })).toMatch(/JPEG/);
  });

  it("reports any other answer from storage without blaming the connection", () => {
    const message = explainPosterFailure({ status: 500, statusCode: "500", message: "oops" });
    expect(message).toContain("500");
    expect(message).not.toMatch(/connection/i);
  });

  it("mentions the connection only when no answer came back", () => {
    expect(explainPosterFailure({ message: "Failed to fetch", originalError: new TypeError("Failed to fetch") })).toMatch(/connection/i);
    expect(explainPosterFailure({ message: "strange", originalError: new Error("strange") })).not.toMatch(/connection/i);
  });
});
