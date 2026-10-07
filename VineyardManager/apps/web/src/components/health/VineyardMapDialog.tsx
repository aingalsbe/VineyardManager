import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Map as MapIcon, X } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Full-screen pop-up that hosts the vineyard health map.
 * Mirrors the weather pop-down pattern (portal + focus trap + Escape/backdrop).
 * When `suspend` is true (e.g. RowActionPanel is open above it) Escape and
 * focus trapping are handed to the topmost overlay.
 */
export function VineyardMapDialog({
  open,
  onClose,
  title = "Vineyard health map",
  subtitle,
  suspend = false,
  highlightRowId,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: ReactNode;
  suspend?: boolean;
  /** Row to scroll/focus into view once the dialog opens. */
  highlightRowId?: string | null;
  children: ReactNode;
}) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Focus management + restore on close.
  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    panel?.querySelector<HTMLElement>("[data-map-close]")?.focus();
    return () => {
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
    };
  }, [open]);

  // Scroll + focus the highlighted row into view.
  useEffect(() => {
    if (!open || !highlightRowId) return;
    const frame = requestAnimationFrame(() => {
      const target = panelRef.current?.querySelector<HTMLElement | SVGElement>(
        `[data-row-id="${CSS.escape(highlightRowId)}"]`,
      );
      if (!target) return;
      target.scrollIntoView({ block: "center", inline: "center", behavior: "smooth" });
      (target as HTMLElement).focus?.({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [open, highlightRowId]);

  useEffect(() => {
    if (!open || suspend) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const panel = panelRef.current;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab" || !panel) return;
      const focusable = Array.from(
        panel.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        ),
      );
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      if (!panel.contains(document.activeElement)) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [open, suspend]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-30 flex items-end justify-center sm:items-center sm:p-6">
      <button
        type="button"
        className="absolute inset-0 bg-foreground/40"
        aria-label="Dismiss map"
        tabIndex={-1}
        onClick={onClose}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative z-10 flex max-h-[92dvh] w-full max-w-5xl flex-col overflow-hidden rounded-t-2xl border-2 border-primary/40 bg-card shadow-xl sm:rounded-2xl"
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-primary/20 bg-primary/5 px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <MapIcon className="size-5 shrink-0 text-primary" aria-hidden />
            <div className="min-w-0">
              <p id={titleId} className="text-base font-semibold text-primary">
                {title}
              </p>
              {subtitle ? (
                <div className="text-xs text-muted" aria-live="polite">
                  {subtitle}
                </div>
              ) : null}
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            data-map-close
            className="size-11 shrink-0 text-primary hover:bg-primary/10"
            aria-label="Close map"
            onClick={onClose}
          >
            <X className="size-5" aria-hidden />
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto p-3 md:p-4">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
