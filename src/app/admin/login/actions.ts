"use server";

import { createClient } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { isSupabaseConfigured, supabasePublishableKey, supabaseUrl } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface LoginState {
  error: string | null;
}

function asEmail(value: FormDataEntryValue | null): string | null {
  const email = typeof value === "string" ? value.trim() : "";
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

const NOT_CONFIGURED = "Sign-in is not available yet because Supabase is not connected to this site.";
const UNREACHABLE =
  "The sign-in service could not be reached. Please try again in a moment. If the Supabase project is paused, restore it from the Supabase dashboard.";

export async function signIn(_previous: LoginState, formData: FormData): Promise<LoginState> {
  if (!isSupabaseConfigured()) return { error: NOT_CONFIGURED };

  const email = asEmail(formData.get("email"));
  const password = formData.get("password");
  if (!email) return { error: "Please enter a valid email address." };
  if (typeof password !== "string" || !password) return { error: "Please enter your password." };

  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      if (error.code === "invalid_credentials") return { error: "That email and password do not match." };
      if (error.code === "over_request_rate_limit") return { error: "Too many attempts. Please wait a few minutes." };
      if (error.code === "email_not_confirmed") {
        return { error: "This email has not been confirmed yet. Use the link in your invitation email first." };
      }
      if (error.status && error.status >= 500) return { error: UNREACHABLE };
      return { error: "Sign-in failed. Please check your details and try again." };
    }

    const { data: isAdmin, error: adminError } = await supabase.rpc("is_admin");
    if (adminError || isAdmin !== true) {
      await supabase.auth.signOut();
      return { error: "This account is not an administrator of this site." };
    }
  } catch {
    return { error: UNREACHABLE };
  }

  // redirect() works by throwing, so it has to stay outside the try block.
  redirect("/admin");
}

export interface ResetState {
  sent: boolean;
  error: string | null;
}

// Sends a link for setting a new password. It uses the implicit flow on purpose: that link works in
// any browser, whereas a PKCE link only works in the browser that requested it. The reply is the same
// for known and unknown addresses, so this form cannot reveal who has an account.
export async function requestPasswordLink(_previous: ResetState, formData: FormData): Promise<ResetState> {
  if (!isSupabaseConfigured()) return { sent: false, error: NOT_CONFIGURED };

  const email = asEmail(formData.get("email"));
  if (!email) return { sent: false, error: "Please enter a valid email address." };

  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/$/, "");
  if (!siteUrl) return { sent: false, error: "NEXT_PUBLIC_SITE_URL is not set, so a link cannot be created." };

  try {
    const client = createClient(supabaseUrl, supabasePublishableKey, {
      auth: { flowType: "implicit", persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const { error } = await client.auth.resetPasswordForEmail(email, {
      redirectTo: `${siteUrl}/admin/login?flow=set-password`,
    });
    if (error?.status === 429) {
      return { sent: false, error: "Too many emails have been requested. Please wait and try again later." };
    }
    if (error) console.error("[auth] password link failed:", error.message);
  } catch {
    return { sent: false, error: UNREACHABLE };
  }
  return { sent: true, error: null };
}

export async function signOutAction() {
  if (isSupabaseConfigured()) {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut();
  }
  redirect("/admin/login");
}
