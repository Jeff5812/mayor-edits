import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { assertAdmin } from "@/lib/auth/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ActionResult } from "./action-types";

const SESSION_ENDED = "Your admin session has ended. Please sign in again.";

// Every server action starts here, so nothing runs for anyone but an administrator.
// It lives outside the action files because everything exported from those can be called from a browser.
export async function asAdmin<T>(run: (supabase: SupabaseClient) => Promise<ActionResult<T>>): Promise<ActionResult<T>> {
  try {
    await assertAdmin();
  } catch {
    return { ok: false, error: SESSION_ENDED };
  }
  try {
    return await run(await createSupabaseServerClient());
  } catch (error) {
    console.error("[admin] action failed:", error instanceof Error ? error.message : error);
    return { ok: false, error: "Something went wrong. Please try again in a moment." };
  }
}
