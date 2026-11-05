// The admin's small icons: one line weight on one grid, so they read as a set beside the player's and the header's.
const LINE = "size-4 shrink-0 fill-none stroke-current stroke-[1.5] [stroke-linecap:round] [stroke-linejoin:round]";

export function PlusIcon({ className = LINE }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className={className}>
      <path d="M8 3v10M3 8h10" />
    </svg>
  );
}

export function BackIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className={LINE}>
      <path d="M14 8H3M7.500 3.500 3 8l4.500 4.500" />
    </svg>
  );
}

export function ExternalIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className={LINE}>
      <path d="M6 3H3v10h10v-3M9 3h4v4M13 3 7.500 8.500" />
    </svg>
  );
}

export function StarIcon({ filled, small = false }: { filled: boolean; small?: boolean }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className={`${LINE} ${filled ? "!fill-current" : ""} ${small ? "!size-3" : ""}`}>
      <path d="m8 2 1.800 3.800 4.200.6-3 2.900.7 4.200L8 11.500l-3.700 2 .7-4.200-3-2.900 4.200-.6Z" />
    </svg>
  );
}

export function TrashIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className={LINE}>
      <path d="M2.500 4h11M6 4V2.500h4V4M4 4l.7 9.500h6.600L12 4M6.700 7v4M9.300 7v4" />
    </svg>
  );
}

export function CloseIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className={LINE}>
      <path d="m4 4 8 8M12 4l-8 8" />
    </svg>
  );
}

export function ChevronIcon() {
  return (
    <svg viewBox="0 0 12 12" aria-hidden="true" className="header-menu-chevron size-3 shrink-0 fill-none stroke-current stroke-[1.75]">
      <path d="M2.500 4.500 6 8l3.500-3.500" />
    </svg>
  );
}
