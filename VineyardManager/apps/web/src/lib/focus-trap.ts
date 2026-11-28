/**
 * Pure focus-trap helpers shared by every modal (ConfirmDialog,
 * ActivityFormDialog, NewSeasonDialog) via useModalFocus. Kept free of
 * React and path aliases so they can be unit-tested with node:test.
 */

export const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';

export type TrapDecision =
  /** Let the browser move focus normally. */
  | { kind: "allow" }
  /** Prevent default and focus focusables[index]. */
  | { kind: "focus"; index: number }
  /** Prevent default and focus the panel itself (no focusable children). */
  | { kind: "panel" };

/**
 * Decide what a Tab / Shift+Tab press should do inside a modal panel.
 * @param count number of focusable elements in the panel
 * @param activeIndex index of document.activeElement in that list, or -1
 * @param activeInsidePanel whether document.activeElement is inside the panel
 * @param shiftKey Shift held (backwards)
 */
export function trapTab(
  count: number,
  activeIndex: number,
  activeInsidePanel: boolean,
  shiftKey: boolean,
): TrapDecision {
  if (count === 0) return { kind: "panel" };
  if (!activeInsidePanel) return { kind: "focus", index: shiftKey ? count - 1 : 0 };
  if (shiftKey && activeIndex === 0) return { kind: "focus", index: count - 1 };
  if (!shiftKey && activeIndex === count - 1) return { kind: "focus", index: 0 };
  return { kind: "allow" };
}
