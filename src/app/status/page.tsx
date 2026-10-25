import { ActionForm, RowAction, SubmitButton } from "@/components/forms";
import { Badge, Card, EmptyRow, Field, NoProject, PageHeader, StatusBadge, inputCls, tdCls, thCls } from "@/components/ui";
import { fmtDate, pkr } from "@/lib/format";
import {
  closureReadiness, getClosure, getMilestones, getProject, getSchedule, getStatusLog, getTasksLite, getTeam,
} from "@/lib/queries";
import {
  addMilestone, addStatusReport, addTeamMember, closeProject, deleteMilestone, deleteTeamMember,
  saveClosure, setMilestoneStatus, setPhase, setStatusDate,
} from "../actions/status";

const PHASES = ["Initiating", "Planning", "Executing", "Monitoring", "Closing"];
const ROLES = ["Project Manager", "Backend Developer", "Frontend Developer", "Database Developer", "QA Engineer"];
const MS_STATUS = ["Pending", "At Risk", "Achieved", "Missed"];

function Check({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2 text-sm">
      <span className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white ${ok ? "bg-emerald-500" : "bg-red-500"}`}>{ok ? "✓" : "!"}</span>
      <span className={ok ? "text-slate-600" : "text-slate-800"}>{children}</span>
    </li>
  );
}

export default function StatusPage() {
  const p = getProject();
  if (!p) return <NoProject />;
  const forecastOf = new Map(getSchedule(p.id)!.milestones.map((m) => [m.id, m]));
  const milestones = getMilestones(p.id).map((m) => ({ ...m, forecast_date: forecastOf.get(m.id)?.forecast_date ?? null, display_status: forecastOf.get(m.id)?.display_status ?? m.status }));
  const reports = getStatusLog(p.id);
  const team = getTeam(p.id);
  const tasks = getTasksLite(p.id);
  const closure = getClosure(p.id);
  const ready = closureReadiness(p.id);
  const pm = team.find((m) => m.role === "Project Manager");
  const closed = p.status === "Closed";
  const canClose = ready.incomplete === 0 && ready.critical === 0 && !!closure && !!closure.deliverables_accepted;

  return (
    <>
      <PageHeader title="Status, milestones & closure" subtitle="Track project status, milestones and who is responsible for what, then formally close the project." />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Project phase" description="Where the project is in its lifecycle.">
          <ActionForm action={setPhase} className="flex items-end gap-3">
            <input type="hidden" name="project_id" value={p.id} />
            <Field label="Phase" className="flex-1">
              <select name="phase" defaultValue={closed ? "Closing" : p.status} className={inputCls}>{PHASES.map((x) => <option key={x}>{x}</option>)}</select>
            </Field>
            <SubmitButton label="Update" pendingLabel="Saving..." />
          </ActionForm>
          {closed && <p className="mt-3 text-sm text-emerald-700">The project is closed. Choose another phase to reopen it.</p>}
        </Card>
        <Card title="Status date" description="All schedule and earned value analysis is measured as of this date.">
          <ActionForm action={setStatusDate} className="flex items-end gap-3">
            <input type="hidden" name="project_id" value={p.id} />
            <Field label="As of" className="flex-1"><input type="date" name="status_date" defaultValue={p.status_date} className={inputCls} required /></Field>
            <SubmitButton label="Update" pendingLabel="Saving..." />
          </ActionForm>
        </Card>
      </div>

      <Card title="Milestones" className="mt-6" padded={false}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[44rem]">
            <thead className="bg-slate-50"><tr>
              <th className={thCls}>Milestone</th><th className={thCls}>Target</th><th className={thCls}>Forecast / actual</th>
              <th className={thCls}>Status</th><th className={thCls}>Owner</th><th className={thCls}>Update</th>
            </tr></thead>
            <tbody className="divide-y divide-slate-100">
              {milestones.length === 0 && <EmptyRow cols={6}>No milestones yet.</EmptyRow>}
              {milestones.map((m) => (
                <tr key={m.id}>
                  <td className={tdCls}><p className="font-medium text-slate-900">{m.name}</p>{m.task_code && <p className="text-xs text-slate-500">Tracks task {m.task_code}</p>}</td>
                  <td className={tdCls}>{fmtDate(m.target_date)}</td>
                  <td className={tdCls}>
                    <span className={!m.actual_date && m.forecast_date && m.forecast_date > m.target_date ? "font-medium text-red-700" : undefined}>{fmtDate(m.forecast_date)}</span>
                    {m.forecast_date && <p className="text-xs text-slate-500">{m.actual_date ? "actual" : m.task_code ? `forecast of ${m.task_code}` : ""}</p>}
                  </td>
                  <td className={tdCls}><StatusBadge value={m.display_status} />{m.display_status !== m.status && <p className="mt-1 text-xs text-slate-500">from schedule (saved: {m.status})</p>}</td>
                  <td className={tdCls}>{m.owner_name ?? "-"}</td>
                  <td className={tdCls}>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <ActionForm action={setMilestoneStatus} className="flex items-center gap-1" inlineError={false}>
                        <input type="hidden" name="id" value={m.id} />
                        <select name="status" defaultValue={m.status} className="rounded-md border border-slate-300 bg-white px-1.5 py-1 text-xs">{MS_STATUS.map((s) => <option key={s}>{s}</option>)}</select>
                        <SubmitButton label="Set" small />
                      </ActionForm>
                      <RowAction action={deleteMilestone} fields={{ id: m.id }} label="Delete" variant="danger" confirm={`Delete milestone "${m.name}"?`} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="border-t border-slate-100 p-5">
          <p className="mb-3 text-sm font-semibold text-slate-900">Add milestone</p>
          <ActionForm action={addMilestone} resetOnSuccess className="grid gap-3 md:grid-cols-6">
            <input type="hidden" name="project_id" value={p.id} />
            <Field label="Name" className="md:col-span-2"><input name="name" className={inputCls} required /></Field>
            <Field label="Target date"><input type="date" name="target_date" className={inputCls} required /></Field>
            <Field label="Status"><select name="status" defaultValue="Pending" className={inputCls}>{MS_STATUS.map((s) => <option key={s}>{s}</option>)}</select></Field>
            <Field label="Linked task"><select name="task_id" defaultValue="" className={inputCls}><option value="">None</option>{tasks.map((t) => <option key={t.id} value={t.id}>{t.code} {t.name}</option>)}</select></Field>
            <Field label="Owner"><select name="owner_id" defaultValue="" className={inputCls}><option value="">None</option>{team.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></Field>
            <div className="md:col-span-6"><SubmitButton label="Add milestone" pendingLabel="Adding..." /></div>
          </ActionForm>
        </div>
      </Card>

      <div className="mt-6 grid gap-6 lg:grid-cols-5">
        <Card title="Status reports" className="lg:col-span-3" padded={false}>
          <ul className="divide-y divide-slate-100">
            {reports.length === 0 && <li className="px-5 py-8 text-center text-sm text-slate-500">No status reports yet.</li>}
            {reports.map((r) => (
              <li key={r.id} className="px-5 py-3.5">
                <div className="flex items-center gap-2"><StatusBadge value={r.health} /><span className="text-xs text-slate-500">{fmtDate(r.report_date)}{r.reporter ? ` · ${r.reporter}` : ""}</span></div>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-700">{r.summary}</p>
              </li>
            ))}
          </ul>
        </Card>
        <Card title="New status report" className="lg:col-span-2">
          <ActionForm action={addStatusReport} resetOnSuccess className="space-y-3">
            <input type="hidden" name="project_id" value={p.id} />
            <input type="hidden" name="reported_by" value={pm?.id ?? ""} />
            <div className="grid grid-cols-2 gap-3">
              <Field label="Date"><input type="date" name="report_date" defaultValue={p.status_date} className={inputCls} required /></Field>
              <Field label="Health"><select name="health" defaultValue="Green" className={inputCls}><option>Green</option><option>Amber</option><option>Red</option></select></Field>
            </div>
            <Field label="Summary"><textarea name="summary" rows={4} className={inputCls} required /></Field>
            <SubmitButton label="Record report" pendingLabel="Saving..." />
          </ActionForm>
        </Card>
      </div>

      <Card title="Team & responsibilities" description="Who is responsible for which work. Counts exclude completed tasks." className="mt-6" padded={false}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[46rem]">
            <thead className="bg-slate-50"><tr>
              <th className={thCls}>Team member</th><th className={thCls}>Open tasks</th><th className={thCls}>Open defects</th><th className={thCls}>Milestones</th><th className={thCls}>Risks owned</th><th className={thCls} />
            </tr></thead>
            <tbody className="divide-y divide-slate-100">
              {team.map((m) => (
                <tr key={m.id}>
                  <td className={tdCls}><p className="font-medium text-slate-900">{m.name}</p><p className="text-xs text-slate-500">{m.role}</p></td>
                  <td className={tdCls}>{m.open_tasks}{m.task_codes && <span className="ml-1.5 text-xs text-slate-500">({m.task_codes})</span>}</td>
                  <td className={tdCls}>{m.open_defects ? <Badge tone="amber">{m.open_defects}</Badge> : 0}</td>
                  <td className={tdCls}>{m.milestones}</td>
                  <td className={tdCls}>{m.risks}</td>
                  <td className={`${tdCls} text-right`}><RowAction action={deleteTeamMember} fields={{ id: m.id }} label="Remove" variant="danger" confirm={`Remove ${m.name} from the team?`} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="border-t border-slate-100 p-5">
          <p className="mb-3 text-sm font-semibold text-slate-900">Add team member</p>
          <ActionForm action={addTeamMember} resetOnSuccess className="grid gap-3 md:grid-cols-4">
            <input type="hidden" name="project_id" value={p.id} />
            <Field label="Name"><input name="name" className={inputCls} required /></Field>
            <Field label="Role"><select name="role" defaultValue="Backend Developer" className={inputCls}>{ROLES.map((r) => <option key={r}>{r}</option>)}</select></Field>
            <Field label="Email"><input type="email" name="email" className={inputCls} /></Field>
            <div className="flex items-end"><SubmitButton label="Add member" pendingLabel="Adding..." /></div>
          </ActionForm>
        </div>
      </Card>

      <Card title="Project closure" description="A project can only be closed when all work is complete, no critical defects remain and the sponsor has accepted the deliverables." className="mt-6">
        <div className="grid gap-6 lg:grid-cols-2">
          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Closure readiness</p>
            <ul className="space-y-2.5">
              <Check ok={ready.incomplete === 0}>{ready.incomplete === 0 ? "All tasks are complete" : `${ready.incomplete} task${ready.incomplete > 1 ? "s" : ""} not yet complete`}</Check>
              <Check ok={ready.critical === 0}>{ready.critical === 0 ? "No unresolved critical defects" : `${ready.critical} unresolved critical defect${ready.critical > 1 ? "s" : ""}`}</Check>
              <Check ok={!!closure}>{closure ? "Closure record saved" : "Closure record not saved yet"}</Check>
              <Check ok={!!closure?.deliverables_accepted}>{closure?.deliverables_accepted ? "Deliverables accepted by sponsor" : "Deliverables not yet accepted"}</Check>
            </ul>
            <div className="mt-5">
              {closed ? (
                <Badge tone="green">Project closed</Badge>
              ) : (
                <RowAction action={closeProject} fields={{ project_id: p.id }} label="Close project" variant={canClose ? "success" : "danger"} confirm="Close the project? This marks it as Closed." pendingLabel="Closing..." />
              )}
              {!closed && !canClose && <p className="mt-2 text-xs text-slate-500">You can try - the system will refuse and explain what is missing.</p>}
            </div>
          </div>
          <ActionForm action={saveClosure} className="space-y-3">
            <input type="hidden" name="project_id" value={p.id} />
            <div className="grid grid-cols-2 gap-3">
              <Field label="Closure date"><input type="date" name="closure_date" defaultValue={closure?.closure_date ?? p.deadline} className={inputCls} required /></Field>
              <Field label="Final cost (PKR)" hint={`Actual cost recorded so far: ${pkr(ready.actual)}`}><input name="final_cost" inputMode="numeric" defaultValue={closure?.final_cost ?? ready.actual} className={inputCls} required /></Field>
            </div>
            <Field label="Lessons learned"><textarea name="lessons_learned" rows={4} defaultValue={closure?.lessons_learned ?? ""} className={inputCls} required /></Field>
            <Field label="Signed off by"><input name="signed_off_by" defaultValue={closure?.signed_off_by ?? ""} className={inputCls} required /></Field>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" name="deliverables_accepted" value="1" defaultChecked={!!closure?.deliverables_accepted} className="h-4 w-4 rounded border-slate-300 text-teal-700" />
              Sponsor has accepted the deliverables
            </label>
            <SubmitButton label="Save closure record" pendingLabel="Saving..." variant="secondary" />
          </ActionForm>
        </div>
      </Card>
    </>
  );
}
