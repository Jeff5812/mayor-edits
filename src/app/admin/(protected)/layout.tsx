import Link from "next/link";
import type { ReactNode } from "react";
import { signOutAction } from "@/app/admin/login/actions";
import { smallButtonClass } from "@/components/admin/styles";
import { requireAdmin } from "@/lib/auth/admin";
import { SITE } from "@/lib/site";

const navLinkClass = "inline-flex min-h-11 items-center px-3 text-sm text-bone underline-offset-4 hover:underline";

// Every page under here needs an administrator. Each page and action checks again for itself,
// because a layout does not re-run on every navigation.
export default async function ProtectedAdminLayout({ children }: { children: ReactNode }) {
  const user = await requireAdmin();

  return (
    <>
      <header className="border-b border-line bg-graphite">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-3 sm:px-6">
          <Link href="/admin" className="inline-flex min-h-11 items-center text-sm font-medium text-bone">
            {SITE.name} admin
          </Link>
          <nav aria-label="Admin" className="flex flex-wrap items-center">
            <Link href="/admin" className={navLinkClass}>
              Projects
            </Link>
            <a href="/" target="_blank" rel="noreferrer" className={navLinkClass}>
              View site<span className="sr-only"> (opens in a new tab)</span>
            </a>
          </nav>
          <div className="flex flex-wrap items-center gap-3">
            <span className="hidden text-sm text-ash md:inline">{user.email}</span>
            <Link href="/admin/login?flow=set-password" className={navLinkClass}>
              Change password
            </Link>
            <form action={signOutAction}>
              <button type="submit" className={smallButtonClass}>
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>
      {children}
    </>
  );
}
