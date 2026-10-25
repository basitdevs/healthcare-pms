// Phase 0 smoke test. Runs against an IN-MEMORY COPY of healthcare.db (never modifies the real file).
// Usage: npm run db:verify
import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

const real = new Database(path.join(process.cwd(), "healthcare.db"), { readonly: true });
const db = new Database(real.serialize());
real.close();
db.pragma("foreign_keys = ON");

let passed = 0;
let failed = 0;
const ok = (name: string, cond: boolean, extra = "") => {
  cond ? passed++ : failed++;
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  -> " + extra : ""}`);
};
const one = <T,>(sql: string, ...p: unknown[]) => db.prepare(sql).get(...p) as T;
const all = <T,>(sql: string, ...p: unknown[]) => db.prepare(sql).all(...p) as T[];
const rejects = (name: string, sql: string, expected: string) => {
  try {
    db.exec(sql);
    ok(name, false, "statement was accepted");
  } catch (e) {
    const m = (e as Error).message;
    ok(name, m.includes(expected), m);
  }
};

console.log("\n== Data integrity ==");
const fk = db.pragma("foreign_key_check") as unknown[];
ok("foreign keys consistent", fk.length === 0);
const proj = one<{ current_budget: number; deadline: string }>("SELECT current_budget, deadline FROM project WHERE id=1");
const sumBac = one<{ s: number }>("SELECT SUM(estimated_cost) s FROM tasks").s;
ok("sum of task estimates = approved budget (PKR 5,000,000)", sumBac === 5_000_000 && proj.current_budget === 5_000_000, `${sumBac}`);

// forward-pass check: every task starts the day after its latest predecessor finishes
const bad = all<{ code: string }>(`
  SELECT t.code FROM tasks t
  JOIN (SELECT task_id, MAX(p.planned_end) mx FROM task_dependencies d JOIN tasks p ON p.id = d.predecessor_id GROUP BY task_id) x ON x.task_id = t.id
  WHERE date(x.mx, '+1 day') <> t.planned_start`);
ok("planned dates follow dependencies (finish-to-start)", bad.length === 0, bad.map((b) => b.code).join(","));
const lastEnd = one<{ m: string }>("SELECT MAX(planned_end) m FROM tasks").m;
ok("planned finish is inside original deadline", lastEnd <= proj.deadline, `${lastEnd} <= ${proj.deadline}`);

// resource overlap check
const overlaps = all<{ a: string; b: string }>(`
  SELECT x.code a, y.code b FROM tasks x JOIN tasks y ON x.assignee_id = y.assignee_id AND x.id < y.id
  WHERE x.planned_start <= y.planned_end AND y.planned_start <= x.planned_end`);
ok("no planned resource double-booking", overlaps.length === 0, overlaps.map((o) => `${o.a}/${o.b}`).join(","));

console.log("\n== EVM sanity (status date 2026-10-25, linear PV) ==");
const status = "2026-10-25";
const t = all<{ estimated_cost: number; planned_start: string; planned_end: string; percent_complete: number; ac: number }>(`
  SELECT t.estimated_cost, t.planned_start, t.planned_end, t.percent_complete, a.actual_cost ac
  FROM tasks t JOIN v_task_actual_cost a ON a.task_id = t.id`);
const day = (d: string) => Date.parse(d + "T00:00:00Z") / 86400000;
let PV = 0, EV = 0, AC = 0;
for (const r of t) {
  const dur = day(r.planned_end) - day(r.planned_start) + 1;
  const planned = Math.min(1, Math.max(0, (day(status) - day(r.planned_start) + 1) / dur));
  PV += r.estimated_cost * planned;
  EV += (r.estimated_cost * r.percent_complete) / 100;
  AC += r.ac;
}
const CPI = EV / AC, SPI = EV / PV;
console.log(`      PV=${PV.toFixed(0)}  EV=${EV.toFixed(0)}  AC=${AC.toFixed(0)}  CPI=${CPI.toFixed(3)}  SPI=${SPI.toFixed(3)}`);
ok("AC equals seeded expenditure (2,995,000)", AC === 2_995_000);
ok("CPI and SPI are below the 0.95 warning threshold (alerts will fire)", CPI < 0.95 && SPI < 0.95);

