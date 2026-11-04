import { describe, expect, it } from "vitest";
import { PASSWORD_MIN_LENGTH, explainLinkError, parseAuthLink, validateNewPassword } from "./auth-link";

describe("parseAuthLink", () => {
  it("reads the session Supabase puts in the fragment after an invitation", () => {
    expect(parseAuthLink("#access_token=aaa&expires_in=3600&refresh_token=bbb&token_type=bearer&type=invite")).toEqual({
      kind: "session",
      access_token: "aaa",
      refresh_token: "bbb",
    });
  });

  it("reads a failed link", () => {
    expect(parseAuthLink("#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid")).toEqual({
      kind: "error",
      code: "otp_expired",
    });
  });

  it("treats anything else as no link", () => {
    expect(parseAuthLink("")).toEqual({ kind: "none" });
    expect(parseAuthLink("#section")).toEqual({ kind: "none" });
    expect(parseAuthLink("#access_token=aaa")).toEqual({ kind: "none" });
  });
});

describe("explainLinkError", () => {
  it("explains that an expired link needs replacing", () => {
    expect(explainLinkError("otp_expired")).toMatch(/expired/);
    expect(explainLinkError(null)).toMatch(/new one/);
  });
});

describe("validateNewPassword", () => {
  const good = "x".repeat(PASSWORD_MIN_LENGTH);

  it("needs enough characters", () => {
    expect(validateNewPassword("short", "short")).toMatch(/at least/i);
  });

  it("needs both copies to match", () => {
    expect(validateNewPassword(good, `${good}y`)).toMatch(/match/);
  });

  it("accepts a good password", () => {
    expect(validateNewPassword(good, good)).toBeNull();
  });
});
