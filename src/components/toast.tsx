"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

type Kind = "success" | "error";
interface ToastItem { id: number; kind: Kind; message: string }
type Push = (kind: Kind, message: string) => void;

const ToastContext = createContext<Push>(() => {});
export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const push = useCallback<Push>((kind, message) => {
    const id = Date.now() + Math.random();
    setItems((cur) => [...cur.slice(-3), { id, kind, message }]);
    setTimeout(() => setItems((cur) => cur.filter((t) => t.id !== id)), kind === "error" ? 9000 : 5000);
  }, []);

  const value = useMemo(() => push, [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed right-4 top-4 z-50 flex w-[22rem] max-w-[calc(100vw-2rem)] flex-col gap-2">
        {items.map((t) => (
          <div
            key={t.id}
            role={t.kind === "error" ? "alert" : "status"}
            className={`pointer-events-auto flex items-start gap-3 rounded-lg border px-4 py-3 text-sm shadow-lg ${
              t.kind === "error"
                ? "border-red-200 bg-red-50 text-red-900"
                : "border-emerald-200 bg-emerald-50 text-emerald-900"
            }`}
          >
            <span className="mt-0.5 font-bold">{t.kind === "error" ? "!" : "✓"}</span>
            <p className="flex-1 leading-snug">{t.message}</p>
            <button
              type="button"
              aria-label="Dismiss"
              className="text-current/60 hover:text-current"
              onClick={() => setItems((cur) => cur.filter((x) => x.id !== t.id))}
            >
              &times;
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
