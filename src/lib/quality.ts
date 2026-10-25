// Quality & risk helpers (Module 5). PURE functions only - no database access - so they are unit-testable.

export const SEVERITIES = ["Critical", "Major", "Minor", "Trivial"] as const;
export const DEFECT_STATUSES = ["Open", "In Progress", "Resolved", "Closed"] as const;
export const RESULTS = ["Pass", "Fail", "Pending"] as const;
export const RISK_CATEGORIES = ["Scope", "Schedule", "Cost", "Quality", "Technical", "Security", "People", "External"] as const;
export const RISK_STATUSES = ["Open", "Mitigating", "Occurred", "Closed"] as const;

export type Rating = "Critical" | "High" | "Medium" | "Low";

/** Same bands as the generated `rating` column: >=15 Critical, 10-14 High, 5-9 Medium, else Low. */
export const ratingOf = (score: number): Rating => (score >= 15 ? "Critical" : score >= 10 ? "High" : score >= 5 ? "Medium" : "Low");

export interface InspectionLike { id: number; checklist_item_id: number; result: string; inspected_on: string }

/** Latest inspection per checklist item (by date, then by id for same-day retests). */
export function latestPerItem<T extends InspectionLike>(inspections: T[]): Map<number, T> {
  const out = new Map<number, T>();
  for (const i of inspections) {
    const cur = out.get(i.checklist_item_id);
    if (!cur || i.inspected_on > cur.inspected_on || (i.inspected_on === cur.inspected_on && i.id > cur.id)) out.set(i.checklist_item_id, i);
  }
  return out;
}

/** Pass rate over items: rate = passed / all items; inspectedRate = passed / items with a Pass or Fail latest result. */
export function passRate(itemIds: number[], latest: Map<number, { result: string }>) {
  const r = (id: number) => latest.get(id)?.result ?? "Not inspected";
  const pass = itemIds.filter((id) => r(id) === "Pass").length;
  const fail = itemIds.filter((id) => r(id) === "Fail").length;
  const pending = itemIds.filter((id) => r(id) === "Pending").length;
  const none = itemIds.length - pass - fail - pending;
  return {
    items: itemIds.length, pass, fail, pending, none,
    rate: itemIds.length ? pass / itemIds.length : null,
    inspectedRate: pass + fail ? pass / (pass + fail) : null,
  };
}

/** Competition ranking (ties share a rank, next rank skips): score desc, impact desc - mirrors v_risk_ranked. */
export function rankRisks<T extends { score: number; impact: number }>(risks: T[]): (T & { rank: number })[] {
  const sorted = [...risks].sort((a, b) => b.score - a.score || b.impact - a.impact);
  return sorted.map((r, i) => {
    let first = i;
    while (first > 0 && sorted[first - 1].score === r.score && sorted[first - 1].impact === r.impact) first--;
    return { ...r, rank: first + 1 };
  });
}

export function defectCounts(defects: { status: string; severity: string }[]) {
  const by = <K extends string>(keys: readonly K[], f: (d: { status: string; severity: string }) => string) =>
    Object.fromEntries(keys.map((k) => [k, defects.filter((d) => f(d) === k).length])) as Record<K, number>;
  const unresolved = defects.filter((d) => d.status === "Open" || d.status === "In Progress");
  return {
    total: defects.length,
    status: by(DEFECT_STATUSES, (d) => d.status),
    severity: by(SEVERITIES, (d) => d.severity),
    unresolved: unresolved.length,
    unresolvedCritical: unresolved.filter((d) => d.severity === "Critical").length,
  };
}

/** resolved_date for a status change: set to the status date when resolving/closing, cleared when reopening. */
export function resolvedDateFor(status: string, current: string | null, statusDate: string, reportedDate: string): string | null {
  if (status !== "Resolved" && status !== "Closed") return null;
  const d = current ?? statusDate;
  if (d < reportedDate) throw new Error(`The resolved date (${d}) cannot be before the reported date (${reportedDate}). Move the status date forward first.`);
  return d;
}

const blank = (s: string | null | undefined) => !s || !s.trim();

/** Throws an Error with a user-facing message when a defect is not acceptable. */
export function validateDefect(d: { title: string; taskId: number | null; assigneeId: number | null; reporterId: number | null; severity: string; status: string; reportedDate: string; resolvedDate: string | null; statusDate: string }) {
  if (blank(d.title)) throw new Error("Defect title is required.");
  if (!d.taskId) throw new Error("Choose the task the defect belongs to.");
  if (!d.assigneeId) throw new Error("Choose who the defect is assigned to.");
  if (!d.reporterId) throw new Error("Choose who reported the defect.");
  if (!(SEVERITIES as readonly string[]).includes(d.severity)) throw new Error(`Severity must be one of: ${SEVERITIES.join(", ")}.`);
  if (!(DEFECT_STATUSES as readonly string[]).includes(d.status)) throw new Error(`Status must be one of: ${DEFECT_STATUSES.join(", ")}.`);
  if (d.reportedDate > d.statusDate) throw new Error(`Reported date cannot be after the status date (${d.statusDate}).`);
  const resolved = d.status === "Resolved" || d.status === "Closed";
  if (resolved && !d.resolvedDate) throw new Error("A resolved or closed defect needs a resolved date.");
  if (!resolved && d.resolvedDate) throw new Error("Only resolved or closed defects can have a resolved date.");
  if (d.resolvedDate && d.resolvedDate < d.reportedDate) throw new Error("Resolved date cannot be before the reported date.");
}

/** Throws an Error with a user-facing message when a risk is not acceptable. */
export function validateRisk(r: { title: string; likelihood: number; impact: number; category: string; status: string; ownerId: number | null }) {
  if (blank(r.title)) throw new Error("Risk title is required.");
  for (const [k, v] of [["Likelihood", r.likelihood], ["Impact", r.impact]] as const) {
    if (!Number.isInteger(v) || v < 1 || v > 5) throw new Error(`${k} must be a whole number from 1 to 5.`);
  }
  if (!(RISK_CATEGORIES as readonly string[]).includes(r.category)) throw new Error(`Category must be one of: ${RISK_CATEGORIES.join(", ")}.`);
  if (!(RISK_STATUSES as readonly string[]).includes(r.status)) throw new Error(`Status must be one of: ${RISK_STATUSES.join(", ")}.`);
  if (!r.ownerId) throw new Error("Choose a risk owner.");
}

export const fmtRate = (v: number | null) => (v === null ? "n/a" : `${(v * 100).toFixed(1)}%`);
