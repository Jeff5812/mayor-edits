"use client";

import { type ReactNode, useRef } from "react";

// The header's logo. One press goes back to the top. Three quick presses open the owner's sign-in, so the public page needs
// no visible sign-in link. That only saves the owner typing the address: the admin area checks every visitor on the server.
const PRESSES = 3;
const WITHIN_MS = 1500;

export function BrandLink({ className, children }: { className: string; children: ReactNode }) {
  const presses = useRef<number[]>([]);
  return (
    <a
      href="#top"
      className={className}
      onClick={(event) => {
        const now = event.timeStamp;
        presses.current = [...presses.current.filter((at) => now - at < WITHIN_MS), now];
        if (presses.current.length < PRESSES) return;
        presses.current = [];
        event.preventDefault();
        // A full load, as the plain link it replaces was: the public page never fetches the owner's area ahead of time.
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        window.location.assign("/admin");
      }}
    >
      {children}
    </a>
  );
}
