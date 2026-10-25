// Project health and baseline-vs-current (Module 6). PURE functions - no database access.
import { weeksInclusive } from "./format";

export type Rag = "GREEN" | "AMBER" | "RED";

/**
 * RED   if CPI or SPI is below the critical threshold, or the projected finish is after the current deadline;
 * AMBER if there is any EVM alert, delayed task, pending change request or unresolved critical defect;
 * GREEN otherwise.
 */
export function projectHealth(i: {
  cpi: number | null; spi: number | null; critical: number; projectedFinish: string | null; deadline: string;
  alerts: number; delayed: number; pendingCRs: number; unresolvedCritical: number;
}): { rag: Rag; reasons: string[] } {
  const red: string[] = [];
  if (i.cpi !== null && i.cpi < i.critical) red.push(`CPI ${i.cpi.toFixed(3)} is below the critical threshold ${i.critical}`);
  if (i.spi !== null && i.spi < i.critical) red.push(`SPI ${i.spi.toFixed(3)} is below the critical threshold ${i.critical}`);
  if (i.projectedFinish && i.projectedFinish > i.deadline) red.push(`Projected finish ${i.projectedFinish} is after the deadline ${i.deadline}`);
  if (red.length) return { rag: "RED", reasons: red };
  const amber: string[] = [];
  if (i.alerts) amber.push(`${i.alerts} cost/schedule alert${i.alerts === 1 ? "" : "s"}`);
  if (i.delayed) amber.push(`${i.delayed} delayed activit${i.delayed === 1 ? "y" : "ies"}`);
  if (i.pendingCRs) amber.push(`${i.pendingCRs} pending change request${i.pendingCRs === 1 ? "" : "s"}`);
  if (i.unresolvedCritical) amber.push(`${i.unresolvedCritical} unresolved critical defect${i.unresolvedCritical === 1 ? "" : "s"}`);
  return amber.length ? { rag: "AMBER", reasons: amber } : { rag: "GREEN", reasons: ["All indicators are within thresholds"] };
}

export interface BaselineCounts { approvedReqs: number; workPackages: number; tasks: number }

/** Baseline = original charter values and the items that were not introduced by a change request. */
export function baselineVsCurrent(p: { start_date: string; original_budget: number; current_budget: number; original_deadline: string; deadline: string },
  baseline: BaselineCounts, current: BaselineCounts) {
  const row = (label: string, base: number | string, now: number | string, unit = "") => ({ label, baseline: base, current: now, changed: base !== now, unit });
  return [
    row("Budget (PKR)", p.original_budget, p.current_budget),
    row("Deadline", p.original_deadline, p.deadline),
    row("Duration (weeks)", weeksInclusive(p.start_date, p.original_deadline), weeksInclusive(p.start_date, p.deadline)),
    row("Approved requirements", baseline.approvedReqs, current.approvedReqs),
    row("WBS work packages", baseline.workPackages, current.workPackages),
    row("Tasks", baseline.tasks, current.tasks),
  ];
}

/** Upcoming (not achieved) milestones, earliest target first. */
export function nextMilestones<T extends { status: string; target_date: string }>(ms: T[], n = 4) {
  return ms.filter((m) => m.status !== "Achieved").sort((a, b) => a.target_date.localeCompare(b.target_date)).slice(0, n);
}

