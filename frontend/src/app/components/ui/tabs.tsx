import { createContext, useContext, useState } from "react";
import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";
import { cn } from "../../lib/cn";

type TabsContextValue = {
  value: string;
  setValue: (value: string) => void;
};

const TabsContext = createContext<TabsContextValue | null>(null);

export function Tabs({ defaultValue, children }: { defaultValue: string; children: ReactNode }) {
  const [value, setValue] = useState(defaultValue);
  return <TabsContext.Provider value={{ value, setValue }}>{children}</TabsContext.Provider>;
}

export function TabsList({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("inline-flex rounded-xl bg-[var(--surface-tint)] p-1", className)} {...props} />;
}

type TabsTriggerProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  value: string;
};

export function TabsTrigger({ className, value, ...props }: TabsTriggerProps) {
  const context = useContext(TabsContext);
  if (!context) throw new Error("TabsTrigger must be used inside Tabs");

  const active = context.value === value;

  return (
    <button
      className={cn(
        "rounded-lg px-3 py-2 text-sm font-medium transition-colors",
        active ? "bg-white text-[var(--ink)] shadow-sm" : "text-[var(--muted)] hover:text-[var(--ink)]",
        className,
      )}
      onClick={() => context.setValue(value)}
      type="button"
      {...props}
    />
  );
}

export function TabsContent({
  children,
  value,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & { value: string }) {
  const context = useContext(TabsContext);
  if (!context || context.value !== value) return null;

  return (
    <div className={cn(className)} {...props}>
      {children}
    </div>
  );
}
