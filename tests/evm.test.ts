// Phase 4 tests: earned value engine (pure) + DB-backed seed scenarios.
// DB tests build a fresh IN-MEMORY database from db/schema.sql + db/seed.sql (never healthcare.db).
// Run: npm run test
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import {
  analyseEvm, byCategory, evmAlerts, forecasts, metricsOf, plannedFraction, rollup, sCurve, taskMetrics,
  validateCostEntry, validateThresholds, type EvmTask,
} from "../src/lib/evm";
import { evmFor } from "../src/lib/evm-data";

const TH = { warning: 0.95, critical: 0.85 };
const near = (actual: number | null, expected: number, tol: number, what = "") =>
  assert.ok(actual !== null && Math.abs(actual - expected) <= tol, `${what} expected ${expected} ±${tol}, got ${actual}`);

let nextId = 1;
const mk = (o: Partial<EvmTask> = {}): EvmTask => ({
  id: nextId++, code: `X${nextId}`, name: "Task", estimated_cost: 100_000, duration_days: 10,
  planned_start: "2026-01-01", planned_end: "2026-01-10", actual_start: null, actual_end: null,
  percent_complete: 0, status: "Not Started", ac: 0, ...o,
});
const run = (tasks: EvmTask[], statusDate: string, approvedBudget = tasks.reduce((s, t) => s + t.estimated_cost, 0)) =>
  analyseEvm({ tasks, entries: [], statusDate, approvedBudget, thresholds: TH });

const SCHEMA = fs.readFileSync(path.join(process.cwd(), "db", "schema.sql"), "utf8");
const SEED = fs.readFileSync(path.join(process.cwd(), "db", "seed.sql"), "utf8");
function freshDb() {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA);
  db.exec(SEED);
  return db;
}
const evm = (db: Database.Database) => evmFor(db, 1)!;
const task = (e: ReturnType<typeof evm>, code: string) => e.analysis.rows.find((r) => r.task.code === code)!;

// ------------------------------------------------------------------ pure formulas
test("EVM-01 PV is linear over the baseline dates and clamped to 0..BAC", () => {
  const t = mk();
  assert.equal(taskMetrics(t, "2025-12-31").pv, 0);          // before start
  assert.equal(taskMetrics(t, "2026-01-01").pv, 10_000);     // day 1 of 10
  assert.equal(taskMetrics(t, "2026-01-03").pv, 30_000);
  assert.equal(taskMetrics(t, "2026-01-10").pv, 100_000);    // planned end
  assert.equal(taskMetrics(t, "2026-03-01").pv, 100_000);    // after end: clamped to the estimate
  assert.equal(plannedFraction(t, "2026-01-05"), 0.5);
});

test("EVM-02 EV = estimate x % complete; AC from cost entries", () => {
  const m = taskMetrics(mk({ percent_complete: 35, status: "In Progress", actual_start: "2026-01-01", ac: 40_000 }), "2026-01-05");
  assert.equal(m.ev, 35_000);
  assert.equal(m.ac, 40_000);
});

test("EVM-03 CV, SV, CPI, SPI", () => {
  const m = metricsOf(1000, 500, 400, 450);
  assert.equal(m.cv, -50);
  assert.equal(m.sv, -100);
  near(m.cpi, 0.8889, 0.0001, "CPI");
  near(m.spi, 0.8, 0.0001, "SPI");
});

test("EVM-04 zero denominators give n/a (null) and raise no alert", () => {
  const a = run([mk({ percent_complete: 0 })], "2025-12-01"); // before project start, nothing spent
  assert.equal(a.project.pv, 0);
  assert.equal(a.project.cpi, null);
  assert.equal(a.project.spi, null);
  assert.equal(a.forecast.eac, null);
  assert.equal(a.forecast.etc, null);
  assert.equal(a.forecast.vac, null);
  assert.deepEqual(a.alerts, []);
  const done = forecasts(metricsOf(100, 100, 100, 100), 100);
  assert.equal(done.tcpi, null); // BAC - AC = 0
});

