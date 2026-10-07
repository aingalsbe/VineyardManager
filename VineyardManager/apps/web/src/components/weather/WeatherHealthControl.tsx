import {
  useEffect,
  useId,
  useRef,
  useState,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { CloudSun, X } from "lucide-react";
import type { VineyardWeatherState } from "@/hooks/useVineyardWeather";
import { Button } from "@/components/ui/button";
import { WeatherPanel } from "@/components/weather/WeatherPanel";
import { cn } from "@/lib/utils";

function hasWeatherAlerts(state: VineyardWeatherState): boolean {
  return state.status === "ready" && state.weather.alerts.length > 0;
}

function weatherButtonLabel(state: VineyardWeatherState): string {
  if (state.status === "loading") return "Weather, loading";
  if (state.status === "location-unresolved") {
    return "Weather, location needed";
  }
  if (state.status === "weather-unavailable" || state.status === "error") {
    return "Weather, unavailable";
  }
  if (state.status === "ready" && state.weather.alerts.length > 0) {
    const n = state.weather.alerts.length;
    return `Weather, ${n} alert${n === 1 ? "" : "s"}`;
  }
  if (state.status === "ready") {
    return `Weather, ${state.weather.current.summary}, ${Math.round(state.weather.current.tempF)}°F`;
  }
  return "Weather";
}

/**
 * Compact weather control for the vineyard-health chrome.
 * Opens a pop-down overlay that covers the health bar + map area
 * (portal into `overlayContainerRef`).
 */
export function WeatherHealthControl({
  state,
  onRetry,
  overlayContainerRef,
  showTemp = false,
  className,
}: {
  state: VineyardWeatherState;
  onRetry: () => void;
  /** Relative ancestor that wraps health chrome + map. */
  overlayContainerRef: RefObject<HTMLElement | null>;
  /** Show the current temperature beside the icon when weather is ready. */
  showTemp?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const titleId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const hidden = state.status === "empty-vineyard";
  const showAlerts = hasWeatherAlerts(state);
  const tempLabel =
    showTemp && state.status === "ready"
      ? `${Math.round(state.weather.current.tempF)}°`
      : null;

  useEffect(() => {
    if (!open || hidden) return;

    const panel = panelRef.current;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const focusTarget =
      panel?.querySelector<HTMLElement>("[data-weather-close]") ?? panel;
    focusTarget?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        setOpen(false);
        return;
      }
      if (event.key !== "Tab" || !panel) return;

      const focusable = panel.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) {
        event.preventDefault();
        panel.focus();
        return;
      }
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      if (previouslyFocused?.isConnected) {
        previouslyFocused.focus();
      } else {
        buttonRef.current?.focus();
      }
    };
  }, [open, hidden]);

  useEffect(() => {
    if (hidden && open) setOpen(false);
  }, [hidden, open]);

  useEffect(() => {
    if (!open || hidden) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (buttonRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      // Clicks on the dimmed backdrop (sibling under the panel) should dismiss;
      // also dismiss when interacting outside the health overlay container.
      const container = overlayContainerRef.current;
      if (container && !container.contains(target)) {
        setOpen(false);
        return;
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open, hidden, overlayContainerRef]);

  if (hidden) {
    return null;
  }

  const container = overlayContainerRef.current;

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className={cn(
          "relative inline-flex h-11 min-w-11 shrink-0 gap-1.5 items-center justify-center rounded-md border border-primary/30 bg-card text-primary transition-colors hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
          state.status === "loading" && "animate-pulse",
          tempLabel ? "px-3" : "w-11",
          className,
        )}
        aria-label={weatherButtonLabel(state)}
        aria-expanded={open}
        aria-controls={panelId}
        aria-haspopup="dialog"
        onClick={() => setOpen((value) => !value)}
      >
        <CloudSun className="size-5" aria-hidden />
        {tempLabel ? (
          <span className="text-sm font-semibold tabular-nums" aria-hidden>
            {tempLabel}
          </span>
        ) : null}
        {showAlerts ? (
          <span
            className="absolute top-1 right-1 size-2.5 rounded-full bg-primary ring-2 ring-card"
            aria-hidden
          />
        ) : null}
      </button>

      {open && container
        ? createPortal(
            <div className="absolute inset-0 z-30">
              <button
                type="button"
                className="absolute inset-0 bg-foreground/25"
                aria-label="Dismiss weather"
                onClick={() => setOpen(false)}
              />
              <div
                ref={panelRef}
                id={panelId}
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                tabIndex={-1}
                className="absolute inset-2 z-10 flex min-h-0 flex-col overflow-hidden rounded-xl border-2 border-primary/40 bg-card shadow-xl outline-none"
              >
                <div className="flex shrink-0 items-center justify-between gap-3 border-b border-primary/20 bg-primary/5 px-4 py-3">
                  <div className="min-w-0">
                    <p
                      id={titleId}
                      className="text-base font-semibold text-primary"
                    >
                      Weather
                    </p>
                    <p className="text-xs text-muted">
                      Current conditions and outlook
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    data-weather-close
                    className="shrink-0 text-primary hover:bg-primary/10"
                    aria-label="Close weather"
                    onClick={() => setOpen(false)}
                  >
                    <X className="size-5" aria-hidden />
                  </Button>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
                  <WeatherPanel state={state} onRetry={onRetry} />
                </div>
              </div>
            </div>,
            container,
          )
        : null}
    </>
  );
}