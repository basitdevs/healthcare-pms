import Link from "next/link";
import { ActionForm, RowAction, SubmitButton } from "@/components/forms";
import { DurationDates } from "@/components/schedule-inputs";
import { Badge, Card, EmptyRow, Field, NoProject, PageHeader, StatusBadge, inputCls, tdCls, thCls } from "@/components/ui";
import { fmtDate, num, pkr } from "@/lib/format";
import { getProject, getSchedule } from "@/lib/queries";
import type { Schedule } from "@/lib/schedule-data";
import {
  addDependency, addTask, deleteTask, recalculateSchedule, removeDependency, updateProgress, updateTask,
} from "../../actions/schedule";

type Task = Schedule["tasks"][number];
const linkCls = "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50";

function WpSelect({ s, value }: { s: Schedule; value?: number }) {
  return (
    <select name="wbs_item_id" defaultValue={value ?? ""} className={inputCls} required>
      <option value="" disabled>Choose a work package</option>
      {s.workPackages.map((w) => <option key={w.id} value={w.id}>{w.code} {w.name}{w.tasks ? "" : " (no tasks yet)"}</option>)}
    </select>
  );
}

function TeamSelect({ s, value, name = "assignee_id" }: { s: Schedule; value?: number; name?: string }) {
  return (
    <select name={name} defaultValue={value ?? ""} className={inputCls} required>
      <option value="" disabled>Choose a person</option>
      {s.team.map((m) => <option key={m.id} value={m.id}>{m.name} ({m.role})</option>)}
    </select>
  );
}

function EditPanel({ s, t, statusDate }: { s: Schedule; t: Task; statusDate: string }) {
  const preds = s.deps.filter((d) => d.task_id === t.id);
  const succs = s.deps.filter((d) => d.predecessor_id === t.id);
  const f = s.analysis.forecast.get(t.id)!;
  return (
    <Card title={`Edit ${t.code} · ${t.name}`} description={`${t.status} ${t.percent_complete}% · forecast ${fmtDate(f.forecast_start)} – ${fmtDate(f.forecast_end)} (${f.kind})`}
      actions={<Link href="/schedule/activities" className="text-xs font-medium text-slate-500 hover:text-slate-800">Close</Link>} className="mb-6 border-teal-300 ring-1 ring-teal-200">
      <div className="grid gap-6 lg:grid-cols-3">
        <ActionForm action={updateTask} className="grid grid-cols-2 gap-3 lg:col-span-1">
          <p className="col-span-2 text-xs font-semibold uppercase tracking-wide text-teal-700">Details</p>
          <input type="hidden" name="id" value={t.id} />
          <Field label="Name" className="col-span-2"><input name="name" defaultValue={t.name} className={inputCls} required /></Field>
          <Field label="Work package" className="col-span-2"><WpSelect s={s} value={t.wbs_item_id} /></Field>
          <Field label="Assignee" className="col-span-2"><TeamSelect s={s} value={t.assignee_id} /></Field>
          <DurationDates key={t.id} duration={t.duration_days} start={t.planned_start} />
          <Field label="Estimated cost (PKR)"><input name="estimated_cost" defaultValue={t.estimated_cost} inputMode="numeric" className={inputCls} required /></Field>
          <div className="col-span-2"><SubmitButton label="Save activity" pendingLabel="Saving..." /></div>
        </ActionForm>

        <ActionForm action={updateProgress} className="grid grid-cols-2 content-start gap-3">
          <p className="col-span-2 text-xs font-semibold uppercase tracking-wide text-teal-700">Update progress</p>
          <input type="hidden" name="id" value={t.id} />
          <Field label="Percent complete" className="col-span-2"><input name="percent_complete" type="number" min={0} max={100} defaultValue={t.percent_complete} className={inputCls} required /></Field>
          <Field label="Actual start"><input name="actual_start" type="date" defaultValue={t.actual_start ?? ""} className={inputCls} /></Field>
          <Field label="Actual end"><input name="actual_end" type="date" defaultValue={t.actual_end ?? ""} className={inputCls} /></Field>
          <label className="col-span-2 flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" name="on_hold" value="1" defaultChecked={t.status === "On Hold"} className="h-4 w-4 rounded border-slate-300" /> On hold
          </label>
          <p className="col-span-2 text-xs text-slate-500">
            0% = Not Started (actual dates cleared) · 1–99% = In Progress (start defaults to {fmtDate(statusDate)}) · 100% = Completed (end defaults to {fmtDate(statusDate)}).
          </p>
          <div className="col-span-2"><SubmitButton label="Update progress" pendingLabel="Updating..." /></div>
        </ActionForm>

        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-teal-700">Dependencies (finish-to-start)</p>
          <ul className="space-y-1.5">
            {preds.length === 0 && <li className="text-sm text-slate-500">No predecessors.</li>}
            {preds.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-1.5 text-sm">
                <span>After <strong className="font-mono">{d.predecessor_code}</strong>{d.lag_days ? ` + ${d.lag_days} d lag` : ""}</span>
                <RowAction action={removeDependency} fields={{ id: d.id }} label="Remove" variant="danger" confirm={`Remove ${t.code} ← ${d.predecessor_code}?`} />
              </li>
            ))}
          </ul>
          <ActionForm action={addDependency} className="flex items-end gap-2" resetOnSuccess>
            <input type="hidden" name="task_id" value={t.id} />
            <Field label="Predecessor" className="flex-1">
              <select name="predecessor_id" className={inputCls} required defaultValue="">
                <option value="" disabled>Choose</option>
                {s.tasks.filter((x) => x.id !== t.id && !preds.some((d) => d.predecessor_id === x.id)).map((x) => <option key={x.id} value={x.id}>{x.code} {x.name}</option>)}
              </select>
            </Field>
            <Field label="Lag" className="w-20"><input name="lag_days" type="number" min={0} defaultValue={0} className={inputCls} required /></Field>
            <SubmitButton label="Add" pendingLabel="..." />
          </ActionForm>
          <p className="text-xs text-slate-500">Successors: {succs.length ? succs.map((d) => d.task_code).join(", ") : "none"}. Circular links are rejected by the database.</p>
        </div>
      </div>
    </Card>
  );
}

