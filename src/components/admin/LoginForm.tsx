"use client";

import { useActionState, useEffect, useId } from "react";
import { type LoginState, signIn } from "@/app/admin/login/actions";
import { parseAuthLink } from "@/app/admin/login/auth-link";
import { alertClass, fieldLabelClass, inputClass, primaryButtonClass } from "./styles";

const INITIAL_LOGIN: LoginState = { error: null };

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

// The site has one owner, and his developer looks after his account, so a forgotten password goes to the developer. There is
// no email to set up or wait for.
export function LoginForm() {
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
      <p className="border-t border-line pt-6 text-sm leading-relaxed text-ash">Forgot your password? Ask your developer to reset it.</p>
    </div>
  );
}
