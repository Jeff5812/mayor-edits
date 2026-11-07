"use client";

import { useActionState, useEffect, useId, useState } from "react";
import { type LoginState, type ResetState, requestPasswordLink, signIn } from "@/app/admin/login/actions";
import { parseAuthLink } from "@/app/admin/login/auth-link";
import { alertClass, fieldLabelClass, inputClass, primaryButtonClass, smallButtonClass, successClass } from "./styles";

const INITIAL_LOGIN: LoginState = { error: null };
const INITIAL_RESET: ResetState = { sent: false, error: null };

function SignInPanel() {
  const [state, action, pending] = useActionState(signIn, INITIAL_LOGIN);
  const emailId = useId();
  const passwordId = useId();
  const errorId = useId();

  return (
    <form action={action} className="grid gap-5" aria-describedby={state.error ? errorId : undefined}>
      <div>
        <label htmlFor={emailId} className={fieldLabelClass}>
          Email
        </label>
        <input id={emailId} name="email" type="email" required autoComplete="username" className={inputClass} />
      </div>
      <div>
        <label htmlFor={passwordId} className={fieldLabelClass}>
          Password
        </label>
        <input
          id={passwordId}
          name="password"
          type="password"
          required
          autoComplete="current-password"
          className={inputClass}
        />
      </div>
      {state.error ? (
        <p id={errorId} role="alert" className={alertClass}>
          {state.error}
        </p>
      ) : null}
      <button type="submit" disabled={pending} className={primaryButtonClass}>
        {pending ? "Signing in" : "Sign in"}
      </button>
    </form>
  );
}

// `focus` moves straight to the email field when the owner has just asked for the form, which also scrolls it into view on a phone.
export function RequestLinkPanel({ focus = false }: { focus?: boolean }) {
  const [state, action, pending] = useActionState(requestPasswordLink, INITIAL_RESET);
  const emailId = useId();

  if (state.sent) {
    return (
      <p role="status" className={successClass}>
        If that address belongs to an account, a link for choosing a password is on its way. It works once. Check your
        spam folder if nothing arrives within a few minutes.
      </p>
    );
  }

  return (
    <form action={action} className="grid gap-4">
      <div>
        <label htmlFor={emailId} className={fieldLabelClass}>
          Your email
        </label>
        <input id={emailId} name="email" type="email" required autoComplete="username" autoFocus={focus} className={inputClass} />
      </div>
      {state.error ? (
        <p role="alert" className={alertClass}>
          {state.error}
        </p>
      ) : null}
      <button type="submit" disabled={pending} className={smallButtonClass}>
        {pending ? "Sending" : "Email me a link"}
      </button>
    </form>
  );
}

export function LoginForm() {
  const [forgot, setForgot] = useState(false);

  // A link that came back to the plain login address still carries its session or error, so hand it
  // over to the password page rather than leaving it unused in the address bar.
  useEffect(() => {
    if (parseAuthLink(window.location.hash).kind !== "none") {
      window.location.replace(`/admin/login?flow=set-password${window.location.hash}`);
    }
  }, []);

  return (
    <div className="grid gap-8">
      <SignInPanel />
      <div className="border-t border-line pt-6">
        {forgot ? (
          <div className="grid gap-4">
            <h2 className="text-base font-medium text-bone">Choose a new password</h2>
            <RequestLinkPanel focus />
            <button type="button" className="min-h-11 justify-self-start text-sm text-ash underline underline-offset-4 hover:text-bone" onClick={() => setForgot(false)}>
              Back to sign in
            </button>
          </div>
        ) : (
          <button type="button" className="min-h-11 text-sm text-ash underline underline-offset-4 hover:text-bone" onClick={() => setForgot(true)}>
            Forgot your password?
          </button>
        )}
      </div>
    </div>
  );
}
