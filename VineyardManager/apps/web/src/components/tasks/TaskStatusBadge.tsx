import type { TaskStatus } from "@vineyard/shared";
import { Badge } from "@/components/ui/badge";
import { taskStatusStyle } from "@/lib/taskStatus";
import { cn } from "@/lib/utils";

/** Task status pill (blue/neutral; never health colors). See lib/taskStatus.ts. */
export function TaskStatusBadge({
  status,
  className,
}: {
  status: TaskStatus | string;
  className?: string;
}) {
  const { label, variant, className: styleClass, Icon } = taskStatusStyle(status);
  return (
    <Badge variant={variant} className={cn("gap-1", styleClass, className)}>
      <Icon className="size-3.5 shrink-0" aria-hidden />
      {label}
    </Badge>
  );
}