test("EVM-05 forecasts: EAC, EAC2, ETC, VAC, TCPI, % complete, % spent", () => {
  const f = forecasts(metricsOf(1000, 450, 400, 500), 1200);
  assert.equal(f.eac, 1250);       // 1000 / 0.8
  assert.equal(f.eac2, 1100);      // 500 + (1000 - 400)
  assert.equal(f.etc, 750);
  assert.equal(f.vac, -250);
  assert.equal(f.vacApproved, -50);
  assert.equal(f.unallocated, 200);
  near(f.tcpi, 1.2, 1e-9, "TCPI");
  assert.equal(f.pctComplete, 0.4);
  assert.equal(f.pctSpent, 0.5);
});

test("EVM-06 CPI/SPI alert levels and message wording", () => {
  const alertsFor = (ev: number, ac: number, pv: number) => {
    const m = metricsOf(1000, pv, ev, ac);
    return evmAlerts(m, forecasts(m, 100_000), [], TH);
  };
  const w = alertsFor(900, 1000, 900);  // CPI 0.90
  assert.equal(w.length, 1);
  assert.equal(w[0].level, "warning");
  assert.match(w[0].message, /^COST WARNING: CPI 0\.90 is below the 0\.95 threshold\. Every PKR 1 of planned work is costing PKR 1\.11/);
  const c = alertsFor(800, 1000, 800);  // CPI 0.80
  assert.equal(c[0].level, "critical");
  assert.match(c[0].message, /COST CRITICAL: CPI 0\.80 is below the 0\.85 threshold/);
  assert.deepEqual(alertsFor(950, 1000, 950), []); // exactly at the threshold: no alert
  const s = alertsFor(500, 500, 600);   // CPI 1, SPI 0.83
  assert.equal(s.length, 1);
  assert.equal(s[0].kind, "SPI");
  assert.equal(s[0].level, "critical");
  assert.match(s[0].message, /SCHEDULE CRITICAL: SPI 0\.83/);
});

test("EVM-07 task over budget, EAC above approved budget, AC above approved budget", () => {
  const t = mk({ status: "Completed", percent_complete: 100, actual_start: "2026-01-01", actual_end: "2026-01-10", ac: 120_000 });
  const a = run([t], "2026-01-20", 110_000);
  const kinds = a.alerts.map((x) => `${x.level}:${x.kind}`);
  assert.ok(kinds.includes("critical:AC_OVER_BUDGET"), kinds.join());
  assert.ok(kinds.includes("warning:EAC_OVER_BUDGET"));
  assert.ok(kinds.includes("warning:TASK_OVER_BUDGET"));
  assert.match(a.alerts.find((x) => x.kind === "TASK_OVER_BUDGET")!.message, /over budget by PKR 20,000/);
  assert.match(a.alerts.find((x) => x.kind === "EAC_OVER_BUDGET")!.message, /projected to exceed the approved budget by PKR 10,000 \(9\.1%\)/);
  assert.equal(a.alerts[0].level, "critical"); // critical first
});

test("EVM-08 every task complete at exactly its estimate: CPI = SPI = 1, no alerts", () => {
  const tasks = [
    mk({ status: "Completed", percent_complete: 100, actual_start: "2026-01-01", actual_end: "2026-01-10", ac: 100_000 }),
    mk({ estimated_cost: 50_000, duration_days: 5, planned_start: "2026-01-11", planned_end: "2026-01-15", status: "Completed", percent_complete: 100, actual_start: "2026-01-11", actual_end: "2026-01-15", ac: 50_000 }),
  ];
  const a = run(tasks, "2026-02-01");
  assert.equal(a.project.cpi, 1);
  assert.equal(a.project.spi, 1);
  assert.equal(a.forecast.eac, 150_000);
  assert.deepEqual(a.alerts, []);
});

test("EVM-09 rollups by group and by cost category", () => {
  const r = rollup([
    { key: "A", label: "A", m: metricsOf(100, 50, 40, 50) },
    { key: "A", label: "A", m: metricsOf(200, 100, 100, 100) },
    { key: "B", label: "B", m: metricsOf(300, 0, 0, 0) },
  ]);
  const a = r.find((x) => x.key === "A")!;
  assert.equal(a.tasks, 2);
  assert.equal(a.bac, 300);
  assert.equal(a.cv, -10);
  near(a.cpi, 140 / 150, 1e-9);
  assert.equal(r.find((x) => x.key === "B")!.cpi, null);
  const cats = byCategory([
    { task_id: 1, entry_date: "2026-01-01", amount: 70, category: "Labor" },
    { task_id: 1, entry_date: "2026-01-02", amount: 30, category: "Licensing" },
  ]);
  assert.deepEqual(cats.map((c) => [c.category, c.ac]), [["Labor", 70], ["Infrastructure", 0], ["Licensing", 30], ["Other", 0]]);
  assert.equal(cats[0].share, 0.7);
});

