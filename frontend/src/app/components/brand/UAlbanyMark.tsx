import { cn } from "../../lib/cn";

type UAlbanyMarkProps = {
  className?: string;
  compact?: boolean;
};

export function UAlbanyMark({ className, compact = false }: UAlbanyMarkProps) {
  return (
    <div
      aria-label="UAlbany CampusConnect"
      className={cn(
        "relative flex shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[var(--brand-maroon)] text-white shadow-sm ring-1 ring-black/5",
        compact ? "h-11 w-11" : "h-14 w-14",
        className,
      )}
    >
      <div className="absolute top-2 right-2 h-2 w-2 rounded-full bg-[var(--brand-gold)]" />
      <span className={cn("relative block font-black tracking-[-0.06em]", compact ? "text-2xl" : "text-3xl")}>U</span>
    </div>
  );
}
