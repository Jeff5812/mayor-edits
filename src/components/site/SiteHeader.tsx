import { SITE } from "@/lib/site";
import { BrandMark } from "./BrandMark";
import { ContactMenu } from "./ContactMenu";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 pt-2 sm:pt-3">
      <div className="page-shell">
        <div className="header-bar relative flex h-14 items-center justify-between gap-4 px-3 sm:gap-8 sm:px-4">
          <a href="#top" className="inline-flex min-h-11 shrink-0 items-center gap-2 text-bone">
            <BrandMark />
            <span className="display text-[1.625rem] leading-none">{SITE.name}</span>
          </a>
          {/* Decorative: an editor's timeline, whose playhead follows the page as it scrolls. */}
          <div aria-hidden="true" className="header-timeline">
            <span className="header-playhead" />
          </div>
          <ContactMenu />
        </div>
      </div>
    </header>
  );
}
