// Earned Value Management engine (Module 4). PURE functions only - no database access.
//
// Definitions (all money in whole PKR, all dates ISO 'YYYY-MM-DD', "today" = project status date):
//   BAC            = sum of task estimated_cost (the allocated baseline)
//   Approved budget = project.current_budget;  Unallocated = approved budget - BAC
//                    (they differ after a change request is approved until tasks are added for the new work)
//   PV  (BCWS) per task = estimated_cost x clamp((statusDate - planned_start + 1) / duration, 0, 1)
//                    linear over the BASELINE planned dates (not forecast dates);  project PV = sum
//   EV  (BCWP) per task = estimated_cost x percent_complete / 100
//   AC  (ACWP) per task = sum of cost_entries.amount
//   CV = EV - AC   SV = EV - PV   CPI = EV / AC   SPI = EV / PV      (a 0 denominator gives null = "n/a", no alert)
//   EAC  = BAC / CPI                  (primary: current cost efficiency continues)
//   EAC2 = AC + (BAC - EV)            (remaining work is done at the planned rate)
//   ETC = EAC - AC   VAC = BAC - EAC (also shown against the approved budget)
//   TCPI = (BAC - EV) / (BAC - AC)    % complete = EV / BAC   % spent = AC / BAC
//   Alerts: CPI/SPI (project and per task) below evm_warning_threshold => WARNING, below
//   evm_critical_threshold => CRITICAL; task AC > estimate => WARNING; EAC > approved budget => WARNING;
//   AC > approved budget => CRITICAL.
//   S-curve EV approximation: a completed task earns its full estimate on its actual_end date; an
//   in-progress task earns its current EV linearly from actual_start to the status date.
import { addDays, daysBetween, num, pkr } from "./format";

export interface EvmTask {
  id: number; code: string; name: string; estimated_cost: number; duration_days: number;
  planned_start: string; planned_end: string; actual_start: string | null; actual_end: string | null;
  percent_complete: number; status: string; ac: number;
}
export interface EvmEntry { task_id: number; entry_date: string; amount: number; category: string }
export interface Thresholds { warning: number; critical: number }

export type AlertLevel = "warning" | "critical";
export interface EvmAlert { level: AlertLevel; scope: "project" | "task"; kind: "CPI" | "SPI" | "TASK_OVER_BUDGET" | "EAC_OVER_BUDGET" | "AC_OVER_BUDGET"; task_id?: number; message: string }

export interface Metrics { bac: number; pv: number; ev: number; ac: number; cv: number; sv: number; cpi: number | null; spi: number | null }

export const CATEGORIES = ["Labor", "Infrastructure", "Licensing", "Other"] as const;

export const ratio = (a: number, b: number): number | null => (b === 0 ? null : a / b);
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const r2 = (x: number) => x.toFixed(2);

/** Fraction of a task's baseline that is planned to be done by `date` (linear over planned dates). */
export const plannedFraction = (t: Pick<EvmTask, "planned_start" | "duration_days">, date: string) =>
  clamp01((daysBetween(t.planned_start, date) + 1) / t.duration_days);

export function metricsOf(bac: number, pv: number, ev: number, ac: number): Metrics {
  return { bac, pv, ev, ac, cv: ev - ac, sv: ev - pv, cpi: ratio(ev, ac), spi: ratio(ev, pv) };
}

export function taskMetrics(t: EvmTask, statusDate: string): Metrics {
  return metricsOf(t.estimated_cost, t.estimated_cost * plannedFraction(t, statusDate), (t.estimated_cost * t.percent_complete) / 100, t.ac);
}

export function sumMetrics(list: Metrics[]): Metrics {
  const s = (k: "bac" | "pv" | "ev" | "ac") => list.reduce((x, m) => x + m[k], 0);
  return metricsOf(s("bac"), s("pv"), s("ev"), s("ac"));
}

export function forecasts(m: Metrics, approvedBudget: number) {
  const eac = m.cpi === null || m.cpi === 0 ? null : m.bac / m.cpi;
  return {
    bac: m.bac, approvedBudget, unallocated: approvedBudget - m.bac,
    eac, eac2: m.ac + (m.bac - m.ev),
    etc: eac === null ? null : eac - m.ac,
    vac: eac === null ? null : m.bac - eac,
    vacApproved: eac === null ? null : approvedBudget - eac,
    tcpi: ratio(m.bac - m.ev, m.bac - m.ac),
    pctComplete: ratio(m.ev, m.bac),
    pctSpent: ratio(m.ac, m.bac),
  };
}
export type Forecasts = ReturnType<typeof forecasts>;

