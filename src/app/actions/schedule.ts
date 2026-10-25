"use server";

import db from "@/lib/db";
import { InputError, dateReq, idReq, intReq, nextCode, perform, str } from "@/lib/action";
import type { ActionResult } from "@/lib/action-types";
import { addDays, fmtDate } from "@/lib/format";
import { progressState, recalculatePlan } from "@/lib/schedule";
import { loadSchedule } from "@/lib/schedule-data";

interface Pred { id: number; code: string; planned_end: string; lag: number }

const projectOf = (pid: number) => {
  const p = db.prepare("SELECT id, status_date FROM project WHERE id = ?").get(pid) as { id: number; status_date: string } | undefined;
  if (!p) throw new InputError("Project not found.");
  return p;
};

/** "T10, T13+2" -> predecessor tasks with lag days. */
function parsePredecessors(pid: number, text: string): Pred[] {
  const parts = text.split(/[,\s]+/).map((s) => s.trim().toUpperCase()).filter(Boolean);
  return parts.map((part) => {
    const m = /^([A-Z]+\d+)(?:\+(\d+))?$/.exec(part);
    if (!m) throw new InputError(`"${part}" is not a predecessor. Use task codes such as "T10" or "T13+2" (2 days lag).`);
    const t = db.prepare("SELECT id, code, planned_end FROM tasks WHERE project_id = ? AND upper(code) = ?").get(pid, m[1]) as
      Omit<Pred, "lag"> | undefined;
    if (!t) throw new InputError(`Task ${m[1]} does not exist.`);
    return { ...t, lag: Number(m[2] ?? 0) };
  });
}

const earliestStart = (preds: Pred[]) =>
  preds.map((p) => addDays(p.planned_end, 1 + p.lag)).reduce((a, b) => (a > b ? a : b));

function taskFields(fd: FormData) {
  return {
    name: str(fd, "name", "Activity name", { max: 150 }),
    wbs: idReq(fd, "wbs_item_id", "Work package"),
    assignee: idReq(fd, "assignee_id", "Assignee"),
    duration: intReq(fd, "duration_days", "Duration (days)", { min: 1, max: 730 }),
    cost: intReq(fd, "estimated_cost", "Estimated cost", { min: 0 }),
  };
}

export async function addTask(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return perform(() => {
    const pid = idReq(fd, "project_id", "Project");
    projectOf(pid);
    const f = taskFields(fd);
    const preds = parsePredecessors(pid, String(fd.get("predecessors") ?? ""));
    const startRaw = String(fd.get("planned_start") ?? "").trim();
    if (!startRaw && !preds.length) throw new InputError("Planned start is required when the activity has no predecessors.");
    const start = startRaw ? dateReq(fd, "planned_start", "Planned start") : earliestStart(preds);
    const end = addDays(start, f.duration - 1);

    const code = db.transaction(() => {
      const codes = (db.prepare("SELECT code FROM tasks WHERE project_id = ?").all(pid) as { code: string }[]).map((r) => r.code);
      const code = nextCode("T", codes, 2);
      // DB triggers: must sit on a Work Package, cannot start before the project, estimates <= budget.
      const info = db.prepare(
        `INSERT INTO tasks (project_id, code, wbs_item_id, name, assignee_id, duration_days, planned_start, planned_end, estimated_cost)
         VALUES (?,?,?,?,?,?,?,?,?)`,
      ).run(pid, code, f.wbs, f.name, f.assignee, f.duration, start, end, f.cost);
      const id = Number(info.lastInsertRowid);
      for (const p of preds) {
        db.prepare("INSERT INTO task_dependencies (task_id, predecessor_id, lag_days) VALUES (?,?,?)").run(id, p.id, p.lag);
      }
      return code;
    })();
    const conflict = preds.length && start < earliestStart(preds);
    return `${code} added: ${fmtDate(start)} to ${fmtDate(end)}.${conflict ? " Warning: it starts before its predecessors finish - use Recalculate." : ""}`;
  });
}

export async function updateTask(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return perform(() => {
    const id = idReq(fd, "id", "Activity");
    const f = taskFields(fd);
    const start = dateReq(fd, "planned_start", "Planned start");
    const end = addDays(start, f.duration - 1);
    const res = db.prepare(
      `UPDATE tasks SET name = ?, wbs_item_id = ?, assignee_id = ?, duration_days = ?, planned_start = ?, planned_end = ?, estimated_cost = ?
       WHERE id = ?`,
    ).run(f.name, f.wbs, f.assignee, f.duration, start, end, f.cost, id);
    if (!res.changes) throw new InputError("Activity not found.");
    return `Activity updated: ${fmtDate(start)} to ${fmtDate(end)}.`;
  });
}

