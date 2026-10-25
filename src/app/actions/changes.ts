"use server";

import db from "@/lib/db";
import { InputError, dateReq, idReq, intReq, nextCode, oneOf, perform, str, today } from "@/lib/action";
import type { ActionResult } from "@/lib/action-types";

const PRIORITIES = ["Critical", "High", "Medium", "Low"] as const;

export async function createChangeRequest(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return perform(() => {
    const pid = idReq(fd, "project_id", "Project");
    const requestedBy = str(fd, "requested_by", "Requested by", { max: 120 });
    const title = str(fd, "title", "Title", { max: 200 });
    const description = str(fd, "description", "Description");
    const justification = str(fd, "justification", "Justification");
    const cost = intReq(fd, "cost_impact", "Cost impact");
    const days = intReq(fd, "schedule_impact_days", "Schedule impact (days)", { min: -365, max: 365 });
    const requestedDate = dateReq(fd, "requested_date", "Request date");

    // One requirement per line:  "Title"  or  "Title | Priority"
    const lines = String(fd.get("requirements") ?? "").split("\n").map((l) => l.trim()).filter(Boolean);
    const parsed = lines.map((line) => {
      const [t, p] = line.split("|").map((s) => s.trim());
      const priority = p ? (PRIORITIES.find((x) => x.toLowerCase() === p.toLowerCase()) ?? null) : "High";
      if (!priority) throw new InputError(`Unknown priority "${p}" in "${line}". Use Critical, High, Medium or Low.`);
      return { title: t, priority };
    });

    const tx = db.transaction(() => {
      const crCodes = (db.prepare("SELECT code FROM change_requests WHERE project_id = ?").all(pid) as { code: string }[]).map((r) => r.code);
      const crCode = nextCode("CR-", crCodes);
      const info = db.prepare(
        `INSERT INTO change_requests (project_id, code, title, description, justification, cost_impact, schedule_impact_days, status, requested_by, requested_date)
         VALUES (?,?,?,?,?,?,?, 'Pending', ?, ?)`,
      ).run(pid, crCode, title, description, justification, cost, days, requestedBy, requestedDate);
      const crId = Number(info.lastInsertRowid);
      const reqCodes = (db.prepare("SELECT code FROM requirements WHERE project_id = ?").all(pid) as { code: string }[]).map((r) => r.code);
      for (const r of parsed) {
        const code = nextCode("REQ-", reqCodes);
        reqCodes.push(code);
        db.prepare(
          `INSERT INTO requirements (project_id, code, title, type, priority, status, source, change_request_id)
           VALUES (?,?,?, 'Functional', ?, 'Proposed', ?, ?)`,
        ).run(pid, code, r.title, r.priority, requestedBy, crId);
      }
      return { crCode, n: parsed.length };
    });
    const res = tx();
    return `${res.crCode} submitted for approval${res.n ? ` with ${res.n} proposed requirement${res.n > 1 ? "s" : ""}` : ""}.`;
  });
}

export async function decideChangeRequest(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return perform(() => {
    const id = idReq(fd, "id", "Change request");
    const intent = oneOf(fd, "intent", "Decision", ["approve", "reject"] as const);
    const cr = db.prepare("SELECT code, status, requested_date FROM change_requests WHERE id = ?").get(id) as
      { code: string; status: string; requested_date: string } | undefined;
    if (!cr) throw new InputError("Change request not found.");
    if (cr.status !== "Pending") throw new InputError(`${cr.code} has already been decided.`);
    const by = str(fd, "decision_by", "Decision maker", { max: 120 });
    const date = String(fd.get("decision_date") ?? "").trim() ? dateReq(fd, "decision_date", "Decision date") : today();
    if (date < cr.requested_date) throw new InputError("The decision date cannot be before the request date.");
    const notes = str(fd, "decision_notes", "Decision notes", { required: false }) || null;

    // The database applies the effect (budget, deadline, scope) in a trigger, in the same transaction.
    db.prepare("UPDATE change_requests SET status = ?, decision_by = ?, decision_date = ?, decision_notes = ? WHERE id = ?")
      .run(intent === "approve" ? "Approved" : "Rejected", by, date, notes, id);

    const log = db.prepare("SELECT details FROM audit_log WHERE entity = 'change_request' AND entity_id = ? ORDER BY id DESC LIMIT 1").get(id) as { details: string } | undefined;
    return intent === "approve" ? `${cr.code} approved. ${log?.details ?? ""}` : `${cr.code} rejected. Scope, budget and deadline are unchanged.`;
  });
}
