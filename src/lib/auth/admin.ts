import "server-only";
import type { User } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export class NotAdminError extends Error {
  constructor() {
    super("Administrator access required");
    this.name = "NotAdminError";
  }
}

async function getAdminUser(): Promise<User | null> {
  if (!isSupabaseConfigured()) return null;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: isAdmin, error } = await supabase.rpc("is_admin");
  return !error && isAdmin === true ? user : null;
}

// For admin pages: redirects anyone who is not an administrator.
export async function requireAdmin(): Promise<User> {
  const user = await getAdminUser();
  if (!user) redirect("/admin/login");
  return user;
}

// For server actions and route handlers: every one that changes data must call this first.
export async function assertAdmin(): Promise<User> {
  const user = await getAdminUser();
  if (!user) throw new NotAdminError();
  return user;
}
