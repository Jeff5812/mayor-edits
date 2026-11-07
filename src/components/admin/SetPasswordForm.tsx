"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import Link from "next/link";
import { type FormEvent, useEffect, useId, useRef, useState } from "react";
import { PASSWORD_MIN_LENGTH, explainLinkError, parseAuthLink, validateNewPassword } from "@/app/admin/login/auth-link";
import { explainFailure } from "@/lib/media/failures";
import { isSupabaseConfigured, supabasePublishableKey, supabaseUrl } from "@/lib/supabase/env";
import { RequestLinkPanel } from "./LoginForm";
import { alertClass, fieldHintClass, fieldLabelClass, inputClass, primaryButtonClass, successClass } from "./styles";

type Stage =
  | { name: "checking" }
  | { name: "ready"; email: string }
  | { name: "invalid"; message: string }
  | { name: "done"; message: string };

const NO_LINK = "This page needs the link from your invitation or password email. Request a new one below.";
const NOT_CONFIGURED = "Sign-in is not available yet because Supabase is not connected to this site.";

// A separate client that leaves the address bar alone: invitation links carry the session in the URL
// fragment, which the default client refuses because it expects a different sign-in flow. This one
// still saves the session in cookies, so the server sees the same signed-in user.
function createLinkClient() {
  return createBrowserClient(supabaseUrl, supabasePublishableKey, {
    isSingleton: false,
    auth: { detectSessionInUrl: false },
  });
}

function explainSaveError(code: string | undefined, message: string): string {
  if (code === "weak_password") return "That password is too easy to guess. Please choose a longer or less common one.";
  if (code === "same_password") return "That is your current password. Please choose a different one.";
  if (code === "session_expired" || code === "session_not_found" || code === "bad_jwt") {
    return "This link's session has ended. Request a new link from the sign-in page.";
  }
  if (code === "over_request_rate_limit") return "Too many attempts. Please wait a few minutes.";
  console.error("[auth] password update failed:", message);
  return "The password could not be saved. Please try again in a moment.";
}

export function SetPasswordForm() {
  const [stage, setStage] = useState<Stage>({ name: "checking" });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const clientRef = useRef<SupabaseClient | null>(null);
  const started = useRef(false);
  const passwordId = useId();
  const confirmId = useId();
  const hintId = useId();
  const errorId = useId();

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    void (async () => {
      const link = parseAuthLink(window.location.hash);
      // Tokens must not linger in the address bar or the browser history.
      if (window.location.hash) {
        window.history.replaceState(null, "", window.location.pathname + window.location.search);
      }
      if (!isSupabaseConfigured()) {
        setStage({ name: "invalid", message: NOT_CONFIGURED });
        return;
      }
      if (link.kind === "error") {
        setStage({ name: "invalid", message: explainLinkError(link.code) });
        return;
      }

      const client = createLinkClient();
      clientRef.current = client;
      try {
        if (link.kind === "session") {
          const { data, error: sessionError } = await client.auth.setSession({
            access_token: link.access_token,
            refresh_token: link.refresh_token,
          });
          if (sessionError || !data.user) {
            setStage({ name: "invalid", message: explainLinkError("otp_expired") });
            return;
          }
          setStage({ name: "ready", email: data.user.email ?? "" });
          return;
        }
        // No link in the address: a signed-in administrator can still change their password here.
        const { data } = await client.auth.getSession();
        const user = data.session?.user;
        setStage(user ? { name: "ready", email: user.email ?? "" } : { name: "invalid", message: NO_LINK });
      } catch (problem) {
        setStage({ name: "invalid", message: explainFailure("The sign-in service could not be reached.", problem) });
      }
    })();
  }, []);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const client = clientRef.current;
    if (!client || saving) return;

    const form = new FormData(event.currentTarget);
    const problem = validateNewPassword(String(form.get("password")), String(form.get("confirmation")));
    if (problem) {
      setError(problem);
      return;
    }

    setError(null);
    setSaving(true);
    try {
      const { error: updateError } = await client.auth.updateUser({ password: String(form.get("password")) });
      if (updateError) {
        setError(explainSaveError(updateError.code, updateError.message));
        return;
      }
      const { data: isAdmin } = await client.rpc("is_admin");
      if (isAdmin === true) {
        // A full load on purpose: the client router may hold an answer from before this session
        // existed, which could send a newly signed-in owner back to the login page.
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        window.location.assign("/admin");
        return;
      }
      await client.auth.signOut();
      setStage({
        name: "done",
        message: "Your password is saved, but this account is not an administrator of this site, so there is nothing to open here.",
      });
    } catch (problem) {
      setError(explainFailure("The sign-in service could not be reached.", problem));
    } finally {
      setSaving(false);
    }
  }

  if (stage.name === "checking") {
    return (
      <p role="status" className="text-bone">
        Checking your link
      </p>
    );
  }

  if (stage.name === "done") {
    return (
      <p role="status" className={successClass}>
        {stage.message}
      </p>
    );
  }

  if (stage.name === "invalid") {
    return (
      <div className="grid gap-6">
        <p role="alert" className={alertClass}>
          {stage.message}
        </p>
        {stage.message !== NOT_CONFIGURED ? <RequestLinkPanel /> : null}
        <Link href="/admin/login" className="flex min-h-11 items-center justify-self-start text-sm text-ash underline underline-offset-4 hover:text-bone">
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={save} className="grid gap-5" noValidate>
      {/* Lets password managers save the new password against the right account. */}
      <input type="email" name="username" value={stage.email} autoComplete="username" readOnly hidden />
      {stage.email ? (
        <p className="text-sm text-ash">
          Setting the password for <span className="text-bone">{stage.email}</span>
        </p>
      ) : null}
      <div>
        <label htmlFor={passwordId} className={fieldLabelClass}>
          New password
        </label>
        <input
          id={passwordId}
          name="password"
          type="password"
          required
          minLength={PASSWORD_MIN_LENGTH}
          autoComplete="new-password"
          aria-describedby={hintId}
          className={inputClass}
        />
        <p id={hintId} className={fieldHintClass}>
          At least {PASSWORD_MIN_LENGTH} characters. Only you will know it.
        </p>
      </div>
      <div>
        <label htmlFor={confirmId} className={fieldLabelClass}>
          Repeat the password
        </label>
        <input
          id={confirmId}
          name="confirmation"
          type="password"
          required
          autoComplete="new-password"
          className={inputClass}
        />
      </div>
      {error ? (
        <p id={errorId} role="alert" className={alertClass}>
          {error}
        </p>
      ) : null}
      <button type="submit" disabled={saving} className={primaryButtonClass}>
        {saving ? "Saving" : "Save password and continue"}
      </button>
    </form>
  );
}
