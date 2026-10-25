import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/forms";
import { AlertList } from "@/components/AlertList";
import { SCurve } from "@/components/SCurve";
import { Badge, Card, EmptyRow, Field, NoProject, PageHeader, Stat, inputCls, tdCls, thCls } from "@/components/ui";
import { fmtMoney, fmtPct, fmtRatio, lightOf, type Metrics, type Thresholds } from "@/lib/evm";
import { fmtDate, num, pkr } from "@/lib/format";
import { getEvm, getProject } from "@/lib/queries";
import { setThresholds } from "../actions/cost";

const linkCls = "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50";
const signed = (v: number) => `${v > 0 ? "+" : v < 0 ? "-" : ""}${num(Math.abs(v))}`;
const ratioCls = { green: "text-emerald-700", amber: "text-amber-700 font-semibold", red: "text-red-700 font-semibold", slate: "text-slate-400" } as const;

function RollupTable({ title, rows, th }: { title: string; rows: (Metrics & { label: string; tasks: number })[]; th: Thresholds }) {
  return (
    <Card title={title} padded={false}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[40rem]">
          <thead className="bg-slate-50"><tr>
            <th className={thCls}>Group</th><th className={thCls}>BAC</th><th className={thCls}>PV</th><th className={thCls}>EV</th>
            <th className={thCls}>AC</th><th className={thCls}>CV</th><th className={thCls}>CPI</th><th className={thCls}>SPI</th>
          </tr></thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => (
              <tr key={r.label}>
                <td className={tdCls}><p className="font-medium text-slate-900">{r.label}</p><p className="text-xs text-slate-500">{r.tasks} activit{r.tasks === 1 ? "y" : "ies"}</p></td>
                <td className={tdCls}>{num(r.bac)}</td><td className={tdCls}>{num(r.pv)}</td><td className={tdCls}>{num(r.ev)}</td><td className={tdCls}>{num(r.ac)}</td>
                <td className={`${tdCls} ${r.cv < 0 ? "text-red-700" : ""}`}>{signed(r.cv)}</td>
                <td className={`${tdCls} ${ratioCls[lightOf(r.cpi, th)]}`}>{fmtRatio(r.cpi)}</td>
                <td className={`${tdCls} ${ratioCls[lightOf(r.spi, th)]}`}>{fmtRatio(r.spi)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

export default async function CostPage({ searchParams }: { searchParams: Promise<{ [k: string]: string | string[] | undefined }> }) {
  const p = getProject();
  const e = p && getEvm(p.id);
  if (!p || !e) return <NoProject />;
  const problemsOnly = (await searchParams).problems === "1";
  const { analysis: a, thresholds: th } = e;
  const m = a.project, f = a.forecast;
  const rows = problemsOnly ? a.rows.filter((r) => a.taskAlerts(r.task.id).length > 0) : a.rows;
  const critical = a.alerts.filter((x) => x.level === "critical").length;

  const panel: { label: string; value: string; note?: string; bad?: boolean }[] = [
    { label: "BAC (allocated to activities)", value: pkr(f.bac) },
    { label: "Approved budget", value: pkr(f.approvedBudget), note: f.approvedBudget !== p.original_budget ? `baseline ${pkr(p.original_budget)}` : undefined },
    { label: "Unallocated", value: pkr(f.unallocated), note: f.unallocated ? "add activities for the new scope" : undefined },
    { label: "EAC = BAC / CPI", value: fmtMoney(f.eac), bad: f.eac !== null && f.eac > f.approvedBudget, note: `EAC2 = AC + (BAC − EV) = ${pkr(f.eac2)}` },
    { label: "ETC = EAC − AC", value: fmtMoney(f.etc) },
    { label: "VAC = BAC − EAC", value: fmtMoney(f.vac), bad: (f.vac ?? 0) < 0, note: f.vacApproved !== null && f.approvedBudget !== f.bac ? `vs approved budget ${fmtMoney(f.vacApproved)}` : undefined },
    { label: "TCPI = (BAC − EV) / (BAC − AC)", value: fmtRatio(f.tcpi), bad: (f.tcpi ?? 0) > 1, note: f.tcpi !== null && f.tcpi > 1 ? "remaining work must be done more cheaply than planned" : undefined },
    { label: "% complete = EV / BAC", value: fmtPct(f.pctComplete) },
    { label: "% spent = AC / BAC", value: fmtPct(f.pctSpent), bad: (f.pctSpent ?? 0) > (f.pctComplete ?? 0) },
  ];

  return (
    <>
      <PageHeader title="Costs & earned value" subtitle={`Earned value analysis as of the status date ${fmtDate(p.status_date)}. PV uses the baseline planned dates; EV = estimate × % complete; AC = booked cost entries.`}>
        <Link href="/cost/estimates" className={linkCls}>Estimates</Link>
        <Link href="/cost/entries" className={linkCls}>Actual costs</Link>
      </PageHeader>

      {a.alerts.length > 0 ? (
        <div role="alert" className={`mb-6 rounded-xl border px-5 py-4 ${critical ? "border-red-300 bg-red-50" : "border-amber-300 bg-amber-50"}`}>
          <p className={`mb-2 text-sm font-semibold ${critical ? "text-red-800" : "text-amber-800"}`}>
            {a.alerts.length} active alert{a.alerts.length === 1 ? "" : "s"} ({critical} critical, {a.alerts.length - critical} warning)
          </p>
          <AlertList alerts={a.alerts.filter((x) => x.scope === "project")} limit={99} />
          {a.alerts.some((x) => x.scope === "task") && (
            <>
              <p className="mb-1.5 mt-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Activities</p>
              <AlertList alerts={a.alerts.filter((x) => x.scope === "task")} limit={5} />
            </>
          )}
        </div>
      ) : (
        <div className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm text-emerald-900"><strong>No alerts.</strong> Cost and schedule performance are within the thresholds.</div>
      )}

      <div className="mb-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Stat label="PV (planned value)" value={pkr(m.pv)} sub="Work scheduled to date" />
        <Stat label="EV (earned value)" value={pkr(m.ev)} sub="Budgeted cost of work done" tone="teal" />
        <Stat label="AC (actual cost)" value={pkr(m.ac)} sub={`${e.entries.length} cost entries`} tone={m.ac > m.ev ? "red" : "green"} />
        <Stat label="CV = EV − AC" value={signed(m.cv)} sub={m.cv < 0 ? "Over budget for work done" : "Under budget"} tone={m.cv < 0 ? "red" : "green"} />
        <Stat label="SV = EV − PV" value={signed(m.sv)} sub={m.sv < 0 ? "Behind schedule" : "On or ahead of schedule"} tone={m.sv < 0 ? "red" : "green"} />
      </div>

      <div className="mb-6 grid gap-4 lg:grid-cols-3">
        <div className="grid gap-4">
          <Stat label="CPI = EV / AC" value={fmtRatio(m.cpi)} tone={lightOf(m.cpi, th)}
            sub={m.cpi === null ? "No actual cost yet" : `PKR ${(1 / m.cpi).toFixed(2)} spent per PKR 1 of work · warning < ${th.warning}, critical < ${th.critical}`} />
          <Stat label="SPI = EV / PV" value={fmtRatio(m.spi)} tone={lightOf(m.spi, th)}
            sub={m.spi === null ? "No work planned yet" : `${(m.spi * 100).toFixed(1)}% of planned work done · warning < ${th.warning}, critical < ${th.critical}`} />
        </div>
        <Card title="Forecast" description="At-completion projections from current performance." className="lg:col-span-2">
          <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-3">
            {panel.map((x) => (
              <div key={x.label}>
                <dt className="text-xs text-slate-500">{x.label}</dt>
                <dd className={`text-lg font-semibold ${x.bad ? "text-red-700" : "text-slate-900"}`}>{x.value}</dd>
                {x.note && <dd className="text-xs text-slate-500">{x.note}</dd>}
              </div>
            ))}
          </dl>
        </Card>
      </div>

      <Card title="S-curve" description="Cumulative planned value, earned value and actual cost by week, from the project start to the current deadline. EV approximation: completed activities earn their estimate on their actual finish; in-progress activities earn linearly from actual start to the status date." className="mb-6">
        <SCurve e={e} />
      </Card>

      <Card title="Earned value by activity" padded={false} className="mb-6"
        actions={<Link href={problemsOnly ? "/cost" : "/cost?problems=1"} className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50">{problemsOnly ? "Show all activities" : "Problem activities only"}</Link>}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[60rem]">
            <thead className="bg-slate-50"><tr>
              <th className={thCls}>Activity</th><th className={thCls}>BAC</th><th className={thCls}>%</th><th className={thCls}>PV</th><th className={thCls}>EV</th>
              <th className={thCls}>AC</th><th className={thCls}>CV</th><th className={thCls}>SV</th><th className={thCls}>CPI</th><th className={thCls}>SPI</th><th className={thCls}>Alert</th>
            </tr></thead>
            <tbody className="divide-y divide-slate-100">
              {rows.length === 0 && <EmptyRow cols={11}>No problem activities.</EmptyRow>}
              {rows.map(({ task: t, m: r }) => {
                const al = a.taskAlerts(t.id);
                const lvl = al.some((x) => x.level === "critical") ? "critical" : al.length ? "warning" : null;
                return (
                  <tr key={t.id}>
                    <td className={tdCls}><p className="font-medium text-slate-900"><span className="font-mono text-slate-500">{t.code}</span> {t.name}</p><p className="text-xs text-slate-500">{t.status}</p></td>
                    <td className={tdCls}>{num(r.bac)}</td>
                    <td className={tdCls}>{t.percent_complete}%</td>
                    <td className={tdCls}>{num(r.pv)}</td>
                    <td className={tdCls}>{num(r.ev)}</td>
                    <td className={`${tdCls} ${t.ac > t.estimated_cost ? "font-semibold text-red-700" : ""}`}>{num(r.ac)}</td>
                    <td className={`${tdCls} ${r.cv < 0 ? "text-red-700" : ""}`}>{signed(r.cv)}</td>
                    <td className={`${tdCls} ${r.sv < 0 ? "text-red-700" : ""}`}>{signed(r.sv)}</td>
                    <td className={`${tdCls} ${ratioCls[lightOf(r.cpi, th)]}`}>{fmtRatio(r.cpi)}</td>
                    <td className={`${tdCls} ${ratioCls[lightOf(r.spi, th)]}`}>{fmtRatio(r.spi)}</td>
                    <td className={tdCls}>{lvl ? <span title={al.map((x) => x.message).join("\n")}><Badge tone={lvl === "critical" ? "red" : "amber"}>{lvl === "critical" ? "Critical" : "Warning"}{al.length > 1 ? ` ×${al.length}` : ""}</Badge></span> : <span className="text-xs text-slate-400">-</span>}</td>
                  </tr>
                );
              })}
              <tr className="bg-slate-50 font-semibold">
                <td className={tdCls}>Project total</td><td className={tdCls}>{num(m.bac)}</td><td className={tdCls}>{fmtPct(f.pctComplete)}</td>
                <td className={tdCls}>{num(m.pv)}</td><td className={tdCls}>{num(m.ev)}</td><td className={tdCls}>{num(m.ac)}</td>
                <td className={tdCls}>{signed(m.cv)}</td><td className={tdCls}>{signed(m.sv)}</td>
                <td className={`${tdCls} ${ratioCls[lightOf(m.cpi, th)]}`}>{fmtRatio(m.cpi)}</td><td className={`${tdCls} ${ratioCls[lightOf(m.spi, th)]}`}>{fmtRatio(m.spi)}</td><td className={tdCls}></td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="border-t border-slate-100 px-5 py-3 text-xs text-slate-500">
          Cost variance split: completed activities overran by {pkr(a.completedOverrun)}, unfinished activities by {pkr(a.inProgressOverrun)} (total {pkr(a.completedOverrun + a.inProgressOverrun)} = −CV).
        </p>
      </Card>

      <div className="mb-6 grid gap-6">
        <RollupTable title="By WBS deliverable" rows={e.byDeliverable} th={th} />
        <RollupTable title="By team member" rows={e.byMember} th={th} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Actual cost by category" padded={false}>
          <table className="w-full">
            <thead className="bg-slate-50"><tr><th className={thCls}>Category</th><th className={thCls}>Entries</th><th className={thCls}>AC (PKR)</th><th className={thCls}>Share</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {a.categories.map((c) => (
                <tr key={c.category}><td className={tdCls}>{c.category}</td><td className={tdCls}>{c.entries}</td><td className={tdCls}>{num(c.ac)}</td><td className={tdCls}>{fmtPct(c.share)}</td></tr>
              ))}
              <tr className="bg-slate-50 font-semibold"><td className={tdCls}>Total</td><td className={tdCls}>{e.entries.length}</td><td className={tdCls}>{num(m.ac)}</td><td className={tdCls}>100%</td></tr>
            </tbody>
          </table>
        </Card>
        <Card title="Alert thresholds" description="CPI or SPI below the warning value raises a warning; below the critical value raises a critical alert.">
          <ActionForm action={setThresholds} className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="project_id" value={p.id} />
            <Field label="Warning below" className="w-32"><input name="warning" type="number" step="0.01" min="0.01" max="1.5" defaultValue={th.warning} className={inputCls} required /></Field>
            <Field label="Critical below" className="w-32"><input name="critical" type="number" step="0.01" min="0.01" max="1.5" defaultValue={th.critical} className={inputCls} required /></Field>
            <SubmitButton label="Save thresholds" pendingLabel="Saving..." />
          </ActionForm>
          <p className="mt-3 text-xs text-slate-500">Rule: 0 &lt; critical ≤ warning ≤ 1.5.</p>
        </Card>
      </div>
    </>
  );
}
