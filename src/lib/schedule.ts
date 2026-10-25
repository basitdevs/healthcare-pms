// Scheduling engine (Module 3). PURE functions only - no database access - so every
// calculation can be unit-tested. Conventions match the schema:
//   * dates are ISO text 'YYYY-MM-DD'
//   * durations are inclusive CALENDAR days:  end = start + duration - 1
//   * finish-to-start links:  successor start >= predecessor end + 1 + lag_days
//   * "today" is always the project's status date, never the system clock
import { addDays, daysBetween, fmtDate } from "./format";

export interface SchedTask {
  id: number; code: string; name: string; wbs_item_id: number; assignee_id: number;
  duration_days: number; planned_start: string; planned_end: string;
  actual_start: string | null; actual_end: string | null;
  percent_complete: number; status: string;
}
export interface SchedDep { task_id: number; predecessor_id: number; lag_days: number }

export type ForecastKind = "Completed" | "Completed late" | "Delayed (own progress)" | "Impacted by predecessor" | "On track";

export interface TaskForecast {
  id: number;
  forecast_start: string;
  forecast_end: string;
  delay_days: number;        // forecast_end - planned_end  (positive = late)
  kind: ForecastKind;
  drivers: number[];         // predecessors that set this task's forecast start (impacted tasks)
  roots: number[];           // the directly delayed task(s) at the origin of the push
  cause: string;
}

const later = (a: string, b: string) => (a > b ? a : b);

function links(deps: SchedDep[]) {
  const preds = new Map<number, SchedDep[]>();
  const succs = new Map<number, SchedDep[]>();
  for (const d of deps) {
    preds.set(d.task_id, [...(preds.get(d.task_id) ?? []), d]);
    succs.set(d.predecessor_id, [...(succs.get(d.predecessor_id) ?? []), d]);
  }
  return { preds, succs };
}

/** Topological order (Kahn). Tasks caught in a cycle are appended last; the DB blocks cycles anyway. */
export function topoOrder(tasks: SchedTask[], deps: SchedDep[]): SchedTask[] {
  const ids = new Set(tasks.map((t) => t.id));
  const indeg = new Map(tasks.map((t) => [t.id, 0]));
  const { succs } = links(deps);
  for (const d of deps) if (ids.has(d.task_id) && ids.has(d.predecessor_id)) indeg.set(d.task_id, indeg.get(d.task_id)! + 1);
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const queue = tasks.filter((t) => indeg.get(t.id) === 0).sort((a, b) => a.planned_start.localeCompare(b.planned_start) || a.id - b.id);
  const out: SchedTask[] = [];
  while (queue.length) {
    const t = queue.shift()!;
    out.push(t);
    for (const d of succs.get(t.id) ?? []) {
      if (!indeg.has(d.task_id)) continue;
      const n = indeg.get(d.task_id)! - 1;
      indeg.set(d.task_id, n);
      if (n === 0) queue.push(byId.get(d.task_id)!);
    }
  }
  if (out.length < tasks.length) out.push(...tasks.filter((t) => !out.includes(t)));
  return out;
}

/**
 * Forward pass over the PLANNED network. Tasks without predecessors keep their own planned_start;
 * every other task starts at max(predecessor end + 1 + lag). Pinned tasks (by default: completed
 * ones) keep their dates and act as fixed anchors for their successors.
 */
export function forwardPass(
  tasks: SchedTask[], deps: SchedDep[], pinned: (t: SchedTask) => boolean = (t) => t.status === "Completed",
): Map<number, { start: string; end: string }> {
  const { preds } = links(deps);
  const out = new Map<number, { start: string; end: string }>();
  for (const t of topoOrder(tasks, deps)) {
    let start = t.planned_start;
    const ps = (preds.get(t.id) ?? []).filter((d) => out.has(d.predecessor_id));
    if (!pinned(t) && ps.length) {
      start = ps.map((d) => addDays(out.get(d.predecessor_id)!.end, 1 + d.lag_days)).reduce(later);
    }
    out.set(t.id, { start, end: pinned(t) ? t.planned_end : addDays(start, t.duration_days - 1) });
  }
  return out;
}

/** New planned dates for every non-completed task whose dates the forward pass would change. */
export function recalculatePlan(tasks: SchedTask[], deps: SchedDep[]) {
  const fp = forwardPass(tasks, deps);
  return tasks
    .filter((t) => t.status !== "Completed")
    .map((t) => ({ id: t.id, code: t.code, old_start: t.planned_start, planned_start: fp.get(t.id)!.start, planned_end: fp.get(t.id)!.end }))
    .filter((c) => c.planned_start !== c.old_start);
}

/** Days of work left on a started task, from its percent complete. */
export const remainingDays = (t: Pick<SchedTask, "duration_days" | "percent_complete">) =>
  Math.ceil((t.duration_days * (100 - t.percent_complete)) / 100);

