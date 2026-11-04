import { buttonClass } from "@/components/ui/Button";

// Shared admin form styling. Text sizes stay large enough for AA on the dark grounds.
export const fieldLabelClass = "block text-sm font-medium text-bone";
export const fieldHintClass = "mt-1 text-sm text-ash";
export const fieldErrorClass = "mt-1 text-sm text-danger";
export const inputClass =
  "mt-2 block min-h-11 w-full rounded-[3px] border border-line-strong bg-ink px-3 py-2 text-base text-bone placeholder:text-ash/70 " +
  "shadow-[inset_0_2px_5px_rgb(0_0_0/0.6)] focus-visible:border-bone aria-[invalid=true]:border-danger disabled:cursor-not-allowed disabled:opacity-60";
// Slightly tighter than the public buttons, because admin rows hold several at once.
const compact = "!min-h-11 !px-4 !py-2";
export const smallButtonClass = buttonClass("outline", compact);
export const dangerButtonClass = buttonClass("primary", compact);
export const primaryButtonClass = buttonClass("primary", compact);
export const panelClass = "plate p-5 sm:p-6";
export const alertClass = "border border-danger bg-graphite p-4 text-sm text-bone";
export const noticeClass = "border border-line-strong bg-graphite p-4 text-sm text-bone";
export const successClass = "border border-line-strong bg-charcoal p-4 text-sm text-bone";
