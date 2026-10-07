import type { RowStatus } from "@vineyard/shared";
import { Archive, Pause, RefreshCw, Sprout, type LucideIcon } from "lucide-react";

/**
 * Single source of truth for row status badges. Blue/neutral only:
 * green/yellow/orange/red are reserved for vineyard health. Each state is
 * distinguishable by its text label and icon, not color alone.
 * Contrast (text on fill) is ≥ 4.5:1 for every entry.
 */
export type RowStatusStyle = {
  label: string;
  /** Badge variant from components/ui/badge. */
  variant: "default" | "muted" | "outline";
  /** Extra classes layered on the variant. */
  className?: string;
  Icon: LucideIcon;
};

export const ROW_STATUS_STYLES: Record<RowStatus, RowStatusStyle> = {
  // #215a96 on the primary/10 tint over white: 6.07:1
  active: { label: "Active", variant: "default", Icon: Sprout },
  // #5a6573 on white, neutral border: 5.93:1
  fallow: { label: "Fallow", variant: "outline", Icon: Pause },
  // #215a96 on white, primary border: 7.08:1
  replanting: {
    label: "Replanting",
    variant: "outline",
    className: "border-primary/50 text-primary",
    Icon: RefreshCw,
  },
  // #5a6573 on #eef2f6: 5.27:1
  retired: { label: "Retired", variant: "muted", Icon: Archive },
};

const FALLBACK: RowStatusStyle = { label: "", variant: "outline", Icon: Pause };

export function rowStatusStyle(status: RowStatus | string): RowStatusStyle {
  const style = ROW_STATUS_STYLES[status as RowStatus];
  if (style) return style;
  // Unknown future status: neutral outline with its raw text.
  const text = String(status).replaceAll("_", " ");
  return { ...FALLBACK, label: text.charAt(0).toUpperCase() + text.slice(1) };
}
