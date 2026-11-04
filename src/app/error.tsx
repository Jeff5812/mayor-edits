"use client";

import { buttonClass } from "@/components/ui/Button";
import { SITE } from "@/lib/site";

// Shown if the portfolio cannot be loaded. Never an empty portfolio, and the contact details still work.
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="page-shell flex min-h-dvh flex-col items-start justify-center gap-4 py-16">
      <h1 className="text-heading">The reel could not be loaded.</h1>
      <p className="text-ash">
        Please try again in a moment, or send your footage details to{" "}
        <a href={SITE.emailUrl} className="text-bone underline underline-offset-4">
          {SITE.email}
        </a>
        .
      </p>
      <button type="button" className={buttonClass("outline")} onClick={reset}>
        Try again
      </button>
    </main>
  );
}
