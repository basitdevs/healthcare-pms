// Loads cost/EVM facts for a project and runs the pure engine in ./evm.ts.
// Takes the connection as a parameter so tests can pass an in-memory database.
import type Database from "better-sqlite3";
import { analyseEvm, rollup, sCurve, type EvmTask } from "./evm";

export interface CostTask extends EvmTask {
  assignee_id: number; assignee_name: string; wp_code: string; wp_name: string;
  deliverable_id: number; deliverable_code: string; deliverable_name: string;
}
export interface CostEntryRow {
  id: number; task_id: number; task_code: string; task_name: string; task_status: string;
  entry_date: string; amount: number; category: string; description: string | null;
}

const natural = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true });

export function loadCosts(db: Database.Database, pid: number) {
  const project = db.prepare(
    `SELECT id, start_date, status_date, deadline, original_budget, current_budget, evm_warning_threshold, evm_critical_threshold
     FROM project WHERE id = ?`,
  ).get(pid) as {
    id: number; start_date: string; status_date: string; deadline: string; original_budget: number; current_budget: number;
    evm_warning_threshold: number; evm_critical_threshold: number;
  } | undefined;
  if (!project) return null;

  const tasks = (db.prepare(
    `SELECT t.id, t.code, t.name, t.estimated_cost, t.duration_days, t.planned_start, t.planned_end, t.actual_start, t.actual_end,
            t.percent_complete, t.status, a.actual_cost AS ac, t.assignee_id, m.name AS assignee_name,
            w.code AS wp_code, w.name AS wp_name, d.id AS deliverable_id, d.code AS deliverable_code, d.name AS deliverable_name
     FROM tasks t
     JOIN v_task_actual_cost a ON a.task_id = t.id
     JOIN team_members m ON m.id = t.assignee_id
     JOIN wbs_items w ON w.id = t.wbs_item_id
     JOIN wbs_items d ON d.id = w.parent_id
     WHERE t.project_id = ?`,
  ).all(pid) as CostTask[]).sort((a, b) => natural(a.code, b.code));

  const entries = db.prepare(
    `SELECT c.id, c.task_id, t.code AS task_code, t.name AS task_name, t.status AS task_status,
            c.entry_date, c.amount, c.category, c.description
     FROM cost_entries c JOIN tasks t ON t.id = c.task_id
     WHERE t.project_id = ? ORDER BY c.entry_date, c.id`,
  ).all(pid) as CostEntryRow[];

  return { project, tasks, entries };
}

export function evmFor(db: Database.Database, pid: number) {
  const data = loadCosts(db, pid);
  if (!data) return null;
  const { project: p, tasks, entries } = data;
  const thresholds = { warning: p.evm_warning_threshold, critical: p.evm_critical_threshold };
  const a = analyseEvm({ tasks, entries, statusDate: p.status_date, approvedBudget: p.current_budget, thresholds });
  const byTask = new Map(a.rows.map((r) => [r.task.id, r.m]));
  const withKey = <K extends string | number>(key: (t: CostTask) => K, label: (t: CostTask) => string) =>
    tasks.map((t) => ({ m: byTask.get(t.id)!, key: key(t), label: label(t) }));
  return {
    ...data, thresholds, analysis: a,
    byDeliverable: rollup(withKey((t) => t.deliverable_code, (t) => `${t.deliverable_code} ${t.deliverable_name}`)).sort((x, y) => natural(x.key, y.key)),
    byMember: rollup(withKey((t) => t.assignee_id, (t) => t.assignee_name)),
    curve: sCurve(tasks, entries, { start: p.start_date, end: p.deadline, statusDate: p.status_date }),
  };
}

export type Evm = NonNullable<ReturnType<typeof evmFor>>;
