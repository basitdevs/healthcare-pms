"use server";

import db from "@/lib/db";
import { InputError, dateReq, idReq, intReq, oneOf, perform, str } from "@/lib/action";
import type { ActionResult } from "@/lib/action-types";

const LEVELS = ["Low", "Medium", "High"] as const;

export async function createCharter(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return perform(() => {
    if (db.prepare("SELECT 1 FROM project LIMIT 1").get()) throw new InputError("A project already exists.");
    const start = dateReq(fd, "start_date", "Start date");
    const deadline = dateReq(fd, "deadline", "Deadline");
    if (deadline < start) throw new InputError("The deadline cannot be before the start date.");
    const budget = intReq(fd, "budget", "Approved budget", { min: 1 });
    db.prepare(
      `INSERT INTO project (code, name, description, sponsor, objectives, scope_in, scope_out,
         start_date, original_deadline, deadline, original_budget, current_budget, status_date, status)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?, 'Initiating')`,
    ).run(
      str(fd, "code", "Project code", { max: 30 }), str(fd, "name", "Project name", { max: 150 }),
      str(fd, "description", "Description", { required: false }) || null,
      str(fd, "sponsor", "Sponsor"), str(fd, "objectives", "Objectives"),
      str(fd, "scope_in", "Scope - included"), str(fd, "scope_out", "Scope - excluded"),
      start, deadline, deadline, budget, budget, start,
    );
    return "Project charter created.";
  });
}

export async function updateCharter(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return perform(() => {
    const id = idReq(fd, "id", "Project");
    const start = dateReq(fd, "start_date", "Start date");
    const earliest = db.prepare("SELECT MIN(planned_start) d FROM tasks WHERE project_id = ?").get(id) as { d: string | null };
    if (earliest.d && start > earliest.d) {
      throw new InputError(`The start date cannot be after the first scheduled activity (${earliest.d}).`);
    }
    const locked = (db.prepare("SELECT COUNT(*) n FROM change_requests WHERE project_id = ? AND status = 'Approved'").get(id) as { n: number }).n > 0;
    const budget = locked ? null : intReq(fd, "budget", "Approved budget", { min: 1 });
    const deadline = locked ? null : dateReq(fd, "deadline", "Deadline");
    if (deadline && deadline < start) throw new InputError("The deadline cannot be before the start date.");
    const fields = [
      str(fd, "code", "Project code", { max: 30 }), str(fd, "name", "Project name", { max: 150 }),
      str(fd, "description", "Description", { required: false }) || null,
      str(fd, "sponsor", "Sponsor"), str(fd, "objectives", "Objectives"),
      str(fd, "scope_in", "Scope - included"), str(fd, "scope_out", "Scope - excluded"), start, id,
    ];
    // validated above; both updates succeed or neither does
    db.transaction(() => {
      db.prepare(
      `UPDATE project SET code=?, name=?, description=?, sponsor=?, objectives=?, scope_in=?, scope_out=?, start_date=? WHERE id=?`,
      ).run(...fields);
      if (!locked) {
        db.prepare("UPDATE project SET original_budget=?, current_budget=?, original_deadline=?, deadline=? WHERE id=?")
          .run(budget, budget, deadline, deadline, id);
      }
    })();
    return "Project charter saved.";
  });
}

export async function addStakeholder(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return perform(() => {
    db.prepare(
      `INSERT INTO stakeholders (project_id, name, role, organization, influence, interest, expectations)
       VALUES (?,?,?,?,?,?,?)`,
    ).run(
      idReq(fd, "project_id", "Project"), str(fd, "name", "Name", { max: 120 }), str(fd, "role", "Role"),
      str(fd, "organization", "Organisation"), oneOf(fd, "influence", "Influence", LEVELS),
      oneOf(fd, "interest", "Interest", LEVELS), str(fd, "expectations", "Expectations", { required: false }) || null,
    );
    return "Stakeholder added.";
  });
}

export async function deleteStakeholder(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return perform(() => {
    db.prepare("DELETE FROM stakeholders WHERE id = ?").run(idReq(fd, "id", "Stakeholder"));
    return "Stakeholder removed.";
  });
}
