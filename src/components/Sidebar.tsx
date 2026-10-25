"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface Item { href?: string; label: string; soon?: string; exact?: boolean }
interface Group { title: string; items: Item[] }

const groups: Group[] = [
  { title: "Dashboard", items: [{ href: "/", label: "Project dashboard" }] },
  { title: "1 · Initiation & Integration", items: [{ href: "/charter", label: "Project charter" }, { href: "/plan", label: "Management plan" }, { href: "/status", label: "Status, milestones & closure" }] },
  { title: "2 · Scope & WBS", items: [{ href: "/requirements", label: "Requirements" }, { href: "/wbs", label: "Work breakdown structure" }, { href: "/changes", label: "Change requests" }] },
  { title: "3 · Schedule & Resources", items: [{ href: "/schedule", label: "Schedule & Gantt", exact: true }, { href: "/schedule/activities", label: "Activities & team" }] },
  { title: "4 · Cost & EVM", items: [{ href: "/cost", label: "Earned value", exact: true }, { href: "/cost/estimates", label: "Cost estimates" }, { href: "/cost/entries", label: "Actual costs" }] },
  { title: "5 · Quality & Risk", items: [{ href: "/quality", label: "Defects", exact: true }, { href: "/quality/checklist", label: "Quality checklist" }, { href: "/risks", label: "Prioritization matrix", exact: true }, { href: "/risks/pdpc", label: "PDPC" }] },
  { title: "6 · Reporting", items: [{ href: "/report", label: "Project report" }] },
];

export function Sidebar({ code }: { code: string | null }) {
  const pathname = usePathname();
  return (
    <aside className="sticky top-0 hidden print:hidden h-screen w-64 shrink-0 flex-col overflow-y-auto bg-slate-900 px-3 py-5 text-slate-300 md:flex">
      <div className="mb-6 flex items-center gap-2.5 px-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-teal-600 text-lg font-bold text-white">+</span>
        <div className="leading-tight">
          <p className="text-sm font-semibold text-white">Healthcare PMS</p>
          <p className="text-xs text-slate-400">{code ?? "No project"}</p>
        </div>
      </div>
      <nav className="flex-1 space-y-5">
        {groups.map((g) => (
          <div key={g.title}>
            <p className="mb-1.5 px-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">{g.title}</p>
            <ul className="space-y-0.5">
              {g.items.map((it) => {
                const active = it.href && (it.href === "/" || it.exact ? pathname === it.href : pathname.startsWith(it.href));
                if (!it.href) {
                  return (
                    <li key={it.label} className="flex items-center justify-between rounded-lg px-2 py-1.5 text-sm text-slate-500">
                      <span>{it.label}</span>
                      <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-slate-400">{it.soon}</span>
                    </li>
                  );
                }
                return (
                  <li key={it.href}>
                    <Link
                      href={it.href}
                      className={`block rounded-lg px-2 py-1.5 text-sm transition ${
                        active ? "bg-teal-600/20 font-medium text-teal-200" : "hover:bg-slate-800 hover:text-white"
                      }`}
                    >
                      {it.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
      <p className="px-2 pt-4 text-[11px] text-slate-500">CSE-494 &middot; Software Project Management</p>
    </aside>
  );
}
