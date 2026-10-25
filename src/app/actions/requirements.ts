"use server";

import db from "@/lib/db";
import { InputError, idReq, nextCode, oneOf, perform, str, today } from "@/lib/action";
import type { ActionResult } from "@/lib/action-types";

const TYPES = ["Functional", "Non-Functional"] as const;
const PRIORITIES = ["Critical", "High", "Medium", "Low"] as const;
const STATUSES = ["Proposed", "Approved", "Rejected", "Deferred"] as const;

export async function addRequirement(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return perform(() => {
    const pid = idReq(fd, "project_id", "Project");
    const codes = (db.prepare("SELECT code FROM requirements WHERE project_id = ?").all(pid) as { code: string }[]).map((r) => r.code);
    const code = nextCode("REQ-", codes);
    const status = oneOf(fd, "status", "Status", ["Proposed", "Approved"] as const);
    db.prepare(
      `INSERT INTO requirements (project_id, code, title, description, type, priority, status, source, approved_date)
       VALUES (?,?,?,?,?,?,?,?,?)`,
    ).run(
      pid, code, str(fd, "title", "Title", { max: 200 }), str(fd, "description", "Description", { required: false }) || null,
      oneOf(fd, "type", "Type", TYPES), oneOf(fd, "priority", "Priority", PRIORITIES), status,
      str(fd, "source", "Source", { required: false }) || null, status === "Approved" ? today() : null,
    );
    return `${code} added as ${status}.`;
  });
}

export async function updateRequirement(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return perform(() => {
    db.prepare("UPDATE requirements SET title=?, description=?, type=?, priority=?, source=? WHERE id=?").run(
      str(fd, "title", "Title", { max: 200 }), str(fd, "description", "Description", { required: false }) || null,
      oneOf(fd, "type", "Type", TYPES), oneOf(fd, "priority", "Priority", PRIORITIES),
      str(fd, "source", "Source", { required: false }) || null, idReq(fd, "id", "Requirement"),
    );
    return "Requirement updated.";
  });
}

export async function setRequirementStatus(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return perform(() => {
    const id = idReq(fd, "id", "Requirement");
    const status = oneOf(fd, "status", "Status", STATUSES);
    const r = db.prepare("SELECT code FROM requirements WHERE id = ?").get(id) as { code: string } | undefined;
    if (!r) throw new InputError("Requirement not found.");
    // The database enforces: a CR-linked requirement can only be approved by approving its change request,
    // and an approved requirement that is already in the WBS cannot be un-approved.
    db.prepare("UPDATE requirements SET status = ?, approved_date = ? WHERE id = ?").run(status, status === "Approved" ? today() : null, id);
    return `${r.code} is now ${status}.`;
  });
}

export async function deleteRequirement(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return perform(() => {
    const id = idReq(fd, "id", "Requirement");
    const used = db.prepare("SELECT COUNT(*) n FROM wbs_items WHERE requirement_id = ?").get(id) as { n: number };
    if (used.n > 0) throw new InputError("This requirement is used in the WBS. Remove those WBS items first.");
    db.prepare("DELETE FROM requirements WHERE id = ?").run(id);
    return "Requirement deleted.";
  });
}
