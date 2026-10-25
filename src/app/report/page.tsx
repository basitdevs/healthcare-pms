import type { ReactNode } from "react";
import { PrintButton } from "@/components/PrintButton";
import { SCurve } from "@/components/SCurve";
import { NoProject } from "@/components/ui";
import { summarise } from "@/lib/consistency";
import { fmtMoney, fmtPct, fmtRatio } from "@/lib/evm";
import { fmtDate, num, pkr, signedPkr, weeksInclusive } from "@/lib/format";
import { fmtRate } from "@/lib/quality";
import {
  getChangeRequests, getConsistency, getDashboard, getProject, getRequirements, getStakeholders, getTeam, getWbsTree,
} from "@/lib/queries";

const th = "border-b border-slate-300 px-2 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500";
const td = "border-b border-slate-100 px-2 py-1.5 align-top text-xs text-slate-800";

function Section({ n, title, children, first = false }: { n: number; title: string; children: ReactNode; first?: boolean }) {
  return (
    <section className={`mb-8 ${first ? "" : "print:break-before-page"}`}>
      <h2 className="mb-3 border-b-2 border-teal-700 pb-1 text-lg font-semibold text-slate-900">{n}. {title}</h2>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function Table({ head, rows }: { head: string[]; rows: ReactNode[][] }) {
  return (
    <table className="w-full border-collapse break-inside-auto">
      <thead><tr>{head.map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
      <tbody>{rows.map((r, i) => <tr key={i} className="break-inside-avoid">{r.map((c, j) => <td key={j} className={td}>{c}</td>)}</tr>)}</tbody>
    </table>
  );
}

const KV = ({ items }: { items: [string, ReactNode][] }) => (
  <dl className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm sm:grid-cols-4">
    {items.map(([k, v]) => <div key={k}><dt className="text-[11px] uppercase tracking-wide text-slate-500">{k}</dt><dd className="font-semibold text-slate-900">{v}</dd></div>)}
  </dl>
);

export default function ReportPage() {
  const p = getProject();
  const d = p && getDashboard(p.id);
  if (!p || !d) return <NoProject />;
  const a = d.evm.analysis, s = d.sched.analysis, q = d.quality;
  const checks = getConsistency(p.id) ?? [];
  const sum = summarise(checks);
  const team = getTeam(p.id);

  return (
    <article className="bg-white print:text-black">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-teal-700">Project status report · {p.code}</p>
          <h1 className="text-2xl font-semibold text-slate-900">{p.name}</h1>
          <p className="text-sm text-slate-600">As of {fmtDate(p.status_date)} · Sponsor: {p.sponsor} · Overall health: <strong>{d.health.rag}</strong></p>
        </div>
        <PrintButton />
      </div>

      <Section n={1} title="Initiation & integration" first>
        <KV items={[
          ["Start", fmtDate(p.start_date)], ["Deadline", `${fmtDate(p.deadline)} (${weeksInclusive(p.start_date, p.deadline)} wks)`],
          ["Approved budget", pkr(p.current_budget)], ["Phase", p.status],
        ]} />
        <p className="text-sm"><strong>Health {d.health.rag}:</strong> {d.health.reasons.join("; ")}.</p>
        <Table head={["Item", "Baseline", "Current"]} rows={d.baseline.map((r) => [r.label, typeof r.baseline === "string" ? fmtDate(r.baseline) : num(r.baseline), typeof r.current === "string" ? fmtDate(r.current) : num(r.current)])} />
        <Table head={["Stakeholder", "Role", "Influence", "Interest"]} rows={getStakeholders(p.id).map((x) => [x.name, x.role, x.influence, x.interest])} />
        <Table head={["Team member", "Role", "Open tasks"]} rows={team.map((m) => [m.name, m.role, m.task_codes ?? "-"])} />
        <Table head={["Milestone", "Target", "Forecast", "Status"]} rows={d.sched.milestones.map((m) => [m.name, fmtDate(m.target_date), fmtDate(m.forecast_date), m.display_status])} />
      </Section>

      <Section n={2} title="Scope & WBS">
        <Table head={["Code", "Requirement", "Type", "Priority", "Status", "CR"]} rows={getRequirements(p.id).map((r) => [r.code, r.title, r.type, r.priority, r.status, r.cr_code ?? "-"])} />
        <Table head={["WBS", "Name", "Type", "Requirement", "Tasks", "Cost (PKR)"]}
          rows={getWbsTree(p.id).flat.map((w) => [w.code, w.name, w.node_type, w.req_code ?? "-", w.task_count, num(w.own_cost)])} />
        <Table head={["CR", "Title", "Cost", "Days", "Status", "Decision"]}
          rows={getChangeRequests(p.id).map((c) => [c.code, c.title, signedPkr(c.cost_impact), c.schedule_impact_days, c.status, c.decision_date ? `${c.decision_by}, ${fmtDate(c.decision_date)}` : "-"])} />
      </Section>

      <Section n={3} title="Schedule & resources">
        <KV items={[
          ["Planned finish", fmtDate(s.plannedFinish)], ["Projected finish", fmtDate(s.projectedFinish)],
          ["Margin vs deadline", s.marginDays === null ? "-" : `${s.marginDays} days`], ["Delayed / impacted", `${s.delayed.length} / ${s.impacted.length}`],
        ]} />
        <Table head={["Activity", "Planned end", "Forecast end", "Delay", "Cause", "Critical"]}
          rows={s.impact.map((x) => [`${x.task.code} ${x.task.name}`, fmtDate(x.task.planned_end), fmtDate(x.f.forecast_end), `+${x.f.delay_days} d`, x.f.cause, s.critical.has(x.task.id) ? "Yes" : ""])} />
        <p className="text-xs text-slate-600">Over-allocations: {s.overAllocations.length} · dependency conflicts: {s.conflicts.length}.</p>
      </Section>

      <Section n={4} title="Cost & earned value">
        <KV items={[
          ["PV", pkr(a.project.pv)], ["EV", pkr(a.project.ev)], ["AC", pkr(a.project.ac)], ["CV / SV", `${num(a.project.cv)} / ${num(a.project.sv)}`],
          ["CPI", fmtRatio(a.project.cpi)], ["SPI", fmtRatio(a.project.spi)], ["EAC", fmtMoney(a.forecast.eac)], ["VAC", fmtMoney(a.forecast.vac)],
          ["BAC", pkr(a.forecast.bac)], ["TCPI", fmtRatio(a.forecast.tcpi)], ["% complete", fmtPct(a.forecast.pctComplete)], ["% spent", fmtPct(a.forecast.pctSpent)],
        ]} />
        <div className="break-inside-avoid"><SCurve e={d.evm} /></div>
        <Table head={["Activity", "BAC", "PV", "EV", "AC", "CPI", "SPI"]}
          rows={a.rows.filter((r) => r.m.ac > 0 || r.m.pv > 0).map((r) => [`${r.task.code} ${r.task.name}`, num(r.m.bac), num(r.m.pv), num(r.m.ev), num(r.m.ac), fmtRatio(r.m.cpi), fmtRatio(r.m.spi)])} />
        <Table head={["Alert level", "Message"]} rows={a.alerts.map((x) => [x.level === "critical" ? "CRITICAL" : "WARNING", x.message])} />
      </Section>

      <Section n={5} title="Quality & risk">
        <KV items={[
          ["Defects", q.counts.total], ["Unresolved", q.counts.unresolved], ["Unresolved critical", q.counts.unresolvedCritical], ["Checklist pass rate", fmtRate(q.checklist.rate)],
        ]} />
        <Table head={["Defect", "Severity", "Status", "Task", "Requirement"]} rows={q.defects.map((x) => [`${x.code} ${x.title}`, x.severity, x.status, x.task_code, x.req_code ?? "-"])} />
        <Table head={["Rank", "Risk", "L", "I", "Score", "Rating", "Status", "Owner"]} rows={q.risks.map((r) => [r.rank, `${r.code} ${r.title}`, r.likelihood, r.impact, r.score, r.rating, r.status, r.owner])} />
        <Table head={["Risk", "Step", "Potential problem", "Type", "Countermeasure", "Status"]}
          rows={q.responses.map((r) => [r.risk_code, r.task_code ?? "General", r.potential_problem, r.response_type, r.action, r.status])} />
      </Section>

      <Section n={6} title="Integration & consistency">
        <p className="text-sm">{sum.pass} checks passed, {sum.warn} warnings, {sum.fail} failures.</p>
        <Table head={["Check", "Result", "Issues"]} rows={checks.map((c) => [`${c.id} ${c.title}`, c.status, c.issues.join("; ") || "-"])} />
      </Section>
    </article>
  );
}
