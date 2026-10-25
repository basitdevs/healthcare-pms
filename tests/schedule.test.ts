// Phase 3 tests: scheduling engine + DB business rules.
// Every test builds a fresh IN-MEMORY database from db/schema.sql + db/seed.sql (never healthcare.db).
// Run: npm run test
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DeadlineBanner } from "../src/components/DeadlineBanner";
import { analyseSchedule, downstream, progressState, recalculatePlan } from "../src/lib/schedule";
import { loadSchedule, scheduleFor } from "../src/lib/schedule-data";

const sql = (f: string) => fs.readFileSync(path.join(process.cwd(), "db", f), "utf8");
const SCHEMA = sql("schema.sql");
const SEED = sql("seed.sql");

function freshDb() {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA);
  db.exec(SEED);
  return db;
}
const sched = (db: Database.Database) => scheduleFor(db, 1)!;
const byCode = (s: ReturnType<typeof sched>) => {
  const id = new Map(s.tasks.map((t) => [t.code, t.id]));
  return (code: string) => s.analysis.forecast.get(id.get(code)!)!;
};
const codes = (s: ReturnType<typeof sched>, list: { task: { code: string } }[]) => list.map((x) => x.task.code).sort();
const rejects = (db: Database.Database, stmt: string, expected: RegExp) => assert.throws(() => db.exec(stmt), expected);

// ------------------------------------------------------------------ expected results on the seed
test("SCH-01 directly delayed activities and their forecast end dates", () => {
  const s = sched(freshDb());
  const f = byCode(s);
  assert.deepEqual(codes(s, s.analysis.delayed), ["T10", "T12", "T15", "T16"]);
  const expected: [string, number, string][] = [["T10", 3, "2026-10-30"], ["T12", 3, "2026-11-01"], ["T15", 3, "2026-10-30"], ["T16", 1, "2026-11-03"]];
  for (const [c, delay, end] of expected) {
    assert.equal(f(c).delay_days, delay, `${c} delay`);
    assert.equal(f(c).forecast_end, end, `${c} forecast end`);
    assert.equal(f(c).kind, "Delayed (own progress)");
  }
});

test("SCH-02 impacted activities are pushed +3 days and name the predecessor", () => {
  const s = sched(freshDb());
  const f = byCode(s);
  const impacted = ["T13", "T17", "T18", "T19", "T20", "T21", "T22", "T23", "T24", "T25"];
  assert.deepEqual(codes(s, s.analysis.impacted), impacted);
  for (const c of impacted) assert.equal(f(c).delay_days, 3, `${c} delay`);
  assert.equal(f("T13").forecast_end, "2026-11-11");
  assert.match(f("T13").cause, /T10/);
  assert.match(f("T18").cause, /T12/);
});

test("SCH-03 projected finish, slip and margin vs current deadline", () => {
  const a = sched(freshDb()).analysis;
  assert.equal(a.plannedFinish, "2026-12-21");
  assert.equal(a.projectedFinish, "2026-12-24");
  assert.equal(a.slipDays, 3);
  assert.equal(a.marginDays, 3); // deadline 2026-12-27
});

test("SCH-04 T08 and T09 are completed late (+2), not delayed", () => {
  const s = sched(freshDb());
  const f = byCode(s);
  assert.deepEqual(codes(s, s.analysis.completedLate), ["T08", "T09"]);
  for (const c of ["T08", "T09"]) {
    assert.equal(f(c).kind, "Completed late");
    assert.equal(f(c).delay_days, 2);
  }
  assert.ok(!codes(s, s.analysis.delayed).includes("T08"));
});

test("SCH-05 seed has no dependency conflicts, no over-allocation, nothing to recalculate", () => {
  const a = sched(freshDb()).analysis;
  assert.equal(a.conflicts.length, 0);
  assert.equal(a.overAllocations.length, 0);
  assert.equal(a.recalc.length, 0);
});

test("SCH-06 critical path (total float 0) runs T10 -> T13 -> T17/T19 -> T21 ... T25", () => {
  const s = sched(freshDb());
  const crit = s.tasks.filter((t) => s.analysis.critical.has(t.id)).map((t) => t.code);
  assert.deepEqual(crit, ["T10", "T13", "T17", "T19", "T21", "T22", "T23", "T24", "T25"]);
  const id = (c: string) => s.tasks.find((t) => t.code === c)!.id;
  assert.equal(s.analysis.float.get(id("T20")), 2);
  assert.equal(s.analysis.float.get(id("T12")), 5);
});

