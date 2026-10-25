"use server";

import db from "@/lib/db";
import { InputError, idReq, intReq, perform, str } from "@/lib/action";
import type { ActionResult } from "@/lib/action-types";
import { validateCostEntry, validateThresholds } from "@/lib/evm";
import { fmtDate, pkr } from "@/lib/format";

/** Reads and validates a cost entry form (rules live in validateCostEntry so they are unit-tested). */
function costFields(fd: FormData) {
  const taskId = idReq(fd, "task_id", "Activity");
  const ctx = db.prepare(
    "SELECT t.code, t.status, p.start_date, p.status_date FROM tasks t JOIN project p ON p.id = t.project_id WHERE t.id = ?",
  ).get(taskId) as { code: string; status: string; start_date: string; status_date: string } | undefined;
  const amount = intReq(fd, "amount", "Amount");
  const date = String(fd.get("entry_date") ?? "").trim();
  const category = String(fd.get("category") ?? "").trim();
  try {
    validateCostEntry({ amount, date, category, taskStatus: ctx?.status ?? null, projectStart: ctx?.start_date ?? "", statusDate: ctx?.status_date ?? "" });
  } catch (e) {
    throw new InputError((e as Error).message);
  }
  return { taskId, code: ctx!.code, amount, date, category, description: str(fd, "description", "Description", { required: false, max: 300 }) || null };
}

export async function addCostEntry(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return perform(() => {
    const c = costFields(fd);
    db.prepare("INSERT INTO cost_entries (task_id, entry_date, amount, category, description) VALUES (?,?,?,?,?)")
      .run(c.taskId, c.date, c.amount, c.category, c.description); // DB also refuses cost on a Not Started task
    return `${pkr(c.amount)} booked against ${c.code} on ${fmtDate(c.date)}.`;
  });
}

export async function updateCostEntry(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return perform(() => {
    const id = idReq(fd, "id", "Cost entry");
    const c = costFields(fd);
    const res = db.prepare("UPDATE cost_entries SET task_id = ?, entry_date = ?, amount = ?, category = ?, description = ? WHERE id = ?")
      .run(c.taskId, c.date, c.amount, c.category, c.description, id);
    if (!res.changes) throw new InputError("Cost entry not found.");
    return `Cost entry updated: ${pkr(c.amount)} on ${c.code}.`;
  });
}

export async function deleteCostEntry(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return perform(() => {
    const res = db.prepare("DELETE FROM cost_entries WHERE id = ?").run(idReq(fd, "id", "Cost entry"));
    if (!res.changes) throw new InputError("Cost entry not found.");
    return "Cost entry deleted.";
  });
}

export async function updateEstimate(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return perform(() => {
    const id = idReq(fd, "id", "Activity");
    const cost = intReq(fd, "estimated_cost", "Estimate", { min: 0 });
    // DB trigger rejects a total above the approved budget (BUDGET RULE).
    const res = db.prepare("UPDATE tasks SET estimated_cost = ? WHERE id = ?").run(cost, id);
    if (!res.changes) throw new InputError("Activity not found.");
    const t = db.prepare("SELECT code FROM tasks WHERE id = ?").get(id) as { code: string };
    return `${t.code} estimate set to ${pkr(cost)}.`;
  });
}

export async function setThresholds(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return perform(() => {
    const warning = Number(String(fd.get("warning") ?? "").trim());
    const critical = Number(String(fd.get("critical") ?? "").trim());
    try {
      validateThresholds(warning, critical);
    } catch (e) {
      throw new InputError((e as Error).message);
    }
    db.prepare("UPDATE project SET evm_warning_threshold = ?, evm_critical_threshold = ? WHERE id = ?")
      .run(warning, critical, idReq(fd, "project_id", "Project"));
    return `Alert thresholds set: warning below ${warning}, critical below ${critical}.`;
  });
}
