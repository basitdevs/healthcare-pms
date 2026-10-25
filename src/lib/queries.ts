// Read-side data access for server components.
import db, { dbReady } from "./db";
import { evmFor } from "./evm-data";
import { consistencyFor, dashboardFor } from "./integration-data";
import { qualityFor } from "./quality-data";
import { scheduleFor } from "./schedule-data";

const all = <T>(sql: string, ...p: unknown[]) => db.prepare(sql).all(...p) as T[];
const get = <T>(sql: string, ...p: unknown[]) => db.prepare(sql).get(...p) as T | undefined;

// ------------------------------------------------------------------ types
export interface Project {
  id: number; code: string; name: string; description: string | null; sponsor: string;
  objectives: string; scope_in: string; scope_out: string;
  start_date: string; original_deadline: string; deadline: string;
  original_budget: number; current_budget: number; currency: string;
  status_date: string; status: string;
  evm_warning_threshold: number; evm_critical_threshold: number;
}
export interface Stakeholder {
  id: number; name: string; role: string; organization: string;
  influence: string; interest: string; expectations: string | null;
}
export interface TeamRow {
  id: number; name: string; role: string; email: string | null;
  tasks: number; open_tasks: number; task_codes: string | null;
  open_defects: number; milestones: number; risks: number;
}
export interface MilestoneRow {
  id: number; name: string; target_date: string; actual_date: string | null; status: string;
  task_id: number | null; task_code: string | null; owner_id: number | null; owner_name: string | null;
}
export interface StatusReport { id: number; report_date: string; health: string; summary: string; reporter: string | null }
export interface Closure {
  id: number; closure_date: string; deliverables_accepted: number; final_cost: number;
  lessons_learned: string; signed_off_by: string;
}
export interface Plan {
  id: number; version: string; scope_plan: string; schedule_plan: string; cost_plan: string; quality_plan: string; updated_on: string;
}
export interface RequirementRow {
  id: number; code: string; title: string; description: string | null; type: string; priority: string;
  status: string; source: string | null; change_request_id: number | null; approved_date: string | null;
  cr_code: string | null; cr_status: string | null; wbs_count: number;
}
export interface WbsRow {
  id: number; parent_id: number | null; code: string; name: string; node_type: string;
  requirement_id: number | null; description: string | null;
  req_code: string | null; req_title: string | null; req_status: string | null;
  task_count: number; own_cost: number;
}
export interface WbsNode extends WbsRow { children: WbsNode[]; cost: number; tasks: number }
export interface ChangeRequest {
  id: number; code: string; title: string; description: string; justification: string;
  cost_impact: number; schedule_impact_days: number; status: string;
  requested_by: string; requested_date: string;
  decision_by: string | null; decision_date: string | null; decision_notes: string | null;
}
export interface AuditRow { id: number; entity: string; entity_id: number | null; action: string; details: string | null; created_at: string }

// ------------------------------------------------------------------ module 1
// undefined before `npm run db:init` (no tables): pages then show "No project" / the setup screen
export const getProject = () => (dbReady() ? get<Project>("SELECT * FROM project ORDER BY id LIMIT 1") : undefined);

export const getStakeholders = (pid: number) =>
  all<Stakeholder>(
    `SELECT * FROM stakeholders WHERE project_id = ?
     ORDER BY CASE influence WHEN 'High' THEN 0 WHEN 'Medium' THEN 1 ELSE 2 END, id`, pid);

export const getTeam = (pid: number) =>
  all<TeamRow>(
    `SELECT m.id, m.name, m.role, m.email,
       (SELECT COUNT(*) FROM tasks t WHERE t.assignee_id = m.id) AS tasks,
       (SELECT COUNT(*) FROM tasks t WHERE t.assignee_id = m.id AND t.status <> 'Completed') AS open_tasks,
       (SELECT group_concat(t.code, ', ') FROM tasks t WHERE t.assignee_id = m.id AND t.status <> 'Completed') AS task_codes,
       (SELECT COUNT(*) FROM defects d WHERE d.assigned_to = m.id AND d.status IN ('Open','In Progress')) AS open_defects,
       (SELECT COUNT(*) FROM milestones ms WHERE ms.owner_id = m.id) AS milestones,
       (SELECT COUNT(*) FROM risks r WHERE r.owner_id = m.id AND r.status <> 'Closed') AS risks
     FROM team_members m WHERE m.project_id = ? ORDER BY m.id`, pid);