export const levelOf = (v: number | null, th: Thresholds): AlertLevel | null =>
  v === null ? null : v < th.critical ? "critical" : v < th.warning ? "warning" : null;

/** Traffic light for a CPI/SPI value. */
export const lightOf = (v: number | null, th: Thresholds): "green" | "amber" | "red" | "slate" =>
  v === null ? "slate" : v < th.critical ? "red" : v < th.warning ? "amber" : "green";

function indexAlerts(m: Metrics, th: Thresholds, prefix: string, scope: "project" | "task", task_id?: number): EvmAlert[] {
  const out: EvmAlert[] = [];
  const cl = levelOf(m.cpi, th);
  if (cl && m.cpi !== null) {
    out.push({
      level: cl, scope, kind: "CPI", task_id,
      message: `${prefix}COST ${cl.toUpperCase()}: CPI ${r2(m.cpi)} is below the ${r2(cl === "critical" ? th.critical : th.warning)} threshold. Every PKR 1 of planned work is costing PKR ${r2(1 / m.cpi)} (EV ${pkr(m.ev)} vs AC ${pkr(m.ac)}).`,
    });
  }
  const sl = levelOf(m.spi, th);
  if (sl && m.spi !== null) {
    out.push({
      level: sl, scope, kind: "SPI", task_id,
      message: `${prefix}SCHEDULE ${sl.toUpperCase()}: SPI ${r2(m.spi)} is below the ${r2(sl === "critical" ? th.critical : th.warning)} threshold. Only PKR ${r2(m.spi)} of work is done for every PKR 1 planned (EV ${pkr(m.ev)} vs PV ${pkr(m.pv)}).`,
    });
  }
  return out;
}

/** All active alerts, critical first, project-level before task-level. */
export function evmAlerts(project: Metrics, f: Forecasts, tasks: { task: EvmTask; m: Metrics }[], th: Thresholds): EvmAlert[] {
  const out: EvmAlert[] = [...indexAlerts(project, th, "", "project")];
  if (project.ac > f.approvedBudget) {
    out.push({ level: "critical", scope: "project", kind: "AC_OVER_BUDGET", message: `BUDGET CRITICAL: actual cost ${pkr(project.ac)} already exceeds the approved budget ${pkr(f.approvedBudget)} by ${pkr(project.ac - f.approvedBudget)}.` });
  }
  if (f.eac !== null && f.eac > f.approvedBudget) {
    const over = f.eac - f.approvedBudget;
    out.push({ level: "warning", scope: "project", kind: "EAC_OVER_BUDGET", message: `FORECAST WARNING: at the current CPI the project is projected to exceed the approved budget by ${pkr(over)} (${((over / f.approvedBudget) * 100).toFixed(1)}%): EAC ${pkr(f.eac)} vs ${pkr(f.approvedBudget)}.` });
  }
  for (const { task, m } of tasks) {
    out.push(...indexAlerts(m, th, `${task.code} `, "task", task.id));
    if (task.ac > task.estimated_cost) {
      out.push({ level: "warning", scope: "task", kind: "TASK_OVER_BUDGET", task_id: task.id, message: `${task.code} is over budget by ${pkr(task.ac - task.estimated_cost)} (AC ${pkr(task.ac)} vs estimate ${pkr(task.estimated_cost)}).` });
    }
  }
  const rank = (a: EvmAlert) => (a.level === "critical" ? 0 : 2) + (a.scope === "project" ? 0 : 1);
  return out.map((a, i) => ({ a, i })).sort((x, y) => rank(x.a) - rank(y.a) || x.i - y.i).map((x) => x.a);
}

/** Group task metrics by a key (WBS deliverable, team member, ...). */
export function rollup<K extends string | number>(rows: { m: Metrics; key: K; label: string }[]) {
  const groups = new Map<K, { key: K; label: string; tasks: number; list: Metrics[] }>();
  for (const r of rows) {
    const g = groups.get(r.key) ?? { key: r.key, label: r.label, tasks: 0, list: [] };
    g.tasks++;
    g.list.push(r.m);
    groups.set(r.key, g);
  }
  return [...groups.values()].map((g) => ({ key: g.key, label: g.label, tasks: g.tasks, ...sumMetrics(g.list) }));
}

/** Actual cost by category (Labor / Infrastructure / Licensing / Other). */
export function byCategory(entries: EvmEntry[]) {
  const total = entries.reduce((s, e) => s + e.amount, 0);
  return CATEGORIES.map((c) => {
    const ac = entries.filter((e) => e.category === c).reduce((s, e) => s + e.amount, 0);
    return { category: c, ac, entries: entries.filter((e) => e.category === c).length, share: ratio(ac, total) };
  });
}

