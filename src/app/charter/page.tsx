import { ActionForm, RowAction, SubmitButton } from "@/components/forms";
import { Badge, Card, EmptyRow, Field, PageHeader, Stat, StatusBadge, inputCls, tdCls, thCls, toneFor } from "@/components/ui";
import { fmtDate, pkr, weeksInclusive } from "@/lib/format";
import { getProject, getStakeholders, type Project, type Stakeholder } from "@/lib/queries";
import db from "@/lib/db";
import { addStakeholder, createCharter, deleteStakeholder, updateCharter } from "../actions/charter";

const LEVELS = ["Low", "Medium", "High"];

function CreateCharter() {
  return (
    <>
      <PageHeader title="Create project charter" subtitle="The database is empty. Define the project to get started." />
      <Card>
        <ActionForm action={createCharter} className="grid gap-4 md:grid-cols-2">
          <Field label="Project code"><input name="code" className={inputCls} placeholder="SHPMS-2026" required /></Field>
          <Field label="Project name"><input name="name" className={inputCls} required /></Field>
          <Field label="Sponsor"><input name="sponsor" className={inputCls} required /></Field>
          <Field label="Approved budget (PKR)"><input name="budget" inputMode="numeric" className={inputCls} placeholder="5000000" required /></Field>
          <Field label="Start date"><input type="date" name="start_date" className={inputCls} required /></Field>
          <Field label="Deadline"><input type="date" name="deadline" className={inputCls} required /></Field>
          <Field label="Description" className="md:col-span-2"><textarea name="description" rows={2} className={inputCls} /></Field>
          <Field label="Objectives" className="md:col-span-2"><textarea name="objectives" rows={4} className={inputCls} required /></Field>
          <Field label="Scope - included"><textarea name="scope_in" rows={3} className={inputCls} required /></Field>
          <Field label="Scope - excluded"><textarea name="scope_out" rows={3} className={inputCls} required /></Field>
          <div className="md:col-span-2"><SubmitButton label="Create charter" /></div>
        </ActionForm>
      </Card>
    </>
  );
}

