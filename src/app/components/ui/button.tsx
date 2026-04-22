import { forwardRef } from "react";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "../../lib/cn";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "ghost" | "outline" | "link" | "secondary";
  size?: "default" | "sm" | "lg";
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "default", type = "button", ...props }, ref) => {
    return (
      <button
        className={cn(
          "inline-flex items-center justify-center rounded-xl text-center font-medium transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-gold)]",
          "disabled:pointer-events-none disabled:opacity-50",
          variant === "default" &&
            "bg-[var(--brand-maroon)] px-4 py-2 text-white hover:bg-[var(--brand-maroon-deep)]",
          variant === "secondary" &&
            "bg-[var(--gold-soft)] px-4 py-2 text-[var(--ink)] hover:bg-[#f5e6bb]",
          variant === "ghost" && "px-3 py-2 text-[var(--ink)] hover:bg-[#f4eadc]",
          variant === "outline" &&
            "border border-[var(--border)] bg-white px-4 py-2 text-[var(--ink)] hover:bg-[var(--surface-tint)]",
          variant === "link" && "px-0 py-0 text-[var(--brand-maroon)] hover:text-[var(--brand-maroon-deep)]",
          size === "sm" && "h-9 text-sm",
          size === "default" && "h-10 text-sm",
          size === "lg" && "h-12 px-5 text-base",
          className,
        )}
        ref={ref}
        type={type}
        {...props}
      />
    );
  },
);

Button.displayName = "Button";
