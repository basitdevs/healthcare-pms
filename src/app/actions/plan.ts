"use server";

import db from "@/lib/db";
import { idReq, perform, str, today } from "@/lib/action";
import type { ActionResult } from "@/lib/action-types";

export async function savePlan(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return perform(() => {
    db.prepare(
      `INSERT INTO pm_plan (project_id, version, scope_plan, schedule_plan, cost_plan, quality_plan, updated_on)
       VALUES (?,?,?,?,?,?,?)
       ON CONFLICT(project_id) DO UPDATE SET version=excluded.version, scope_plan=excluded.scope_plan,
         schedule_plan=excluded.schedule_plan, cost_plan=excluded.cost_plan, quality_plan=excluded.quality_plan,
         updated_on=excluded.updated_on`,
    ).run(
      idReq(fd, "project_id", "Project"), str(fd, "version", "Version", { max: 20 }),
      str(fd, "scope_plan", "Scope plan"), str(fd, "schedule_plan", "Schedule plan"),
      str(fd, "cost_plan", "Cost plan"), str(fd, "quality_plan", "Quality plan"), today(),
    );
    return "Project management plan saved.";
  });
}
