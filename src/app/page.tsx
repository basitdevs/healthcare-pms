import Link from "next/link";
import { AlertList } from "@/components/AlertList";
import { RowAction } from "@/components/forms";
import { Badge, Card, NoProject, PageHeader, Stat, StatusBadge, tdCls, thCls } from "@/components/ui";
import { fmtMoney, fmtPct, fmtRatio, lightOf } from "@/lib/evm";
import { daysBetween, fmtDate, num, pkr, signedPkr } from "@/lib/format";
import { fmtRate } from "@/lib/quality";
import { getDashboard, getProject } from "@/lib/queries";
import { resetDemo } from "./actions/demo";

const ragCls = { GREEN: "border-emerald-300 bg-emerald-50 text-emerald-900", AMBER: "border-amber-300 bg-amber-50 text-amber-900", RED: "border-red-300 bg-red-50 text-red-900" } as const;
const ragDot = { GREEN: "bg-emerald-500", AMBER: "bg-amber-500", RED: "bg-red-600" } as const;

function Bar({ label, value, cls }: { label: string; value: number | null; cls: string }) {
  return (
    <div className="grid grid-cols-[9rem_1fr_4rem] items-center gap-3 text-sm">
      <span className="text-slate-600">{label}</span>
      <div className="h-3 overflow-hidden rounded-full bg-slate-100"><div className={`h-full ${cls}`} style={{ width: `${Math.min(100, (value ?? 0) * 100)}%` }} /></div>
      <span className="text-right font-semibold text-slate-900">{fmtPct(value)}</span>
    </div>
  );
}

