import Link from "next/link";
import type { ReactNode } from "react";
import { BackIcon } from "./AdminIcons";

// The top of every admin page: where you are, the page's name in the site's own headline type, and its main action.
export function PageHead({ eyebrow, title, action, back = false }: { eyebrow?: ReactNode; title: string; action?: ReactNode; back?: boolean }) {
  return (
    <div className="anim-rise flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
      <div className="min-w-0">
        {back ? (
          <Link href="/admin" className="group inline-flex min-h-11 items-center gap-2 text-sm text-ash transition-colors duration-200 hover:text-bone">
            <span className="transition-transform duration-300 ease-[var(--ease-settle)] group-hover:-translate-x-1">
              <BackIcon />
            </span>
            All projects
          </Link>
        ) : null}
        {eyebrow}
        <h1 dir="auto" className="text-heading display-lift mt-1 break-words">
          <span className="display-deep">{title}</span>
        </h1>
      </div>
      {action}
    </div>
  );
}
