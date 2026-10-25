import { ActionForm, RowAction, SubmitButton } from "@/components/forms";
import { Badge, Card, Field, NoProject, PageHeader, StatusBadge, inputCls } from "@/components/ui";
import { num, pkr } from "@/lib/format";
import { approvedRequirements, getProject, getRequirements, getWbsTree, type WbsNode } from "@/lib/queries";
import { addWbsItem, deleteWbsItem, renameWbsItem } from "../actions/wbs";

const typeTone = { Project: "teal", Deliverable: "blue", "Work Package": "slate" } as const;

function TreeNode({ n }: { n: WbsNode }) {
  const isLeaf = n.node_type === "Work Package";
  return (
    <li>
      <div className="group rounded-lg border border-transparent px-2 py-2 hover:border-slate-200 hover:bg-slate-50">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="w-14 shrink-0 font-mono text-xs text-slate-500">{n.code}</span>
          <span className={`min-w-0 flex-1 text-sm ${n.node_type === "Work Package" ? "text-slate-800" : "font-semibold text-slate-900"}`}>{n.name}</span>
          <Badge tone={typeTone[n.node_type as keyof typeof typeTone] ?? "slate"}>{n.node_type}</Badge>
          {n.req_code && (
            <span className="inline-flex items-center gap-1">
              <Badge tone="teal">{n.req_code}</Badge>
              {n.req_status !== "Approved" && <StatusBadge value={n.req_status ?? ""} />}
            </span>
          )}
          <span className="w-44 shrink-0 text-right text-xs tabular-nums text-slate-500">
            {n.tasks > 0 ? `${num(n.tasks)} task${n.tasks > 1 ? "s" : ""} · ${pkr(n.cost)}` : isLeaf ? "no tasks yet" : ""}
          </span>
        </div>
        {n.node_type !== "Project" && (
          <div className="mt-1.5 flex flex-wrap items-start gap-3 pl-[4.25rem]">
            <details>
              <summary className="cursor-pointer text-xs font-medium text-teal-700 hover:underline">Rename</summary>
              <ActionForm action={renameWbsItem} className="mt-2 flex flex-wrap items-end gap-2 rounded-lg border border-slate-200 bg-white p-3">
                <input type="hidden" name="id" value={n.id} />
                <Field label="Name"><input name="name" defaultValue={n.name} className={`${inputCls} w-64`} required /></Field>
                <Field label="Description"><input name="description" defaultValue={n.description ?? ""} className={`${inputCls} w-64`} /></Field>
                <SubmitButton label="Save" small />
              </ActionForm>
            </details>
            <RowAction action={deleteWbsItem} fields={{ id: n.id }} label="Delete" variant="danger" confirm={`Delete ${n.code} ${n.name}?`} />
          </div>
        )}
      </div>
      {n.children.length > 0 && (
        <ul className="ml-5 border-l border-slate-200 pl-3">
          {n.children.map((c) => <TreeNode key={c.id} n={c} />)}
        </ul>
      )}
    </li>
  );
}

export default function WbsPage() {
  const p = getProject();
  if (!p) return <NoProject />;
  const { root, flat } = getWbsTree(p.id);
  const deliverables = flat.filter((w) => w.node_type === "Deliverable");
  const allReqs = getRequirements(p.id);
  const approved = allReqs.filter((r) => r.status === "Approved");
  const notApproved = allReqs.filter((r) => r.status !== "Approved" && r.status !== "Rejected");
  const rejected = allReqs.filter((r) => r.status === "Rejected");
  const coverage = approvedRequirements(p.id);
  const uncovered = coverage.filter((c) => c.wbs_count === 0);

  return (
    <>
      <PageHeader
        title="Work breakdown structure"
        subtitle="Project > deliverables > work packages. Each work package traces to an approved requirement. Costs roll up from the scheduled tasks."
      />

      <div className="grid gap-6 xl:grid-cols-3">
        <Card title="WBS" className="xl:col-span-2">
          {root ? <ul><TreeNode n={root} /></ul> : <p className="text-sm text-slate-500">No WBS yet.</p>}
        </Card>

        <div className="space-y-6">
          <Card title="Add deliverable">
            <ActionForm action={addWbsItem} resetOnSuccess className="space-y-3">
              <input type="hidden" name="project_id" value={p.id} />
              <input type="hidden" name="node_type" value="Deliverable" />
              <Field label="Name"><input name="name" className={inputCls} required /></Field>
              <Field label="Description"><input name="description" className={inputCls} /></Field>
              <SubmitButton label="Add deliverable" pendingLabel="Adding..." />
            </ActionForm>
          </Card>

          <Card title="Add work package" description="Link it to the requirement it delivers.">
            <ActionForm action={addWbsItem} resetOnSuccess className="space-y-3">
              <input type="hidden" name="project_id" value={p.id} />
              <input type="hidden" name="node_type" value="Work Package" />
              <Field label="Deliverable">
                <select name="parent_id" defaultValue="" className={inputCls} required>
                  <option value="" disabled>Choose a deliverable</option>
                  {deliverables.map((d) => <option key={d.id} value={d.id}>{d.code} {d.name}</option>)}
                </select>
              </Field>
              <Field label="Name"><input name="name" className={inputCls} required /></Field>
              <Field label="Requirement" hint="Only approved requirements are accepted. Picking any other one will be rejected by the scope rule.">
                <select name="requirement_id" defaultValue="" className={inputCls}>
                  <option value="">None (management or support work)</option>
                  <optgroup label="Approved scope">{approved.map((r) => <option key={r.id} value={r.id}>{r.code} {r.title}</option>)}</optgroup>
                  {notApproved.length > 0 && <optgroup label="Not approved (blocked)">{notApproved.map((r) => <option key={r.id} value={r.id}>{r.code} {r.title} [{r.status}]</option>)}</optgroup>}
                  {rejected.length > 0 && <optgroup label="Rejected (blocked)">{rejected.map((r) => <option key={r.id} value={r.id}>{r.code} {r.title} [Rejected]</option>)}</optgroup>}
                </select>
              </Field>
              <Field label="Description"><input name="description" className={inputCls} /></Field>
              <SubmitButton label="Add work package" pendingLabel="Adding..." />
            </ActionForm>
          </Card>

          <Card title="Requirement coverage" description="Every approved requirement should appear in the WBS.">
            {uncovered.length === 0 ? (
              <p className="text-sm text-emerald-700">All {coverage.length} approved requirements are covered by the WBS.</p>
            ) : (
              <>
                <p className="mb-2 text-sm text-amber-700">{uncovered.length} approved requirement{uncovered.length > 1 ? "s" : ""} not yet in the WBS:</p>
                <ul className="space-y-1 text-sm text-slate-700">
                  {uncovered.map((u) => <li key={u.id}><span className="font-mono text-xs text-slate-500">{u.code}</span> {u.title}</li>)}
                </ul>
              </>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
