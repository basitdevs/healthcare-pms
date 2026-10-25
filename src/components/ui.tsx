import Link from "next/link";
import type { ReactNode } from "react";

export const inputCls =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20 disabled:bg-slate-100 disabled:text-slate-500";
export const labelCls = "mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500";
export const thCls = "px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500";
export const tdCls = "px-4 py-3 align-top text-sm text-slate-700";

export function Field({ label, hint, children, className = "" }: { label: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className={labelCls}>{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </label>
  );
}

export function PageHeader({ title, subtitle, children }: { title: string; subtitle?: string; children?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{title}</h1>
        {subtitle && <p className="mt-1 max-w-3xl text-sm text-slate-600">{subtitle}</p>}
      </div>
      {children && <div className="flex items-center gap-2">{children}</div>}
    </div>
  );
}

export function Card({
  title, description, actions, children, className = "", padded = true,
}: { title?: string; description?: string; actions?: ReactNode; children: ReactNode; className?: string; padded?: boolean }) {
  return (
    <section className={`rounded-xl border border-slate-200 bg-white shadow-sm ${className}`}>
      {(title || actions) && (
        <header className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-3.5">
          <div>
            {title && <h2 className="text-sm font-semibold text-slate-900">{title}</h2>}
            {description && <p className="mt-0.5 text-xs text-slate-500">{description}</p>}
          </div>
          {actions}
        </header>
      )}
      <div className={padded ? "p-5" : ""}>{children}</div>
    </section>
  );
}

export type Tone = "slate" | "teal" | "green" | "amber" | "red" | "blue" | "violet";
const tones: Record<Tone, string> = {
  slate: "bg-slate-100 text-slate-700 ring-slate-200",
  teal: "bg-teal-50 text-teal-800 ring-teal-200",
  green: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  amber: "bg-amber-50 text-amber-800 ring-amber-200",
  red: "bg-red-50 text-red-800 ring-red-200",
  blue: "bg-sky-50 text-sky-800 ring-sky-200",
  violet: "bg-violet-50 text-violet-800 ring-violet-200",
};

export function Badge({ tone = "slate", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${tones[tone]}`}>
      {children}
    </span>
  );
}

export function toneFor(value: string): Tone {
  switch (value) {
    case "Approved": case "Achieved": case "Completed": case "Green": case "Done": case "Pass": case "Closed": case "Resolved":
      return "green";
    case "Rejected": case "Missed": case "Red": case "Fail": case "Critical":
      return "red";
    case "Pending": case "Proposed": case "At Risk": case "Amber": case "In Progress": case "Major": case "Planned":
      return "amber";
    case "Deferred":
      return "violet";
    case "High":
      return "blue";
    default:
      return "slate";
  }
}

export function StatusBadge({ value }: { value: string }) {
  return <Badge tone={toneFor(value)}>{value}</Badge>;
}

export function Stat({ label, value, sub, tone = "slate" }: { label: string; value: ReactNode; sub?: ReactNode; tone?: Tone }) {
  const bar: Record<Tone, string> = {
    slate: "bg-slate-300", teal: "bg-teal-600", green: "bg-emerald-500", amber: "bg-amber-500",
    red: "bg-red-500", blue: "bg-sky-500", violet: "bg-violet-500",
  };
  return (
    <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <span className={`absolute inset-y-0 left-0 w-1 ${bar[tone]}`} />
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1.5 text-2xl font-semibold tracking-tight text-slate-900">{value}</p>
      {sub && <div className="mt-1 text-xs text-slate-500">{sub}</div>}
    </div>
  );
}

export function EmptyRow({ cols, children }: { cols: number; children: ReactNode }) {
  return (
    <tr>
      <td colSpan={cols} className="px-4 py-8 text-center text-sm text-slate-500">{children}</td>
    </tr>
  );
}

export function NoProject() {
  return (
    <Card title="No project yet">
      <p className="text-sm text-slate-600">There is no project in the database. Create the project charter first.</p>
      <Link href="/charter" className="mt-4 inline-flex rounded-lg bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800">
        Create the project charter
      </Link>
    </Card>
  );
}
