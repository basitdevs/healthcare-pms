import Link from "next/link";
import { ActionForm, RowAction, SubmitButton } from "@/components/forms";
import { Card, EmptyRow, Field, NoProject, PageHeader, Stat, StatusBadge, inputCls, tdCls, thCls } from "@/components/ui";
import { fmtDate } from "@/lib/format";
import { getProject, getQuality, getTeam, getWbsTree } from "@/lib/queries";
import { fmtRate } from "@/lib/quality";
import { addChecklistItem, addInspection, deleteChecklistItem, deleteInspection } from "../../actions/quality";

const linkCls = "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50";
const small = "rounded-md border border-slate-300 bg-white px-2 py-1 text-xs";

export default function ChecklistPage() {
  const p = getProject();
  if (!p) return <NoProject />;
  const q = getQuality(p.id);
  const team = getTeam(p.id);
  const wbs = getWbsTree(p.id).flat.filter((w) => w.node_type !== "Project");
  const o = q.checklist;
  const qa = team.find((m) => m.role === "QA Engineer")?.id;

  return (
    <>
      <PageHeader title="Quality checklist" subtitle="Acceptance criteria per WBS deliverable or work package, with every inspection and test recorded. The latest result of each item counts.">
        <Link href="/quality" className={linkCls}>Defects</Link>
      </PageHeader>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Pass rate (all items)" value={fmtRate(o.rate)} tone={o.rate !== null && o.rate >= 0.8 ? "green" : "amber"} sub={`${o.pass} of ${o.items} items pass`} />
        <Stat label="Pass rate (inspected)" value={fmtRate(o.inspectedRate)} tone="teal" sub={`${o.pass} of ${o.pass + o.fail} items with a Pass/Fail result`} />
        <Stat label="Failing" value={o.fail} tone={o.fail ? "red" : "green"} sub="Latest result is Fail" />
        <Stat label="Pending / not inspected" value={o.pending + o.none} tone="amber" sub={`${o.pending} pending · ${o.none} never inspected`} />
      </div>

      <Card title="Pass rate by WBS item" padded={false} className="mb-6">
        <table className="w-full">
          <thead className="bg-slate-50"><tr>
            <th className={thCls}>WBS item</th><th className={thCls}>Items</th><th className={thCls}>Pass</th><th className={thCls}>Fail</th><th className={thCls}>Pending</th><th className={thCls}>Pass rate</th>
          </tr></thead>
          <tbody className="divide-y divide-slate-100">
            {q.groups.length === 0 && <EmptyRow cols={6}>No checklist items yet.</EmptyRow>}
            {q.groups.map((g) => (
              <tr key={g.wbs_item_id}>
                <td className={tdCls}><span className="font-mono text-slate-500">{g.code}</span> {g.name}</td>
                <td className={tdCls}>{g.items}</td><td className={tdCls}>{g.pass}</td>
                <td className={`${tdCls} ${g.fail ? "font-semibold text-red-700" : ""}`}>{g.fail}</td><td className={tdCls}>{g.pending + g.none}</td>
                <td className={tdCls}>
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-100"><div className="h-full bg-emerald-500" style={{ width: `${(g.rate ?? 0) * 100}%` }} /></div>
                    {fmtRate(g.rate)}
                  </div>
                </td>
              </tr>
            ))}
            <tr className="bg-slate-50 font-semibold">
              <td className={tdCls}>Overall</td><td className={tdCls}>{o.items}</td><td className={tdCls}>{o.pass}</td><td className={tdCls}>{o.fail}</td><td className={tdCls}>{o.pending + o.none}</td><td className={tdCls}>{fmtRate(o.rate)}</td>
            </tr>
          </tbody>
        </table>
      </Card>

      <div className="space-y-6">
        {q.groups.map((g) => (
          <Card key={g.wbs_item_id} title={`${g.code} ${g.name}`} description={`${g.node_type} · ${g.pass}/${g.items} passing`} padded={false}>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[60rem]">
                <thead className="bg-slate-50"><tr>
                  <th className={thCls}>Criterion</th><th className={thCls}>Latest result</th><th className={thCls}>Record inspection / test</th><th className={thCls}></th>
                </tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {g.list.map((it) => {
                    const last = q.latest.get(it.id);
                    const history = q.inspections.filter((i) => i.checklist_item_id === it.id);
                    return (
                      <tr key={it.id} className={last?.result === "Fail" ? "bg-red-50/50" : undefined}>
                        <td className={tdCls}>
                          <p className="font-medium text-slate-900">{it.criterion}</p>
                          {history.length > 0 && (
                            <details className="mt-1 text-xs text-slate-600">
                              <summary className="cursor-pointer text-slate-500 hover:text-slate-800">History ({history.length})</summary>
                              <ul className="mt-1 space-y-1">
                                {history.map((h) => (
                                  <li key={h.id} className="flex flex-wrap items-center gap-1.5">
                                    <StatusBadge value={h.result} /> {h.inspection_type} {fmtDate(h.inspected_on)} by {h.inspector}{h.notes ? ` - ${h.notes}` : ""}
                                    <RowAction action={deleteInspection} fields={{ id: h.id }} label="×" variant="danger" confirm="Delete this inspection record?" />
                                  </li>
                                ))}
                              </ul>
                            </details>
                          )}
                        </td>
                        <td className={tdCls}>
                          {last ? <><StatusBadge value={last.result} /><p className="mt-1 text-xs text-slate-500">{last.inspection_type} · {fmtDate(last.inspected_on)}</p></> : <span className="text-xs text-slate-400">Not inspected</span>}
                          {last?.result === "Fail" && it.task_id && (
                            <Link href={`/quality?task=${it.task_id}&title=${encodeURIComponent(`Failed check: ${it.criterion}`)}#add`}
                              className="mt-1.5 inline-flex rounded-lg bg-red-600 px-2 py-0.5 text-xs font-medium text-white hover:bg-red-700">Log defect</Link>
                          )}
                        </td>
                        <td className={tdCls}>
                          <ActionForm action={addInspection} resetOnSuccess inlineError={false} className="flex flex-wrap items-center gap-1.5">
                            <input type="hidden" name="checklist_item_id" value={it.id} />
                            <select name="inspection_type" className={small} aria-label="Type"><option>Test</option><option>Inspection</option></select>
                            <select name="result" className={small} aria-label="Result"><option>Pass</option><option>Fail</option><option>Pending</option></select>
                            <input type="date" name="inspected_on" defaultValue={p.status_date} max={p.status_date} className={small} aria-label="Date" required />
                            <select name="inspector_id" defaultValue={qa ?? ""} className={small} aria-label="Inspector" required>{team.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select>
                            <input name="notes" placeholder="Notes" className={`${small} w-32`} aria-label="Notes" />
                            <SubmitButton label="Record" small />
                          </ActionForm>
                        </td>
                        <td className={`${tdCls} text-right`}>
                          <RowAction action={deleteChecklistItem} fields={{ id: it.id }} label="Delete" variant="danger" confirm="Delete this checklist item and its inspection history?" />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        ))}
      </div>

      <Card title="Add a checklist item" className="mt-6">
        <ActionForm action={addChecklistItem} resetOnSuccess className="grid gap-4 md:grid-cols-6">
          <Field label="Deliverable or work package" className="md:col-span-2">
            <select name="wbs_item_id" defaultValue="" className={inputCls} required>
              <option value="" disabled>Choose</option>
              {wbs.map((w) => <option key={w.id} value={w.id}>{w.code} {w.name} ({w.node_type})</option>)}
            </select>
          </Field>
          <Field label="Acceptance criterion" className="md:col-span-3"><input name="criterion" className={inputCls} placeholder="e.g. Invoice totals match billed services" required /></Field>
          <div className="flex items-end"><SubmitButton label="Add item" pendingLabel="Adding..." /></div>
        </ActionForm>
      </Card>
    </>
  );
}
