import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import { MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";

export type OverflowMenuItem = {
  key: string;
  label: string;
  icon?: ReactNode;
  /** Red text for irreversible actions (not the health-red token). */
  destructive?: boolean;
  onSelect: () => void;
};

/**
 * "⋯" menu button (WAI-ARIA menu button pattern): 44px trigger with an
 * accessible label, aria-haspopup/expanded/controls; Arrow keys, Home/End
 * move between items; Escape or Tab closes; focus returns to the trigger
 * before the chosen action runs (so dialogs opened by an item treat the
 * trigger as their opener).
 */
export function OverflowMenu({
  label,
  items,
  className,
}: {
  /** Accessible name, e.g. "More actions for NS3 Merlot". */
  label: string;
  items: OverflowMenuItem[];
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [initialIndex, setInitialIndex] = useState(0);

  useEffect(() => {
    if (!open) return;
    itemRefs.current[initialIndex]?.focus();
  }, [open, initialIndex]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  const close = (refocus = true) => {
    setOpen(false);
    if (refocus) triggerRef.current?.focus();
  };

  const openAt = (index: number) => {
    setInitialIndex(index);
    setOpen(true);
  };

  const onTriggerKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      openAt(0);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      openAt(items.length - 1);
    }
  };

  const onMenuKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const nodes = itemRefs.current.filter(
      (node): node is HTMLButtonElement => Boolean(node),
    );
    const current = nodes.indexOf(document.activeElement as HTMLButtonElement);
    const move = (index: number) => {
      event.preventDefault();
      nodes[(index + nodes.length) % nodes.length]?.focus();
    };
    switch (event.key) {
      case "ArrowDown":
        move(current + 1);
        break;
      case "ArrowUp":
        move(current - 1);
        break;
      case "Home":
        move(0);
        break;
      case "End":
        move(nodes.length - 1);
        break;
      case "Escape":
        event.preventDefault();
        event.stopPropagation();
        close();
        break;
      case "Tab":
        close(false);
        break;
      default:
        break;
    }
  };

  if (items.length === 0) return null;

  return (
    <div ref={wrapperRef} className={cn("relative shrink-0", className)}>
      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => (open ? close() : openAt(0))}
        onKeyDown={onTriggerKeyDown}
        className="inline-flex size-11 items-center justify-center rounded-md border border-border bg-card text-foreground hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
      >
        <MoreHorizontal className="size-5" aria-hidden />
      </button>
      {open ? (
        <div
          id={menuId}
          role="menu"
          aria-label={label}
          onKeyDown={onMenuKeyDown}
          className="absolute top-full right-0 z-20 mt-1 min-w-44 rounded-lg border border-border bg-card p-1 shadow-lg"
        >
          {items.map((item, index) => (
            <button
              key={item.key}
              ref={(node) => {
                itemRefs.current[index] = node;
              }}
              type="button"
              role="menuitem"
              tabIndex={-1}
              onClick={() => {
                close();
                item.onSelect();
              }}
              className={cn(
                "flex min-h-11 w-full items-center gap-2 rounded-md px-3 text-left text-base font-medium hover:bg-background focus-visible:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                item.destructive ? "text-red-700" : "text-foreground",
              )}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
