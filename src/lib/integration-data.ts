// Loaders for the integration screens (dashboard, consistency checks, report). Each takes the
// connection as a parameter so tests can pass an in-memory database.
import type Database from "better-sqlite3";
import { runConsistencyChecks, type ConsistencyInput } from "./consistency";
import { baselineVsCurrent, nextMilestones, projectHealth } from "./dashboard";
import { evmFor } from "./evm-data";
import { qualityFor } from "./quality-data";
import { scheduleFor } from "./schedule-data";

/** Plain rows for the pure consistency checks. */
export function consistencyInput(db: Database.Database, pid: number): ConsistencyInput | null {
  const all = <T>(sql: string) => db.prepare(sql).all(pid) as T[];
  const project = db.prepare("SELECT deadline, current_budget, status_date FROM project WHERE id = ?").get(pid) as ConsistencyInput["project"] | undefined;
  if (!project) return null;
  const input: ConsistencyInput = {
    project,
    requirements: all("SELECT id, code, title, status, change_request_id FROM requirements WHERE project_id = ? ORDER BY code"),
    wbs: all("SELECT id, code, name, node_type, requirement_id FROM wbs_items WHERE project_id = ? ORDER BY code"),
    tasks: all(`SELECT id, code, name, wbs_item_id, assignee_id, duration_days, planned_start, planned_end, actual_start, actual_end,
                       percent_complete, status, estimated_cost FROM tasks WHERE project_id = ? ORDER BY id`),
    deps: all("SELECT d.task_id, d.predecessor_id, d.lag_days FROM task_dependencies d JOIN tasks t ON t.id = d.task_id WHERE t.project_id = ?"),
    costEntries: all("SELECT c.id, c.task_id, c.entry_date, c.amount FROM cost_entries c JOIN tasks t ON t.id = c.task_id WHERE t.project_id = ? ORDER BY c.id"),
    // defects are not project-scoped in the schema; a LEFT JOIN finds any whose task has disappeared
    defects: db.prepare("SELECT d.id, d.code, d.task_id, (t.id IS NOT NULL) AS task_exists FROM defects d LEFT JOIN tasks t ON t.id = d.task_id ORDER BY d.code").all() as ConsistencyInput["defects"],
    changeRequests: all("SELECT id, code, status FROM change_requests WHERE project_id = ? ORDER BY code"),
    milestones: all("SELECT id, name, target_date, status, task_id FROM milestones WHERE project_id = ? ORDER BY target_date"),
    team: all("SELECT id, name FROM team_members WHERE project_id = ?"),
  };
  return input;
}

export function consistencyFor(db: Database.Database, pid: number) {
  const input = consistencyInput(db, pid);
  return input ? runConsistencyChecks(input) : null;
}

export function dashboardFor(db: Database.Database, pid: number) {
  const p = db.prepare("SELECT * FROM project WHERE id = ?").get(pid) as {
    id: number; name: string; start_date: string; status_date: string; original_budget: number; current_budget: number;
    original_deadline: string; deadline: string; evm_critical_threshold: number;
  } | undefined;
  const sched = scheduleFor(db, pid), evm = evmFor(db, pid);
  if (!p || !sched || !evm) return null;
  const quality = qualityFor(db, pid);
  const pending = db.prepare("SELECT code, title, cost_impact, schedule_impact_days FROM change_requests WHERE project_id = ? AND status = 'Pending' ORDER BY code")
    .all(pid) as { code: string; title: string; cost_impact: number; schedule_impact_days: number }[];
  const n = (sql: string) => (db.prepare(sql).get(pid) as { n: number }).n;
  // baseline scope = what was not introduced by a change request
  const baseWp = `w.project_id = ? AND w.node_type = 'Work Package'
                  AND (w.requirement_id IS NULL OR (SELECT change_request_id FROM requirements r WHERE r.id = w.requirement_id) IS NULL)`;
  const baseline = {
    approvedReqs: n("SELECT COUNT(*) n FROM requirements WHERE project_id = ? AND status = 'Approved' AND change_request_id IS NULL"),
    workPackages: n(`SELECT COUNT(*) n FROM wbs_items w WHERE ${baseWp}`),
    tasks: n(`SELECT COUNT(*) n FROM tasks t JOIN wbs_items w ON w.id = t.wbs_item_id WHERE ${baseWp}`),
  };
  const current = {
    approvedReqs: n("SELECT COUNT(*) n FROM requirements WHERE project_id = ? AND status = 'Approved'"),
    workPackages: n("SELECT COUNT(*) n FROM wbs_items WHERE project_id = ? AND node_type = 'Work Package'"),
    tasks: n("SELECT COUNT(*) n FROM tasks WHERE project_id = ?"),
  };
  const a = evm.analysis, s = sched.analysis;
  const health = projectHealth({
    cpi: a.project.cpi, spi: a.project.spi, critical: p.evm_critical_threshold, projectedFinish: s.projectedFinish, deadline: p.deadline,
    alerts: a.alerts.length, delayed: s.delayed.length + s.impacted.length, pendingCRs: pending.length, unresolvedCritical: quality.counts.unresolvedCritical,
  });
  return {
    project: p, health, evm, sched, quality, pending,
    progress: { ev: a.forecast.pctComplete, pv: a.project.bac ? a.project.pv / a.project.bac : null },
    baseline: baselineVsCurrent(p, baseline, current),
    milestones: nextMilestones(sched.milestones),
  };
}

export type Dashboard = NonNullable<ReturnType<typeof dashboardFor>>;