export const getMilestones = (pid: number) =>
  all<MilestoneRow>(
    `SELECT ms.id, ms.name, ms.target_date, ms.actual_date, ms.status, ms.task_id, t.code AS task_code,
            ms.owner_id, m.name AS owner_name
     FROM milestones ms
     LEFT JOIN tasks t ON t.id = ms.task_id
     LEFT JOIN team_members m ON m.id = ms.owner_id
     WHERE ms.project_id = ? ORDER BY ms.target_date, ms.id`, pid);

export const getTasksLite = (pid: number) =>
  all<{ id: number; code: string; name: string }>("SELECT id, code, name FROM tasks WHERE project_id = ? ORDER BY id", pid);

export const getStatusLog = (pid: number) =>
  all<StatusReport>(
    `SELECT s.id, s.report_date, s.health, s.summary, m.name AS reporter
     FROM status_log s LEFT JOIN team_members m ON m.id = s.reported_by
     WHERE s.project_id = ? ORDER BY s.report_date DESC, s.id DESC`, pid);

export const getClosure = (pid: number) => get<Closure>("SELECT * FROM project_closure WHERE project_id = ?", pid);
export const getPlan = (pid: number) => get<Plan>("SELECT * FROM pm_plan WHERE project_id = ?", pid);

export function closureReadiness(pid: number) {
  const incomplete = get<{ n: number }>("SELECT COUNT(*) n FROM tasks WHERE project_id = ? AND status <> 'Completed'", pid)!.n;
  const critical = get<{ n: number }>("SELECT COUNT(*) n FROM v_unresolved_critical_defects WHERE project_id = ?", pid)!.n;
  const actual = get<{ s: number }>(
    `SELECT COALESCE(SUM(c.amount),0) s FROM cost_entries c JOIN tasks t ON t.id = c.task_id WHERE t.project_id = ?`, pid)!.s;
  return { incomplete, critical, actual };
}

export function planGlance(pid: number) {
  const n = (sql: string) => get<{ n: number }>(sql, pid)!.n;
  return {
    approvedReqs: n("SELECT COUNT(*) n FROM requirements WHERE project_id = ? AND status = 'Approved'"),
    workPackages: n("SELECT COUNT(*) n FROM wbs_items WHERE project_id = ? AND node_type = 'Work Package'"),
    tasks: n("SELECT COUNT(*) n FROM tasks WHERE project_id = ?"),
    estimated: n("SELECT COALESCE(SUM(estimated_cost),0) n FROM tasks WHERE project_id = ?"),
    plannedFinish: get<{ d: string | null }>("SELECT MAX(planned_end) d FROM tasks WHERE project_id = ?", pid)?.d ?? null,
    checklist: n("SELECT COUNT(*) n FROM checklist_items c JOIN wbs_items w ON w.id = c.wbs_item_id WHERE w.project_id = ?"),
    openDefects: n(`SELECT COUNT(*) n FROM defects d JOIN tasks t ON t.id = d.task_id WHERE t.project_id = ? AND d.status IN ('Open','In Progress')`),
    risks: n("SELECT COUNT(*) n FROM risks WHERE project_id = ? AND status <> 'Closed'"),
  };
}

// ------------------------------------------------------------------ module 2
export function getRequirements(pid: number, status?: string) {
  const where = status ? "AND r.status = ?" : "";
  const params: unknown[] = status ? [pid, status] : [pid];
  return all<RequirementRow>(
    `SELECT r.*, cr.code AS cr_code, cr.status AS cr_status,
            (SELECT COUNT(*) FROM wbs_items w WHERE w.requirement_id = r.id) AS wbs_count
     FROM requirements r LEFT JOIN change_requests cr ON cr.id = r.change_request_id
     WHERE r.project_id = ? ${where}
     ORDER BY CASE r.priority WHEN 'Critical' THEN 0 WHEN 'High' THEN 1 WHEN 'Medium' THEN 2 ELSE 3 END, r.code`, ...params);
}

