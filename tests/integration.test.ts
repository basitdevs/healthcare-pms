// Phase 6 tests: dashboard aggregates, health rule, consistency checks and an end-to-end change-request flow.
// Uses an IN-MEMORY database built from db/schema.sql + db/seed.sql (never healthcare.db).
// Run: npm run test
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { runConsistencyChecks, summarise } from "../src/lib/consistency";
import { projectHealth } from "../src/lib/dashboard";
import { consistencyFor, consistencyInput, dashboardFor } from "../src/lib/integration-data";

const SCHEMA = fs.readFileSync(path.join(process.cwd(), "db", "schema.sql"), "utf8");
const SEED = fs.readFileSync(path.join(process.cwd(), "db", "seed.sql"), "utf8");
function freshDb() {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA);
  db.exec(SEED);
  return db;
}
const approveCr1 = (db: Database.Database) =>
  db.exec("UPDATE change_requests SET status = 'Approved', decision_by = 'Hospital Management Board', decision_date = '2026-10-26' WHERE id = 1");
const status = (db: Database.Database) => Object.fromEntries(consistencyFor(db, 1)!.map((c) => [c.id, c]));
const near = (v: number | null, e: number, tol: number, what: string) => assert.ok(v !== null && Math.abs(v - e) <= tol, `${what}: expected ${e} ±${tol}, got ${v}`);
const baseRow = (db: Database.Database, label: string) => dashboardFor(db, 1)!.baseline.find((r) => r.label === label)!;

test("INT-01 dashboard aggregates on the seed", () => {
  const d = dashboardFor(freshDb(), 1)!;
  assert.equal(d.health.rag, "AMBER");
  near(d.progress.ev, 0.547, 0.0005, "EV/BAC");
  near(d.progress.pv, 0.594, 0.0005, "PV/BAC");
  const a = d.evm.analysis;
  near(a.project.cpi, 0.913, 0.001, "CPI");
  near(a.project.spi, 0.920, 0.001, "SPI");
  assert.equal(a.project.ac, 2_995_000);
  near(a.forecast.eac, 5_478_300, 1000, "EAC");
  const s = d.sched.analysis;
  assert.deepEqual(s.delayed.map((x) => x.task.code).sort(), ["T10", "T12", "T15", "T16"]);
  assert.equal(s.impacted.length, 10);
  assert.equal(s.projectedFinish, "2026-12-24");
  assert.equal(d.project.deadline, "2026-12-27");
  assert.equal(s.marginDays, 3);
  assert.deepEqual(d.pending, [{ code: "CR-001", title: d.pending[0].title, cost_impact: 800_000, schedule_impact_days: 21 }]);
  assert.equal(d.quality.counts.unresolvedCritical, 3);
  assert.equal(d.quality.risks[0].code, "RSK-02");
  assert.equal(d.quality.risks[0].score, 20);
  assert.equal((d.quality.checklist.rate! * 100).toFixed(1), "46.2");
  assert.equal(d.milestones[0].name, "Backend core modules complete");
  assert.equal(d.milestones[0].forecast_date, "2026-11-11");
});

test("INT-02 health rule: RED / AMBER / GREEN", () => {
  const ok = { cpi: 1, spi: 1, critical: 0.85, projectedFinish: "2026-12-20", deadline: "2026-12-27", alerts: 0, delayed: 0, pendingCRs: 0, unresolvedCritical: 0 };
  assert.equal(projectHealth(ok).rag, "GREEN");
  assert.equal(projectHealth({ ...ok, cpi: 0.84 }).rag, "RED");
  assert.equal(projectHealth({ ...ok, spi: 0.8 }).rag, "RED");
  assert.equal(projectHealth({ ...ok, projectedFinish: "2026-12-28" }).rag, "RED");
  assert.equal(projectHealth({ ...ok, cpi: null, spi: null }).rag, "GREEN"); // n/a never raises an alert
  for (const k of ["alerts", "delayed", "pendingCRs", "unresolvedCritical"] as const) assert.equal(projectHealth({ ...ok, [k]: 1 }).rag, "AMBER", k);
  const red = projectHealth({ ...ok, cpi: 0.8, projectedFinish: "2027-01-01" });
  assert.equal(red.reasons.length, 2);
});

test("INT-03 consistency checks on the seed: everything passes", () => {
  const checks = consistencyFor(freshDb(), 1)!;
  assert.equal(checks.length, 13);
  assert.deepEqual(summarise(checks), { pass: 13, warn: 0, fail: 0 });
});

