import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";

export function EmptyState({
  title,
  children,
  action,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <Card className="flex flex-col items-start gap-4">
      <div>
        <h2 className="text-lg font-semibold">{title}</h2>
        <div className="mt-1 max-w-xl text-muted">{children}</div>
      </div>
      {action}
    </Card>
  );
}
