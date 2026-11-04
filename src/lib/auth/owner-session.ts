// Browser only. Tells the public page whether the person looking at it is the signed-in owner, so owner controls can
// appear over the reel. The page itself stays static and the same for everyone. This only decides what to show:
// the server actions and row-level security are what actually protect anything.
import { useSyncExternalStore } from "react";

const AUTH_COOKIE = /(?:^|;\s*)sb-[^=]+-auth-token(?:\.\d+)?=/;

let isOwner = false;
let checked = false;
const listeners = new Set<() => void>();

async function check() {
  if (checked) return;
  checked = true;
  // Visitors without a session stop here, and never download the Supabase client.
  if (!AUTH_COOKIE.test(document.cookie)) return;
  try {
    const { createSupabaseBrowserClient } = await import("@/lib/supabase/browser");
    const { data, error } = await createSupabaseBrowserClient().rpc("is_admin");
    isOwner = !error && data === true;
    if (isOwner) listeners.forEach((listener) => listener());
  } catch {
    // Without an answer the controls stay hidden, and the page is simply the public page.
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  void check();
  return () => {
    listeners.delete(listener);
  };
}

export function useIsOwner() {
  return useSyncExternalStore(
    subscribe,
    () => isOwner,
    () => false,
  );
}
