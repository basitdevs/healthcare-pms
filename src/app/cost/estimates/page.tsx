import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Card, NoProject, PageHeader, Stat, StatusBadge, tdCls, thCls } from "@/components/ui";
import { num, pkr } from "@/lib/format";
import { getEvm, getProject } from "@/lib/queries";
import { updateEstimate } from "../../actions/cost";

const linkCls = "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50";

function BudgetBar({ approved, bac, ac }: { approved: number; bac: number; ac: number }) {
  const max = Math.max(approved, bac, ac) || 1;
  const bars = [
    { label: "Approved budget", v: approved, cls: "bg-violet-500" },
    { label: "Allocated (BAC)", v: bac, cls: "bg-teal-600" },
    { label: "Actual cost (AC)", v: ac, cls: ac > bac ? "bg-red-500" : "bg-sky-500" },
  ];
  return (
    <div className="space-y-2.5">
      {bars.map((b) => (
        <div key={b.label} className="grid grid-cols-[9rem_1fr_9rem] items-center gap-3 text-sm">
          <span className="text-slate-600">{b.label}</span>
          <div className="h-4 overflow-hidden rounded bg-slate-100"><div className={`h-full ${b.cls}`} style={{ width: `${(b.v / max) * 100}%` }} /></div>
          <span className="text-right font-medium text-slate-900">{pkr(b.v)}</span>
        </div>
      ))}
    </div>
  );
}

export default function EstimatesPage() {
  const p = getProject();
  const e = p && getEvm(p.id);
  if (!p || !e) return <NoProject />;
  const f = e.analysis.forecast;
  const groups = e.byDeliverable.map((g) => ({ ...g, tasks: e.tasks.filter((t) => t.deliverable_code === g.key) }));

  return (
    <>
      <PageHeader title="Cost estimates" subtitle="Activity estimates make up the BAC. The database rejects any change that would push the total above the approved budget.">
        <Link href="/cost" className={linkCls}>EVM dashboard</Link>
        <Link href="/cost/entries" className={linkCls}>Actual costs</Link>
      </PageHeader>

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Stat label="Approved budget" value={pkr(f.approvedBudget)} tone="violet" sub={f.approvedBudget !== p.original_budget ? `Baseline ${pkr(p.original_budget)}` : "Original baseline"} />
        <Stat label="Allocated (BAC)" value={pkr(f.bac)} tone="teal" sub={`${e.tasks.length} activities`} />
        <Stat label="Unallocated" value={pkr(f.unallocated)} tone={f.unallocated > 0 ? "amber" : "green"} sub={f.unallocated > 0 ? "Room for new activities" : "Budget fully allocated"} />
      </div>

      <Card title="Budget vs allocated vs actual" className="mb-6"><BudgetBar approved={f.approvedBudget} bac={f.bac} ac={e.analysis.project.ac} /></Card>

      <div className="space-y-6">
        {groups.map((g) => (
          <Card key={g.key} title={g.label} description={`Estimate ${pkr(g.bac)} · actual ${pkr(g.ac)} · ${g.tasks.length} activities`} padded={false}>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[48rem]">
                <thead className="bg-slate-50"><tr>
                  <th className={thCls}>Activity</th><th className={thCls}>Status</th><th className={thCls}>Estimate (PKR)</th>
                  <th className={thCls}>Actual (PKR)</th><th className={thCls}>Remaining / over</th>
                </tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {g.tasks.map((t) => {
                    const left = t.estimated_cost - t.ac;
                    return (
                      <tr key={t.id}>
                        <td className={tdCls}><p className="font-medium text-slate-900"><span className="font-mono text-slate-500">{t.code}</span> {t.name}</p><p className="text-xs text-slate-500">{t.wp_code} {t.wp_name}</p></td>
                        <td className={tdCls}><StatusBadge value={t.status} /></td>
                        <td className={tdCls}>
                          <ActionForm action={updateEstimate} className="flex items-center gap-1.5" inlineError={false}>
                            <input type="hidden" name="id" value={t.id} />
                            <input name="estimated_cost" defaultValue={t.estimated_cost} inputMode="numeric" aria-label={`Estimate for ${t.code}`}
                              className="w-28 rounded-md border border-slate-300 bg-white px-2 py-1 text-right text-sm" required />
                            <SubmitButton label="Save" small variant="secondary" />
                          </ActionForm>
                        </td>
                        <td className={tdCls}>{num(t.ac)}</td>
                        <td className={`${tdCls} ${left < 0 ? "font-semibold text-red-700" : "text-slate-600"}`}>{left < 0 ? `over by ${num(-left)}` : num(left)}</td>
                      </tr>
                    );
                  })}
                  <tr className="bg-slate-50 font-semibold">
                    <td className={tdCls} colSpan={2}>Deliverable total</td><td className={tdCls}>{num(g.bac)}</td><td className={tdCls}>{num(g.ac)}</td>
                    <td className={`${tdCls} ${g.bac - g.ac < 0 ? "text-red-700" : ""}`}>{num(g.bac - g.ac)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Card>
        ))}
      </div>
    </>
  );
}