test("EVM-10 S-curve: full PV curve, AC/EV stop at the status date, EV approximation", () => {
  const done = mk({ status: "Completed", percent_complete: 100, actual_start: "2026-01-01", actual_end: "2026-01-12", ac: 100_000 });
  const wip = mk({ planned_start: "2026-01-11", planned_end: "2026-01-20", status: "In Progress", percent_complete: 50, actual_start: "2026-01-13" });
  const pts = sCurve([done, wip], [{ task_id: done.id, entry_date: "2026-01-05", amount: 60_000, category: "Labor" }, { task_id: done.id, entry_date: "2026-01-12", amount: 40_000, category: "Labor" }],
    { start: "2026-01-01", end: "2026-01-29", statusDate: "2026-01-17" });
  const at = (d: string) => pts.find((p) => p.date === d)!;
  assert.deepEqual(pts.map((p) => p.date), ["2026-01-01", "2026-01-08", "2026-01-15", "2026-01-17", "2026-01-22", "2026-01-29"]);
  assert.equal(at("2026-01-29").pv, 200_000);           // whole baseline
  assert.equal(at("2026-01-08").ev, 0);                 // completed task earns at actual_end (12 Jan)
  assert.equal(at("2026-01-08").ac, 60_000);
  assert.equal(at("2026-01-15").ev, 100_000 + 50_000 * (3 / 5)); // in progress: linear 13..17 Jan
  assert.equal(at("2026-01-17").ev, 150_000);           // = current EV at the status date
  assert.equal(at("2026-01-22").ac, null);              // nothing after the status date
  assert.equal(at("2026-01-22").ev, null);
});

test("EVM-11 cost entry validation (pure)", () => {
  const ok = { amount: 50_000, date: "2026-10-20", category: "Labor", taskStatus: "In Progress", projectStart: "2026-09-07", statusDate: "2026-10-25" };
  assert.doesNotThrow(() => validateCostEntry(ok));
  assert.throws(() => validateCostEntry({ ...ok, date: "2026-10-26" }), /after the status date .*Move the status date forward first/);
  assert.throws(() => validateCostEntry({ ...ok, date: "2026-09-01" }), /before the project start/);
  assert.throws(() => validateCostEntry({ ...ok, date: "2026-02-30" }), /not a valid date/);
  assert.throws(() => validateCostEntry({ ...ok, amount: 0 }), /greater than 0/);
  assert.throws(() => validateCostEntry({ ...ok, amount: -5 }), /greater than 0/);
  assert.throws(() => validateCostEntry({ ...ok, category: "Food" }), /Category must be one of/);
  assert.throws(() => validateCostEntry({ ...ok, taskStatus: "Not Started" }), /has not started/);
});

test("EVM-12 threshold validation: 0 < critical <= warning <= 1.5", () => {
  assert.doesNotThrow(() => validateThresholds(0.95, 0.85));
  assert.doesNotThrow(() => validateThresholds(0.9, 0.9));
  assert.throws(() => validateThresholds(0.8, 0.9), /cannot be above the warning/);
  assert.throws(() => validateThresholds(0.95, 0), /greater than 0/);
  assert.throws(() => validateThresholds(1.6, 0.85), /at most 1\.5/);
  assert.throws(() => validateThresholds(Number.NaN, 0.85), /must be numbers/);
});

// ------------------------------------------------------------------ seed data (in-memory DB)
test("EVM-13 seed: BAC, PV, EV, AC, CV, SV, CPI, SPI", () => {
  const a = evm(freshDb()).analysis;
  const m = a.project, f = a.forecast;
  assert.equal(f.bac, 5_000_000);
  assert.equal(f.approvedBudget, 5_000_000);
  assert.equal(f.unallocated, 0);
  near(m.pv, 2_972_286, 1, "PV");
  near(m.ev, 2_733_500, 1, "EV");
  assert.equal(m.ac, 2_995_000);
  near(m.cv, -261_500, 1, "CV");
  near(m.sv, -238_786, 1, "SV");
  near(m.cpi, 0.913, 0.001, "CPI");
  near(m.spi, 0.920, 0.001, "SPI");
});

