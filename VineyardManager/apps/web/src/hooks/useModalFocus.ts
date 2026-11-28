import { useEffect, useRef, type RefObject } from "react";
import { FOCUSABLE_SELECTOR, trapTab } from "@/lib/focus-trap";

export type ModalFocusOptions = {
  /** Element focused when the modal opens; defaults to the first focusable, then the panel. */
  initialFocusRef?: RefObject<HTMLElement | null>;
  /** Called on Escape. Omit (or block via `busy`) to ignore Escape. */
  onEscape?: () => void;
  /** While true, Escape is ignored (e.g. a save in flight). */
  busy?: boolean;
  /**
   * Where focus goes on close when set and still connected. Otherwise focus
   * returns to the opener, then falls back to the page's `main h1`.
   */
  returnFocusRef?: RefObject<HTMLElement | null>;
};

function focusWithTabIndex(el: HTMLElement) {
  if (el.tabIndex < 0 && !el.hasAttribute("tabindex")) el.tabIndex = -1;
  el.focus();
}

/**
 * Modal focus management (WAI-ARIA dialog pattern): moves focus into the
 * panel on open, keeps Tab / Shift+Tab inside it, closes on Escape, and
 * returns focus to the opener (or `returnFocusRef`, or `main h1`) on close.
 */
export function useModalFocus(
  panelRef: RefObject<HTMLElement | null>,
  open: boolean,
  options: ModalFocusOptions = {},
): void {
  const optionsRef = useRef(options);
  useEffect(() => {
    optionsRef.current = options;
  });

  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    const initial = optionsRef.current.initialFocusRef?.current;
    if (initial) {
      initial.focus();
    } else if (panel) {
      const first = panel.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
      if (first) first.focus();
      else focusWithTabIndex(panel);
    }
    return () => {
      const explicit = optionsRef.current.returnFocusRef?.current;
      if (explicit?.isConnected) {
        focusWithTabIndex(explicit);
      } else if (opener?.isConnected && opener !== document.body) {
        opener.focus();
      } else {
        const fallback = document.querySelector<HTMLElement>("main h1");
        if (fallback) focusWithTabIndex(fallback);
      }
    };
  }, [open, panelRef]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const panel = panelRef.current;
      if (event.key === "Escape") {
        const { onEscape, busy } = optionsRef.current;
        if (!onEscape) return;
        event.preventDefault();
        event.stopPropagation();
        if (!busy) onEscape();
        return;
      }
      if (event.key !== "Tab" || !panel) return;
      const focusable = Array.from(
        panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      ).filter((el) => el.getClientRects().length > 0);
      const active = document.activeElement as HTMLElement | null;
      const decision = trapTab(
        focusable.length,
        active ? focusable.indexOf(active) : -1,
        Boolean(active && panel.contains(active)),
        event.shiftKey,
      );
      if (decision.kind === "allow") return;
      event.preventDefault();
      if (decision.kind === "panel") focusWithTabIndex(panel);
      else focusable[decision.index]?.focus();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [open, panelRef]);
}
