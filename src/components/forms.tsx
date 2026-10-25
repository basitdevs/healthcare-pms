"use client";

import {
  createContext, startTransition, useActionState, useContext, useRef,
  type FormEvent, type ReactNode,
} from "react";
import type { FormAction } from "@/lib/action-types";
import { useToast } from "./toast";

const PendingContext = createContext(false);

const buttonStyles = {
  primary: "bg-teal-700 text-white hover:bg-teal-800 focus-visible:ring-teal-600/40",
  secondary: "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 focus-visible:ring-slate-400/40",
  danger: "border border-red-200 bg-white text-red-700 hover:bg-red-50 focus-visible:ring-red-400/40",
  success: "bg-emerald-600 text-white hover:bg-emerald-700 focus-visible:ring-emerald-500/40",
  warning: "bg-amber-500 text-white hover:bg-amber-600 focus-visible:ring-amber-400/40",
} as const;

export function SubmitButton({
  label, pendingLabel = "Working...", variant = "primary", name, value, confirm, small = false, disabled = false,
}: {
  label: string; pendingLabel?: string; variant?: keyof typeof buttonStyles;
  name?: string; value?: string; confirm?: string; small?: boolean; disabled?: boolean;
}) {
  const pending = useContext(PendingContext);
  return (
    <button
      type="submit"
      name={name}
      value={value}
      disabled={pending || disabled}
      onClick={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
      className={`inline-flex items-center justify-center rounded-lg font-medium shadow-sm outline-none transition focus-visible:ring-4 disabled:cursor-not-allowed disabled:opacity-50 ${
        small ? "px-2.5 py-1 text-xs" : "px-4 py-2 text-sm"
      } ${buttonStyles[variant]}`}
    >
      {pending ? pendingLabel : label}
    </button>
  );
}

export function ActionForm({
  action, children, className, resetOnSuccess = false, inlineError = true,
}: {
  action: FormAction; children: ReactNode; className?: string; resetOnSuccess?: boolean; inlineError?: boolean;
}) {
  const toast = useToast();
  const ref = useRef<HTMLFormElement>(null);

  // Toast when the action resolves (not from an effect): after a successful action the page
  // re-renders and this form may already be gone (approved CR card, deleted row, ...).
  const wrapped: FormAction = async (prev, fd) => {
    const res = await action(prev, fd);
    toast(res.ok ? "success" : "error", res.message);
    if (res.ok && resetOnSuccess) ref.current?.reset();
    return res;
  };
  const [state, formAction, pending] = useActionState(wrapped, null);

  // Submit manually so React does not auto-reset the fields when validation fails.
  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLElement | null;
    const fd = new FormData(e.currentTarget, submitter);
    startTransition(() => formAction(fd));
  };

  return (
    <PendingContext.Provider value={pending}>
      <form ref={ref} onSubmit={onSubmit} className={className}>
        {children}
        {inlineError && state && !state.ok && (
          <p role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {state.message}
          </p>
        )}
      </form>
    </PendingContext.Provider>
  );
}

/** One-button form for table rows (approve, delete, mark achieved...). */
export function RowAction({
  action, fields, label, variant = "secondary", confirm, pendingLabel,
}: {
  action: FormAction; fields: Record<string, string | number>; label: string;
  variant?: keyof typeof buttonStyles; confirm?: string; pendingLabel?: string;
}) {
  return (
    <ActionForm action={action} className="inline-block" inlineError={false}>
      {Object.entries(fields).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={String(v)} />
      ))}
      <SubmitButton label={label} variant={variant} confirm={confirm} small pendingLabel={pendingLabel} />
    </ActionForm>
  );
}
