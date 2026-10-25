// Cross-module consistency checks (Module 6). PURE functions over plain rows - no database access.
// Each check reports PASS, or its own level (WARN / FAIL) with the offending records.
import { pkr } from "./format";
import { dependencyConflicts, overAllocations, type SchedDep, type SchedTask } from "./schedule";

export interface ConsistencyInput {
  project: { deadline: string; current_budget: number; status_date: string };
  requirements: { id: number; code: string; title: string; status: string; change_request_id: number | null }[];
  wbs: { id: number; code: string; name: string; node_type: string; requirement_id: number | null }[];
  tasks: (SchedTask & { estimated_cost: number })[];
  deps: SchedDep[];
  costEntries: { id: number; task_id: number; entry_date: string; amount: number }[];
  defects: { id: number; code: string; task_id: number | null; task_exists: number }[];
  changeRequests: { id: number; code: string; status: string }[];
  milestones: { id: number; name: string; target_date: string; status: string; task_id: number | null }[];
  team: { id: number; name: string }[];
}

export type CheckLevel = "WARN" | "FAIL";
export interface CheckResult { id: string; title: string; level: CheckLevel; status: "PASS" | CheckLevel; count: number; issues: string[]; note?: string }

const check = (id: string, title: string, level: CheckLevel, issues: string[], note?: string): CheckResult =>
  ({ id, title, level, status: issues.length ? level : "PASS", count: issues.length, issues, note });

export function runConsistencyChecks(i: ConsistencyInput): CheckResult[] {
  const task = new Map(i.tasks.map((t) => [t.id, t]));
  const req = new Map(i.requirements.map((r) => [r.id, r]));
  const inWbs = new Set(i.wbs.map((w) => w.requirement_id).filter((x) => x !== null));
  const bac = i.tasks.reduce((s, t) => s + t.estimated_cost, 0);
  const unallocated = i.project.current_budget - bac;
  const memberOf = (id: number) => i.team.find((m) => m.id === id)?.name ?? `member #${id}`;

  return [
    check("C01", "Approved requirements not in the WBS", "WARN",
      i.requirements.filter((r) => r.status === "Approved" && !inWbs.has(r.id)).map((r) => `${r.code} ${r.title}`)),
    check("C02", "Work packages without tasks", "WARN",
      i.wbs.filter((w) => w.node_type === "Work Package" && !i.tasks.some((t) => t.wbs_item_id === w.id)).map((w) => `${w.code} ${w.name}`)),
    check("C03", "WBS items linked to a non-approved requirement", "FAIL",
      i.wbs.filter((w) => w.requirement_id !== null && req.get(w.requirement_id)?.status !== "Approved")
        .map((w) => `${w.code} ${w.name} -> ${req.get(w.requirement_id!)?.code ?? "missing"} (${req.get(w.requirement_id!)?.status ?? "-"})`)),
    check("C04", "Tasks starting before a predecessor's end + lag", "FAIL",
      dependencyConflicts(i.tasks, i.deps).map((c) => `${c.task} starts ${c.planned_start}, must start on/after ${c.required_start} (after ${c.predecessor})`)),
    check("C05", "Tasks ending after the current deadline", "WARN",
      i.tasks.filter((t) => t.planned_end > i.project.deadline).map((t) => `${t.code} ends ${t.planned_end} (deadline ${i.project.deadline})`)),
    check("C06", "Task estimates exceed the approved budget", "FAIL",
      bac > i.project.current_budget ? [`BAC ${pkr(bac)} > approved budget ${pkr(i.project.current_budget)}`] : []),
    check("C07", "Approved budget not fully allocated", "WARN",
      unallocated > 0 ? [`${pkr(unallocated)} unallocated (approved ${pkr(i.project.current_budget)}, BAC ${pkr(bac)})`] : [],
      `Unallocated ${pkr(Math.max(0, unallocated))}`),
    check("C08", "Cost entries on Not Started tasks", "FAIL",
      i.costEntries.filter((c) => task.get(c.task_id)?.status === "Not Started").map((c) => `Entry #${c.id} ${pkr(c.amount)} on ${task.get(c.task_id)!.code}`)),
    check("C09", "Cost entries dated after the status date", "FAIL",
      i.costEntries.filter((c) => c.entry_date > i.project.status_date).map((c) => `Entry #${c.id} ${pkr(c.amount)} dated ${c.entry_date} (status date ${i.project.status_date})`)),
    check("C10", "Defects whose task is missing", "FAIL",
      i.defects.filter((d) => d.task_id === null || !d.task_exists).map((d) => `${d.code} -> task #${d.task_id ?? "none"}`)),
    check("C11", "Approved change requests whose requirements are not Approved", "FAIL",
      i.changeRequests.filter((c) => c.status === "Approved").flatMap((c) =>
        i.requirements.filter((r) => r.change_request_id === c.id && r.status !== "Approved").map((r) => `${c.code}: ${r.code} is ${r.status}`))),
    check("C12", "Milestones whose task finishes after the target", "WARN",
      i.milestones.filter((m) => m.status !== "Achieved" && m.task_id !== null && task.has(m.task_id) && task.get(m.task_id)!.planned_end > m.target_date)
        .map((m) => `${m.name}: ${task.get(m.task_id!)!.code} ends ${task.get(m.task_id!)!.planned_end} > target ${m.target_date}`)),
    check("C13", "Resource over-allocation", "WARN",
      overAllocations(i.tasks).map((o) => `${memberOf(o.assignee_id)}: ${o.a.code} and ${o.b.code} overlap ${o.from}..${o.to} (${o.days} d)`)),
  ];
}

export function summarise(results: CheckResult[]) {
  return {
    pass: results.filter((r) => r.status === "PASS").length,
    warn: results.filter((r) => r.status === "WARN").length,
    fail: results.filter((r) => r.status === "FAIL").length,
  };
}
