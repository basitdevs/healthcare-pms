import Link from "next/link";
import { ActionForm, RowAction, SubmitButton } from "@/components/forms";
import { Badge, Card, EmptyRow, Field, NoProject, PageHeader, StatusBadge, inputCls, tdCls, thCls, toneFor } from "@/components/ui";
import { fmtDate } from "@/lib/format";
import { getProject, getRequirements, requirementCounts, type RequirementRow } from "@/lib/queries";
import { addRequirement, deleteRequirement, setRequirementStatus, updateRequirement } from "../actions/requirements";

const TYPES = ["Functional", "Non-Functional"];
const PRIORITIES = ["Critical", "High", "Medium", "Low"];
const FILTERS = ["All", "Approved", "Proposed", "Rejected", "Deferred"] as const;

function StatusActions({ r }: { r: RequirementRow }) {
  const set = (status: string, label: string, variant: "success" | "secondary" | "danger" | "warning") => (
    <RowAction key={status} action={setRequirementStatus} fields={{ id: r.id, status }} label={label} variant={variant} />
  );
  return (
    <div className="flex flex-wrap gap-1.5">
      {r.status !== "Approved" && set("Approved", "Approve", "success")}
      {r.status === "Approved" && set("Proposed", "Un-approve", "warning")}
      {r.status !== "Rejected" && set("Rejected", "Reject", "danger")}
      {r.status === "Proposed" && set("Deferred", "Defer", "secondary")}
      {(r.status === "Rejected" || r.status === "Deferred") && set("Proposed", "Reopen", "secondary")}
    </div>
  );
}

function EditRequirement({ r }: { r: RequirementRow }) {
  return (
    <details className="mt-2 group">
      <summary className="cursor-pointer text-xs font-medium text-teal-700 hover:underline">Edit details</summary>
      <ActionForm action={updateRequirement} className="mt-3 grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 md:grid-cols-2">
        <input type="hidden" name="id" value={r.id} />
        <Field label="Title" className="md:col-span-2"><input name="title" defaultValue={r.title} className={inputCls} required /></Field>
        <Field label="Description" className="md:col-span-2"><textarea name="description" rows={2} defaultValue={r.description ?? ""} className={inputCls} /></Field>
        <Field label="Type"><select name="type" defaultValue={r.type} className={inputCls}>{TYPES.map((t) => <option key={t}>{t}</option>)}</select></Field>
        <Field label="Priority"><select name="priority" defaultValue={r.priority} className={inputCls}>{PRIORITIES.map((t) => <option key={t}>{t}</option>)}</select></Field>
        <Field label="Source" className="md:col-span-2"><input name="source" defaultValue={r.source ?? ""} className={inputCls} /></Field>
        <div className="md:col-span-2"><SubmitButton label="Save changes" pendingLabel="Saving..." /></div>
      </ActionForm>
    </details>
  );
}

export default async function RequirementsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const p = getProject();
  if (!p) return <NoProject />;
  const { status } = await searchParams;
  const active = (FILTERS as readonly string[]).includes(status ?? "") && status !== "All" ? status : undefined;
  const rows = getRequirements(p.id, active);
  const counts = requirementCounts(p.id);
  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  return (
    <>
      <PageHeader
        title="Requirements"
        subtitle="Only approved requirements form the approved scope and can be placed in the WBS. Requirements raised by a change request become approved only when that change request is approved."
      />

      <div className="mb-4 flex flex-wrap gap-2">
        {FILTERS.map((f) => {
          const n = f === "All" ? total : counts[f];
          const on = (f === "All" && !active) || f === active;
          return (
            <Link
              key={f}
              href={f === "All" ? "/requirements" : `/requirements?status=${f}`}
              className={`rounded-full px-3.5 py-1.5 text-sm font-medium ring-1 ring-inset transition ${on ? "bg-teal-700 text-white ring-teal-700" : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50"}`}
            >
              {f} <span className={on ? "text-teal-100" : "text-slate-400"}>{n}</span>
            </Link>
          );
        })}
      </div>

      <Card padded={false}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[56rem]">
            <thead className="bg-slate-50"><tr>
              <th className={thCls}>Code</th><th className={thCls}>Requirement</th><th className={thCls}>Priority</th>
              <th className={thCls}>Status</th><th className={thCls}>Traceability</th><th className={thCls}>Decision</th>
            </tr></thead>
            <tbody className="divide-y divide-slate-100">
              {rows.length === 0 && <EmptyRow cols={6}>No requirements with this status.</EmptyRow>}
              {rows.map((r) => (
                <tr key={r.id} className={r.status === "Approved" ? "" : "bg-slate-50/40"}>
                  <td className={`${tdCls} font-mono text-xs text-slate-500`}>{r.code}</td>
                  <td className={tdCls}>
                    <p className="font-medium text-slate-900">{r.title}</p>
                    {r.description && <p className="mt-0.5 max-w-md text-xs text-slate-500">{r.description}</p>}
                    <p className="mt-1 text-xs text-slate-400">{r.type}{r.source ? ` · ${r.source}` : ""}</p>
                    <EditRequirement r={r} />
                  </td>
                  <td className={tdCls}><Badge tone={r.priority === "Critical" ? "red" : toneFor(r.priority)}>{r.priority}</Badge></td>
                  <td className={tdCls}>
                    <StatusBadge value={r.status} />
                    {r.approved_date && <p className="mt-1 text-xs text-slate-400">{fmtDate(r.approved_date)}</p>}
                  </td>
                  <td className={tdCls}>
                    {r.cr_code && <p className="text-xs"><Link href="/changes" className="font-medium text-teal-700 hover:underline">{r.cr_code}</Link> <span className="text-slate-400">({r.cr_status})</span></p>}
                    <p className="text-xs text-slate-500">{r.wbs_count ? `In WBS (${r.wbs_count})` : r.status === "Approved" ? "Not in WBS yet" : "Not in approved scope"}</p>
                  </td>
                  <td className={tdCls}>
                    <StatusActions r={r} />
                    <div className="mt-1.5"><RowAction action={deleteRequirement} fields={{ id: r.id }} label="Delete" variant="danger" confirm={`Delete ${r.code}?`} /></div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="Add requirement" description="New requirements start as Proposed unless you approve them here." className="mt-6">
        <ActionForm action={addRequirement} resetOnSuccess className="grid gap-4 md:grid-cols-4">
          <input type="hidden" name="project_id" value={p.id} />
          <Field label="Title" className="md:col-span-4"><input name="title" className={inputCls} required /></Field>
          <Field label="Description" className="md:col-span-4"><textarea name="description" rows={2} className={inputCls} /></Field>
          <Field label="Type"><select name="type" defaultValue="Functional" className={inputCls}>{TYPES.map((t) => <option key={t}>{t}</option>)}</select></Field>
          <Field label="Priority"><select name="priority" defaultValue="Medium" className={inputCls}>{PRIORITIES.map((t) => <option key={t}>{t}</option>)}</select></Field>
          <Field label="Initial status"><select name="status" defaultValue="Proposed" className={inputCls}><option>Proposed</option><option>Approved</option></select></Field>
          <Field label="Source"><input name="source" className={inputCls} placeholder="Who asked for it?" /></Field>
          <div className="md:col-span-4"><SubmitButton label="Add requirement" pendingLabel="Adding..." /></div>
        </ActionForm>
      </Card>
    </>
  );
}
