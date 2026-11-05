import Link from "next/link";
import { signOutAction } from "@/app/admin/login/actions";
import { BrandMark } from "@/components/site/BrandMark";
import { buttonClass } from "@/components/ui/Button";
import { SITE } from "@/lib/site";
import { ChevronIcon, ExternalIcon } from "./AdminIcons";

const ACCOUNT_MENU_ID = "account-menu";
const NAV_LINK = "inline-flex min-h-11 items-center gap-1.5 rounded-[3px] px-2.5 text-sm font-medium text-ash transition-colors duration-200 hover:text-bone sm:px-3";
const MENU_ITEM = "flex min-h-11 w-full cursor-pointer items-center rounded-[3px] px-3 text-sm font-medium text-bone transition-colors duration-200 hover:bg-white/[0.07] focus-visible:bg-white/[0.07]";

// The same raised bar as the public page, timeline and all, so signing in feels like walking behind the same screen.
// The account menu is the browser's own popover, so it needs no JavaScript and works from the keyboard.
export function AdminHeader({ email }: { email: string | undefined }) {
  return (
    <header className="sticky top-0 z-30 pt-2 sm:pt-3">
      <div className="page-shell">
        <div className="header-bar relative flex h-14 items-center justify-between gap-3 px-3 sm:gap-6 sm:px-4">
          <Link href="/admin" className="inline-flex min-h-11 shrink-0 items-center gap-2 text-bone">
            <BrandMark />
            <span className="display text-[1.625rem] leading-none">{SITE.name}</span>
          </Link>
          {/* Decorative: an editor's timeline, whose playhead follows the page as it scrolls. */}
          <div aria-hidden="true" className="header-timeline">
            <span className="header-playhead" />
          </div>
          <nav aria-label="Admin" className="flex shrink-0 items-center">
            <Link href="/admin" className={`${NAV_LINK} max-sm:hidden`}>
              Projects
            </Link>
            <a href="/" target="_blank" rel="noreferrer" className={NAV_LINK}>
              View site
              <ExternalIcon />
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
            <button
              type="button"
              popoverTarget={ACCOUNT_MENU_ID}
              aria-label="Account"
              className={buttonClass("outline", "header-menu-trigger ms-1 !min-h-9 !gap-1.5 !px-2.5 !py-1.5 sm:ms-2")}
            >
              <span aria-hidden="true" className="font-time text-xs uppercase">
                {email?.charAt(0) ?? "?"}
              </span>
              <ChevronIcon />
            </button>
            <div id={ACCOUNT_MENU_ID} popover="auto" className="header-menu plate">
              <div className="px-3 pb-2 pt-2.5">
                <p className="label">Signed in as</p>
                <p className="mt-1 text-sm text-bone [overflow-wrap:anywhere]">{email}</p>
              </div>
              <div className="mx-3 border-t border-line" />
              <Link href="/admin/login?flow=set-password" className={MENU_ITEM}>
                Change password
              </Link>
              <form action={signOutAction}>
                <button type="submit" className={MENU_ITEM}>
                  Sign out
                </button>
              </form>
            </div>
          </nav>
        </div>
      </div>
    </header>
  );
}
