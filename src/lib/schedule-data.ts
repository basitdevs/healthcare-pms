// Loads the schedule network for a project and runs the pure engine in ./schedule.ts.
// Takes the connection as a parameter so tests can pass an in-memory database.
import type Database from "better-sqlite3";
import { analyseSchedule, type SchedDep, type SchedTask } from "./schedule";

export interface ScheduleTask extends SchedTask {
  estimated_cost: number; assignee_name: string;
  wp_code: string; wp_name: string; deliverable_id: number; deliverable_code: string; deliverable_name: string;
  cost_entries: number; defects: number;
}
export interface ScheduleDep extends SchedDep { id: number; predecessor_code: string; task_code: string }
export interface ScheduleMilestone { id: number; name: string; target_date: string; actual_date: string | null; status: string; task_id: number | null }
export interface WorkPackage { id: number; code: string; name: string; deliverable_code: string; deliverable_name: string; tasks: number }

const natural = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true });

export function loadSchedule(db: Database.Database, pid: number) {
  const project = db.prepare(
    "SELECT id, start_date, status_date, deadline, original_deadline, current_budget FROM project WHERE id = ?",
  ).get(pid) as { id: number; start_date: string; status_date: string; deadline: string; original_deadline: string; current_budget: number } | undefined;
  if (!project) return null;

  const tasks = db.prepare(
    `SELECT t.id, t.code, t.name, t.wbs_item_id, t.assignee_id, t.duration_days, t.planned_start, t.planned_end,
            t.actual_start, t.actual_end, t.percent_complete, t.status, t.estimated_cost, m.name AS assignee_name,
            w.code AS wp_code, w.name AS wp_name, d.id AS deliverable_id, d.code AS deliverable_code, d.name AS deliverable_name,
            (SELECT COUNT(*) FROM cost_entries c WHERE c.task_id = t.id) AS cost_entries,
            (SELECT COUNT(*) FROM defects x WHERE x.task_id = t.id) AS defects
     FROM tasks t
     JOIN team_members m ON m.id = t.assignee_id
     JOIN wbs_items w ON w.id = t.wbs_item_id
     JOIN wbs_items d ON d.id = w.parent_id
     WHERE t.project_id = ?`,
  ).all(pid) as ScheduleTask[];
  tasks.sort((a, b) => natural(a.code, b.code));

  const deps = db.prepare(
    `SELECT d.id, d.task_id, d.predecessor_id, d.lag_days, p.code AS predecessor_code, s.code AS task_code
     FROM task_dependencies d JOIN tasks s ON s.id = d.task_id JOIN tasks p ON p.id = d.predecessor_id
     WHERE s.project_id = ? ORDER BY d.task_id, d.predecessor_id`,
  ).all(pid) as ScheduleDep[];

  const milestones = db.prepare(
    "SELECT id, name, target_date, actual_date, status, task_id FROM milestones WHERE project_id = ? ORDER BY target_date, id",
  ).all(pid) as ScheduleMilestone[];

  const workPackages = (db.prepare(
    `SELECT w.id, w.code, w.name, d.code AS deliverable_code, d.name AS deliverable_name,
            (SELECT COUNT(*) FROM tasks t WHERE t.wbs_item_id = w.id) AS tasks
     FROM wbs_items w JOIN wbs_items d ON d.id = w.parent_id
     WHERE w.project_id = ? AND w.node_type = 'Work Package'`,
  ).all(pid) as WorkPackage[]).sort((a, b) => natural(a.code, b.code));

  const team = db.prepare("SELECT id, name, role FROM team_members WHERE project_id = ? ORDER BY id").all(pid) as
    { id: number; name: string; role: string }[];

  return { project, tasks, deps, milestones, workPackages, team };
}

export function scheduleFor(db: Database.Database, pid: number) {
  const data = loadSchedule(db, pid);
  if (!data) return null;
  const analysis = analyseSchedule(data.tasks, data.deps, { statusDate: data.project.status_date, deadline: data.project.deadline });
  // Milestones that track a task follow that task's forecast; "At Risk" when the forecast passes the target.
  const milestones = data.milestones.map((m) => {
    const fe = m.task_id ? analysis.forecast.get(m.task_id)?.forecast_end ?? null : null;
    const atRisk = m.status !== "Achieved" && fe !== null && fe > m.target_date;
    return { ...m, forecast_date: m.actual_date ?? fe, display_status: atRisk ? "At Risk" : m.status };
  });
  return { ...data, milestones, analysis };
}

export type Schedule = NonNullable<ReturnType<typeof scheduleFor>>;
