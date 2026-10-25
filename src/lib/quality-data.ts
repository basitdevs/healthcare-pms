// Loads defects, checklist/inspections, risks and PDPC responses for a project.
// Takes the connection as a parameter so tests can pass an in-memory database.
import type Database from "better-sqlite3";
import { defectCounts, latestPerItem, passRate } from "./quality";

export interface DefectRow {
  id: number; code: string; title: string; description: string | null; severity: string; status: string;
  task_id: number; task_code: string; task_name: string; wbs_code: string; wbs_name: string;
  req_code: string | null; req_title: string | null;
  assigned_to: number; assignee: string; reported_by: number; reporter: string;
  reported_date: string; resolved_date: string | null;
}
export interface ChecklistRow {
  id: number; wbs_item_id: number; criterion: string; wbs_code: string; wbs_name: string; node_type: string;
  task_id: number | null; // most recent task under this WBS item (target for "Log defect")
}
export interface InspectionRow {
  id: number; checklist_item_id: number; inspection_type: string; result: string; inspected_on: string;
  inspector_id: number; inspector: string; notes: string | null;
}
export interface RiskRow {
  id: number; code: string; title: string; description: string | null; category: string;
  likelihood: number; impact: number; score: number; rating: string; status: string;
  owner_id: number; owner: string; related_task_id: number | null; task_code: string | null;
  identified_date: string; rank: number | null;
}
export interface ResponseRow {
  id: number; risk_id: number; risk_code: string; risk_title: string; task_id: number | null; task_code: string | null; task_name: string | null;
  potential_problem: string; response_type: string; action: string; owner_id: number | null; owner: string | null; status: string;
}

const natural = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true });

export function qualityFor(db: Database.Database, pid: number) {
  const defects = db.prepare(
    `SELECT d.id, d.code, d.title, d.description, d.severity, d.status, d.task_id, t.code AS task_code, t.name AS task_name,
            w.code AS wbs_code, w.name AS wbs_name, r.code AS req_code, r.title AS req_title,
            d.assigned_to, a.name AS assignee, d.reported_by, b.name AS reporter, d.reported_date, d.resolved_date
     FROM defects d
     JOIN tasks t ON t.id = d.task_id
     JOIN wbs_items w ON w.id = t.wbs_item_id
     LEFT JOIN requirements r ON r.id = w.requirement_id
     JOIN team_members a ON a.id = d.assigned_to
     JOIN team_members b ON b.id = d.reported_by
     WHERE t.project_id = ?
     ORDER BY CASE d.severity WHEN 'Critical' THEN 0 WHEN 'Major' THEN 1 WHEN 'Minor' THEN 2 ELSE 3 END, d.code`,
  ).all(pid) as DefectRow[];

  const items = (db.prepare(
    `SELECT c.id, c.wbs_item_id, c.criterion, w.code AS wbs_code, w.name AS wbs_name, w.node_type,
            (SELECT t.id FROM tasks t JOIN wbs_items tw ON tw.id = t.wbs_item_id
              WHERE t.wbs_item_id = w.id OR tw.parent_id = w.id ORDER BY t.planned_start DESC LIMIT 1) AS task_id
     FROM checklist_items c JOIN wbs_items w ON w.id = c.wbs_item_id
     WHERE w.project_id = ?`,
  ).all(pid) as ChecklistRow[]).sort((a, b) => natural(a.wbs_code, b.wbs_code) || a.id - b.id);

  const inspections = db.prepare(
    `SELECT i.id, i.checklist_item_id, i.inspection_type, i.result, i.inspected_on, i.inspector_id, m.name AS inspector, i.notes
     FROM inspections i JOIN checklist_items c ON c.id = i.checklist_item_id JOIN wbs_items w ON w.id = c.wbs_item_id
     JOIN team_members m ON m.id = i.inspector_id
     WHERE w.project_id = ? ORDER BY i.inspected_on DESC, i.id DESC`,
  ).all(pid) as InspectionRow[];
  const latest = latestPerItem(inspections);

  const groups = [...new Set(items.map((i) => i.wbs_item_id))].map((wid) => {
    const list = items.filter((i) => i.wbs_item_id === wid);
    return { wbs_item_id: wid, code: list[0].wbs_code, name: list[0].wbs_name, node_type: list[0].node_type, list, ...passRate(list.map((i) => i.id), latest) };
  });

  const ranked = db.prepare(
    `SELECT r.id, r.code, r.title, r.description, r.category, r.likelihood, r.impact, r.score, r.rating, r.status,
            r.owner_id, m.name AS owner, r.related_task_id, t.code AS task_code, r.identified_date, r.priority_rank AS rank
     FROM v_risk_ranked r JOIN team_members m ON m.id = r.owner_id LEFT JOIN tasks t ON t.id = r.related_task_id
     WHERE r.project_id = ? ORDER BY r.priority_rank, r.code`,
  ).all(pid) as RiskRow[];
  const closed = db.prepare(
    `SELECT r.id, r.code, r.title, r.description, r.category, r.likelihood, r.impact, r.score, r.rating, r.status,
            r.owner_id, m.name AS owner, r.related_task_id, t.code AS task_code, r.identified_date, NULL AS rank
     FROM risks r JOIN team_members m ON m.id = r.owner_id LEFT JOIN tasks t ON t.id = r.related_task_id
     WHERE r.project_id = ? AND r.status = 'Closed' ORDER BY r.code`,
  ).all(pid) as RiskRow[];

  const responses = db.prepare(
    `SELECT x.id, x.risk_id, r.code AS risk_code, r.title AS risk_title, x.task_id, t.code AS task_code, t.name AS task_name,
            x.potential_problem, x.response_type, x.action, x.owner_id, m.name AS owner, x.status
     FROM risk_responses x JOIN risks r ON r.id = x.risk_id
     LEFT JOIN tasks t ON t.id = x.task_id LEFT JOIN team_members m ON m.id = x.owner_id
     WHERE r.project_id = ? ORDER BY x.id`,
  ).all(pid) as ResponseRow[];

  return {
    defects, counts: defectCounts(defects),
    items, inspections, latest, groups, checklist: passRate(items.map((i) => i.id), latest),
    risks: ranked, closedRisks: closed, responses,
  };
}

export type Quality = ReturnType<typeof qualityFor>;
