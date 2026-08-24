/**
 * Button appearance, as a class function rather than a component.
 *
 * Half the "buttons" in this application are `next/link` anchors — "Back to the
 * event library", the landing CTAs — and half are real `<button>` elements.
 * Wrapping both in a component would mean either forwarding every anchor prop
 * or having two components that must be kept in sync, so this exports the
 * classes and lets each caller keep its correct element. Semantics stay right:
 * navigation is an `<a>`, action is a `<button>`.
 *
 * Four variants, and the split is about emphasis rather than colour:
 *
 *   primary   — brand indigo fill. One per view, at most. This is the only
 *               button that is allowed to be a solid block of colour.
 *   secondary — bordered surface. The default for anything that is not the
 *               single most important action on screen.
 *   ghost     — no chrome until hover. For controls that live inside dense
 *               content and should not compete with it.
 *   danger    — semantic red, and only for something destructive. Nothing in
 *               the product uses it yet; it is here so that when something does,
 *               it does not get invented as a one-off.
 *
 * No focus classes: `globals.css` owns the ring for every interactive element,
 * so a button cannot ship without one by forgetting a utility.
 */
export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md";

const BASE =
  "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg font-mono font-semibold uppercase tracking-[0.12em] transition-colors duration-150";

const SIZE: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-[10px]",
  md: "h-10 px-5 text-[11px]",
};

const VARIANT: Record<ButtonVariant, string> = {
  primary:
    "bg-brand text-white shadow-[0_1px_0_0_rgba(255,255,255,0.14)_inset,0_6px_18px_-8px_rgba(91,124,250,0.7)] hover:bg-brand-bright hover:text-canvas",
  secondary:
    "surface-lift border border-line bg-surface-2 text-ink-2 hover:border-line-brand hover:bg-surface-3 hover:text-ink",
  ghost: "text-ink-3 hover:bg-brand-tint hover:text-brand-bright",
  danger:
    "border border-neg/40 bg-neg-tint text-neg hover:border-neg/60 hover:bg-neg/15",
};

export function buttonClass(
  variant: ButtonVariant = "secondary",
  size: ButtonSize = "md",
  className = "",
): string {
  return `${BASE} ${SIZE[size]} ${VARIANT[variant]} ${className}`;
}