test("EVM-14 seed: forecasts EAC, ETC, VAC, TCPI, % complete, % spent", () => {
  const f = evm(freshDb()).analysis.forecast;
  near(f.eac, 5_478_300, 1000, "EAC");
  near(f.etc, 2_483_300, 1000, "ETC");
  near(f.vac, -478_300, 1000, "VAC");
  near(f.tcpi, 1.130, 0.001, "TCPI");
  near(f.pctComplete, 0.547, 0.001, "% complete");
  near(f.pctSpent, 0.599, 0.001, "% spent");
});

test("EVM-15 seed: per-task PV/EV/AC/CPI/SPI and PV components", () => {
  const e = evm(freshDb());
  const t10 = task(e, "T10").m;
  assert.equal(t10.ev, 240_000); assert.equal(t10.ac, 310_000); near(t10.pv, 333_333, 1, "T10 PV");
  near(t10.cpi, 0.774, 0.001, "T10 CPI"); near(t10.spi, 0.720, 0.001, "T10 SPI");
  const t12 = task(e, "T12").m;
  assert.equal(t12.ev, 203_500); assert.equal(t12.ac, 265_000); near(t12.cpi, 0.768, 0.001); near(t12.pv, 264_286, 1);
  const t16 = task(e, "T16").m;
  assert.equal(t16.ev, 24_000); assert.equal(t16.ac, 35_000); near(t16.cpi, 0.686, 0.001); assert.equal(t16.pv, 48_000);
  near(task(e, "T15").m.pv, 216_667, 1);
  const completedPv = e.analysis.rows.filter((r) => r.task.planned_end <= "2026-10-25").reduce((s, r) => s + r.m.pv, 0);
  assert.equal(completedPv, 2_110_000);
  const t08 = task(e, "T08").m;
  assert.equal(t08.ev, 350_000); assert.equal(t08.ac, 385_000);
});

test("EVM-16 seed: alerts - project CPI/SPI WARNING (not critical), forecast overrun, task-level criticals", () => {
  const a = evm(freshDb()).analysis;
  const proj = a.alerts.filter((x) => x.scope === "project");
  assert.equal(proj.find((x) => x.kind === "CPI")!.level, "warning");
  assert.equal(proj.find((x) => x.kind === "SPI")!.level, "warning");
  assert.match(proj.find((x) => x.kind === "CPI")!.message, /COST WARNING: CPI 0\.91 is below the 0\.95 threshold\. Every PKR 1 of planned work is costing PKR 1\.10/);
  assert.match(proj.find((x) => x.kind === "EAC_OVER_BUDGET")!.message, /projected to exceed the approved budget/);
  assert.ok(!proj.some((x) => x.kind === "AC_OVER_BUDGET"));
  const crit = (code: string, kind: string) => a.alerts.some((x) => x.level === "critical" && x.kind === kind && x.message.startsWith(code));
  assert.ok(crit("T10", "CPI") && crit("T10", "SPI") && crit("T12", "CPI") && crit("T16", "CPI"));
  assert.match(a.alerts.find((x) => x.kind === "TASK_OVER_BUDGET" && x.message.startsWith("T08"))!.message, /over budget by PKR 35,000/);
});

test("EVM-17 seed: overrun split and cost categories", () => {
  const e = evm(freshDb());
  assert.equal(e.analysis.completedOverrun, 100_000);
  assert.equal(e.analysis.inProgressOverrun, 161_500);
  assert.equal(e.analysis.completedOverrun + e.analysis.inProgressOverrun, -e.analysis.project.cv);
  const cat = Object.fromEntries(e.analysis.categories.map((c) => [c.category, c.ac]));
  assert.deepEqual(cat, { Labor: 2_855_000, Infrastructure: 135_000, Licensing: 5_000, Other: 0 });
  assert.equal(e.byDeliverable.reduce((s, d) => s + d.bac, 0), 5_000_000);
  assert.equal(e.byMember.reduce((s, d) => s + d.ac, 0), 2_995_000);
});

