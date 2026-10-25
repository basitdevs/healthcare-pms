import Link from "next/link";
import { DeadlineBanner } from "@/components/DeadlineBanner";
import { Gantt } from "@/components/Gantt";
import { Badge, Card, EmptyRow, NoProject, PageHeader, Stat, tdCls, thCls } from "@/components/ui";
import { daysBetween, fmtDate } from "@/lib/format";
import { getProject, getSchedule } from "@/lib/queries";

const linkCls = "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50";

export default function SchedulePage() {
  const p = getProject();
  const s = p && getSchedule(p.id);
  if (!p || !s) return <NoProject />;
  const a = s.analysis;
  const code = new Map(s.tasks.map((t) => [t.id, t.code]));
  const criticalChain = s.tasks.filter((t) => a.critical.has(t.id)).sort((x, y) => a.forecast.get(x.id)!.forecast_start.localeCompare(a.forecast.get(y.id)!.forecast_start));
  const remaining = a.projectedFinish ? Math.max(0, daysBetween(p.status_date, a.projectedFinish)) : 0;

  return (
    <>
      <PageHeader title="Schedule & Gantt" subtitle={`Forecast as of the status date ${fmtDate(p.status_date)}. Delays are propagated through finish-to-start dependencies to the projected finish.`}>
        <Link href="/schedule/activities" className={linkCls}>Activities</Link>
      </PageHeader>

      <div className="mb-6">
        <DeadlineBanner projectedFinish={a.projectedFinish} deadline={p.deadline} marginDays={a.marginDays} />
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <Stat label="Projected finish" value={fmtDate(a.projectedFinish)} tone={a.slipDays > 0 ? "amber" : "green"}
          sub={<>Planned {fmtDate(a.plannedFinish)}{a.slipDays ? <> &middot; <strong>{a.slipDays > 0 ? "+" : ""}{a.slipDays} days</strong> slip</> : null}</>} />
        <Stat label="Margin vs deadline" value={a.marginDays === null ? "-" : `${a.marginDays} days`} tone={a.marginDays === null ? "slate" : a.marginDays < 0 ? "red" : a.marginDays <= 7 ? "amber" : "green"}
          sub={<>Deadline {fmtDate(p.deadline)}{p.deadline !== p.original_deadline ? ` (was ${fmtDate(p.original_deadline)})` : ""}</>} />
        <Stat label="Delayed activities" value={a.delayed.length} tone={a.delayed.length ? "red" : "green"}
          sub={a.delayed.length ? a.delayed.map((x) => `${x.task.code} +${x.f.delay_days}`).join(", ") : "None behind on their own progress"} />
        <Stat label="Impacted activities" value={a.impacted.length} tone={a.impacted.length ? "amber" : "green"} sub="Pushed later by a predecessor" />
        <Stat label="Critical path" value={`${criticalChain.length} ${criticalChain.length === 1 ? "activity" : "activities"}`} tone="amber"
          sub={`${remaining} days from status date to finish`} />
      </div>

      <Card title="Delay & impact analysis" description="Every late activity, why it is late, and which downstream activities it pushes (red = pushed by this activity's delay)." padded={false} className="mb-6">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[56rem]">
            <thead className="bg-slate-50"><tr>
              <th className={thCls}>Activity</th><th className={thCls}>Planned end</th><th className={thCls}>Forecast end</th>
              <th className={thCls}>Delay</th><th className={thCls}>Cause</th><th className={thCls}>Downstream activities affected</th>
            </tr></thead>
            <tbody className="divide-y divide-slate-100">
              {a.impact.length === 0 && <EmptyRow cols={6}>No activity is forecast to finish late.</EmptyRow>}
              {a.impact.map(({ task: t, f, downstream }) => (
                <tr key={t.id}>
                  <td className={tdCls}>
                    <p className="font-medium text-slate-900"><span className="font-mono text-slate-500">{t.code}</span> {t.name}</p>
                    <p className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500">
                      {t.status} {t.percent_complete}%
                      {a.critical.has(t.id) && <Badge tone="amber">Critical</Badge>}
                    </p>
                  </td>
                  <td className={tdCls}>{fmtDate(t.planned_end)}</td>
                  <td className={tdCls}>{fmtDate(f.forecast_end)}</td>
                  <td className={tdCls}><Badge tone="red">+{f.delay_days} d</Badge></td>
                  <td className={tdCls}>
                    <Badge tone={f.kind === "Delayed (own progress)" ? "red" : "amber"}>{f.kind}</Badge>
                    <p className="mt-1 text-xs text-slate-600">{f.cause}</p>
                  </td>
                  <td className={tdCls}>
                    {downstream.length === 0 ? <span className="text-xs text-slate-400">None (end of chain)</span> : (
                      <div className="flex max-w-sm flex-wrap gap-1">
                        {downstream.map((d) => (
                          <span key={d.id} className={`rounded px-1.5 py-0.5 font-mono text-[11px] ring-1 ring-inset ${d.pushedByThis ? "bg-red-50 text-red-800 ring-red-200" : "bg-slate-50 text-slate-500 ring-slate-200"}`}
                            title={d.pushedByThis ? `${d.code} is pushed ${d.days} days by this delay` : `${d.code} is downstream; its delay (${d.days} d) is driven by another path`}>
                            {d.code} +{d.days}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {a.completedLate.length > 0 && (
          <p className="border-t border-slate-100 px-5 py-3 text-xs text-slate-500">
            Completed late (history, not counted as delayed): {a.completedLate.map((x) => `${x.task.code} +${x.f.delay_days} d (finished ${fmtDate(x.f.forecast_end)})`).join(" · ")}
          </p>
        )}
      </Card>

      {(a.conflicts.length > 0 || a.overAllocations.length > 0) && (
        <Card title="Planning problems" className="mb-6 border-red-200">
          <ul className="space-y-1 text-sm text-red-800">
            {a.conflicts.map((c) => (
              <li key={`c${c.task_id}-${c.predecessor_id}`}>Dependency conflict: <strong>{c.task}</strong> starts {fmtDate(c.planned_start)} but must start on or after {fmtDate(c.required_start)} (after {c.predecessor}{c.lag_days ? ` +${c.lag_days} d lag` : ""}).</li>
            ))}
            {a.overAllocations.map((o) => (
              <li key={`o${o.a.id}-${o.b.id}`}>Over-allocation: <strong>{s.team.find((m) => m.id === o.assignee_id)?.name}</strong> is on {o.a.code} and {o.b.code} at the same time ({fmtDate(o.from)} – {fmtDate(o.to)}, {o.days} d).</li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-slate-500">Fix them in <Link href="/schedule/activities" className="text-teal-700 hover:underline">Activities</Link> (Recalculate) (Recalculate or reassign).</p>
        </Card>
      )}

      <Card title="Gantt chart" description={`Grouped by WBS deliverable. Critical path: ${criticalChain.map((t) => code.get(t.id)).join(" → ") || "-"}. Hover a bar for details.`} padded={false}>
        <Gantt s={s} />
      </Card>
    </>
  );
}