/** Forecast every task as of the status date and classify why it is (or is not) late. */
export function forecast(tasks: SchedTask[], deps: SchedDep[], statusDate: string): Map<number, TaskForecast> {
  const { preds } = links(deps);
  const code = new Map(tasks.map((t) => [t.id, t.code]));
  const out = new Map<number, TaskForecast>();

  for (const t of topoOrder(tasks, deps)) {
    let fs: string, fe: string, kind: ForecastKind, cause: string;
    let drivers: number[] = [];
    if (t.status === "Completed") {
      fs = t.actual_start ?? t.planned_start;
      fe = t.actual_end ?? t.planned_end;
      const late = daysBetween(t.planned_end, fe);
      kind = late > 0 ? "Completed late" : "Completed";
      cause = late > 0 ? `Finished ${late} day${late === 1 ? "" : "s"} late on ${fmtDate(fe)}` : `Finished ${fmtDate(fe)}`;
    } else if (t.status === "In Progress" || t.status === "On Hold") {
      const rem = remainingDays(t);
      fs = t.actual_start ?? t.planned_start;
      fe = later(addDays(statusDate, rem), statusDate);
      kind = fe > t.planned_end ? "Delayed (own progress)" : "On track";
      cause = `${t.percent_complete}% complete${t.status === "On Hold" ? " (on hold)" : ""}: ${rem} day${rem === 1 ? "" : "s"} of work left after ${fmtDate(statusDate)}`;
    } else {
      const ps = (preds.get(t.id) ?? []).filter((d) => out.has(d.predecessor_id));
      const fromPred = ps.map((d) => ({ id: d.predecessor_id, start: addDays(out.get(d.predecessor_id)!.forecast_end, 1 + d.lag_days) }));
      fs = [t.planned_start, addDays(statusDate, 1), ...fromPred.map((p) => p.start)].reduce(later);
      fe = addDays(fs, t.duration_days - 1);
      if (fs > t.planned_start) {
        drivers = fromPred.filter((p) => p.start === fs).map((p) => p.id);
        kind = drivers.length ? "Impacted by predecessor" : "Delayed (own progress)";
        cause = drivers.length
          ? `Pushed by ${drivers.map((d) => code.get(d)).join(", ")}`
          : `Not started by ${fmtDate(statusDate)}; earliest start ${fmtDate(fs)}`;
      } else {
        kind = "On track";
        cause = `Starts ${fmtDate(fs)} as planned`;
      }
    }
    out.set(t.id, { id: t.id, forecast_start: fs, forecast_end: fe, delay_days: daysBetween(t.planned_end, fe), kind, drivers, roots: [], cause });
  }

  // Trace each impacted task back to the directly delayed task(s) that started the chain.
  const roots = (id: number, seen = new Set<number>()): number[] => {
    const f = out.get(id)!;
    if (f.kind === "Delayed (own progress)") return [id];
    if (f.kind !== "Impacted by predecessor" || seen.has(id)) return [];
    seen.add(id);
    return [...new Set(f.drivers.flatMap((d) => roots(d, seen)))];
  };
  for (const f of out.values()) {
    f.roots = roots(f.id);
    if (f.kind === "Impacted by predecessor" && f.roots.some((r) => !f.drivers.includes(r))) {
      f.cause += ` (origin: ${f.roots.map((r) => code.get(r)).join(", ")})`;
    }
  }
  return out;
}

/** Every task reachable downstream of `id` (transitive successors), in network order. */
export function downstream(id: number, tasks: SchedTask[], deps: SchedDep[]): number[] {
  const { succs } = links(deps);
  const seen = new Set<number>();
  const stack = [id];
  while (stack.length) {
    for (const d of succs.get(stack.pop()!) ?? []) {
      if (!seen.has(d.task_id)) { seen.add(d.task_id); stack.push(d.task_id); }
    }
  }
  return topoOrder(tasks, deps).map((t) => t.id).filter((x) => seen.has(x));
}

/**
 * CPM total float of every unfinished task: backward pass anchored at the projected finish over the
 * forecast network. Only not-started successors constrain a predecessor (started work cannot be
 * pushed back). Critical = float 0.
 */
export function totalFloat(tasks: SchedTask[], deps: SchedDep[], fc: Map<number, TaskForecast>, projectedFinish: string) {
  const { succs } = links(deps);
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const ls = new Map<number, string>();
  const float = new Map<number, number>();
  for (const t of [...topoOrder(tasks, deps)].reverse()) {
    if (t.status === "Completed") continue;
    const f = fc.get(t.id)!;
    const lf = (succs.get(t.id) ?? [])
      .filter((d) => byId.get(d.task_id)?.status === "Not Started" && ls.has(d.task_id))
      .map((d) => addDays(ls.get(d.task_id)!, -1 - d.lag_days))
      .reduce((a, b) => (a < b ? a : b), projectedFinish);
    ls.set(t.id, addDays(lf, -daysBetween(f.forecast_start, f.forecast_end)));
    float.set(t.id, daysBetween(f.forecast_end, lf));
  }
  return float;
}