console.log("\n== Guard triggers ==");
rejects("unapproved requirement cannot enter WBS", "INSERT INTO wbs_items (project_id,parent_id,code,name,node_type,requirement_id) VALUES (1,4,'1.3.7','AI Diagnosis','Work Package',11)", "SCOPE RULE");
rejects("rejected requirement cannot enter WBS", "INSERT INTO wbs_items (project_id,parent_id,code,name,node_type,requirement_id) VALUES (1,4,'1.3.8','Pharmacy','Work Package',13)", "SCOPE RULE");
rejects("task must hang off a Work Package", "INSERT INTO tasks (project_id,code,wbs_item_id,name,assignee_id,duration_days,planned_start,planned_end,estimated_cost) VALUES (1,'T99',4,'x',2,1,'2026-12-01','2026-12-01',0)", "Work Package");
rejects("new task cannot exceed approved budget", "INSERT INTO tasks (project_id,code,wbs_item_id,name,assignee_id,duration_days,planned_start,planned_end,estimated_cost) VALUES (1,'T98',11,'x',2,1,'2026-12-01','2026-12-01',1)", "BUDGET RULE");
rejects("circular dependency blocked (T01 -> T25 chain)", "INSERT INTO task_dependencies (task_id,predecessor_id) VALUES (1,25)", "Circular");
rejects("duration must match dates", "INSERT INTO tasks (project_id,code,wbs_item_id,name,assignee_id,duration_days,planned_start,planned_end,estimated_cost) VALUES (1,'T97',11,'x',2,5,'2026-12-01','2026-12-01',0)", "CHECK");
rejects("cost cannot be booked on a task that has not started", "INSERT INTO cost_entries (task_id,entry_date,amount) VALUES (13,'2026-10-25',1000)", "not started");
rejects("invalid date text rejected", "UPDATE tasks SET planned_start='2026-13-45' WHERE id=13", "CHECK");
rejects("likelihood must be 1..5", "INSERT INTO risks (project_id,code,title,category,likelihood,impact,owner_id,identified_date) VALUES (1,'RSK-99','x','Cost',9,2,1,'2026-10-25')", "CHECK");
rejects("project cannot close with open work and critical defects", "UPDATE project SET status='Closed' WHERE id=1", "Cannot close");
rejects("proposed requirement cannot be approved outside its CR", "UPDATE requirements SET status='Approved' WHERE id=11", "SCOPE RULE");
rejects("decided change request is final (CR-002)", "UPDATE change_requests SET status='Approved', decision_by='x', decision_date='2026-10-26' WHERE id=2", "final");

console.log("\n== Change request effect (CR-001 approval) ==");
const before = one<{ b: number; d: string }>("SELECT current_budget b, deadline d FROM project");
const reqBefore = one<{ n: number }>("SELECT COUNT(*) n FROM requirements WHERE status='Approved'").n;
db.exec("UPDATE change_requests SET status='Approved', decision_by='Hospital Management Board', decision_date='2026-10-26' WHERE id=1");
const after = one<{ b: number; d: string }>("SELECT current_budget b, deadline d FROM project");
const reqAfter = one<{ n: number }>("SELECT COUNT(*) n FROM requirements WHERE status='Approved'").n;
console.log(`      budget ${before.b} -> ${after.b} ; deadline ${before.d} -> ${after.d} ; approved requirements ${reqBefore} -> ${reqAfter}`);
ok("budget rises by PKR 800,000 to 5,800,000", after.b === 5_800_000);
ok("deadline moves +21 days (16 -> 19 weeks) to 2027-01-17", after.d === "2027-01-17");
ok("REQ-011 and REQ-012 become approved scope", reqAfter === reqBefore + 2);
db.exec("INSERT INTO wbs_items (project_id,parent_id,code,name,node_type,requirement_id) VALUES (1,1,'1.6','AI Diagnosis Module','Deliverable',NULL)");
db.exec("INSERT INTO wbs_items (project_id,parent_id,code,name,node_type,requirement_id) VALUES (1,22,'1.6.1','AI Diagnosis Module','Work Package',11)");
ok("approved requirement can now be placed in the WBS", true);
ok("audit log recorded the approval", one<{ n: number }>("SELECT COUNT(*) n FROM audit_log WHERE entity='change_request' AND entity_id=1 AND action='APPROVED'").n === 1);

console.log("\n== Risk ranking ==");
const top = all<{ code: string; score: number; priority_rank: number }>("SELECT code, score, priority_rank FROM v_risk_ranked ORDER BY priority_rank LIMIT 3");
console.log("      top 3: " + top.map((r) => `${r.code}(${r.score})`).join(", "));
ok("RSK-02 (likelihood 4 x impact 5 = 20) is ranked first", top[0].code === "RSK-02" && top[0].score === 20);

console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