export const requirementCounts = (pid: number) => {
  const rows = all<{ status: string; n: number }>("SELECT status, COUNT(*) n FROM requirements WHERE project_id = ? GROUP BY status", pid);
  const out: Record<string, number> = { Proposed: 0, Approved: 0, Rejected: 0, Deferred: 0 };
  for (const r of rows) out[r.status] = r.n;
  return out;
};

export const approvedRequirements = (pid: number) =>
  all<{ id: number; code: string; title: string; wbs_count: number }>(
    `SELECT r.id, r.code, r.title, (SELECT COUNT(*) FROM wbs_items w WHERE w.requirement_id = r.id) AS wbs_count
     FROM requirements r WHERE r.project_id = ? AND r.status = 'Approved' ORDER BY r.code`, pid);

const natural = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true });

export function getWbsTree(pid: number): { root: WbsNode | undefined; flat: WbsRow[] } {
  const rows = all<WbsRow>(
    `SELECT w.id, w.parent_id, w.code, w.name, w.node_type, w.requirement_id, w.description,
            r.code AS req_code, r.title AS req_title, r.status AS req_status,
            (SELECT COUNT(*) FROM tasks t WHERE t.wbs_item_id = w.id) AS task_count,
            (SELECT COALESCE(SUM(t.estimated_cost),0) FROM tasks t WHERE t.wbs_item_id = w.id) AS own_cost
     FROM wbs_items w LEFT JOIN requirements r ON r.id = w.requirement_id
     WHERE w.project_id = ?`, pid);
  const nodes = new Map<number, WbsNode>();
  for (const r of rows) nodes.set(r.id, { ...r, children: [], cost: r.own_cost, tasks: r.task_count });
  let root: WbsNode | undefined;
  for (const n of nodes.values()) {
    if (n.parent_id === null) root = n;
    else nodes.get(n.parent_id)?.children.push(n);
  }
  const roll = (n: WbsNode) => {
    n.children.sort((a, b) => natural(a.code, b.code));
    for (const c of n.children) { roll(c); n.cost += c.cost; n.tasks += c.tasks; }
  };
  if (root) roll(root);
  return { root, flat: rows.sort((a, b) => natural(a.code, b.code)) };
}

export function getChangeRequests(pid: number) {
  const crs = all<ChangeRequest>("SELECT * FROM change_requests WHERE project_id = ? ORDER BY id DESC", pid);
  return crs.map((cr) => ({
    ...cr,
    requirements: all<{ id: number; code: string; title: string; status: string; priority: string }>(
      "SELECT id, code, title, status, priority FROM requirements WHERE change_request_id = ? ORDER BY code", cr.id),
  }));
}

export const getAudit = (limit = 8) =>
  all<AuditRow>("SELECT * FROM audit_log ORDER BY id DESC LIMIT ?", limit);

// ------------------------------------------------------------------ overview
export function overview(pid: number) {
  const pending = all<ChangeRequest>("SELECT * FROM change_requests WHERE project_id = ? AND status = 'Pending' ORDER BY id", pid);
  const approvedCRs = get<{ n: number }>("SELECT COUNT(*) n FROM change_requests WHERE project_id = ? AND status = 'Approved'", pid)!.n;
  const latest = get<StatusReport>(
    `SELECT s.id, s.report_date, s.health, s.summary, m.name AS reporter FROM status_log s
     LEFT JOIN team_members m ON m.id = s.reported_by WHERE s.project_id = ? ORDER BY s.report_date DESC, s.id DESC LIMIT 1`, pid);
  return { pending, approvedCRs, latest, req: requirementCounts(pid), glance: planGlance(pid) };
}

// ------------------------------------------------------------------ module 3
export const getSchedule = (pid: number) => scheduleFor(db, pid);

// ------------------------------------------------------------------ module 4
export const getEvm = (pid: number) => evmFor(db, pid);

// ------------------------------------------------------------------ module 5
export const getQuality = (pid: number) => qualityFor(db, pid);

// ------------------------------------------------------------------ module 6
export const getDashboard = (pid: number) => dashboardFor(db, pid);
export const getConsistency = (pid: number) => consistencyFor(db, pid);