test("SCH-07 impact analysis lists all downstream activities of a delayed task", () => {
  const s = sched(freshDb());
  const row = s.analysis.impact.find((r) => r.task.code === "T10")!;
  assert.deepEqual(row.downstream.map((d) => d.code).sort(), ["T13", "T17", "T18", "T19", "T20", "T21", "T22", "T23", "T24", "T25"]);
  assert.ok(row.downstream.every((d) => d.days === 3));
  assert.ok(row.downstream.find((d) => d.code === "T13")!.pushedByThis);
  const t16 = s.tasks.find((t) => t.code === "T16")!;
  assert.deepEqual(downstream(t16.id, s.tasks, s.deps).length, 7); // T19, T20, T21..T25
});

test("SCH-08 milestone linked to a delayed task turns At Risk with the forecast date", () => {
  const ms = sched(freshDb()).milestones;
  const backend = ms.find((m) => m.name === "Backend core modules complete")!;
  assert.equal(backend.forecast_date, "2026-11-11");
  assert.equal(backend.display_status, "At Risk");
  assert.equal(ms.find((m) => m.name === "Design complete")!.display_status, "Achieved");
});

test("SCH-09 an earlier deadline shows a red 'will miss the deadline by N days' warning", () => {
  const db = freshDb();
  db.exec("UPDATE project SET deadline = '2026-12-22' WHERE id = 1");
  const s = sched(db);
  assert.equal(s.analysis.marginDays, -2);
  const html = renderToStaticMarkup(createElement(DeadlineBanner, { projectedFinish: s.analysis.projectedFinish, deadline: s.project.deadline, marginDays: s.analysis.marginDays }));
  assert.match(html, /will miss the deadline by 2 days/);
  assert.match(html, /role="alert"/);
  assert.match(html, /bg-red-50/);
  const ok = renderToStaticMarkup(createElement(DeadlineBanner, { projectedFinish: "2026-12-24", deadline: "2026-12-27", marginDays: 3 }));
  assert.doesNotMatch(ok, /will miss/);
});

test("SCH-10 lag days are honoured by the forecast", () => {
  const db = freshDb();
  db.exec("UPDATE task_dependencies SET lag_days = 2 WHERE task_id = 13 AND predecessor_id = 10");
  const f = byCode(sched(db));
  assert.equal(f("T13").forecast_start, "2026-11-02"); // T10 ends 30 Oct + 1 + 2
  assert.equal(f("T13").forecast_end, "2026-11-13");
});

// ------------------------------------------------------------------ database business rules
test("DB-01 a circular dependency is rejected", () => {
  const db = freshDb();
  rejects(db, "INSERT INTO task_dependencies (task_id, predecessor_id) VALUES (10, 25)", /Circular dependency/);
  rejects(db, "INSERT INTO task_dependencies (task_id, predecessor_id) VALUES (13, 13)", /Circular dependency|CHECK constraint/);
});

test("DB-02 task estimates above the approved budget are rejected (5.0M, then 5.8M after CR-001)", () => {
  const db = freshDb();
  const insert = (cost: number, code: string) =>
    `INSERT INTO tasks (project_id, code, wbs_item_id, name, assignee_id, duration_days, planned_start, planned_end, estimated_cost)
     VALUES (1, '${code}', 21, 'Extra', 3, 5, '2026-12-01', '2026-12-05', ${cost})`;
  rejects(db, insert(1, "T26"), /BUDGET RULE/);
  rejects(db, "UPDATE tasks SET estimated_cost = estimated_cost + 1 WHERE id = 13", /BUDGET RULE/);

  db.exec("UPDATE change_requests SET status = 'Approved', decision_by = 'Board', decision_date = '2026-10-26' WHERE id = 1");
  db.exec("INSERT INTO wbs_items (project_id, parent_id, code, name, node_type) VALUES (1, 1, '1.6', 'AI Diagnosis and Mobile App', 'Deliverable')");
  const d = (db.prepare("SELECT id FROM wbs_items WHERE code = '1.6'").get() as { id: number }).id;
  db.exec(`INSERT INTO wbs_items (project_id, parent_id, code, name, node_type, requirement_id) VALUES (1, ${d}, '1.6.1', 'AI Diagnosis Module', 'Work Package', 11)`);
  const wp = (db.prepare("SELECT id FROM wbs_items WHERE code = '1.6.1'").get() as { id: number }).id;
  const add = (cost: number, code: string) =>
    `INSERT INTO tasks (project_id, code, wbs_item_id, name, assignee_id, duration_days, planned_start, planned_end, estimated_cost)
     VALUES (1, '${code}', ${wp}, 'AI module', 2, 10, '2026-11-01', '2026-11-10', ${cost})`;
  rejects(db, add(800_001, "T26"), /BUDGET RULE/);
  db.exec(add(800_000, "T26"));
  assert.equal((db.prepare("SELECT SUM(estimated_cost) s FROM tasks").get() as { s: number }).s, 5_800_000);
  assert.equal(sched(db).workPackages.find((w) => w.code === "1.6.1")!.tasks, 1);
});

