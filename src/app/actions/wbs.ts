"use server";

import db from "@/lib/db";
import { InputError, idOpt, idReq, oneOf, perform, str } from "@/lib/action";
import type { ActionResult } from "@/lib/action-types";

interface Node { id: number; code: string; node_type: string }

function nextChildCode(parent: Node): string {
  const kids = db.prepare("SELECT code FROM wbs_items WHERE parent_id = ?").all(parent.id) as { code: string }[];
  const max = kids.reduce((m, k) => Math.max(m, Number(k.code.split(".").pop()) || 0), 0);
  return `${parent.code}.${max + 1}`;
}

export async function addWbsItem(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return perform(() => {
    const pid = idReq(fd, "project_id", "Project");
    const type = oneOf(fd, "node_type", "Type", ["Deliverable", "Work Package"] as const);
    let parentId = idOpt(fd, "parent_id");
    if (type === "Deliverable") {
      const root = db.prepare("SELECT id FROM wbs_items WHERE project_id = ? AND node_type = 'Project'").get(pid) as { id: number } | undefined;
      if (!root) throw new InputError("The project root node is missing.");
      parentId = root.id;
    } else if (parentId === null) {
      throw new InputError("Choose the deliverable this work package belongs to.");
    }
    const parent = db.prepare("SELECT id, code, node_type FROM wbs_items WHERE id = ?").get(parentId) as Node | undefined;
    if (!parent) throw new InputError("Parent WBS item not found.");
    const code = nextChildCode(parent);
    const reqId = type === "Work Package" ? idOpt(fd, "requirement_id") : null;
    // DB trigger rejects a requirement that is not Approved (the approved-scope rule).
    db.prepare("INSERT INTO wbs_items (project_id, parent_id, code, name, node_type, requirement_id, description) VALUES (?,?,?,?,?,?,?)").run(
      pid, parent.id, code, str(fd, "name", "Name", { max: 150 }), type, reqId, str(fd, "description", "Description", { required: false }) || null,
    );
    return `${type} ${code} added to the WBS.`;
  });
}

export async function renameWbsItem(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return perform(() => {
    db.prepare("UPDATE wbs_items SET name = ?, description = ? WHERE id = ?").run(
      str(fd, "name", "Name", { max: 150 }), str(fd, "description", "Description", { required: false }) || null, idReq(fd, "id", "WBS item"),
    );
    return "WBS item updated.";
  });
}

export async function deleteWbsItem(_prev: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return perform(() => {
    const id = idReq(fd, "id", "WBS item");
    const n = db.prepare(
      `SELECT (SELECT COUNT(*) FROM wbs_items WHERE parent_id = @id) AS kids,
              (SELECT COUNT(*) FROM tasks WHERE wbs_item_id = @id) AS tasks,
              (SELECT node_type FROM wbs_items WHERE id = @id) AS node_type`,
    ).get({ id }) as { kids: number; tasks: number; node_type: string | null };
    if (!n.node_type) throw new InputError("WBS item not found.");
    if (n.node_type === "Project") throw new InputError("The project root cannot be deleted.");
    if (n.kids > 0) throw new InputError("This item still has child items. Delete or move them first.");
    if (n.tasks > 0) throw new InputError("This work package has scheduled tasks. Remove the tasks first.");
    db.prepare("DELETE FROM wbs_items WHERE id = ?").run(id);
    return "WBS item deleted.";
  });
}
