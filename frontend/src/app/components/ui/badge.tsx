import type { HTMLAttributes } from "react";
import { cn } from "../../lib/cn";

type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  variant?: "default" | "secondary" | "outline";
};

export function Badge({ className, variant = "default", ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium",
        variant === "default" && "bg-[var(--brand-maroon)] text-white",
        variant === "secondary" && "bg-[var(--gold-soft)] text-[var(--ink)]",
        variant === "outline" && "border border-[var(--border)] bg-white text-[var(--ink)]",
        className,
      )}
      {...props}
    />
  );
}
