import Database from "better-sqlite3";
import path from "node:path";

// One shared connection (survives Next.js hot reloads in dev).
const g = globalThis as unknown as { __healthcareDb?: Database.Database };

// HEALTHCARE_DB lets you point the app at another file (e.g. an empty database for testing).
export const dbFile = process.env.HEALTHCARE_DB ?? path.join(process.cwd(), "healthcare.db");

export const db: Database.Database = g.__healthcareDb ?? new Database(dbFile);

db.pragma("foreign_keys = ON"); // enforce consistency between modules
g.__healthcareDb = db;

export default db;

/** True once the schema exists (npm run db:init). The layout shows a setup screen otherwise. */
export function dbReady(): boolean {
  try {
    return !!db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'project'").get();
  } catch {
    return false;
  }
}
