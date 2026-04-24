import type { HTMLAttributes, ImgHTMLAttributes } from "react";
import { cn } from "../../lib/cn";

export function Avatar({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "relative flex h-10 w-10 shrink-0 overflow-hidden rounded-full bg-[var(--gold-soft)]",
        className,
      )}
      {...props}
    />
  );
}

export function AvatarImage({ className, alt = "", ...props }: ImgHTMLAttributes<HTMLImageElement>) {
  return <img alt={alt} className={cn("h-full w-full object-cover", className)} {...props} />;
}

export function AvatarFallback({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "absolute inset-0 flex items-center justify-center text-sm font-semibold text-[var(--brand-maroon)]",
        className,
      )}
      {...props}
    />
  );
}