test("EVM-18 Scenario A: +PKR 400,000 on T10 makes the project CPI CRITICAL", () => {
  const db = freshDb();
  const input = { amount: 400_000, date: "2026-10-25", category: "Labor", taskStatus: "In Progress", projectStart: "2026-09-07", statusDate: "2026-10-25" };
  assert.doesNotThrow(() => validateCostEntry(input));
  db.exec("INSERT INTO cost_entries (task_id, entry_date, amount, category) VALUES (10, '2026-10-25', 400000, 'Labor')");
  const a = evm(db).analysis;
  assert.equal(a.project.ac, 3_395_000);
  near(a.project.cpi, 0.805, 0.001, "CPI");
  const cpi = a.alerts.find((x) => x.scope === "project" && x.kind === "CPI")!;
  assert.equal(cpi.level, "critical");
  assert.match(cpi.message, /COST CRITICAL: CPI 0\.81 is below the 0\.85 threshold/);
});

test("EVM-19 Scenario B: approve CR-001, then allocate the new 800,000 to future activities", () => {
  const db = freshDb();
  const before = evm(db).analysis;
  db.exec("UPDATE change_requests SET status = 'Approved', decision_by = 'Hospital Management Board', decision_date = '2026-10-26' WHERE id = 1");
  let a = evm(db).analysis;
  assert.equal(a.forecast.approvedBudget, 5_800_000);
  assert.equal(a.forecast.bac, 5_000_000);
  assert.equal(a.forecast.unallocated, 800_000);
  assert.equal(a.project.cpi, before.project.cpi);
  assert.equal(a.project.spi, before.project.spi);

  db.exec("INSERT INTO wbs_items (id, project_id, parent_id, code, name, node_type) VALUES (22, 1, 1, '1.6', 'AI Diagnosis and Mobile App', 'Deliverable')");
  db.exec("INSERT INTO wbs_items (id, project_id, parent_id, code, name, node_type, requirement_id) VALUES (23, 1, 22, '1.6.1', 'AI Diagnosis Module', 'Work Package', 11), (24, 1, 22, '1.6.2', 'Mobile Application', 'Work Package', 12)");
  const ins = (code: string, wp: number, cost: number) =>
    `INSERT INTO tasks (project_id, code, wbs_item_id, name, assignee_id, duration_days, planned_start, planned_end, estimated_cost)
     VALUES (1, '${code}', ${wp}, 'New scope', 2, 14, '2026-12-01', '2026-12-14', ${cost})`;
  db.exec(ins("T26", 23, 450_000));
  db.exec(ins("T27", 24, 350_000));
  assert.throws(() => db.exec(ins("T28", 24, 1)), /BUDGET RULE/); // total would exceed 5,800,000

  a = evm(db).analysis;
  assert.equal(a.forecast.bac, 5_800_000);
  assert.equal(a.forecast.unallocated, 0);
  near(a.forecast.eac, 6_355_000, 1000, "EAC");
  near(a.forecast.vac, -555_000, 1000, "VAC");
  near(a.project.pv, before.project.pv, 1e-6, "PV unchanged");
  assert.equal(a.project.ev, before.project.ev);
  assert.equal(a.project.cpi, before.project.cpi);
  assert.equal(a.project.spi, before.project.spi);
});

test("EVM-20 DB rejects cost on a Not Started task", () => {
  const db = freshDb();
  assert.throws(() => db.exec("INSERT INTO cost_entries (task_id, entry_date, amount) VALUES (13, '2026-10-25', 1000)"), /has not started/);
});

test("EVM-21 DB rejects an estimate edit that pushes the total above the approved budget", () => {
  const db = freshDb();
  assert.throws(() => db.exec("UPDATE tasks SET estimated_cost = 400001 WHERE id = 10"), /BUDGET RULE/);
  db.exec("UPDATE tasks SET estimated_cost = 390000 WHERE id = 10"); // lowering is fine
  assert.equal(evm(db).analysis.forecast.bac, 4_990_000);
});

test("EVM-22 future-dated cost entry rejected against the seed project dates", () => {
  const p = freshDb().prepare("SELECT start_date, status_date FROM project WHERE id = 1").get() as { start_date: string; status_date: string };
  assert.throws(
    () => validateCostEntry({ amount: 10_000, date: "2026-10-26", category: "Labor", taskStatus: "In Progress", projectStart: p.start_date, statusDate: p.status_date }),
    /after the status date \(2026-10-25\)/,
  );
});
