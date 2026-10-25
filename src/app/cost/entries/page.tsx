import Link from "next/link";
import { ActionForm, RowAction, SubmitButton } from "@/components/forms";
import { Card, EmptyRow, Field, NoProject, PageHeader, inputCls, tdCls, thCls } from "@/components/ui";
import { CATEGORIES } from "@/lib/evm";
import type { CostEntryRow, Evm } from "@/lib/evm-data";
import { fmtDate, num, pkr } from "@/lib/format";
import { getEvm, getProject } from "@/lib/queries";
import { addCostEntry, deleteCostEntry, updateCostEntry } from "../../actions/cost";

const linkCls = "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50";

function EntryFields({ e, entry, statusDate, startDate }: { e: Evm; entry?: CostEntryRow; statusDate: string; startDate: string }) {
  return (
    <>
      <Field label="Activity" className="md:col-span-2">
        <select name="task_id" defaultValue={entry?.task_id ?? ""} className={inputCls} required>
          <option value="" disabled>Choose an activity</option>
          {e.tasks.map((t) => <option key={t.id} value={t.id} disabled={t.status === "Not Started" && t.id !== entry?.task_id}>{t.code} {t.name}{t.status === "Not Started" ? " (not started)" : ""}</option>)}
        </select>
      </Field>
      <Field label="Date" hint={`${fmtDate(startDate)} to status date ${fmtDate(statusDate)}`}>
        <input type="date" name="entry_date" defaultValue={entry?.entry_date ?? statusDate} min={startDate} max={statusDate} className={inputCls} required />
      </Field>
      <Field label="Amount (PKR)"><input name="amount" inputMode="numeric" defaultValue={entry?.amount} placeholder="50000" className={inputCls} required /></Field>
      <Field label="Category">
        <select name="category" defaultValue={entry?.category ?? "Labor"} className={inputCls}>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select>
      </Field>
      <Field label="Description" className="md:col-span-3"><input name="description" defaultValue={entry?.description ?? ""} className={inputCls} placeholder="Optional" /></Field>
    </>
  );
}

