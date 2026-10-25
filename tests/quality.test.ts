// Phase 5 tests: quality & risk. DB tests use an IN-MEMORY database built from db/schema.sql + db/seed.sql.
// Run: npm run test
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { latestPerItem, passRate, rankRisks, ratingOf, resolvedDateFor, validateDefect, validateRisk } from "../src/lib/quality";
import { qualityFor } from "../src/lib/quality-data";

const SCHEMA = fs.readFileSync(path.join(process.cwd(), "db", "schema.sql"), "utf8");
const SEED = fs.readFileSync(path.join(process.cwd(), "db", "seed.sql"), "utf8");
function freshDb() {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA);
  db.exec(SEED);
  return db;
}
const q = (db: Database.Database) => qualityFor(db, 1);
const critOpen = (db: Database.Database) => (db.prepare("SELECT COUNT(*) n FROM v_unresolved_critical_defects WHERE project_id = 1").get() as { n: number }).n;
const okDefect = { title: "Bug", taskId: 10, assigneeId: 3, reporterId: 7, severity: "Major", status: "Open", reportedDate: "2026-10-20", resolvedDate: null, statusDate: "2026-10-25" };
const okRisk = { title: "Risk", likelihood: 3, impact: 4, category: "Technical", status: "Open", ownerId: 1 };

test("QR-01 seed defects: counts by status and severity, unresolved critical", () => {
  const c = q(freshDb()).counts;
  assert.equal(c.total, 9);
  assert.deepEqual(c.status, { Open: 4, "In Progress": 2, Resolved: 2, Closed: 1 });
  assert.deepEqual(c.severity, { Critical: 3, Major: 4, Minor: 2, Trivial: 0 });
  assert.equal(c.unresolved, 6);
  assert.equal(c.unresolvedCritical, 3);
  const codes = q(freshDb()).defects.filter((d) => d.severity === "Critical" && (d.status === "Open" || d.status === "In Progress")).map((d) => d.code).sort();
  assert.deepEqual(codes, ["DEF-001", "DEF-003", "DEF-004"]);
});

test("QR-02 defect traceability: task -> WBS work package -> requirement", () => {
  const d1 = q(freshDb()).defects.find((d) => d.code === "DEF-001")!;
  assert.equal(d1.task_code, "T10");
  assert.equal(d1.wbs_code, "1.3.1");
  assert.equal(d1.req_code, "REQ-001");
});

test("QR-03 seed checklist: latest result per item and pass rates", () => {
  const x = q(freshDb());
  assert.equal(x.items.length, 13);
  const o = x.checklist;
  assert.deepEqual([o.pass, o.fail, o.pending, o.none], [6, 4, 3, 0]);
  assert.equal((o.rate! * 100).toFixed(1), "46.2");
  assert.equal(o.inspectedRate, 0.6);
  const byText = (s: string) => x.latest.get(x.items.find((i) => i.criterion.includes(s))!.id)!.result;
  assert.equal(byText("masks sensitive identifiers"), "Pass");      // Fail then retest Pass
  assert.equal(byText("locks after three failed logins"), "Pass");  // Fail then retest Pass
  assert.equal(x.groups.reduce((s, g) => s + g.items, 0), 13);
});

test("QR-04 latestPerItem / passRate helpers (pure)", () => {
  const latest = latestPerItem([
    { id: 1, checklist_item_id: 1, result: "Fail", inspected_on: "2026-01-01" },
    { id: 2, checklist_item_id: 1, result: "Pass", inspected_on: "2026-01-03" },
    { id: 3, checklist_item_id: 2, result: "Pass", inspected_on: "2026-01-02" },
    { id: 4, checklist_item_id: 2, result: "Fail", inspected_on: "2026-01-02" }, // same day: higher id wins
  ]);
  assert.equal(latest.get(1)!.result, "Pass");
  assert.equal(latest.get(2)!.result, "Fail");
  const r = passRate([1, 2, 3], latest);
  assert.deepEqual([r.pass, r.fail, r.none], [1, 1, 1]);
  assert.equal(r.inspectedRate, 0.5);
  assert.equal(passRate([], latest).rate, null);
});

test("QR-05 seed risks: ranking with ties (v_risk_ranked) and rating counts", () => {
  const risks = q(freshDb()).risks;
  const rank = Object.fromEntries(risks.map((r) => [r.code, [r.score, r.rank]]));
  assert.deepEqual(rank, {
    "RSK-02": [20, 1], "RSK-01": [16, 2], "RSK-07": [16, 2], "RSK-05": [12, 4], "RSK-06": [12, 4],
    "RSK-03": [10, 6], "RSK-08": [9, 7], "RSK-04": [6, 8],
  });
  const n = (r: string) => risks.filter((x) => x.rating === r).length;
  assert.deepEqual([n("Critical"), n("High"), n("Medium"), n("Low")], [3, 3, 2, 0]);
  // the pure helper agrees with the view
  const pure = rankRisks(risks.map((r) => ({ code: r.code, score: r.score, impact: r.impact })));
  assert.deepEqual(Object.fromEntries(pure.map((r) => [r.code, r.rank])), Object.fromEntries(risks.map((r) => [r.code, r.rank])));
});

test("QR-06 rating bands match the generated column", () => {
  assert.deepEqual([25, 15, 14, 10, 9, 5, 4, 1].map(ratingOf), ["Critical", "Critical", "High", "High", "Medium", "Medium", "Low", "Low"]);
  const db = freshDb();
  for (let l = 1; l <= 5; l++) for (let i = 1; i <= 5; i++) {
    db.prepare("UPDATE risks SET likelihood = ?, impact = ? WHERE id = 4").run(l, i);
    assert.equal((db.prepare("SELECT rating FROM risks WHERE id = 4").get() as { rating: string }).rating, ratingOf(l * i), `${l}x${i}`);
  }
});