export default async function ActivitiesPage({ searchParams }: { searchParams: Promise<{ [k: string]: string | string[] | undefined }> }) {
  const p = getProject();
  const s = p && getSchedule(p.id);
  if (!p || !s) return <NoProject />;
  const sp = await searchParams;
  const editing = s.tasks.find((t) => String(t.id) === sp.edit);
  const wp = Number(sp.wp) || undefined;
  const a = s.analysis;
  const estimated = s.tasks.reduce((sum, t) => sum + t.estimated_cost, 0);
  const headroom = p.current_budget - estimated;
  const emptyWps = s.workPackages.filter((w) => w.tasks === 0);
  const predsOf = (id: number) => s.deps.filter((d) => d.task_id === id);

  return (
    <>
      <PageHeader title="Activities" subtitle="Add, edit and delete activities, record progress and manage finish-to-start dependencies. Business rules are enforced by the database.">
        <Link href="/schedule" className={linkCls}>Gantt</Link>
      </PageHeader>

      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <Card title="Recalculate schedule from dependencies" description="Forward pass: each unfinished activity starts the day after its latest predecessor (+ lag). Completed work keeps its dates.">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-slate-700">
              {a.recalc.length
                ? <><strong className="text-red-700">{a.recalc.length} activit{a.recalc.length === 1 ? "y" : "ies"}</strong> would move: {a.recalc.map((c) => `${c.code} → ${fmtDate(c.planned_start)}`).join(", ")}</>
                : "Planned dates already follow every dependency."}
            </p>
            <RowAction action={recalculateSchedule} fields={{ project_id: p.id }} label="Recalculate schedule" variant="primary" pendingLabel="Recalculating..."
              confirm="Move planned dates of unfinished activities to follow their dependencies?" />
          </div>
          {a.conflicts.length > 0 && (
            <ul className="mt-3 space-y-1 text-sm text-red-800">
              {a.conflicts.map((c) => <li key={`${c.task_id}-${c.predecessor_id}`}>Conflict: {c.task} starts {fmtDate(c.planned_start)}, {c.days_early} d before {c.predecessor}{c.lag_days ? ` + ${c.lag_days} d lag` : ""} allows ({fmtDate(c.required_start)}).</li>)}
            </ul>
          )}
        </Card>
        <Card title="Work packages with no activities yet" description="E.g. new scope added by an approved change request.">
          {emptyWps.length === 0 ? <p className="text-sm text-slate-500">Every work package has at least one activity.</p> : (
            <ul className="space-y-1.5">
              {emptyWps.map((w) => (
                <li key={w.id} className="flex items-center justify-between gap-2 text-sm">
                  <span><span className="font-mono text-slate-500">{w.code}</span> {w.name} <span className="text-xs text-slate-400">({w.deliverable_name})</span></span>
                  <Link href={`/schedule/activities?wp=${w.id}#add`} className="rounded-lg bg-teal-700 px-2.5 py-1 text-xs font-medium text-white hover:bg-teal-800">Add activity</Link>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-xs text-slate-500">Unallocated budget: <strong className={headroom > 0 ? "text-slate-800" : "text-red-700"}>{pkr(headroom)}</strong> of {pkr(p.current_budget)}. New estimates must fit.</p>
        </Card>
      </div>

      {editing && <EditPanel s={s} t={editing} statusDate={p.status_date} />}

      <Card title={`Activity list (${s.tasks.length})`} padded={false} className="mb-6">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[68rem]">
            <thead className="bg-slate-50"><tr>
              <th className={thCls}>Activity</th><th className={thCls}>Assignee</th><th className={thCls}>Days</th><th className={thCls}>Planned</th>
              <th className={thCls}>Forecast end</th><th className={thCls}>Est. cost</th><th className={thCls}>Progress</th><th className={thCls}>After</th><th className={thCls}></th>
            </tr></thead>
            <tbody className="divide-y divide-slate-100">
              {s.tasks.length === 0 && <EmptyRow cols={9}>No activities yet. Add the first one below.</EmptyRow>}
              {s.tasks.map((t) => {
                const f = a.forecast.get(t.id)!;
                const late = t.status !== "Completed" && f.delay_days > 0;
                return (
                  <tr key={t.id} className={editing?.id === t.id ? "bg-teal-50/50" : undefined}>
                    <td className={tdCls}>
                      <p className="font-medium text-slate-900"><span className="font-mono text-slate-500">{t.code}</span> {t.name}</p>
                      <p className="text-xs text-slate-500">{t.wp_code} {t.wp_name}</p>
                    </td>
                    <td className={tdCls}>{t.assignee_name}</td>
                    <td className={tdCls}>{t.duration_days}</td>
                    <td className={`${tdCls} whitespace-nowrap`}>{fmtDate(t.planned_start)}<br /><span className="text-xs text-slate-500">to {fmtDate(t.planned_end)}</span></td>
                    <td className={`${tdCls} whitespace-nowrap`}>
                      {fmtDate(f.forecast_end)}
                      {f.delay_days !== 0 && <div><Badge tone={late ? "red" : f.delay_days > 0 ? "slate" : "green"}>{f.delay_days > 0 ? "+" : ""}{f.delay_days} d{t.status === "Completed" ? " (done)" : ""}</Badge></div>}
                    </td>
                    <td className={tdCls}>{num(t.estimated_cost)}</td>
                    <td className={tdCls}>
                      <StatusBadge value={t.status} />
                      <div className="mt-1.5 h-1.5 w-20 overflow-hidden rounded-full bg-slate-100"><div className={`h-full ${late ? "bg-red-500" : "bg-teal-600"}`} style={{ width: `${t.percent_complete}%` }} /></div>
                      <span className="text-xs text-slate-500">{t.percent_complete}%</span>
                    </td>
                    <td className={`${tdCls} font-mono text-xs`}>{predsOf(t.id).map((d) => `${d.predecessor_code}${d.lag_days ? `+${d.lag_days}` : ""}`).join(", ") || "-"}</td>
                    <td className={`${tdCls} whitespace-nowrap text-right`}>
                      <div className="flex justify-end gap-1.5">
                        <Link href={`/schedule/activities?edit=${t.id}`} className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50">Edit / progress</Link>
                        <RowAction action={deleteTask} fields={{ id: t.id }} label="Delete" variant="danger" confirm={`Delete ${t.code}? Its dependencies are removed too.`} />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <div id="add">
        <Card title="Add an activity" description="Must sit on a WBS work package; total estimates cannot exceed the approved budget (enforced by the database).">
          <ActionForm action={addTask} resetOnSuccess className="grid gap-4 md:grid-cols-6">
            <input type="hidden" name="project_id" value={p.id} />
            <Field label="Activity name" className="md:col-span-3"><input name="name" className={inputCls} required /></Field>
            <Field label="Work package" className="md:col-span-3"><WpSelect s={s} value={wp} /></Field>
            <Field label="Assignee" className="md:col-span-2"><TeamSelect s={s} /></Field>
            <Field label="Estimated cost (PKR)" hint={`Unallocated ${pkr(headroom)}`} className="md:col-span-2"><input name="estimated_cost" inputMode="numeric" className={inputCls} placeholder="250000" required /></Field>
            <Field label="Predecessors" hint='Task codes, optional lag: "T13, T16+2"' className="md:col-span-2"><input name="predecessors" className={inputCls} placeholder="T13" /></Field>
            <div className="grid gap-4 sm:grid-cols-3 md:col-span-6"><DurationDates startRequired={false} /></div>
            <div className="md:col-span-6"><SubmitButton label="Add activity" pendingLabel="Adding..." /></div>
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
