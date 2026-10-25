import Link from "next/link";
import { ActionForm, RowAction, SubmitButton } from "@/components/forms";
import { Card, Field, NoProject, PageHeader, StatusBadge, inputCls } from "@/components/ui";
import { getProject, getQuality, getTasksLite, getTeam } from "@/lib/queries";
import type { ResponseRow } from "@/lib/quality-data";
import { addResponse, deleteResponse, updateResponse } from "../../actions/risks";

const linkCls = "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50";
const typeCls = { Preventive: "border-sky-300 bg-sky-50", Corrective: "border-violet-300 bg-violet-50" } as const;
const typeText = { Preventive: "text-sky-800", Corrective: "text-violet-800" } as const;
const Arrow = () => <span aria-hidden className="flex items-center px-1 text-slate-400">→</span>;

export default async function PdpcPage({ searchParams }: { searchParams: Promise<{ [k: string]: string | string[] | undefined }> }) {
  const p = getProject();
  if (!p) return <NoProject />;
  const q = getQuality(p.id);
  const tasks = getTasksLite(p.id);
  const team = getTeam(p.id);
  const editId = String((await searchParams).edit ?? "");
  const editing = q.responses.find((r) => String(r.id) === editId);

  // Steps = related tasks (in task order), then responses without a task in "General / scope".
  const steps: { key: string; title: string; sub: string; rows: ResponseRow[] }[] = [];
  for (const t of tasks) {
    const rows = q.responses.filter((r) => r.task_id === t.id);
    if (rows.length) steps.push({ key: `t${t.id}`, title: t.code, sub: t.name, rows });
  }
  const general = q.responses.filter((r) => r.task_id === null);
  if (general.length) steps.push({ key: "general", title: "General / scope", sub: "Responses not tied to one task", rows: general });
  const byProblem = (rows: ResponseRow[]) => {
    const m = new Map<string, ResponseRow[]>();
    for (const r of rows) m.set(`${r.risk_id}|${r.potential_problem}`, [...(m.get(`${r.risk_id}|${r.potential_problem}`) ?? []), r]);
    return [...m.values()];
  };

  return (
    <>
      <PageHeader title="Process Decision Program Chart" subtitle="For each step of the plan: what could go wrong, and the preventive (stop it happening) or corrective (recover if it happens) countermeasure.">
        <Link href="/risks" className={linkCls}>Risk matrix</Link>
      </PageHeader>

      <Card title="PDPC" description={`${q.responses.length} countermeasures across ${steps.length} steps`} className="mb-6">
        <div className="overflow-x-auto">
          <div className="grid min-w-[60rem] grid-cols-[13rem_1fr] gap-3">
            <div className="flex flex-col justify-center rounded-xl border-2 border-teal-600 bg-teal-50 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-teal-700">Objective</p>
              <p className="mt-1 text-sm font-semibold text-slate-900">{p.name}</p>
              <p className="mt-2 text-xs text-slate-600">Deliver the system to all five hospitals by the deadline, within budget, with zero unresolved critical defects.</p>
            </div>
            <div className="space-y-3">
              <div className="grid grid-cols-[12rem_1.5rem_1fr_1.5rem_1.3fr] text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                <span>Step</span><span /><span>Potential problem</span><span /><span>Countermeasure</span>
              </div>
              {steps.length === 0 && <p className="text-sm text-slate-500">No responses yet. Add one below.</p>}
              {steps.map((s) => (
                <div key={s.key} className="grid grid-cols-[12rem_1.5rem_1fr] items-stretch border-l-2 border-teal-600 pl-3">
                  <div className="flex flex-col justify-center rounded-lg border border-slate-300 bg-white p-3">
                    <p className="font-mono text-sm font-bold text-slate-900">{s.title}</p>
                    <p className="text-xs text-slate-500">{s.sub}</p>
                  </div>
                  <Arrow />
                  <div className="space-y-2">
                    {byProblem(s.rows).map((g) => (
                      <div key={g[0].id} className="grid grid-cols-[1fr_1.5rem_1.3fr] items-stretch">
                        <div className="rounded-lg border border-amber-300 bg-amber-50 p-2.5 text-sm">
                          <span className="mr-1.5 rounded bg-white px-1 font-mono text-[11px] font-bold text-amber-800 ring-1 ring-amber-200" title={g[0].risk_title}>{g[0].risk_code}</span>
                          {g[0].potential_problem}
                        </div>
                        <Arrow />
                        <div className="space-y-1.5">
                          {g.map((r) => (
                            <div key={r.id} className={`rounded-lg border p-2.5 text-sm ${typeCls[r.response_type as keyof typeof typeCls]} ${editing?.id === r.id ? "ring-2 ring-teal-500" : ""}`}>
                              <div className="mb-1 flex flex-wrap items-center gap-1.5">
                                <span className={`text-[11px] font-bold uppercase tracking-wide ${typeText[r.response_type as keyof typeof typeText]}`}>{r.response_type}</span>
                                <StatusBadge value={r.status} />
                                {r.owner && <span className="text-xs text-slate-500">{r.owner}</span>}
                                <span className="ml-auto flex gap-1">
                                  <Link href={`/risks/pdpc?edit=${r.id}#form`} className="rounded border border-slate-300 bg-white px-1.5 text-[11px] text-slate-600 hover:bg-slate-50">Edit</Link>
                                  <RowAction action={deleteResponse} fields={{ id: r.id }} label="×" variant="danger" confirm="Delete this countermeasure?" />
                                </span>
                              </div>
                              <p className="text-slate-800">{r.action}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-4 text-xs text-slate-600">
          <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded border border-amber-300 bg-amber-50" /> Potential problem (risk code)</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded border border-sky-300 bg-sky-50" /> Preventive countermeasure</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded border border-violet-300 bg-violet-50" /> Corrective countermeasure</span>
        </div>
      </Card>

      <div id="form">
        <Card title={editing ? "Edit countermeasure" : "Add a countermeasure"} className={editing ? "border-teal-300 ring-1 ring-teal-200" : ""}
          actions={editing ? <Link href="/risks/pdpc" className="text-xs font-medium text-slate-500 hover:text-slate-800">Cancel</Link> : undefined}>
          <ActionForm key={editing?.id ?? "new"} action={editing ? updateResponse : addResponse} resetOnSuccess={!editing} className="grid gap-4 md:grid-cols-6">
            {editing && <input type="hidden" name="id" value={editing.id} />}
            <Field label="Risk" className="md:col-span-2">
              <select name="risk_id" defaultValue={editing?.risk_id ?? ""} className={inputCls} required>
                <option value="" disabled>Choose a risk</option>
                {[...q.risks, ...q.closedRisks].map((r) => <option key={r.id} value={r.id}>{r.code} {r.title}</option>)}
              </select>
            </Field>
            <Field label="Step (task)" className="md:col-span-2">
              <select name="task_id" defaultValue={editing?.task_id ?? ""} className={inputCls}>
                <option value="">General / scope (no task)</option>
                {tasks.map((t) => <option key={t.id} value={t.id}>{t.code} {t.name}</option>)}
              </select>
            </Field>
            <Field label="Type"><select name="response_type" defaultValue={editing?.response_type ?? "Preventive"} className={inputCls}><option>Preventive</option><option>Corrective</option></select></Field>
            <Field label="Status"><select name="status" defaultValue={editing?.status ?? "Planned"} className={inputCls}><option>Planned</option><option>In Progress</option><option>Done</option></select></Field>
            <Field label="Potential problem" className="md:col-span-3"><input name="potential_problem" defaultValue={editing?.potential_problem} className={inputCls} required /></Field>
            <Field label="Countermeasure" className="md:col-span-3"><input name="action" defaultValue={editing?.action} className={inputCls} required /></Field>
            <Field label="Owner" className="md:col-span-2">
              <select name="owner_id" defaultValue={editing?.owner_id ?? ""} className={inputCls}><option value="">None</option>{team.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select>
            </Field>
            <div className="flex items-end md:col-span-4"><SubmitButton label={editing ? "Save countermeasure" : "Add countermeasure"} pendingLabel="Saving..." /></div>
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
