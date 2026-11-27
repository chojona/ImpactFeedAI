/**
 * Pure helpers for the mobile nav disclosure. Kept free of React so the
 * Escape / Tab contracts can be unit-tested without a DOM harness.
 */

export function isMenuCloseKey(key: string): boolean {
  return key === "Escape";
}

/**
 * Cycle focus inside an open menu when Tab / Shift+Tab hit the edges.
 * Returns the element that should receive focus, or null when the event
 * should be left alone.
 */
export function nextMenuFocusTarget(
  items: readonly HTMLElement[],
  active: Element | null,
  shiftKey: boolean,
): HTMLElement | null {
  if (items.length === 0) return null;

  const index = items.findIndex((el) => el === active);
  if (index === -1) {
    return shiftKey ? items[items.length - 1]! : items[0]!;
  }

  if (!shiftKey && index === items.length - 1) {
    return items[0]!;
  }
  if (shiftKey && index === 0) {
    return items[items.length - 1]!;
  }
  return null;
}
