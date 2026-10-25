import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Card, Field, NoProject, PageHeader, inputCls } from "@/components/ui";
import { fmtDate, pkr, weeksInclusive } from "@/lib/format";
import { fmtRatio } from "@/lib/evm";
import { getEvm, getPlan, getProject, getQuality, getSchedule, planGlance } from "@/lib/queries";
import { fmtRate } from "@/lib/quality";
import { savePlan } from "../actions/plan";

export default function PlanPage() {
  const p = getProject();
  if (!p) return <NoProject />;
  const plan = getPlan(p.id);
  const g = planGlance(p.id);
  const sched = getSchedule(p.id)!.analysis;
  const evm = getEvm(p.id)!.analysis;
  const q = getQuality(p.id);

  const tiles = [
    { title: "Scope", href: "/requirements", lines: [`${g.approvedReqs} approved requirements`, `${g.workPackages} WBS work packages`] },
    { title: "Schedule", href: "/schedule", lines: [`${g.tasks} activities`, `Deadline ${fmtDate(p.deadline)} (${weeksInclusive(p.start_date, p.deadline)} wks)`, g.plannedFinish ? `Planned finish ${fmtDate(g.plannedFinish)}` : "No activities scheduled", sched.projectedFinish ? `Projected finish ${fmtDate(sched.projectedFinish)} (${sched.marginDays! < 0 ? `misses deadline by ${-sched.marginDays!} d` : `${sched.marginDays} d margin`})` : "No forecast", `${sched.delayed.length} delayed, ${sched.impacted.length} impacted activities`] },
    { title: "Cost", href: "/cost", lines: [`Approved budget ${pkr(p.current_budget)}`, `BAC ${pkr(evm.forecast.bac)} (unallocated ${pkr(evm.forecast.unallocated)})`, `EAC ${evm.forecast.eac === null ? "n/a" : pkr(evm.forecast.eac)}`, `CPI ${fmtRatio(evm.project.cpi)} · SPI ${fmtRatio(evm.project.spi)}`] },
    { title: "Quality & risk", href: "/quality", lines: [`${q.counts.unresolvedCritical} unresolved critical defects (${q.counts.unresolved} unresolved)`, `Checklist pass rate ${fmtRate(q.checklist.rate)} (${q.checklist.pass}/${q.checklist.items})`, `Top risks: ${q.risks.slice(0, 3).map((r) => `${r.code} (${r.score})`).join(", ") || "none"}`] },
  ];

  return (
    <>
      <PageHeader title="Project management plan" subtitle="Describes how scope, schedule, cost and quality are planned, monitored and controlled." />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {tiles.map((t) => (
          <Link key={t.title} href={t.href} className="group rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-teal-300 hover:shadow">
            <p className="text-xs font-semibold uppercase tracking-wide text-teal-700">{t.title}</p>
            <ul className="mt-2 space-y-1 text-sm text-slate-700">{t.lines.map((l) => <li key={l}>{l}</li>)}</ul>
            <p className="mt-3 text-xs text-slate-400 group-hover:text-teal-700">Live figures from the database</p>
          </Link>
        ))}
      </div>

      <Card title="Plan content" description={plan ? `Version ${plan.version} - last updated ${fmtDate(plan.updated_on)}` : "No plan saved yet."}>
        <ActionForm action={savePlan} className="space-y-4">
          <input type="hidden" name="project_id" value={p.id} />
          <Field label="Version" className="max-w-40"><input name="version" defaultValue={plan?.version ?? "1.0"} className={inputCls} required /></Field>
          <Field label="Scope management plan"><textarea name="scope_plan" rows={4} defaultValue={plan?.scope_plan ?? ""} className={inputCls} required /></Field>
          <Field label="Schedule management plan"><textarea name="schedule_plan" rows={4} defaultValue={plan?.schedule_plan ?? ""} className={inputCls} required /></Field>
          <Field label="Cost management plan"><textarea name="cost_plan" rows={4} defaultValue={plan?.cost_plan ?? ""} className={inputCls} required /></Field>
          <Field label="Quality management plan"><textarea name="quality_plan" rows={4} defaultValue={plan?.quality_plan ?? ""} className={inputCls} required /></Field>
          <SubmitButton label="Save plan" pendingLabel="Saving..." />
        </ActionForm>
      </Card>
    </>
  );
}
