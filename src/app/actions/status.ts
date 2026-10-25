"use server";

import db from "@/lib/db";
import { InputError, dateReq, idOpt, idReq, intReq, oneOf, perform, str } from "@/lib/action";
import type { ActionResult } from "@/lib/action-types";

const PHASES = ["Initiating", "Planning", "Executing", "Monitoring", "Closing"] as const;
const HEALTH = ["Green", "Amber", "Red"] as const;
const ROLES = ["Project Manager", "Backend Developer", "Frontend Developer", "Database Developer", "QA Engineer"] as const;

const projectRow = (id: number) =>
  db.prepare("SELECT id, start_date, status_date, status FROM project WHERE id = ?").get(id) as
    { id: number; start_date: string; status_date: string; status: string } | undefined;

export async function setPhase(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return perform(() => {
    const id = idReq(fd, "project_id", "Project");
    const phase = oneOf(fd, "phase", "Project phase", PHASES);
    db.prepare("UPDATE project SET status = ? WHERE id = ?").run(phase, id);
    return `Project phase set to ${phase}.`;
  });
}

export async function setStatusDate(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return perform(() => {
    const id = idReq(fd, "project_id", "Project");
    const date = dateReq(fd, "status_date", "Status date");
    const p = projectRow(id);
    if (!p) throw new InputError("Project not found.");
    if (date < p.start_date) throw new InputError("The status date cannot be before the project start date.");
    db.prepare("UPDATE project SET status_date = ? WHERE id = ?").run(date, id);
    return "Status date updated. Schedule and cost analysis will use this date.";
  });
}

export async function addStatusReport(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return perform(() => {
    db.prepare("INSERT INTO status_log (project_id, report_date, health, summary, reported_by) VALUES (?,?,?,?,?)").run(
      idReq(fd, "project_id", "Project"), dateReq(fd, "report_date", "Report date"),
      oneOf(fd, "health", "Health", HEALTH), str(fd, "summary", "Summary", { max: 1000 }), idOpt(fd, "reported_by"),
    );
    return "Status report recorded.";
  });
}

export async function addMilestone(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return perform(() => {
    const status = oneOf(fd, "status", "Status", ["Pending", "At Risk", "Achieved", "Missed"] as const);
    const target = dateReq(fd, "target_date", "Target date");
    let actual: string | null = null;
    if (status === "Achieved") actual = fd.get("actual_date") ? dateReq(fd, "actual_date", "Actual date") : target;
    db.prepare("INSERT INTO milestones (project_id, name, target_date, actual_date, task_id, owner_id, status) VALUES (?,?,?,?,?,?,?)").run(
      idReq(fd, "project_id", "Project"), str(fd, "name", "Milestone name", { max: 150 }), target, actual,
      idOpt(fd, "task_id"), idOpt(fd, "owner_id"), status,
    );
    return "Milestone added.";
  });
}

export async function setMilestoneStatus(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return perform(() => {
    const id = idReq(fd, "id", "Milestone");
    const status = oneOf(fd, "status", "Status", ["Pending", "At Risk", "Achieved", "Missed"] as const);
    const row = db.prepare("SELECT m.project_id, p.status_date FROM milestones m JOIN project p ON p.id = m.project_id WHERE m.id = ?")
      .get(id) as { project_id: number; status_date: string } | undefined;
    if (!row) throw new InputError("Milestone not found.");
    db.prepare("UPDATE milestones SET status = ?, actual_date = ? WHERE id = ?").run(status, status === "Achieved" ? row.status_date : null, id);
    return status === "Achieved" ? "Milestone marked as achieved." : `Milestone set to ${status}.`;
  });
}

export async function deleteMilestone(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return perform(() => {
    db.prepare("DELETE FROM milestones WHERE id = ?").run(idReq(fd, "id", "Milestone"));
    return "Milestone deleted.";
  });
}

export async function addTeamMember(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return perform(() => {
    db.prepare("INSERT INTO team_members (project_id, name, role, email) VALUES (?,?,?,?)").run(
      idReq(fd, "project_id", "Project"), str(fd, "name", "Name", { max: 120 }), oneOf(fd, "role", "Role", ROLES),
      str(fd, "email", "Email", { required: false }) || null,
    );
    return "Team member added.";
  });
}

export async function deleteTeamMember(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return perform(() => {
    const id = idReq(fd, "id", "Team member");
    const used = db.prepare(
      `SELECT (SELECT COUNT(*) FROM tasks WHERE assignee_id = @id) + (SELECT COUNT(*) FROM defects WHERE assigned_to = @id OR reported_by = @id)
            + (SELECT COUNT(*) FROM risks WHERE owner_id = @id) + (SELECT COUNT(*) FROM inspections WHERE inspector_id = @id) n`,
    ).get({ id }) as { n: number };
    if (used.n > 0) throw new InputError("This person still has tasks, defects, risks or inspections assigned. Reassign them first.");
    db.prepare("DELETE FROM team_members WHERE id = ?").run(id);
    return "Team member removed.";
  });
}

export async function saveClosure(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return perform(() => {
    db.prepare(
      `INSERT INTO project_closure (project_id, closure_date, deliverables_accepted, final_cost, lessons_learned, signed_off_by)
       VALUES (?,?,?,?,?,?)
       ON CONFLICT(project_id) DO UPDATE SET closure_date=excluded.closure_date, deliverables_accepted=excluded.deliverables_accepted,
         final_cost=excluded.final_cost, lessons_learned=excluded.lessons_learned, signed_off_by=excluded.signed_off_by`,
    ).run(
      idReq(fd, "project_id", "Project"), dateReq(fd, "closure_date", "Closure date"),
      fd.get("deliverables_accepted") === "1" ? 1 : 0, intReq(fd, "final_cost", "Final cost", { min: 0 }),
      str(fd, "lessons_learned", "Lessons learned"), str(fd, "signed_off_by", "Signed off by"),
    );
    return "Closure record saved.";
  });
}

export async function closeProject(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return perform(() => {
    const id = idReq(fd, "project_id", "Project");
    const rec = db.prepare("SELECT deliverables_accepted FROM project_closure WHERE project_id = ?").get(id) as { deliverables_accepted: number } | undefined;
    if (!rec) throw new InputError("Save the closure record before closing the project.");
    if (!rec.deliverables_accepted) throw new InputError("Deliverables must be accepted by the sponsor before the project can be closed.");
    db.prepare("UPDATE project SET status = 'Closed' WHERE id = ?").run(id); // DB gate blocks open work / critical defects
    return "Project closed.";
  });
}
