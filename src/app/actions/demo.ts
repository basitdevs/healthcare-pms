"use server";

import fs from "node:fs";
import path from "node:path";
import db from "@/lib/db";
import { perform } from "@/lib/action";
import type { ActionResult } from "@/lib/action-types";

/** Drops every table/view and reloads schema.sql + seed.sql on the live connection (demo reset). */
export async function resetDemo(_prev: ActionResult | null, _fd: FormData): Promise<ActionResult> {
  void _prev; void _fd;
  return perform(() => {
    const dir = path.join(process.cwd(), "db");
    const schema = fs.readFileSync(path.join(dir, "schema.sql"), "utf8");
    const seed = fs.readFileSync(path.join(dir, "seed.sql"), "utf8");
    db.pragma("foreign_keys = OFF");
    try {
      const views = db.prepare("SELECT name FROM sqlite_master WHERE type = 'view'").all() as { name: string }[];
      for (const v of views) db.exec(`DROP VIEW IF EXISTS "${v.name}"`);
      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all() as { name: string }[];
      for (const t of tables) db.exec(`DROP TABLE IF EXISTS "${t.name}"`);
    } finally {
      db.pragma("foreign_keys = ON");
    }
    db.exec(schema);
    db.exec(seed);
    return "Demo data restored: CR-001 is pending again and the project is at its original baseline.";
  });
}