export default function HomePage() {
  const p = getProject();
  const d = p && getDashboard(p.id);
  if (!p || !d) return <NoProject />;
  const a = d.evm.analysis, s = d.sched.analysis, q = d.quality, th = d.evm.thresholds;
  const margin = s.marginDays;
  const fmt = (v: number | string, label: string) => (typeof v === "string" ? fmtDate(v) : label.startsWith("Budget") ? num(v) : String(v));

  return (
    <>
      <PageHeader title="Dashboard" subtitle={`All modules at a glance, as of the status date ${fmtDate(p.status_date)}.`}>
        <Link href="/report" className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50">Full report</Link>
      </PageHeader>

      <div className={`mb-6 flex flex-wrap items-center gap-4 rounded-xl border px-5 py-4 ${ragCls[d.health.rag]}`}>
        <span className={`h-10 w-10 shrink-0 rounded-full ${ragDot[d.health.rag]}`} aria-hidden />
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide opacity-70">Overall health</p>
          <p className="text-2xl font-bold">{d.health.rag}</p>
        </div>
        <ul className="ml-auto list-disc pl-5 text-sm">{d.health.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
      </div>

      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <Card title="Progress" description="Earned (EV/BAC) vs planned (PV/BAC) share of the baseline">
          <div className="space-y-3">
            <Bar label="Earned (EV / BAC)" value={d.progress.ev} cls="bg-teal-600" />
            <Bar label="Planned (PV / BAC)" value={d.progress.pv} cls="bg-slate-400" />
            <Bar label="Spent (AC / BAC)" value={a.forecast.pctSpent} cls={(a.forecast.pctSpent ?? 0) > (d.progress.ev ?? 0) ? "bg-red-500" : "bg-sky-500"} />
          </div>
        </Card>
        <Card title="Baseline vs current" description="Effect of approved change requests on scope, schedule and budget" padded={false}>
          <table className="w-full">
            <thead className="bg-slate-50"><tr><th className={thCls}>Item</th><th className={thCls}>Baseline</th><th className={thCls}>Current</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {d.baseline.map((r) => (
                <tr key={r.label} className={r.changed ? "bg-amber-50/60" : undefined}>
                  <td className={tdCls}>{r.label}</td>
                  <td className={tdCls}>{fmt(r.baseline, r.label)}</td>
                  <td className={`${tdCls} ${r.changed ? "font-semibold text-amber-800" : ""}`}>{fmt(r.current, r.label)}{r.changed && " ▲"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Projected finish" value={fmtDate(s.projectedFinish)} tone={margin !== null && margin < 0 ? "red" : s.slipDays > 0 ? "amber" : "green"}
          sub={<>Deadline {fmtDate(p.deadline)} · {margin === null ? "-" : margin < 0 ? <strong className="text-red-700">misses by {-margin} days</strong> : `${margin} days margin`}</>} />
        <Stat label="Delayed activities" value={s.delayed.length + s.impacted.length} tone={s.delayed.length ? "red" : "green"}
          sub={`${s.delayed.length} own progress (${s.delayed.map((x) => x.task.code).join(", ") || "-"}) · ${s.impacted.length} impacted`} />
        <Stat label="Pending change requests" value={d.pending.length} tone={d.pending.length ? "amber" : "green"}
          sub={d.pending.length ? `${signedPkr(d.pending.reduce((x, c) => x + c.cost_impact, 0))}, +${d.pending.reduce((x, c) => x + c.schedule_impact_days, 0)} days (${d.pending.map((c) => c.code).join(", ")})` : "None waiting"} />
        <Stat label="Unresolved critical defects" value={q.counts.unresolvedCritical} tone={q.counts.unresolvedCritical ? "red" : "green"}
          sub={`${q.counts.unresolved} unresolved in total · checklist pass rate ${fmtRate(q.checklist.rate)}`} />
      </div>

      <div className="mb-6 grid gap-6 lg:grid-cols-3">
        <Card title="Budget status" className="lg:col-span-2">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
            {[
              ["Approved budget", pkr(a.forecast.approvedBudget)], ["BAC (allocated)", pkr(a.forecast.bac)], ["AC (actual cost)", pkr(a.project.ac)],
              ["EAC (forecast)", fmtMoney(a.forecast.eac)],
            ].map(([k, v]) => <div key={k}><dt className="text-xs text-slate-500">{k}</dt><dd className="text-lg font-semibold text-slate-900">{v}</dd></div>)}
            <div><dt className="text-xs text-slate-500">CPI</dt><dd className={`text-lg font-semibold ${lightOf(a.project.cpi, th) === "green" ? "text-emerald-700" : lightOf(a.project.cpi, th) === "red" ? "text-red-700" : "text-amber-700"}`}>{fmtRatio(a.project.cpi)}</dd></div>
            <div><dt className="text-xs text-slate-500">SPI</dt><dd className={`text-lg font-semibold ${lightOf(a.project.spi, th) === "green" ? "text-emerald-700" : lightOf(a.project.spi, th) === "red" ? "text-red-700" : "text-amber-700"}`}>{fmtRatio(a.project.spi)}</dd></div>
          </dl>
        </Card>
        <Card title="Top risks">
          <ul className="space-y-2 text-sm">
            {q.risks.slice(0, 3).map((r) => (
              <li key={r.id} className="flex items-start gap-2">
                <span className="w-6 text-xs font-semibold text-slate-500">#{r.rank}</span>
                <Badge tone={r.rating === "Critical" ? "red" : r.rating === "High" ? "amber" : "slate"}>{r.score}</Badge>
                <span><span className="font-mono text-slate-500">{r.code}</span> {r.title}</span>
              </li>
            ))}
            {q.risks.length === 0 && <li className="text-slate-500">No active risks.</li>}
          </ul>
        </Card>
      </div>

      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <Card title="Next milestones" padded={false}>
          <table className="w-full">
            <thead className="bg-slate-50"><tr><th className={thCls}>Milestone</th><th className={thCls}>Target</th><th className={thCls}>Forecast</th><th className={thCls}>Status</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {d.milestones.length === 0 && <tr><td colSpan={4} className={tdCls}>No upcoming milestones.</td></tr>}
              {d.milestones.map((m) => (
                <tr key={m.id}>
                  <td className={tdCls}>{m.name}</td><td className={tdCls}>{fmtDate(m.target_date)}</td>
                  <td className={`${tdCls} ${m.forecast_date && m.forecast_date > m.target_date ? "font-semibold text-red-700" : ""}`}>
                    {fmtDate(m.forecast_date)}{m.forecast_date && m.forecast_date > m.target_date ? ` (+${daysBetween(m.target_date, m.forecast_date)} d)` : ""}
                  </td>
                  <td className={tdCls}><StatusBadge value={m.display_status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        <Card title={`Active alerts (${a.alerts.length})`} description="Critical first">
          {a.alerts.length ? <AlertList alerts={a.alerts} limit={6} /> : <p className="text-sm text-emerald-700">No active alerts.</p>}
        </Card>
      </div>
      <div className="mt-6">
        <RowAction action={resetDemo} fields={{}} label="Reset demo data" variant="danger" pendingLabel="Resetting..."
          confirm="Reset the database to the original sample data? Any changes you made will be lost." />
      </div>
    </>
  );
}
