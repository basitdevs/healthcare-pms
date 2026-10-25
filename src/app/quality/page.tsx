import Link from "next/link";
import { ActionForm, RowAction, SubmitButton } from "@/components/forms";
import { Badge, Card, EmptyRow, Field, NoProject, PageHeader, Stat, StatusBadge, inputCls, tdCls, thCls } from "@/components/ui";
import { fmtDate } from "@/lib/format";
import { getProject, getQuality, getTasksLite, getTeam } from "@/lib/queries";
import { DEFECT_STATUSES, SEVERITIES } from "@/lib/quality";
import type { DefectRow } from "@/lib/quality-data";
import { addDefect, deleteDefect, setDefectStatus, updateDefect } from "../actions/quality";

type SP = { [k: string]: string | string[] | undefined };
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const linkCls = "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50";
const sevTone = { Critical: "red", Major: "amber", Minor: "blue", Trivial: "slate" } as const;
const NEXT: Record<string, string[]> = { Open: ["In Progress", "Resolved"], "In Progress": ["Resolved", "Open"], Resolved: ["Closed", "Open"], Closed: ["Open"] };

function DefectFields({ d, tasks, team, statusDate, prefill }: {
  d?: DefectRow; tasks: { id: number; code: string; name: string }[]; team: { id: number; name: string }[]; statusDate: string; prefill: { task?: string; title?: string };
}) {
  const person = (name: string, value?: number) => (
    <select name={name} defaultValue={value ?? ""} className={inputCls} required>
      <option value="" disabled>Choose a person</option>
      {team.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
    </select>
  );
  return (
    <>
      <Field label="Title" className="md:col-span-3"><input name="title" defaultValue={d?.title ?? prefill.title ?? ""} className={inputCls} required /></Field>
      <Field label="Task" className="md:col-span-3">
        <select name="task_id" defaultValue={d?.task_id ?? prefill.task ?? ""} className={inputCls} required>
          <option value="" disabled>Choose a task</option>
          {tasks.map((t) => <option key={t.id} value={t.id}>{t.code} {t.name}</option>)}
        </select>
      </Field>
      <Field label="Severity"><select name="severity" defaultValue={d?.severity ?? "Major"} className={inputCls}>{SEVERITIES.map((s) => <option key={s}>{s}</option>)}</select></Field>
      <Field label="Assigned to">{person("assigned_to", d?.assigned_to)}</Field>
      <Field label="Reported by">{person("reported_by", d?.reported_by)}</Field>
      <Field label="Reported on"><input type="date" name="reported_date" defaultValue={d?.reported_date ?? statusDate} max={statusDate} className={inputCls} required /></Field>
      <Field label="Description" className="md:col-span-2"><input name="description" defaultValue={d?.description ?? ""} className={inputCls} placeholder="Optional" /></Field>
    </>
  );
}

export default async function QualityPage({ searchParams }: { searchParams: Promise<SP> }) {
  const p = getProject();
  if (!p) return <NoProject />;
  const sp = await searchParams;
  const q = getQuality(p.id);
  const tasks = getTasksLite(p.id);
  const team = getTeam(p.id);
  const fStatus = one(sp.status), fSev = one(sp.severity);
  const editing = q.defects.find((d) => String(d.id) === one(sp.edit));
  const prefill = { task: one(sp.task) || undefined, title: one(sp.title) || undefined };
  const rows = q.defects.filter((d) => (!fStatus || (fStatus === "unresolved" ? d.status === "Open" || d.status === "In Progress" : d.status === fStatus)) && (!fSev || d.severity === fSev));
  const c = q.counts;
  const href = (k: "status" | "severity", v: string) => {
    const u = new URLSearchParams({ ...(fStatus && { status: fStatus }), ...(fSev && { severity: fSev }) });
    if (v) u.set(k, v); else u.delete(k);
    const s = u.toString();
    return s ? `/quality?${s}` : "/quality";
  };
  const chip = (k: "status" | "severity", v: string, label: string, active: boolean) => (
    <Link key={k + v} href={href(k, v)} className={`rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${active ? "bg-teal-700 text-white ring-teal-700" : "bg-white text-slate-600 ring-slate-300 hover:bg-slate-50"}`}>{label}</Link>
  );

  return (
    <>
      <PageHeader title="Defect tracker" subtitle="Every defect is tied to a task and, through the task's WBS work package, to the requirement it affects.">
        <Link href="/quality/checklist" className={linkCls}>Quality checklist</Link>
        <Link href="/risks" className={linkCls}>Risks</Link>
      </PageHeader>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Open" value={c.status.Open} tone={c.status.Open ? "amber" : "green"} sub={`${c.total} defects in total`} />
        <Stat label="In progress" value={c.status["In Progress"]} tone="blue" sub={`${c.unresolved} unresolved`} />
        <Stat label="Resolved / closed" value={c.status.Resolved + c.status.Closed} tone="green" sub={`${c.status.Resolved} resolved · ${c.status.Closed} closed`} />
        <Stat label="Unresolved critical" value={c.unresolvedCritical} tone={c.unresolvedCritical ? "red" : "green"}
          sub={c.unresolvedCritical ? <strong className="text-red-700">Blocks go-live and project closure</strong> : "Nothing blocking closure"} />
      </div>

      <Card title={editing ? `Edit ${editing.code}` : "Log a defect"} className={`mb-6 ${editing || prefill.task ? "border-teal-300 ring-1 ring-teal-200" : ""}`}
        actions={editing || prefill.task ? <Link href="/quality" className="text-xs font-medium text-slate-500 hover:text-slate-800">Cancel</Link> : undefined}>
        <div id="add" />
        <ActionForm key={editing?.id ?? `new-${prefill.task ?? ""}`} action={editing ? updateDefect : addDefect} resetOnSuccess={!editing} className="grid gap-4 md:grid-cols-6">
          {editing && <input type="hidden" name="id" value={editing.id} />}
          <DefectFields d={editing} tasks={tasks} team={team} statusDate={p.status_date} prefill={prefill} />
          <div className="flex items-end"><SubmitButton label={editing ? "Save defect" : "Log defect"} pendingLabel="Saving..." /></div>
        </ActionForm>
      </Card>

      <Card title={`Defects (${rows.length} of ${c.total})`} padded={false}
        actions={
          <div className="flex flex-wrap justify-end gap-1.5">
            {chip("status", "", "All", !fStatus)}
            {chip("status", "unresolved", "Unresolved", fStatus === "unresolved")}
            {DEFECT_STATUSES.map((s) => chip("status", s, `${s} ${c.status[s]}`, fStatus === s))}
            <span className="mx-1 w-px bg-slate-200" />
            {chip("severity", "", "Any severity", !fSev)}
            {SEVERITIES.map((s) => chip("severity", s, `${s} ${c.severity[s]}`, fSev === s))}
          </div>
        }>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[64rem]">
            <thead className="bg-slate-50"><tr>
              <th className={thCls}>Defect</th><th className={thCls}>Severity</th><th className={thCls}>Status</th><th className={thCls}>Task → requirement</th>
              <th className={thCls}>Assignee</th><th className={thCls}>Reported</th><th className={thCls}>Actions</th>
            </tr></thead>
            <tbody className="divide-y divide-slate-100">
              {rows.length === 0 && <EmptyRow cols={7}>No defects match the filter.</EmptyRow>}
              {rows.map((d) => {
                const critOpen = d.severity === "Critical" && (d.status === "Open" || d.status === "In Progress");
                return (
                  <tr key={d.id} className={critOpen ? "bg-red-50/60" : undefined}>
                    <td className={tdCls}><p className="font-medium text-slate-900"><span className="font-mono text-slate-500">{d.code}</span> {d.title}</p>{d.description && <p className="text-xs text-slate-500">{d.description}</p>}</td>
                    <td className={tdCls}><Badge tone={sevTone[d.severity as keyof typeof sevTone] ?? "slate"}>{d.severity}</Badge></td>
                    <td className={tdCls}><StatusBadge value={d.status} />{d.resolved_date && <p className="mt-1 text-xs text-slate-500">resolved {fmtDate(d.resolved_date)}</p>}</td>
                    <td className={tdCls}>
                      <p><span className="font-mono text-xs">{d.task_code}</span> {d.task_name}</p>
                      <p className="text-xs text-slate-500">WBS {d.wbs_code} · {d.req_code ? <><span className="font-mono">{d.req_code}</span> {d.req_title}</> : "no requirement"}</p>
                    </td>
                    <td className={tdCls}>{d.assignee}<p className="text-xs text-slate-500">by {d.reporter}</p></td>
                    <td className={`${tdCls} whitespace-nowrap`}>{fmtDate(d.reported_date)}</td>
                    <td className={tdCls}>
                      <div className="flex flex-wrap gap-1">
                        {NEXT[d.status].map((s) => (
                          <RowAction key={s} action={setDefectStatus} fields={{ id: d.id, status: s }} label={s === "Open" ? "Reopen" : s}
                            variant={s === "Resolved" || s === "Closed" ? "primary" : "secondary"} />
                        ))}
                        <Link href={`/quality?edit=${d.id}#add`} className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50">Edit</Link>
                        <RowAction action={deleteDefect} fields={{ id: d.id }} label="Delete" variant="danger" confirm={`Delete ${d.code}?`} />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
