import type { RowStatus } from "@vineyard/shared";
import { Badge } from "@/components/ui/badge";
import { rowStatusStyle } from "@/lib/rowStatus";
import { cn } from "@/lib/utils";

/** Row status pill (blue/neutral; never health colors). See lib/rowStatus.ts. */
export function RowStatusBadge({
  status,
  className,
}: {
  status: RowStatus | string;
  className?: string;
}) {
  const { label, variant, className: styleClass, Icon } = rowStatusStyle(status);
  return (
    <Badge variant={variant} className={cn("gap-1", styleClass, className)}>
      <Icon className="size-3.5 shrink-0" aria-hidden />
      {label}
    </Badge>
  );
}