test("QR-07 seed PDPC: 14 responses, RSK-05 responses have no task (General group)", () => {
  const rs = q(freshDb()).responses;
  assert.equal(rs.length, 14);
  const rsk05 = rs.filter((r) => r.risk_code === "RSK-05");
  assert.equal(rsk05.length, 2);
  assert.ok(rsk05.every((r) => r.task_id === null));
  assert.deepEqual(rs.filter((r) => r.task_id === null).map((r) => r.risk_code), ["RSK-05", "RSK-05"]);
});

test("QR-08 resolving DEF-001/003/004 clears critical; a new Critical defect blocks closure", () => {
  const db = freshDb();
  for (const code of ["DEF-001", "DEF-003", "DEF-004"]) {
    const d = db.prepare("SELECT status, reported_date, resolved_date FROM defects WHERE code = ?").get(code) as { status: string; reported_date: string; resolved_date: string | null };
    db.prepare("UPDATE defects SET status = 'Resolved', resolved_date = ? WHERE code = ?").run(resolvedDateFor("Resolved", d.resolved_date, "2026-10-25", d.reported_date), code);
  }
  assert.equal(q(db).counts.unresolvedCritical, 0);
  assert.equal(critOpen(db), 0);
  db.exec("INSERT INTO defects (code, title, task_id, severity, status, assigned_to, reported_by, reported_date) VALUES ('DEF-010', 'New crash', 12, 'Critical', 'Open', 2, 7, '2026-10-25')");
  assert.equal(q(db).counts.unresolvedCritical, 1);
  db.exec("UPDATE tasks SET status = 'Completed', percent_complete = 100, actual_start = COALESCE(actual_start, '2026-10-25'), actual_end = '2026-10-25'");
  assert.throws(() => db.exec("UPDATE project SET status = 'Closed' WHERE id = 1"), /unresolved critical defects/);
});

test("QR-09 status transitions: resolve sets the status date, reopen clears it, DB CHECK enforces it", () => {
  assert.equal(resolvedDateFor("Resolved", null, "2026-10-25", "2026-10-20"), "2026-10-25");
  assert.equal(resolvedDateFor("Closed", "2026-10-24", "2026-10-25", "2026-10-20"), "2026-10-24"); // Resolved -> Closed keeps the date
  assert.equal(resolvedDateFor("Open", "2026-10-24", "2026-10-25", "2026-10-20"), null);
  assert.throws(() => resolvedDateFor("Resolved", null, "2026-10-19", "2026-10-20"), /cannot be before the reported date/);
  const db = freshDb();
  assert.throws(() => db.exec("UPDATE defects SET status = 'Resolved' WHERE code = 'DEF-001'"), /CHECK constraint/);
  assert.throws(() => db.exec("UPDATE defects SET status = 'Open' WHERE code = 'DEF-007'"), /CHECK constraint/); // reopened but date kept
});

test("QR-10 validation: defects", () => {
  assert.doesNotThrow(() => validateDefect(okDefect));
  assert.throws(() => validateDefect({ ...okDefect, title: "  " }), /title is required/);
  assert.throws(() => validateDefect({ ...okDefect, taskId: null }), /task/);
  assert.throws(() => validateDefect({ ...okDefect, assigneeId: null }), /assigned/);
  assert.throws(() => validateDefect({ ...okDefect, reporterId: null }), /reported/);
  assert.throws(() => validateDefect({ ...okDefect, status: "Resolved", resolvedDate: null }), /needs a resolved date/);
  assert.throws(() => validateDefect({ ...okDefect, severity: "Huge" }), /Severity must be one of/);
  assert.throws(() => validateDefect({ ...okDefect, reportedDate: "2026-10-26" }), /after the status date/);
  const db = freshDb();
  assert.throws(() => db.exec("INSERT INTO defects (code, title, task_id, severity, assigned_to, reported_by, reported_date) VALUES ('DEF-011', 'x', NULL, 'Minor', 2, 7, '2026-10-25')"), /NOT NULL/);
  assert.throws(() => db.exec("INSERT INTO defects (code, title, task_id, severity, assigned_to, reported_by, reported_date) VALUES ('DEF-012', '  ', 10, 'Minor', 2, 7, '2026-10-25')"), /CHECK constraint/);
});

test("QR-11 validation: risks (likelihood/impact 1-5, title, owner)", () => {
  assert.doesNotThrow(() => validateRisk(okRisk));
  assert.throws(() => validateRisk({ ...okRisk, likelihood: 0 }), /Likelihood must be a whole number from 1 to 5/);
  assert.throws(() => validateRisk({ ...okRisk, impact: 6 }), /Impact must be a whole number from 1 to 5/);
  assert.throws(() => validateRisk({ ...okRisk, likelihood: 2.5 }), /Likelihood/);
  assert.throws(() => validateRisk({ ...okRisk, title: "" }), /title is required/);
  assert.throws(() => validateRisk({ ...okRisk, ownerId: null }), /owner/);
  assert.throws(() => validateRisk({ ...okRisk, category: "Weather" }), /Category must be one of/);
  const db = freshDb();
  assert.throws(() => db.exec("UPDATE risks SET likelihood = 6 WHERE id = 1"), /CHECK constraint/);
  assert.throws(() => db.exec("UPDATE risks SET score = 1 WHERE id = 1"), /generated column/); // never writable
});
