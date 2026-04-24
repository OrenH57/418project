import { useEffect, useState } from "react";
import { cn } from "../../lib/cn";

type ToastRecord = {
  id: number;
  message: string;
  type: "success" | "error";
};

const TOAST_EVENT = "app-toast";

function emitToast(type: ToastRecord["type"], message: string) {
  window.dispatchEvent(
    new CustomEvent(TOAST_EVENT, {
      detail: { id: Date.now() + Math.random(), message, type },
    }),
  );
}

export const toast = {
  success(message: string) {
    emitToast("success", message);
  },
  error(message: string) {
    emitToast("error", message);
  },
};

export function Toaster() {
  const [toasts, setToasts] = useState<ToastRecord[]>([]);

  useEffect(() => {
    const listener = (event: Event) => {
      const customEvent = event as CustomEvent<ToastRecord>;
      const detail = customEvent.detail;
      setToasts((current) => [...current, detail]);

      window.setTimeout(() => {
        setToasts((current) => current.filter((toastItem) => toastItem.id !== detail.id));
      }, 2500);
    };

    window.addEventListener(TOAST_EVENT, listener);
    return () => window.removeEventListener(TOAST_EVENT, listener);
  }, []);

  return (
    <div className="pointer-events-none fixed top-4 right-4 z-[100] flex w-full max-w-sm flex-col gap-3">
      {toasts.map((toastItem) => (
        <div
          key={toastItem.id}
          className={cn(
            "pointer-events-auto rounded-2xl border px-4 py-3 text-sm shadow-lg",
            toastItem.type === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-rose-200 bg-rose-50 text-rose-800",
          )}
        >
          {toastItem.message}
        </div>
      ))}
    </div>
  );
}