test("DB-03 progress updates always produce a state the tasks CHECK accepts", () => {
  const db = freshDb();
  const statusDate = "2026-10-25";
  const apply = (id: number, s: ReturnType<typeof progressState>) =>
    db.prepare("UPDATE tasks SET status = ?, percent_complete = ?, actual_start = ?, actual_end = ? WHERE id = ?")
      .run(s.status, s.percent_complete, s.actual_start, s.actual_end, id);
  const read = (id: number) => db.prepare("SELECT status, percent_complete, actual_start, actual_end FROM tasks WHERE id = ?").get(id);

  apply(13, progressState({ percent: 20, onHold: false, actualStart: null, actualEnd: null, statusDate }));
  assert.deepEqual(read(13), { status: "In Progress", percent_complete: 20, actual_start: statusDate, actual_end: null });

  apply(10, progressState({ percent: 100, onHold: false, actualStart: "2026-10-18", actualEnd: null, statusDate }));
  assert.deepEqual(read(10), { status: "Completed", percent_complete: 100, actual_start: "2026-10-18", actual_end: statusDate });

  apply(12, progressState({ percent: 55, onHold: true, actualStart: "2026-10-18", actualEnd: null, statusDate }));
  assert.equal((read(12) as { status: string }).status, "On Hold");

  apply(16, progressState({ percent: 0, onHold: false, actualStart: "2026-10-24", actualEnd: null, statusDate }));
  assert.deepEqual(read(16), { status: "Not Started", percent_complete: 0, actual_start: null, actual_end: null });

  assert.throws(() => progressState({ percent: 101, onHold: false, actualStart: null, actualEnd: null, statusDate }), /0 to 100/);
  assert.throws(() => progressState({ percent: 100, onHold: false, actualStart: "2026-10-20", actualEnd: "2026-10-19", statusDate }), /before actual start/);
  assert.throws(() => progressState({ percent: 50, onHold: false, actualStart: "2026-10-30", actualEnd: null, statusDate }), /after the status date/);
  // and the raw CHECK still guards inconsistent states
  rejects(db, "UPDATE tasks SET percent_complete = 50 WHERE id = 20", /CHECK constraint/);
});

test("DB-04 a manual dependency conflict is detected and Recalculate fixes it", () => {
  const db = freshDb();
  db.exec("UPDATE tasks SET planned_start = '2026-11-01', planned_end = '2026-11-10' WHERE id = 19"); // T19 now starts before T13/T16 finish
  let s = sched(db);
  const found = s.analysis.conflicts.filter((c) => c.task === "T19").map((c) => c.predecessor).sort();
  assert.deepEqual(found, ["T13", "T16"]);
  assert.equal(s.analysis.conflicts.find((c) => c.predecessor === "T13")!.required_start, "2026-11-09");

  const changes = recalculatePlan(s.tasks, s.deps);
  assert.deepEqual(changes.map((c) => [c.code, c.planned_start, c.planned_end]), [["T19", "2026-11-09", "2026-11-18"]]);
  const upd = db.prepare("UPDATE tasks SET planned_start = ?, planned_end = ? WHERE id = ?");
  for (const c of changes) upd.run(c.planned_start, c.planned_end, c.id);
  s = sched(db);
  assert.equal(s.analysis.conflicts.length, 0);
});

test("DB-05 resource over-allocation is detected", () => {
  const db = freshDb();
  db.exec("UPDATE tasks SET assignee_id = 2 WHERE id = 13"); // Usman already has T12 (to 29 Oct) and T18 (30 Oct - 5 Nov)
  const over = sched(db).analysis.overAllocations;
  const pairs = over.map((o) => `${o.a.code}/${o.b.code}`).sort();
  assert.deepEqual(pairs, ["T12/T13", "T13/T18"]);
  const t12 = over.find((o) => o.a.code === "T12")!;
  assert.equal(t12.from, "2026-10-28");
  assert.equal(t12.days, 2);
});

test("ENG-01 forward pass and analysis are pure (no DB) and consistent with the loader", () => {
  const db = freshDb();
  const data = loadSchedule(db, 1)!;
  db.close(); // the engine must not need the connection any more
  const a = analyseSchedule(data.tasks, data.deps, { statusDate: "2026-10-25", deadline: "2026-12-27" });
  assert.equal(a.projectedFinish, "2026-12-24");
});
