// What an invitation or password-reset link hands back in the address bar. After verifying the link,
// Supabase redirects here with either the session or an error in the URL fragment.
export type AuthLink =
  | { kind: "none" }
  | { kind: "session"; access_token: string; refresh_token: string }
  | { kind: "error"; code: string | null };

export function parseAuthLink(hash: string): AuthLink {
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  if (params.get("error") || params.get("error_code") || params.get("error_description")) {
    return { kind: "error", code: params.get("error_code") };
  }
  const access_token = params.get("access_token");
  const refresh_token = params.get("refresh_token");
  if (access_token && refresh_token) return { kind: "session", access_token, refresh_token };
  return { kind: "none" };
}

export function explainLinkError(code: string | null): string {
  if (code === "otp_expired" || code === "invite_not_found") {
    return "This link has expired or has already been used. Links work once, and some email apps open them while checking for viruses. Ask your developer for a new one.";
  }
  return "This link could not be used. Ask your developer for a new one.";
}

// Matches what the set-password form asks for. Supabase also applies the project's own rules.
export const PASSWORD_MIN_LENGTH = 10;

export function validateNewPassword(password: string, confirmation: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) return `Use at least ${PASSWORD_MIN_LENGTH} characters.`;
  if (password !== confirmation) return "The two passwords do not match.";
  return null;
}