test("INT-04 consistency checks detect broken data (FAIL) and warnings", () => {
  const input = consistencyInput(freshDb(), 1)!;
  input.costEntries.push({ id: 99, task_id: 13, entry_date: "2026-10-30", amount: 1000 }); // T13 Not Started + future date
  input.wbs.push({ id: 99, code: "1.3.9", name: "Pharmacy", node_type: "Work Package", requirement_id: 13 }); // REQ-013 Rejected
  input.defects.push({ id: 99, code: "DEF-099", task_id: 999, task_exists: 0 });
  input.tasks.find((t) => t.code === "T13")!.planned_start = "2026-10-20"; // before T10 ends
  input.tasks.find((t) => t.code === "T25")!.planned_end = "2027-01-05";   // after the deadline
  input.tasks.find((t) => t.code === "T25")!.estimated_cost += 1;          // BAC > budget
  input.requirements.find((r) => r.code === "REQ-011")!.status = "Approved";
  input.changeRequests.find((c) => c.code === "CR-001")!.status = "Approved"; // REQ-012 still Proposed
  input.milestones.find((m) => m.name === "Project closure")!.target_date = "2026-12-20";
  input.tasks.find((t) => t.code === "T13")!.assignee_id = 2; // Usman also has T12/T18
  const r = Object.fromEntries(runConsistencyChecks(input).map((c) => [c.id, c]));
  for (const id of ["C03", "C04", "C06", "C08", "C09", "C10", "C11"]) assert.equal(r[id].status, "FAIL", id);
  for (const id of ["C01", "C02", "C05", "C12", "C13"]) assert.equal(r[id].status, "WARN", id);
  assert.match(r.C11.issues[0], /CR-001: REQ-012 is Proposed/);
  assert.match(r.C09.issues[0], /dated 2026-10-30/);
});

test("INT-05 after approving CR-001: baseline vs current and integrity warnings", () => {
  const db = freshDb();
  approveCr1(db);
  assert.deepEqual([baseRow(db, "Budget (PKR)").baseline, baseRow(db, "Budget (PKR)").current], [5_000_000, 5_800_000]);
  assert.deepEqual([baseRow(db, "Deadline").baseline, baseRow(db, "Deadline").current], ["2026-12-27", "2027-01-17"]);
  assert.deepEqual([baseRow(db, "Duration (weeks)").baseline, baseRow(db, "Duration (weeks)").current], [16, 19]);
  assert.deepEqual([baseRow(db, "Approved requirements").baseline, baseRow(db, "Approved requirements").current], [10, 12]);
  const e = dashboardFor(db, 1)!.evm.analysis.forecast;
  assert.deepEqual([e.approvedBudget, e.bac, e.unallocated], [5_800_000, 5_000_000, 800_000]);
  const c = status(db);
  assert.equal(c.C01.status, "WARN");
  assert.deepEqual(c.C01.issues.map((x: string) => x.slice(0, 7)), ["REQ-011", "REQ-012"]);
  assert.equal(c.C07.status, "WARN");
  assert.match(c.C07.issues[0], /PKR 800,000 unallocated/);
  assert.equal(summarise(consistencyFor(db, 1)!).fail, 0);
});

test("INT-06 end-to-end: approve CR-001 -> WBS + tasks for the new scope -> budget guard -> warnings clear", () => {
  const db = freshDb();
  assert.throws(() => db.exec("UPDATE requirements SET status = 'Approved' WHERE code = 'REQ-011'"), /SCOPE RULE/); // not before approval
  assert.throws(() => db.exec("INSERT INTO wbs_items (project_id, parent_id, code, name, node_type, requirement_id) VALUES (1, 4, '1.3.7', 'AI', 'Work Package', 11)"), /SCOPE RULE/);
  approveCr1(db);
  db.exec("INSERT INTO wbs_items (id, project_id, parent_id, code, name, node_type) VALUES (22, 1, 1, '1.6', 'AI Diagnosis and Mobile App', 'Deliverable')");
  db.exec("INSERT INTO wbs_items (id, project_id, parent_id, code, name, node_type, requirement_id) VALUES (23, 1, 22, '1.6.1', 'AI Diagnosis Module', 'Work Package', 11)");
  db.exec("INSERT INTO wbs_items (id, project_id, parent_id, code, name, node_type, requirement_id) VALUES (24, 1, 22, '1.6.2', 'Mobile Application', 'Work Package', 12)");
  assert.equal(status(db).C02.status, "WARN"); // new work packages have no tasks yet
  const task = (code: string, wp: number, who: number, cost: number) =>
    `INSERT INTO tasks (project_id, code, wbs_item_id, name, assignee_id, duration_days, planned_start, planned_end, estimated_cost)
     VALUES (1, '${code}', ${wp}, 'New scope ${code}', ${who}, 22, '2026-11-19', '2026-12-10', ${cost})`;
  db.exec(task("T26", 23, 4, 450_000)); // Sana Malik is free after T17
  assert.throws(() => db.exec(task("T27", 24, 5, 350_001)), /BUDGET RULE/); // would exceed 5,800,000
  db.exec(task("T27", 24, 5, 350_000)); // Bilal Ahmed is free after T19
  const c = status(db);
  assert.deepEqual(summarise(consistencyFor(db, 1)!), { pass: 13, warn: 0, fail: 0 }, JSON.stringify(Object.values(c).filter((x) => x.status !== "PASS")));
  const d = dashboardFor(db, 1)!;
  assert.equal(d.evm.analysis.forecast.bac, 5_800_000);
  near(d.evm.analysis.forecast.eac, 6_355_000, 1000, "EAC");
  assert.equal(baseRow(db, "WBS work packages").current, 17);
  assert.equal(baseRow(db, "Tasks").current, 27);
  assert.equal(baseRow(db, "Tasks").baseline, 25);
});
