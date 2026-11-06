import { SITE } from "@/lib/site";
import { BrandMark } from "./BrandMark";
import { ContactMenu } from "./ContactMenu";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 pt-2 sm:pt-3">
      <div className="page-shell">
        <div className="header-bar relative flex h-14 items-center justify-between gap-4 pe-2.5 ps-5 sm:ps-6">
          <a href="#top" className="inline-flex min-h-11 shrink-0 items-center gap-2 text-bone">
            <BrandMark className="text-ember" />
            <span className="display text-[1.625rem] leading-none">{SITE.name}</span>
          </a>
          <ContactMenu />
          {/* Decorative: a spark along the bottom edge that follows the page as it scrolls. */}
          <div aria-hidden="true" className="header-timeline">
            <span className="header-playhead" />
          </div>
        </div>
      </div>
    </header>
  );
}
