import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Badge, Card, Field, NoProject, PageHeader, Stat, StatusBadge, inputCls } from "@/components/ui";
import { addDays, fmtDate, pkr, signedPkr, weeksInclusive } from "@/lib/format";
import { getAudit, getChangeRequests, getProject, type Project } from "@/lib/queries";
import { createChangeRequest, decideChangeRequest } from "../actions/changes";

type CR = ReturnType<typeof getChangeRequests>[number];

const sign = (n: number) => (n >= 0 ? `+${n}` : `${n}`);

function Impact({ p, cr }: { p: Project; cr: CR }) {
  const newBudget = p.current_budget + cr.cost_impact;
  const newDeadline = addDays(p.deadline, cr.schedule_impact_days);
  const rows = [
    { label: "Budget", from: pkr(p.current_budget), to: pkr(newBudget), delta: signedPkr(cr.cost_impact) },
    { label: "Deadline", from: fmtDate(p.deadline), to: fmtDate(newDeadline), delta: `${sign(cr.schedule_impact_days)} days` },
    { label: "Duration", from: `${weeksInclusive(p.start_date, p.deadline)} weeks`, to: `${weeksInclusive(p.start_date, newDeadline)} weeks`, delta: "" },
    { label: "Approved scope", from: "current", to: `+${cr.requirements.length} requirement${cr.requirements.length === 1 ? "" : "s"}`, delta: "" },
  ];
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-4">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-amber-800">If approved</p>
      <dl className="grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
        {rows.map((r) => (
          <div key={r.label} className="flex items-baseline justify-between gap-3 border-b border-amber-100 pb-1">
            <dt className="text-slate-600">{r.label}</dt>
            <dd className="text-right text-slate-900"><span className="text-slate-500">{r.from}</span> &rarr; <strong>{r.to}</strong>{r.delta && <span className="ml-1.5 text-xs text-amber-800">({r.delta})</span>}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function CRCard({ p, cr }: { p: Project; cr: CR }) {
  const pending = cr.status === "Pending";
  return (
    <Card className={pending ? "border-amber-300 ring-1 ring-amber-200" : ""}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-mono text-slate-500">{cr.code}</p>
          <h3 className="text-base font-semibold text-slate-900">{cr.title}</h3>
          <p className="mt-0.5 text-xs text-slate-500">Requested {fmtDate(cr.requested_date)} by {cr.requested_by}</p>
        </div>
        <StatusBadge value={cr.status} />
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Description</p>
          <p className="mt-1 text-sm text-slate-700">{cr.description}</p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Justification</p>
          <p className="mt-1 text-sm text-slate-700">{cr.justification}</p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
        <Badge tone={cr.cost_impact > 0 ? "amber" : "green"}>Cost {signedPkr(cr.cost_impact)}</Badge>
        <Badge tone={cr.schedule_impact_days > 0 ? "amber" : "green"}>Schedule {sign(cr.schedule_impact_days)} days</Badge>
        {cr.requirements.map((r) => (
          <span key={r.id} className="inline-flex items-center gap-1 rounded-full bg-slate-50 px-2 py-0.5 text-xs ring-1 ring-inset ring-slate-200">
            <span className="font-mono text-slate-500">{r.code}</span> {r.title} <StatusBadge value={r.status} />
          </span>
        ))}
      </div>

      {pending ? (
        <div className="mt-5 space-y-4">
          <Impact p={p} cr={cr} />
          <ActionForm action={decideChangeRequest} className="grid gap-3 md:grid-cols-6">
            <input type="hidden" name="id" value={cr.id} />
            <Field label="Decision by" className="md:col-span-2"><input name="decision_by" defaultValue="Hospital Management Board" className={inputCls} required /></Field>
            <Field label="Decision date"><input type="date" name="decision_date" defaultValue={p.status_date < cr.requested_date ? cr.requested_date : p.status_date} className={inputCls} required /></Field>
            <Field label="Notes" className="md:col-span-3"><input name="decision_notes" className={inputCls} placeholder="Optional" /></Field>
            <div className="flex gap-2 md:col-span-6">
              <SubmitButton label="Approve change request" variant="success" name="intent" value="approve" pendingLabel="Applying..." confirm={`Approve ${cr.code}? Scope, budget and deadline will change.`} />
              <SubmitButton label="Reject" variant="danger" name="intent" value="reject" pendingLabel="Rejecting..." confirm={`Reject ${cr.code}?`} />
            </div>
          </ActionForm>
        </div>
      ) : (
        <div className="mt-4 rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-700">
          <strong>{cr.status}</strong> by {cr.decision_by} on {fmtDate(cr.decision_date)}.
          {cr.decision_notes && <span className="text-slate-500"> {cr.decision_notes}</span>}
        </div>
      )}
    </Card>
  );
}

export default function ChangesPage() {
  const p = getProject();
  if (!p) return <NoProject />;
  const crs = getChangeRequests(p.id);
  const audit = getAudit(8);
  const dBudget = p.current_budget - p.original_budget;
  const dWeeks = weeksInclusive(p.start_date, p.deadline) - weeksInclusive(p.start_date, p.original_deadline);

  return (
    <>
      <PageHeader title="Change requests" subtitle="Every change records its justification, cost impact, schedule impact and approval status. Approving one updates scope, budget and deadline automatically." />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Stat label="Baseline budget" value={pkr(p.original_budget)} sub={`Current ${pkr(p.current_budget)}${dBudget ? ` (${signedPkr(dBudget)})` : ""}`} tone={dBudget ? "amber" : "teal"} />
        <Stat label="Baseline duration" value={`${weeksInclusive(p.start_date, p.original_deadline)} weeks`} sub={`Current ${weeksInclusive(p.start_date, p.deadline)} weeks${dWeeks ? ` (${dWeeks > 0 ? "+" : ""}${dWeeks})` : ""}`} tone={dWeeks ? "amber" : "teal"} />
        <Stat label="Current deadline" value={fmtDate(p.deadline)} sub={`Baseline ${fmtDate(p.original_deadline)}`} tone={p.deadline !== p.original_deadline ? "amber" : "teal"} />
      </div>

      <div className="space-y-5">
        {crs.length === 0 && <Card><p className="text-sm text-slate-500">No change requests yet.</p></Card>}
        {crs.map((cr) => <CRCard key={cr.id} p={p} cr={cr} />)}
      </div>

      <Card title="Raise a new change request" description="The proposed requirements stay outside the approved scope until the request is approved." className="mt-6">
        <ActionForm action={createChangeRequest} resetOnSuccess className="grid gap-4 md:grid-cols-6">
          <input type="hidden" name="project_id" value={p.id} />
          <Field label="Title" className="md:col-span-4"><input name="title" className={inputCls} required /></Field>
          <Field label="Request date" className="md:col-span-2"><input type="date" name="requested_date" defaultValue={p.status_date} className={inputCls} required /></Field>
          <Field label="Description" className="md:col-span-3"><textarea name="description" rows={3} className={inputCls} required /></Field>
          <Field label="Justification" className="md:col-span-3"><textarea name="justification" rows={3} className={inputCls} required /></Field>
          <Field label="Cost impact (PKR)" className="md:col-span-2"><input name="cost_impact" inputMode="numeric" className={inputCls} placeholder="800000" required /></Field>
          <Field label="Schedule impact (days)" className="md:col-span-2"><input name="schedule_impact_days" inputMode="numeric" className={inputCls} placeholder="21" required /></Field>
          <Field label="Requested by" className="md:col-span-2"><input name="requested_by" className={inputCls} required /></Field>
          <Field label="New requirements (one per line)" hint='Optional. Format: "Title" or "Title | Priority". They are created as Proposed.' className="md:col-span-6">
            <textarea name="requirements" rows={3} className={inputCls} placeholder={"Patient feedback portal | Medium\nAmbulance dispatch integration | High"} />
          </Field>
          <div className="md:col-span-6"><SubmitButton label="Submit change request" pendingLabel="Submitting..." /></div>
        </ActionForm>
      </Card>

      <Card title="Change history" description="Recorded automatically by the database when a decision is made." className="mt-6" padded={false}>
        {audit.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-slate-500">No decisions recorded yet. Approve or reject a change request to see its effect here.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {audit.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
                <Badge tone={a.action === "APPROVED" ? "green" : "red"}>{a.action}</Badge>
                <span className="text-slate-700">{a.details}</span>
                <span className="ml-auto text-xs text-slate-400">{a.created_at}</span>
              </li>
            ))}
          </ul>
        )}
        <div className="border-t border-slate-100 px-5 py-3 text-xs text-slate-500">
          See the updated scope in <Link href="/requirements" className="text-teal-700 hover:underline">Requirements</Link> and <Link href="/wbs" className="text-teal-700 hover:underline">WBS</Link>.
        </div>
      </Card>
    </>
  );
}