/**
 * Weekly S-curve points from the project start to the current deadline (plus the status date).
 * PV is the full planned curve; AC and EV stop at the status date (null afterwards).
 */
export function sCurve(tasks: EvmTask[], entries: EvmEntry[], o: { start: string; end: string; statusDate: string }) {
  const dates = new Set<string>();
  for (let d = o.start; d <= o.end; d = addDays(d, 7)) dates.add(d);
  dates.add(o.end);
  if (o.statusDate >= o.start && o.statusDate <= o.end) dates.add(o.statusDate);
  const evAt = (t: EvmTask, d: string) => {
    if (t.status === "Completed") return t.actual_end && t.actual_end <= d ? t.estimated_cost : 0;
    if (!t.actual_start || t.percent_complete === 0) return 0;
    const ev = (t.estimated_cost * t.percent_complete) / 100;
    const span = daysBetween(t.actual_start, o.statusDate) + 1;
    return span <= 0 ? 0 : ev * clamp01((daysBetween(t.actual_start, d) + 1) / span);
  };
  return [...dates].sort().map((d) => ({
    date: d,
    pv: tasks.reduce((s, t) => s + t.estimated_cost * plannedFraction(t, d), 0),
    ev: d <= o.statusDate ? tasks.reduce((s, t) => s + evAt(t, d), 0) : null,
    ac: d <= o.statusDate ? entries.filter((e) => e.entry_date <= d).reduce((s, e) => s + e.amount, 0) : null,
  }));
}

/** Complete EVM analysis for a project. */
export function analyseEvm(i: { tasks: EvmTask[]; entries: EvmEntry[]; statusDate: string; approvedBudget: number; thresholds: Thresholds }) {
  const rows = i.tasks.map((task) => ({ task, m: taskMetrics(task, i.statusDate) }));
  const project = sumMetrics(rows.map((r) => r.m));
  const f = forecasts(project, i.approvedBudget);
  const alerts = evmAlerts(project, f, rows, i.thresholds);
  const overrun = (filter: (t: EvmTask) => boolean) => rows.filter((r) => filter(r.task)).reduce((s, r) => s + (r.m.ac - r.m.ev), 0);
  return {
    project, forecast: f, rows, alerts,
    taskAlerts: (id: number) => alerts.filter((a) => a.task_id === id),
    completedOverrun: overrun((t) => t.status === "Completed"),
    inProgressOverrun: overrun((t) => t.status !== "Completed"),
    categories: byCategory(i.entries),
  };
}
export type EvmAnalysis = ReturnType<typeof analyseEvm>;

// ------------------------------------------------------------------ input validation (pure, used by server actions)
const isIsoDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;

/** Throws an Error with a user-facing message when a cost entry is not acceptable. */
export function validateCostEntry(i: { amount: number; date: string; category: string; taskStatus: string | null; projectStart: string; statusDate: string }) {
  if (i.taskStatus === null) throw new Error("Choose the activity the cost belongs to.");
  if (!Number.isInteger(i.amount) || i.amount <= 0) throw new Error("Amount must be a whole number of PKR greater than 0.");
  if (!isIsoDate(i.date)) throw new Error("Cost date is not a valid date (use YYYY-MM-DD).");
  if (i.date < i.projectStart) throw new Error(`Cost date ${i.date} is before the project start (${i.projectStart}).`);
  if (i.date > i.statusDate) {
    throw new Error(`Cost date ${i.date} is after the status date (${i.statusDate}). Move the status date forward first (Status, milestones & closure page).`);
  }
  if (!(CATEGORIES as readonly string[]).includes(i.category)) throw new Error(`Category must be one of: ${CATEGORIES.join(", ")}.`);
  if (i.taskStatus === "Not Started") throw new Error("Cannot record actual cost against a task that has not started");
}

/** 0 < critical <= warning <= 1.5 */
export function validateThresholds(warning: number, critical: number) {
  if (!Number.isFinite(warning) || !Number.isFinite(critical)) throw new Error("Thresholds must be numbers, e.g. 0.95 and 0.85.");
  if (!(critical > 0)) throw new Error("The critical threshold must be greater than 0.");
  if (critical > warning) throw new Error("The critical threshold cannot be above the warning threshold.");
  if (warning > 1.5) throw new Error("The warning threshold must be at most 1.5.");
}

export const fmtRatio = (v: number | null, digits = 3) => (v === null ? "n/a" : v.toFixed(digits));
export const fmtPct = (v: number | null) => (v === null ? "n/a" : `${(v * 100).toFixed(1)}%`);
export const fmtMoney = (v: number | null) => (v === null ? "n/a" : `${v < 0 ? "-" : ""}PKR ${num(Math.abs(v))}`);
