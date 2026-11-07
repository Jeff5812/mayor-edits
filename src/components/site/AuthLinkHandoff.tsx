"use client";

import { useEffect } from "react";
import { parseAuthLink } from "@/app/admin/login/auth-link";

// Supabase sends an invitation or password link back to the site's plain address when the link was sent from its dashboard,
// or when the sign-in page is missing from its allowed addresses. This passes such a link on to the page for choosing a
// password, so it still works. It renders nothing.
export function AuthLinkHandoff() {
  useEffect(() => {
    if (parseAuthLink(window.location.hash).kind !== "none") {
      window.location.replace(`/admin/login?flow=set-password${window.location.hash}`);
    }
  }, []);
  return null;
}
