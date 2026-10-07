import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Reusable confirm modal (alertdialog). Same chrome as VineyardMapDialog /
 * the weather pop-down: portal, labelled title + description, focus trap,
 * Escape/backdrop close (blocked while `busy`), focus returns to the opener.
 * Cancel gets initial focus. Bottom sheet on phones, centered card from sm.
 */
export function ConfirmDialog({
  open,
  onClose,
  title,
  description,
  children,
  actions,
  error,
  busy = false,
  cancelLabel = "Cancel",
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  /** Extra body content (lists, loading/error states). */
  children?: ReactNode;
  /** Confirm buttons; Cancel is rendered automatically after them. */
  actions?: ReactNode;
  /** Inline error from the last confirm attempt. */
  error?: string | null;
  busy?: boolean;
  cancelLabel?: string;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  const busyRef = useRef(busy);
  useEffect(() => {
    onCloseRef.current = onClose;
    busyRef.current = busy;
  });

  // Initial focus on Cancel; restore focus to the opener on close.
  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement as HTMLElement | null;
    cancelRef.current?.focus();
    return () => {
      if (opener?.isConnected) {
        opener.focus();
      } else {
        // Opener was removed (e.g. the deleted card); land on the page heading.
        const fallback = document.querySelector<HTMLElement>("main h1");
        if (fallback) {
          fallback.tabIndex = -1;
          fallback.focus();
        }
      }
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      const panel = panelRef.current;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        if (!busyRef.current) onCloseRef.current();
        return;
      }
      if (event.key !== "Tab" || !panel) return;
      const focusable = Array.from(
        panel.querySelectorAll<HTMLElement>(FOCUSABLE),
      );
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) {
        event.preventDefault();
        panel.focus();
        return;
      }
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
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
      <button
        type="button"
        tabIndex={-1}
        aria-label="Dismiss"
        className="absolute inset-0 bg-foreground/40"
        onClick={() => {
          if (!busy) onClose();
        }}
      />
      <div
        ref={panelRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        aria-busy={busy || undefined}
        tabIndex={-1}
        className="relative z-10 flex max-h-[90dvh] w-full flex-col overflow-hidden rounded-t-2xl border border-border bg-card shadow-xl outline-none sm:max-w-lg sm:rounded-2xl"
      >
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pt-5 pb-4">
          <h2
            id={titleId}
            className="text-xl font-semibold tracking-tight text-foreground"
          >
            {title}
          </h2>
          {description ? (
            <div id={descriptionId} className="mt-2 text-sm text-muted">
              {description}
            </div>
          ) : null}
          {children ? <div className="mt-4">{children}</div> : null}
          {error ? (
            <p
              role="alert"
              className="mt-4 rounded-md border border-red-700/30 bg-red-50 px-3 py-2 text-sm text-red-800"
            >
              {error}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-border bg-background/60 px-5 py-4 sm:flex-row sm:flex-wrap sm:justify-end">
          <Button
            ref={cancelRef}
            type="button"
            variant="outline"
            className="w-full sm:w-auto"
            disabled={busy}
            onClick={onClose}
          >
            {cancelLabel}
          </Button>
          {actions}
        </div>
      </div>
    </div>,
    document.body,
  );
}
