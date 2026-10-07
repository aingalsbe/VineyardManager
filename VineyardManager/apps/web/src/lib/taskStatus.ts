import { TASK_STATUS_LABELS, type TaskStatus } from "@vineyard/shared";
import {
  Ban,
  CheckCircle2,
  Clock,
  Send,
  type LucideIcon,
} from "lucide-react";

/**
 * Single source of truth for task status badges (same pattern as
 * lib/rowStatus.ts). Blue/neutral only: green/yellow/orange/red are reserved
 * for vineyard health. Each state differs by text + icon (and fill vs
 * outline), not color alone. Contrast (text on fill) is ≥ 4.5:1 for every entry.
 */
export type TaskStatusStyle = {
  label: string;
  /** Badge variant from components/ui/badge. */
  variant: "default" | "muted" | "outline";
  /** Extra classes layered on the variant. */
  className?: string;
  Icon: LucideIcon;
};

export const TASK_STATUS_STYLES: Record<TaskStatus, TaskStatusStyle> = {
  // Not started — #5a6573 on white, neutral border: 5.93:1
  pending: { label: TASK_STATUS_LABELS.pending, variant: "outline", Icon: Clock },
  // In progress — #215a96 on white, primary border: 7.08:1
  sent: {
    label: TASK_STATUS_LABELS.sent,
    variant: "outline",
    className: "border-primary/50 text-primary",
    Icon: Send,
  },
  // Complete — #215a96 on the primary/10 tint over white: 6.07:1
  acknowledged: {
    label: TASK_STATUS_LABELS.acknowledged,
    variant: "default",
    Icon: CheckCircle2,
  },
  // Dismissed — #5a6573 on #eef2f6: 5.27:1
  dismissed: { label: TASK_STATUS_LABELS.dismissed, variant: "muted", Icon: Ban },
};

const FALLBACK: TaskStatusStyle = { label: "", variant: "outline", Icon: Clock };

export function taskStatusStyle(status: TaskStatus | string): TaskStatusStyle {
  const style = TASK_STATUS_STYLES[status as TaskStatus];
  if (style) return style;
  // Unknown future status: neutral outline with its raw text.
  const text = String(status).replaceAll("_", " ");
  return { ...FALLBACK, label: text.charAt(0).toUpperCase() + text.slice(1) };
}
