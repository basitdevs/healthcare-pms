import { fmtDate } from "@/lib/format";

/** Projected finish vs the CURRENT deadline. Red when the project will miss it. */
export function DeadlineBanner({ projectedFinish, deadline, marginDays }: { projectedFinish: string | null; deadline: string; marginDays: number | null }) {
  if (!projectedFinish || marginDays === null) return null;
  const plural = (n: number) => `${n} day${n === 1 ? "" : "s"}`;
  if (marginDays < 0) {
    return (
      <div role="alert" className="rounded-xl border border-red-300 bg-red-50 px-5 py-4 text-sm text-red-900">
        <strong className="text-red-700">Deadline at risk: the project will miss the deadline by {plural(-marginDays)}.</strong>{" "}
        Projected finish {fmtDate(projectedFinish)} is after the current deadline {fmtDate(deadline)}.
      </div>
    );
  }
  const tight = marginDays <= 7;
  return (
    <div className={`rounded-xl border px-5 py-4 text-sm ${tight ? "border-amber-300 bg-amber-50 text-amber-900" : "border-emerald-200 bg-emerald-50 text-emerald-900"}`}>
      <strong>{marginDays === 0 ? "No margin left:" : `${plural(marginDays)} of margin:`}</strong>{" "}
      projected finish {fmtDate(projectedFinish)} vs current deadline {fmtDate(deadline)}.
    </div>
  );
}
