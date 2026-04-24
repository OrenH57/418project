import { Children, createContext, isValidElement, useContext, useMemo } from "react";
import type { ReactElement, ReactNode, SelectHTMLAttributes } from "react";
import { cn } from "../../lib/cn";

type SelectContextValue = {
  value: string;
  onValueChange: (value: string) => void;
  items: Array<{ value: string; label: string }>;
  placeholder: string;
};

const SelectContext = createContext<SelectContextValue | null>(null);

type SelectProps = {
  children: ReactNode;
  value: string;
  onValueChange: (value: string) => void;
};

type SelectItemElementProps = {
  value: string;
  children: ReactNode;
};

function extractItems(children: ReactNode): Array<{ value: string; label: string }> {
  const items: Array<{ value: string; label: string }> = [];

  Children.forEach(children, (child) => {
    if (!isValidElement(child)) return;
    const element = child as ReactElement<{ children?: ReactNode }>;

    if (child.type === SelectContent) {
      items.push(...extractItems(element.props.children));
      return;
    }

    if (child.type === SelectItem) {
      const itemProps = element.props as SelectItemElementProps;
      const label =
        typeof itemProps.children === "string" ? itemProps.children : itemProps.value;
      items.push({ value: itemProps.value, label });
      return;
    }

    if ("children" in element.props) {
      items.push(...extractItems(element.props.children));
    }
  });

  return items;
}

function findPlaceholder(children: ReactNode): string {
  let placeholder = "";

  Children.forEach(children, (child) => {
    if (!isValidElement(child)) return;
    const element = child as ReactElement<{ children?: ReactNode; placeholder?: string }>;

    if (child.type === SelectValue) {
      placeholder = element.props.placeholder ?? "";
      return;
    }

    if ("children" in element.props && !placeholder) {
      placeholder = findPlaceholder(element.props.children);
    }
  });

  return placeholder;
}

export function Select({ children, value, onValueChange }: SelectProps) {
  const items = extractItems(children);
  const placeholder = findPlaceholder(children);
  const context = useMemo(
    () => ({ value, onValueChange, items, placeholder }),
    [items, onValueChange, placeholder, value],
  );
  return <SelectContext.Provider value={context}>{children}</SelectContext.Provider>;
}

type SelectTriggerProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, "value" | "onChange"> & {
  children: ReactNode;
};

export function SelectTrigger({ children, className, ...props }: SelectTriggerProps) {
  const context = useContext(SelectContext);
  if (!context) throw new Error("SelectTrigger must be used inside Select");

  return (
    <select
      className={cn(
        "flex h-10 w-full rounded-xl border border-[var(--border)] bg-white px-3 py-2 text-sm text-[var(--ink)]",
        "focus:border-[var(--brand-gold)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-gold)]/20",
        className,
      )}
      value={context.value}
      onChange={(event) => context.onValueChange(event.target.value)}
      {...props}
    >
      {context.placeholder ? (
        <option value="" disabled>
          {context.placeholder}
        </option>
      ) : null}
      {context.items.map((item) => (
        <option key={item.value} value={item.value}>
          {item.label}
        </option>
      ))}
    </select>
  );
}

export function SelectValue(_: { placeholder?: string }) {
  return null;
}

export function SelectContent({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

export function SelectItem(_: SelectItemElementProps) {
  return null;
}