/** Planned dates that break a finish-to-start link: successor start <= predecessor end + lag. */
export function dependencyConflicts(tasks: SchedTask[], deps: SchedDep[]) {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  return deps.flatMap((d) => {
    const s = byId.get(d.task_id), p = byId.get(d.predecessor_id);
    if (!s || !p || s.planned_start > addDays(p.planned_end, d.lag_days)) return [];
    const required = addDays(p.planned_end, 1 + d.lag_days);
    return [{ task_id: s.id, predecessor_id: p.id, task: s.code, predecessor: p.code, lag_days: d.lag_days, planned_start: s.planned_start, required_start: required, days_early: daysBetween(s.planned_start, required) }];
  });
}

/** Same person on two tasks whose planned date ranges overlap. */
export function overAllocations(tasks: SchedTask[]) {
  const out: { assignee_id: number; a: SchedTask; b: SchedTask; from: string; to: string; days: number }[] = [];
  const sorted = [...tasks].sort((x, y) => x.planned_start.localeCompare(y.planned_start) || x.id - y.id);
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      const a = sorted[i], b = sorted[j];
      if (a.assignee_id !== b.assignee_id || b.planned_start > a.planned_end) continue;
      const to = a.planned_end < b.planned_end ? a.planned_end : b.planned_end;
      out.push({ assignee_id: a.assignee_id, a, b, from: b.planned_start, to, days: daysBetween(b.planned_start, to) + 1 });
    }
  }
  return out;
}

/** Full schedule analysis used by the pages (and the tests). */
export function analyseSchedule(tasks: SchedTask[], deps: SchedDep[], o: { statusDate: string; deadline: string }) {
  const fc = forecast(tasks, deps, o.statusDate);
  const list = tasks.map((t) => ({ task: t, f: fc.get(t.id)! }));
  const projectedFinish = list.length ? list.map((x) => x.f.forecast_end).reduce(later) : null;
  const plannedFinish = list.length ? tasks.map((t) => t.planned_end).reduce(later) : null;
  const float = projectedFinish ? totalFloat(tasks, deps, fc, projectedFinish) : new Map<number, number>();
  const critical = new Set([...float].filter(([, v]) => v === 0).map(([id]) => id));

  // true when `from`'s forecast start is (transitively) set by `cause` through driving predecessors
  const drivenBy = (from: number, cause: number): boolean =>
    fc.get(from)!.drivers.some((d) => d === cause || drivenBy(d, cause));
  const late = list.filter((x) => x.f.kind === "Delayed (own progress)" || x.f.kind === "Impacted by predecessor");
  const impact = late.map(({ task, f }) => ({
    task, f,
    downstream: downstream(task.id, tasks, deps).map((id) => {
      const d = fc.get(id)!;
      return { id, code: tasks.find((t) => t.id === id)!.code, days: Math.max(0, d.delay_days), pushedByThis: d.delay_days > 0 && drivenBy(id, task.id) };
    }),
  }));

  return {
    forecast: fc,
    projectedFinish,
    plannedFinish,
    slipDays: projectedFinish && plannedFinish ? daysBetween(plannedFinish, projectedFinish) : 0,
    marginDays: projectedFinish ? daysBetween(projectedFinish, o.deadline) : null, // negative = deadline missed
    delayed: list.filter((x) => x.f.kind === "Delayed (own progress)"),
    impacted: list.filter((x) => x.f.kind === "Impacted by predecessor"),
    completedLate: list.filter((x) => x.f.kind === "Completed late"),
    impact,
    float,
    critical,
    conflicts: dependencyConflicts(tasks, deps),
    overAllocations: overAllocations(tasks),
    recalc: recalculatePlan(tasks, deps),
  };
}

export type ScheduleAnalysis = ReturnType<typeof analyseSchedule>;

/**
 * Turns a progress update into a state that always satisfies the tasks CHECK constraint:
 *   0%  -> Not Started (no actual dates)        1-99% -> In Progress (actual start defaults to the status date)
 *   100% -> Completed (actual end defaults to the status date)      On Hold keeps 0-99% with an actual start.
 */
export function progressState(i: { percent: number; onHold: boolean; actualStart: string | null; actualEnd: string | null; statusDate: string }) {
  const { percent, onHold, statusDate } = i;
  if (!Number.isInteger(percent) || percent < 0 || percent > 100) throw new Error("Percent complete must be a whole number from 0 to 100.");
  if (i.actualStart && i.actualStart > statusDate) throw new Error("Actual start cannot be after the status date.");
  if (i.actualEnd && i.actualEnd > statusDate) throw new Error("Actual end cannot be after the status date.");
  if (percent === 100) {
    if (onHold) throw new Error("A completed task cannot be on hold.");
    const end = i.actualEnd ?? statusDate;
    const start = i.actualStart ?? end;
    if (end < start) throw new Error("Actual end cannot be before actual start.");
    return { status: "Completed", percent_complete: 100, actual_start: start, actual_end: end };
  }
  if (percent === 0 && !onHold) return { status: "Not Started", percent_complete: 0, actual_start: null, actual_end: null };
  return { status: onHold ? "On Hold" : "In Progress", percent_complete: percent, actual_start: i.actualStart ?? statusDate, actual_end: null };
}
