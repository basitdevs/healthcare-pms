// Rebuilds healthcare.db from schema.sql + seed.sql.
// Usage:  npm run db:init            (full demo data)
//         npm run db:init -- --empty (schema only)
import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const dbFile = path.join(root, "healthcare.db");
const schema = fs.readFileSync(path.join(root, "db", "schema.sql"), "utf8");
const seed = fs.readFileSync(path.join(root, "db", "seed.sql"), "utf8");
const empty = process.argv.includes("--empty");

for (const f of [dbFile, `${dbFile}-journal`, `${dbFile}-wal`, `${dbFile}-shm`]) {
  if (fs.existsSync(f)) fs.rmSync(f);
}

const db = new Database(dbFile);
db.pragma("foreign_keys = ON");
try {
  db.exec(schema);
  if (!empty) db.exec(seed);
  const n = (t: string) => (db.prepare(`SELECT COUNT(*) c FROM ${t}`).get() as { c: number }).c;
  console.log(`healthcare.db created${empty ? " (schema only)" : " with sample data"}`);
  if (!empty) {
    console.log(
      `  tasks=${n("tasks")} requirements=${n("requirements")} defects=${n("defects")} ` +
        `risks=${n("risks")} cost_entries=${n("cost_entries")} change_requests=${n("change_requests")}`,
    );
  }
} catch (e) {
  console.error("DB build failed:", (e as Error).message);
  process.exitCode = 1;
} finally {
  db.close();
}
