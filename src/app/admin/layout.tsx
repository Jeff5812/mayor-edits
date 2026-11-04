import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Admin",
  robots: { index: false, follow: false },
};

// Every admin page reads the session cookie, so none of them can render ahead of the request.
export const instant = false;

export default function AdminLayout({ children }: { children: ReactNode }) {
  return <div className="min-h-dvh">{children}</div>;
}