export default async function EntriesPage({ searchParams }: { searchParams: Promise<{ [k: string]: string | string[] | undefined }> }) {
  const p = getProject();
  const e = p && getEvm(p.id);
  if (!p || !e) return <NoProject />;
  const sp = await searchParams;
  const editing = e.entries.find((x) => String(x.id) === sp.edit);
  const ledger = e.entries
    .map((x, i) => ({ ...x, running: e.entries.slice(0, i + 1).reduce((s, y) => s + y.amount, 0) }))
    .reverse(); // newest first
  const perTask = e.tasks.filter((t) => t.ac > 0 || e.entries.some((x) => x.task_id === t.id));
  const total = e.analysis.project.ac;

  return (
    <>
      <PageHeader title="Actual costs" subtitle={`Expenditure ledger. Costs can be booked up to the status date (${fmtDate(p.status_date)}) and only on activities that have started.`}>
        <Link href="/cost" className={linkCls}>EVM dashboard</Link>
        <Link href="/cost/estimates" className={linkCls}>Estimates</Link>
      </PageHeader>

      {editing ? (
        <Card title={`Edit cost entry #${editing.id}`} className="mb-6 border-teal-300 ring-1 ring-teal-200"
          actions={<Link href="/cost/entries" className="text-xs font-medium text-slate-500 hover:text-slate-800">Close</Link>}>
          <ActionForm key={editing.id} action={updateCostEntry} className="grid gap-4 md:grid-cols-5">
            <input type="hidden" name="id" value={editing.id} />
            <EntryFields e={e} entry={editing} statusDate={p.status_date} startDate={p.start_date} />
            <div className="flex items-end md:col-span-2"><SubmitButton label="Save changes" pendingLabel="Saving..." /></div>
          </ActionForm>
        </Card>
      ) : (
        <Card title="Book a cost" className="mb-6">
          <ActionForm action={addCostEntry} resetOnSuccess className="grid gap-4 md:grid-cols-5">
            <EntryFields e={e} statusDate={p.status_date} startDate={p.start_date} />
            <div className="flex items-end md:col-span-2"><SubmitButton label="Add cost entry" pendingLabel="Adding..." /></div>
          </ActionForm>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card title={`Ledger (${e.entries.length} entries)`} description={`Grand total ${pkr(total)}`} padded={false} className="lg:col-span-2">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[42rem]">
              <thead className="bg-slate-50"><tr>
                <th className={thCls}>Date</th><th className={thCls}>Activity</th><th className={thCls}>Category</th>
                <th className={`${thCls} text-right`}>Amount</th><th className={`${thCls} text-right`}>Running total</th><th className={thCls}></th>
              </tr></thead>
              <tbody className="divide-y divide-slate-100">
                {ledger.length === 0 && <EmptyRow cols={6}>No costs booked yet.</EmptyRow>}
                {ledger.map((x) => (
                  <tr key={x.id} className={editing?.id === x.id ? "bg-teal-50/50" : undefined}>
                    <td className={`${tdCls} whitespace-nowrap`}>{fmtDate(x.entry_date)}</td>
                    <td className={tdCls}><p><span className="font-mono text-slate-500">{x.task_code}</span> {x.task_name}</p>{x.description && <p className="text-xs text-slate-500">{x.description}</p>}</td>
                    <td className={tdCls}>{x.category}</td>
                    <td className={`${tdCls} text-right`}>{num(x.amount)}</td>
                    <td className={`${tdCls} text-right text-slate-500`}>{num(x.running)}</td>
                    <td className={`${tdCls} whitespace-nowrap text-right`}>
                      <div className="flex justify-end gap-1.5">
                        <Link href={`/cost/entries?edit=${x.id}`} className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50">Edit</Link>
                        <RowAction action={deleteCostEntry} fields={{ id: x.id }} label="Delete" variant="danger" confirm={`Delete ${pkr(x.amount)} on ${x.task_code}?`} />
                      </div>
                    </td>
                  </tr>
                ))}
                <tr className="bg-slate-50 font-semibold"><td className={tdCls} colSpan={3}>Grand total</td><td className={`${tdCls} text-right`}>{num(total)}</td><td colSpan={2}></td></tr>
              </tbody>
            </table>
          </div>
        </Card>

        <div className="space-y-6">
          <Card title="By category" padded={false}>
            <table className="w-full">
              <tbody className="divide-y divide-slate-100">
                {e.analysis.categories.map((c) => (
                  <tr key={c.category}><td className={tdCls}>{c.category}</td><td className={`${tdCls} text-right`}>{num(c.ac)}</td></tr>
                ))}
                <tr className="bg-slate-50 font-semibold"><td className={tdCls}>Total</td><td className={`${tdCls} text-right`}>{num(total)}</td></tr>
              </tbody>
            </table>
          </Card>
          <Card title="By activity" padded={false}>
            <table className="w-full">
              <thead className="bg-slate-50"><tr><th className={thCls}>Activity</th><th className={`${thCls} text-right`}>AC</th><th className={`${thCls} text-right`}>Estimate</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {perTask.map((t) => (
                  <tr key={t.id}>
                    <td className={tdCls}><span className="font-mono">{t.code}</span></td>
                    <td className={`${tdCls} text-right ${t.ac > t.estimated_cost ? "font-semibold text-red-700" : ""}`}>{num(t.ac)}</td>
                    <td className={`${tdCls} text-right text-slate-500`}>{num(t.estimated_cost)}</td>
                  </tr>
                ))}
                <tr className="bg-slate-50 font-semibold"><td className={tdCls}>Total</td><td className={`${tdCls} text-right`}>{num(total)}</td><td className={`${tdCls} text-right text-slate-500`}>{num(e.analysis.project.bac)}</td></tr>
              </tbody>
            </table>
          </Card>
        </div>
      </div>
    </>
  );
}