function InfluenceMap({ rows }: { rows: Stakeholder[] }) {
  const cell = (influence: string, interest: string) => rows.filter((s) => s.influence === influence && s.interest === interest);
  const strategy: Record<string, string> = {
    "High-High": "Manage closely", "High-Medium": "Keep satisfied", "High-Low": "Keep satisfied",
    "Medium-High": "Keep informed", "Medium-Medium": "Keep informed", "Medium-Low": "Monitor",
    "Low-High": "Keep informed", "Low-Medium": "Monitor", "Low-Low": "Monitor",
  };
  return (
    <div className="overflow-x-auto">
      <div className="grid min-w-[36rem] grid-cols-[4.5rem_repeat(3,1fr)] gap-1.5 text-xs">
        <div />
        {["Low", "Medium", "High"].map((i) => <div key={i} className="pb-1 text-center font-semibold uppercase tracking-wide text-slate-500">{i} interest</div>)}
        {["High", "Medium", "Low"].map((influence) => (
          <div key={influence} className="contents">
            <div className="flex items-center font-semibold uppercase tracking-wide text-slate-500">{influence}<br />influence</div>
            {["Low", "Medium", "High"].map((interest) => {
              const list = cell(influence, interest);
              return (
                <div key={interest} className={`min-h-16 rounded-lg border p-2 ${list.length ? "border-teal-200 bg-teal-50/60" : "border-slate-100 bg-slate-50"}`}>
                  <p className="mb-1 text-[10px] uppercase tracking-wide text-slate-400">{strategy[`${influence}-${interest}`]}</p>
                  {list.map((s) => <p key={s.id} className="leading-snug text-slate-700">{s.name}</p>)}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function CharterForm({ p, locked }: { p: Project; locked: boolean }) {
  return (
    <ActionForm action={updateCharter} className="grid gap-4 md:grid-cols-2">
      <input type="hidden" name="id" value={p.id} />
      <Field label="Project code"><input name="code" defaultValue={p.code} className={inputCls} required /></Field>
      <Field label="Project name"><input name="name" defaultValue={p.name} className={inputCls} required /></Field>
      <Field label="Sponsor"><input name="sponsor" defaultValue={p.sponsor} className={inputCls} required /></Field>
      <Field label="Start date"><input type="date" name="start_date" defaultValue={p.start_date} className={inputCls} required /></Field>
      <Field label="Approved budget (PKR)" hint={locked ? "Locked: changes to the baseline must go through an approved change request." : "Sets the baseline budget."}>
        <input name="budget" inputMode="numeric" defaultValue={p.current_budget} disabled={locked} className={inputCls} />
      </Field>
      <Field label="Deadline" hint={locked ? "Locked: moved only by approved change requests." : "Sets the baseline deadline."}>
        <input type="date" name="deadline" defaultValue={p.deadline} disabled={locked} className={inputCls} />
      </Field>
      <Field label="Description" className="md:col-span-2"><textarea name="description" rows={2} defaultValue={p.description ?? ""} className={inputCls} /></Field>
      <Field label="Project objectives" className="md:col-span-2" hint="One objective per line."><textarea name="objectives" rows={6} defaultValue={p.objectives} className={inputCls} required /></Field>
      <Field label="Scope boundary - included"><textarea name="scope_in" rows={5} defaultValue={p.scope_in} className={inputCls} required /></Field>
      <Field label="Scope boundary - excluded"><textarea name="scope_out" rows={5} defaultValue={p.scope_out} className={inputCls} required /></Field>
      <div className="md:col-span-2"><SubmitButton label="Save charter" pendingLabel="Saving..." /></div>
    </ActionForm>
  );
}

export default function CharterPage() {
  const p = getProject();
  if (!p) return <CreateCharter />;
  const stakeholders = getStakeholders(p.id);
  const locked = (db.prepare("SELECT COUNT(*) n FROM change_requests WHERE project_id = ? AND status = 'Approved'").get(p.id) as { n: number }).n > 0;
  const changedBudget = p.current_budget !== p.original_budget;
  const changedDeadline = p.deadline !== p.original_deadline;

  return (
    <>
      <PageHeader title="Project charter" subtitle="Authorises the project: objectives, scope boundaries, sponsor, approved budget and deadline." />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Approved budget" value={pkr(p.current_budget)} tone={changedBudget ? "amber" : "teal"} sub={changedBudget ? `Original ${pkr(p.original_budget)}` : "No approved changes"} />
        <Stat label="Deadline" value={fmtDate(p.deadline)} tone={changedDeadline ? "amber" : "teal"} sub={changedDeadline ? `Original ${fmtDate(p.original_deadline)}` : "No approved changes"} />
        <Stat label="Duration" value={`${weeksInclusive(p.start_date, p.deadline)} weeks`} sub={`Starts ${fmtDate(p.start_date)}`} />
        <Stat label="Sponsor" value={<span className="text-lg">{p.sponsor.split(" - ")[0]}</span>} sub={<StatusBadge value={p.status} />} />
      </div>

      <Card title="Charter" description="Edit and save. Budget and deadline become read-only once a change request has been approved.">
        <CharterForm p={p} locked={locked} />
      </Card>

      <div className="mt-6 grid gap-6 lg:grid-cols-5">
        <Card title="Stakeholder register" className="lg:col-span-3" padded={false}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[34rem]">
              <thead className="bg-slate-50"><tr><th className={thCls}>Stakeholder</th><th className={thCls}>Influence</th><th className={thCls}>Interest</th><th className={thCls} /></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {stakeholders.length === 0 && <EmptyRow cols={4}>No stakeholders yet.</EmptyRow>}
                {stakeholders.map((s) => (
                  <tr key={s.id}>
                    <td className={tdCls}>
                      <p className="font-medium text-slate-900">{s.name}</p>
                      <p className="text-xs text-slate-500">{s.role} &middot; {s.organization}</p>
                      {s.expectations && <p className="mt-1 text-xs text-slate-500">Expects: {s.expectations}</p>}
                    </td>
                    <td className={tdCls}><Badge tone={s.influence === "High" ? "teal" : toneFor(s.influence)}>{s.influence}</Badge></td>
                    <td className={tdCls}><Badge tone={s.interest === "High" ? "teal" : toneFor(s.interest)}>{s.interest}</Badge></td>
                    <td className={`${tdCls} text-right`}><RowAction action={deleteStakeholder} fields={{ id: s.id }} label="Remove" variant="danger" confirm={`Remove ${s.name}?`} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card title="Add stakeholder" className="lg:col-span-2">
          <ActionForm action={addStakeholder} resetOnSuccess className="space-y-3">
            <input type="hidden" name="project_id" value={p.id} />
            <Field label="Name"><input name="name" className={inputCls} required /></Field>
            <Field label="Role"><input name="role" className={inputCls} required /></Field>
            <Field label="Organisation"><input name="organization" className={inputCls} required /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Influence"><select name="influence" defaultValue="Medium" className={inputCls}>{LEVELS.map((l) => <option key={l}>{l}</option>)}</select></Field>
              <Field label="Interest"><select name="interest" defaultValue="Medium" className={inputCls}>{LEVELS.map((l) => <option key={l}>{l}</option>)}</select></Field>
            </div>
            <Field label="Expectations"><input name="expectations" className={inputCls} /></Field>
            <SubmitButton label="Add stakeholder" pendingLabel="Adding..." />
          </ActionForm>
        </Card>
      </div>

      <Card title="Influence / interest map" description="Engagement strategy for each stakeholder group." className="mt-6">
        <InfluenceMap rows={stakeholders} />
      </Card>
    </>
  );
}
