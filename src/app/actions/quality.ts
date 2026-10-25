"use server";

import db from "@/lib/db";
import { InputError, dateReq, idOpt, idReq, nextCode, oneOf, perform, str } from "@/lib/action";
import type { ActionResult } from "@/lib/action-types";
import { DEFECT_STATUSES, RESULTS, resolvedDateFor, validateDefect } from "@/lib/quality";

const statusDate = () => (db.prepare("SELECT status_date FROM project ORDER BY id LIMIT 1").get() as { status_date: string }).status_date;

/** Runs a pure validator and turns its Error into an InputError (shown as a toast). */
function check(fn: () => void) {
  try { fn(); } catch (e) { throw new InputError((e as Error).message); }
}

function defectFields(fd: FormData) {
  return {
    title: str(fd, "title", "Title", { required: false, max: 200 }),
    description: str(fd, "description", "Description", { required: false, max: 1000 }) || null,
    taskId: idOpt(fd, "task_id"), assigneeId: idOpt(fd, "assigned_to"), reporterId: idOpt(fd, "reported_by"),
    severity: String(fd.get("severity") ?? ""),
    reportedDate: dateReq(fd, "reported_date", "Reported date"),
  };
}

export async function addDefect(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return perform(() => {
    const f = defectFields(fd);
    check(() => validateDefect({ ...f, status: "Open", resolvedDate: null, statusDate: statusDate() }));
    const codes = (db.prepare("SELECT code FROM defects").all() as { code: string }[]).map((r) => r.code);
    const code = nextCode("DEF-", codes);
    db.prepare(
      `INSERT INTO defects (code, title, description, task_id, severity, status, assigned_to, reported_by, reported_date)
       VALUES (?,?,?,?,?, 'Open', ?,?,?)`,
    ).run(code, f.title.trim(), f.description, f.taskId, f.severity, f.assigneeId, f.reporterId, f.reportedDate);
    return `${code} logged (${f.severity}).`;
  });
}

export async function updateDefect(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return perform(() => {
    const id = idReq(fd, "id", "Defect");
    const cur = db.prepare("SELECT code, status, resolved_date FROM defects WHERE id = ?").get(id) as { code: string; status: string; resolved_date: string | null } | undefined;
    if (!cur) throw new InputError("Defect not found.");
    const f = defectFields(fd);
    check(() => validateDefect({ ...f, status: cur.status, resolvedDate: cur.resolved_date, statusDate: statusDate() }));
    db.prepare("UPDATE defects SET title = ?, description = ?, task_id = ?, severity = ?, assigned_to = ?, reported_by = ?, reported_date = ? WHERE id = ?")
      .run(f.title.trim(), f.description, f.taskId, f.severity, f.assigneeId, f.reporterId, f.reportedDate, id);
    return `${cur.code} updated.`;
  });
}

export async function setDefectStatus(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return perform(() => {
    const id = idReq(fd, "id", "Defect");
    const status = oneOf(fd, "status", "Status", DEFECT_STATUSES);
    const d = db.prepare("SELECT code, status, reported_date, resolved_date FROM defects WHERE id = ?").get(id) as
      { code: string; status: string; reported_date: string; resolved_date: string | null } | undefined;
    if (!d) throw new InputError("Defect not found.");
    let resolved: string | null = null;
    // Resolved/Closed -> resolved_date = status date (kept when moving Resolved -> Closed); reopening clears it.
    check(() => { resolved = resolvedDateFor(status, d.status === "Resolved" || d.status === "Closed" ? d.resolved_date : null, statusDate(), d.reported_date); });
    db.prepare("UPDATE defects SET status = ?, resolved_date = ? WHERE id = ?").run(status, resolved, id);
    return `${d.code} is now ${status}${resolved ? ` (resolved ${resolved})` : ""}.`;
  });
}

export async function deleteDefect(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return perform(() => {
    const res = db.prepare("DELETE FROM defects WHERE id = ?").run(idReq(fd, "id", "Defect"));
    if (!res.changes) throw new InputError("Defect not found.");
    return "Defect deleted.";
  });
}

export async function addChecklistItem(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return perform(() => {
    const wbs = idReq(fd, "wbs_item_id", "Deliverable or work package");
    const w = db.prepare("SELECT node_type FROM wbs_items WHERE id = ?").get(wbs) as { node_type: string } | undefined;
    if (!w || w.node_type === "Project") throw new InputError("Attach the checklist item to a deliverable or work package.");
    db.prepare("INSERT INTO checklist_items (wbs_item_id, criterion) VALUES (?,?)").run(wbs, str(fd, "criterion", "Criterion", { max: 300 }));
    return "Checklist item added.";
  });
}

export async function deleteChecklistItem(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return perform(() => {
    const res = db.prepare("DELETE FROM checklist_items WHERE id = ?").run(idReq(fd, "id", "Checklist item")); // inspections cascade
    if (!res.changes) throw new InputError("Checklist item not found.");
    return "Checklist item and its inspection history deleted.";
  });
}

export async function addInspection(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return perform(() => {
    const date = dateReq(fd, "inspected_on", "Date");
    const today = statusDate();
    if (date > today) throw new InputError(`Inspection date cannot be after the status date (${today}).`);
    const result = oneOf(fd, "result", "Result", RESULTS);
    db.prepare("INSERT INTO inspections (checklist_item_id, inspection_type, result, inspected_on, inspector_id, notes) VALUES (?,?,?,?,?,?)").run(
      idReq(fd, "checklist_item_id", "Checklist item"), oneOf(fd, "inspection_type", "Type", ["Inspection", "Test"] as const),
      result, date, idReq(fd, "inspector_id", "Inspector"), str(fd, "notes", "Notes", { required: false, max: 500 }) || null,
    );
    return `${result} recorded.${result === "Fail" ? " Use \"Log defect\" to raise a defect for it." : ""}`;
  });
}

export async function deleteInspection(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return perform(() => {
    db.prepare("DELETE FROM inspections WHERE id = ?").run(idReq(fd, "id", "Inspection"));
    return "Inspection deleted.";
  });
}
