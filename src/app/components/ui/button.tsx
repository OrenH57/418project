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
          "inline-flex cursor-pointer items-center justify-center rounded-xl text-center font-medium transition-all duration-150",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-gold)] focus-visible:ring-offset-2",
          "hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98]",
          "disabled:pointer-events-none disabled:opacity-50",
          variant === "default" &&
            "border border-[var(--brand-maroon)] bg-[var(--brand-maroon)] px-4 py-2 text-white shadow-[0_8px_18px_rgba(114,23,43,0.18)] hover:bg-[var(--brand-maroon-deep)] hover:shadow-[0_12px_24px_rgba(114,23,43,0.24)] active:shadow-sm",
          variant === "secondary" &&
            "border border-[#e7cf93] bg-[var(--gold-soft)] px-4 py-2 text-[var(--ink)] shadow-[0_4px_10px_rgba(231,207,147,0.16)] hover:bg-[#f5e6bb] hover:shadow-[0_8px_14px_rgba(231,207,147,0.22)]",
          variant === "ghost" && "px-3 py-2 text-[var(--ink)] hover:bg-[#f4eadc]",
          variant === "outline" &&
            "border border-[var(--border-strong,var(--border))] bg-white px-4 py-2 text-[var(--ink)] hover:border-[var(--brand-accent)] hover:bg-[var(--surface-tint)]",
          variant === "link" && "px-0 py-0 text-[var(--brand-maroon)] hover:text-[var(--brand-maroon-deep)] hover:underline hover:shadow-none",
          size === "sm" && "min-h-10 px-4 text-sm",
          size === "default" && "min-h-11 px-5 text-sm",
          size === "lg" && "min-h-13 px-6 text-base",
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
