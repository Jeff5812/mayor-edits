"use server";

import { redirect } from "next/navigation";
import { isSupabaseConfigured } from "@/lib/supabase/env";
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

export async function signOutAction() {
  if (isSupabaseConfigured()) {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut();
  }
  redirect("/admin/login");
}