export async function deleteTask(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return perform(() => {
    const id = idReq(fd, "id", "Activity");
    const t = db.prepare(
      `SELECT code, (SELECT COUNT(*) FROM cost_entries WHERE task_id = @id) AS costs, (SELECT COUNT(*) FROM defects WHERE task_id = @id) AS defects
       FROM tasks WHERE id = @id`,
    ).get({ id }) as { code: string; costs: number; defects: number } | undefined;
    if (!t) throw new InputError("Activity not found.");
    if (t.costs) throw new InputError(`${t.code} has ${t.costs} cost entr${t.costs === 1 ? "y" : "ies"} booked against it and cannot be deleted.`);
    if (t.defects) throw new InputError(`${t.code} has ${t.defects} defect${t.defects === 1 ? "" : "s"} logged against it and cannot be deleted.`);
    db.prepare("DELETE FROM tasks WHERE id = ?").run(id); // dependencies cascade; milestones/risks are unlinked
    return `${t.code} deleted.`;
  });
}

export async function updateProgress(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return perform(() => {
    const id = idReq(fd, "id", "Activity");
    const t = db.prepare("SELECT code, project_id FROM tasks WHERE id = ?").get(id) as { code: string; project_id: number } | undefined;
    if (!t) throw new InputError("Activity not found.");
    const opt = (k: string, label: string) => (String(fd.get(k) ?? "").trim() ? dateReq(fd, k, label) : null);
    const s = progressState({
      percent: intReq(fd, "percent_complete", "Percent complete", { min: 0, max: 100 }),
      onHold: fd.get("on_hold") === "1",
      actualStart: opt("actual_start", "Actual start"),
      actualEnd: opt("actual_end", "Actual end"),
      statusDate: projectOf(t.project_id).status_date,
    });
    db.prepare("UPDATE tasks SET status = ?, percent_complete = ?, actual_start = ?, actual_end = ? WHERE id = ?")
      .run(s.status, s.percent_complete, s.actual_start, s.actual_end, id);
    return `${t.code}: ${s.status}, ${s.percent_complete}%${s.actual_start ? `, started ${fmtDate(s.actual_start)}` : ""}${s.actual_end ? `, finished ${fmtDate(s.actual_end)}` : ""}.`;
  });
}

export async function addDependency(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return perform(() => {
    const taskId = idReq(fd, "task_id", "Activity");
    const predId = idReq(fd, "predecessor_id", "Predecessor");
    const lag = intReq(fd, "lag_days", "Lag (days)", { min: 0, max: 365 });
    if (taskId === predId) throw new InputError("An activity cannot depend on itself.");
    const row = (id: number) => db.prepare("SELECT code, planned_start, planned_end FROM tasks WHERE id = ?").get(id) as
      { code: string; planned_start: string; planned_end: string } | undefined;
    const s = row(taskId), p = row(predId);
    if (!s || !p) throw new InputError("Activity not found.");
    if (db.prepare("SELECT 1 FROM task_dependencies WHERE task_id = ? AND predecessor_id = ?").get(taskId, predId)) {
      throw new InputError(`${s.code} already depends on ${p.code}.`);
    }
    db.prepare("INSERT INTO task_dependencies (task_id, predecessor_id, lag_days) VALUES (?,?,?)").run(taskId, predId, lag); // DB blocks cycles
    const conflict = s.planned_start <= addDays(p.planned_end, lag);
    return `${s.code} now follows ${p.code}${lag ? ` (+${lag} days lag)` : ""}.${conflict ? ` Its planned start conflicts with this link - use Recalculate.` : ""}`;
  });
}

export async function removeDependency(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return perform(() => {
    const res = db.prepare("DELETE FROM task_dependencies WHERE id = ?").run(idReq(fd, "id", "Dependency"));
    if (!res.changes) throw new InputError("Dependency not found.");
    return "Dependency removed.";
  });
}

export async function recalculateSchedule(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return perform(() => {
    const data = loadSchedule(db, idReq(fd, "project_id", "Project"));
    if (!data) throw new InputError("Project not found.");
    const changes = recalculatePlan(data.tasks, data.deps);
    const upd = db.prepare("UPDATE tasks SET planned_start = ?, planned_end = ? WHERE id = ?");
    db.transaction(() => { for (const c of changes) upd.run(c.planned_start, c.planned_end, c.id); })();
    return changes.length
      ? `Schedule recalculated: ${changes.length} activit${changes.length === 1 ? "y" : "ies"} moved (${changes.map((c) => c.code).join(", ")}).`
      : "Schedule already follows the dependencies - nothing to move.";
  });
}
