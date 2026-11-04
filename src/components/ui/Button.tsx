export type ButtonVariant = "primary" | "outline";

const base =
  "btn inline-flex min-h-12 cursor-pointer items-center justify-center gap-3 px-6 py-3 text-center text-sm font-semibold " +
  "disabled:cursor-not-allowed disabled:opacity-60";

// The surfaces, depth and press are in globals.css, so every button on the site has the same material.
const variants: Record<ButtonVariant, string> = {
  /** Bright with black type: the main action. */
  primary: "btn-primary",
  /** Dark and raised. */
  outline: "btn-outline",
};

/** Class string for anything that should look like a button. */
export function buttonClass(variant: ButtonVariant = "primary", className = "") {
  return `${base} ${variants[variant]} ${className}`;
}
