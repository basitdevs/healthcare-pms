"use server";

import db from "@/lib/db";
import { InputError, dateReq, idOpt, idReq, nextCode, oneOf, perform, str } from "@/lib/action";
import type { ActionResult } from "@/lib/action-types";
import { RISK_STATUSES, validateRisk } from "@/lib/quality";

const num = (fd: FormData, k: string) => Number(String(fd.get(k) ?? "").trim());

function riskFields(fd: FormData) {
  const r = {
    title: str(fd, "title", "Title", { required: false, max: 200 }),
    description: str(fd, "description", "Description", { required: false, max: 1000 }) || null,
    category: String(fd.get("category") ?? ""),
    likelihood: num(fd, "likelihood"), impact: num(fd, "impact"),
    status: String(fd.get("status") ?? "Open"),
    ownerId: idOpt(fd, "owner_id"), taskId: idOpt(fd, "related_task_id"),
    identified: dateReq(fd, "identified_date", "Identified date"),
  };
  try { validateRisk(r); } catch (e) { throw new InputError((e as Error).message); }
  return r;
}

// score and rating are GENERATED columns - never written here.
export async function addRisk(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return perform(() => {
    const pid = idReq(fd, "project_id", "Project");
    const r = riskFields(fd);
    const codes = (db.prepare("SELECT code FROM risks WHERE project_id = ?").all(pid) as { code: string }[]).map((x) => x.code);
    const code = nextCode("RSK-", codes, 2);
    db.prepare(
      `INSERT INTO risks (project_id, code, title, description, category, likelihood, impact, status, owner_id, related_task_id, identified_date)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    ).run(pid, code, r.title.trim(), r.description, r.category, r.likelihood, r.impact, r.status, r.ownerId, r.taskId, r.identified);
    return `${code} added (score ${r.likelihood * r.impact}).`;
  });
}

export async function updateRisk(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return perform(() => {
    const id = idReq(fd, "id", "Risk");
    const r = riskFields(fd);
    const res = db.prepare(
      `UPDATE risks SET title = ?, description = ?, category = ?, likelihood = ?, impact = ?, status = ?, owner_id = ?, related_task_id = ?, identified_date = ?
       WHERE id = ?`,
    ).run(r.title.trim(), r.description, r.category, r.likelihood, r.impact, r.status, r.ownerId, r.taskId, r.identified, id);
    if (!res.changes) throw new InputError("Risk not found.");
    return `Risk updated (score ${r.likelihood * r.impact}).`;
  });
}

export async function setRiskStatus(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return perform(() => {
    const status = oneOf(fd, "status", "Status", RISK_STATUSES);
    const res = db.prepare("UPDATE risks SET status = ? WHERE id = ?").run(status, idReq(fd, "id", "Risk"));
    if (!res.changes) throw new InputError("Risk not found.");
    return `Risk status set to ${status}.`;
  });
}

export async function deleteRisk(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return perform(() => {
    const res = db.prepare("DELETE FROM risks WHERE id = ?").run(idReq(fd, "id", "Risk")); // its responses cascade
    if (!res.changes) throw new InputError("Risk not found.");
    return "Risk and its responses deleted.";
  });
}

function responseFields(fd: FormData) {
  return [
    idReq(fd, "risk_id", "Risk"), idOpt(fd, "task_id"),
    str(fd, "potential_problem", "Potential problem", { max: 300 }),
    oneOf(fd, "response_type", "Response type", ["Preventive", "Corrective"] as const),
    str(fd, "action", "Countermeasure", { max: 500 }), idOpt(fd, "owner_id"),
    oneOf(fd, "status", "Status", ["Planned", "In Progress", "Done"] as const),
  ] as const;
}

export async function addResponse(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return perform(() => {
    db.prepare("INSERT INTO risk_responses (risk_id, task_id, potential_problem, response_type, action, owner_id, status) VALUES (?,?,?,?,?,?,?)")
      .run(...responseFields(fd));
    return "Response added to the PDPC.";
  });
}

export async function updateResponse(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return perform(() => {
    const res = db.prepare("UPDATE risk_responses SET risk_id = ?, task_id = ?, potential_problem = ?, response_type = ?, action = ?, owner_id = ?, status = ? WHERE id = ?")
      .run(...responseFields(fd), idReq(fd, "id", "Response"));
    if (!res.changes) throw new InputError("Response not found.");
    return "Response updated.";
  });
}

export async function deleteResponse(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return perform(() => {
    db.prepare("DELETE FROM risk_responses WHERE id = ?").run(idReq(fd, "id", "Response"));
    return "Response deleted.";
  });
}
