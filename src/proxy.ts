import type { NextRequest } from "next/server";
import { updateAdminSession } from "./lib/supabase/proxy";

// Only the admin area has sessions. The public page never runs this, so it stays fully cached.
export default function proxy(request: NextRequest) {
  return updateAdminSession(request);
}

export const config = {
  matcher: ["/admin/:path*"],
};
