import { cva, type VariantProps } from "class-variance-authority";
import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full px-2.5 py-0.5 text-sm font-medium",
  {
    variants: {
      variant: {
        default: "bg-primary/10 text-primary",
        muted: "bg-background text-muted",
        green: "bg-health-green/15 text-health-green",
        yellow: "bg-health-yellow/20 text-foreground",
        orange: "bg-health-orange/20 text-foreground",
        red: "bg-health-red/15 text-health-red",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export type BadgeProps = HTMLAttributes<HTMLSpanElement> &
  VariantProps<typeof badgeVariants>;

export function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}
