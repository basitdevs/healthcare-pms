// Hand-built SVG Gantt chart (server component, no chart library).
import type { ReactNode } from "react";
import { addDays, daysBetween, fmtDate } from "@/lib/format";
import type { Schedule } from "@/lib/schedule-data";

const LABEL = 300;   // left label column (px)
const DAY = 7;       // px per calendar day
const ROW = 30;
const HEAD = 46;

const C = {
  grid: "#e2e8f0", text: "#334155", muted: "#64748b", planned: "#cbd5e1",
  done: "#0f766e", track: "#14b8a6", trackBg: "#ccfbf1", late: "#dc2626", lateBg: "#fee2e2",
  critical: "#f59e0b", link: "#94a3b8", status: "#0284c7", deadline: "#dc2626", original: "#64748b",
};

type Row =
  | { kind: "group"; label: string }
  | { kind: "task"; t: Schedule["tasks"][number] }
  | { kind: "milestone"; m: Schedule["milestones"][number] };

const short = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const mondayOnOrBefore = (d: string) => addDays(d, -((new Date(`${d}T00:00:00Z`).getUTCDay() + 6) % 7));

export function Gantt({ s }: { s: Schedule }) {
  const { project: p, tasks, deps, milestones, analysis: a } = s;
  if (!tasks.length) return <p className="px-5 py-8 text-center text-sm text-slate-500">No activities scheduled yet.</p>;

  const rows: Row[] = [];
  if (milestones.length) {
    rows.push({ kind: "group", label: "Milestones" });
    for (const m of milestones) rows.push({ kind: "milestone", m });
  }
  const groups = new Map<number, { code: string; name: string; tasks: Schedule["tasks"] }>();
  for (const t of tasks) {
    const g = groups.get(t.deliverable_id) ?? { code: t.deliverable_code, name: t.deliverable_name, tasks: [] };
    g.tasks.push(t);
    groups.set(t.deliverable_id, g);
  }
  for (const g of [...groups.values()].sort((x, y) => x.code.localeCompare(y.code, undefined, { numeric: true }))) {
    rows.push({ kind: "group", label: `${g.code}  ${g.name}` });
    for (const t of g.tasks.sort((x, y) => x.planned_start.localeCompare(y.planned_start) || x.id - y.id)) rows.push({ kind: "task", t });
  }

  const ends = [
    ...tasks.map((t) => t.planned_end), ...[...a.forecast.values()].map((f) => f.forecast_end),
    ...milestones.map((m) => m.forecast_date ?? m.target_date), ...milestones.map((m) => m.target_date),
    p.deadline, p.original_deadline, p.status_date,
  ];
  const starts = [p.start_date, ...tasks.map((t) => t.planned_start), ...[...a.forecast.values()].map((f) => f.forecast_start)];
  const from = mondayOnOrBefore(starts.reduce((x, y) => (x < y ? x : y)));
  const to = addDays(mondayOnOrBefore(ends.reduce((x, y) => (x > y ? x : y))), 13);
  const days = daysBetween(from, to) + 1;
  const width = LABEL + days * DAY + 150; // room for the deadline labels
  const height = HEAD + rows.length * ROW + 8;
  const x = (d: string) => LABEL + daysBetween(from, d) * DAY;   // left edge of day d
  const xEnd = (d: string) => x(d) + DAY;                          // right edge of day d

  const rowIndex = new Map<number, number>();
  rows.forEach((r, i) => r.kind === "task" && rowIndex.set(r.t.id, i));
  const yOf = (i: number) => HEAD + i * ROW;
  const laneMid = (i: number) => yOf(i) + 20;

  const weeks: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 7)) weeks.push(d);

  const vline = (d: string, color: string, label: string, dash: string | undefined, row: number) => (
    <g key={label}>
      <line x1={xEnd(d)} x2={xEnd(d)} y1={HEAD - 4} y2={height - 4} stroke={color} strokeWidth={1.5} strokeDasharray={dash} />
      <text x={xEnd(d) + 3} y={12 + row * 11} fontSize={10} fontWeight={600} fill={color}>{label}</text>
    </g>
  );

  const body: ReactNode[] = [];
  rows.forEach((r, i) => {
    const y = yOf(i);
    if (r.kind === "group") {
      body.push(
        <g key={`g${i}`}>
          <rect x={0} y={y} width={width} height={ROW} fill="#f8fafc" />
          <text x={10} y={y + 19} fontSize={11.5} fontWeight={700} fill={C.text}>{short(r.label, 44)}</text>
        </g>,
      );
      return;
    }
    if (r.kind === "milestone") {
      const m = r.m;
      const achieved = m.status === "Achieved";
      const fx = m.forecast_date ? xEnd(m.forecast_date) : null;
      const tx = xEnd(m.target_date);
      const risk = m.display_status === "At Risk";
      const diamond = (cx: number, fill: string, stroke: string) => (
        <path d={`M${cx} ${y + 8} l7 7 l-7 7 l-7 -7 z`} fill={fill} stroke={stroke} strokeWidth={1.5} />
      );
      body.push(
        <g key={`m${m.id}`}>
          <title>{`${m.name}\nTarget ${fmtDate(m.target_date)}${m.forecast_date ? `\n${achieved ? "Achieved" : "Forecast"} ${fmtDate(m.forecast_date)}` : ""}\nStatus ${m.display_status}`}</title>
          <text x={22} y={y + 19} fontSize={11} fill={C.text}>{short(m.name, 40)}</text>
          {fx !== null && fx !== tx && <line x1={tx} x2={fx} y1={y + 15} y2={y + 15} stroke={risk ? C.late : C.muted} strokeDasharray="2 2" />}
          {diamond(tx, achieved ? C.done : "#fff", achieved ? C.done : C.text)}
          {fx !== null && fx !== tx && diamond(fx, risk ? C.late : C.track, risk ? C.late : C.track)}
        </g>,
      );
      return;
    }

    const t = r.t;
    const f = a.forecast.get(t.id)!;
    const done = t.status === "Completed";
    const late = !done && f.delay_days > 0;
    const crit = a.critical.has(t.id);
    const differs = f.forecast_start !== t.planned_start || f.forecast_end !== t.planned_end;
    const fx0 = x(f.forecast_start), fw = xEnd(f.forecast_end) - fx0;
    const main = done ? C.done : late ? C.late : C.track;
    body.push(
      <g key={`t${t.id}`}>
        <title>{`${t.code} ${t.name}\n${t.assignee_name} · ${t.status} ${t.percent_complete}%\nPlanned ${fmtDate(t.planned_start)} – ${fmtDate(t.planned_end)}\n${done ? "Actual" : "Forecast"} ${fmtDate(f.forecast_start)} – ${fmtDate(f.forecast_end)}${f.delay_days ? ` (${f.delay_days > 0 ? "+" : ""}${f.delay_days} d)` : ""}\n${f.cause}${a.float.has(t.id) ? `\nTotal float ${a.float.get(t.id)} d${crit ? " (critical)" : ""}` : ""}`}</title>
        <line x1={0} x2={width} y1={y + ROW} y2={y + ROW} stroke="#f1f5f9" />
        <text x={22} y={y + 19} fontSize={11} fill={C.text}>
          <tspan fontWeight={700} fill={late ? C.late : C.text}>{t.code}</tspan>
          <tspan dx={6}>{short(t.name, 33)}</tspan>
        </text>
        {/* planned (baseline) bar */}
        <rect x={x(t.planned_start)} y={y + 5} width={xEnd(t.planned_end) - x(t.planned_start)} height={7} rx={2} fill={C.planned} />
        {/* actual / forecast bar, filled by percent complete */}
        <rect x={fx0} y={y + 14} width={fw} height={12} rx={2} fill={done ? C.done : late ? C.lateBg : C.trackBg} />
        {!done && t.percent_complete > 0 && <rect x={fx0} y={y + 14} width={(fw * t.percent_complete) / 100} height={12} rx={2} fill={main} />}
        <rect
          x={fx0} y={y + 14} width={fw} height={12} rx={2} fill="none"
          stroke={crit ? C.critical : main} strokeWidth={crit ? 2 : 1} strokeDasharray={differs && !done ? "4 2" : undefined}
        />
        {f.delay_days !== 0 && (
          <text x={xEnd(f.forecast_end) + 4} y={y + 24} fontSize={10} fontWeight={600} fill={f.delay_days > 0 ? C.late : C.done}>
            {f.delay_days > 0 ? "+" : ""}{f.delay_days}d{done ? " (done)" : ""}
          </text>
        )}
      </g>,
    );
  });

  // finish-to-start connectors between forecast bars
  const links = deps.flatMap((d) => {
    const pi = rowIndex.get(d.predecessor_id), si = rowIndex.get(d.task_id);
    if (pi === undefined || si === undefined) return [];
    const pf = a.forecast.get(d.predecessor_id)!, sf = a.forecast.get(d.task_id)!;
    const x1 = xEnd(pf.forecast_end), x2 = x(sf.forecast_start);
    const y1 = laneMid(pi), y2 = laneMid(si);
    const crit = a.critical.has(d.predecessor_id) && a.critical.has(d.task_id);
    const elbow = x1 + 4;
    return [
      <path
        key={`d${d.id}`}
        d={`M${x1} ${y1} H${elbow} V${y2} H${x2 - 1}`}
        fill="none" stroke={crit ? C.critical : C.link} strokeWidth={crit ? 1.4 : 1} opacity={crit ? 0.95 : 0.7}
        markerEnd={crit ? "url(#arrow-crit)" : "url(#arrow)"}
      />,
    ];
  });

  return (
    <div>
      <div className="overflow-x-auto">
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Gantt chart" className="block font-sans">
          <defs>
            {(["arrow", "arrow-crit"] as const).map((id) => (
              <marker key={id} id={id} viewBox="0 0 6 6" refX={5} refY={3} markerWidth={6} markerHeight={6} orient="auto">
                <path d="M0 0 L6 3 L0 6 z" fill={id === "arrow" ? C.link : C.critical} />
              </marker>
            ))}
          </defs>
          <rect x={0} y={0} width={width} height={height} fill="#fff" />
          {weeks.map((w) => (
            <g key={w}>
              <line x1={x(w)} x2={x(w)} y1={HEAD - 10} y2={height - 4} stroke={C.grid} />
              <text x={x(w) + 3} y={HEAD - 13} fontSize={10} fill={C.muted}>{fmtDate(w).replace(/ \d{4}$/, "")}</text>
            </g>
          ))}
          <line x1={0} x2={width} y1={HEAD - 1} y2={HEAD - 1} stroke={C.grid} />
          <text x={10} y={HEAD - 13} fontSize={10} fontWeight={700} fill={C.muted}>ACTIVITY (week starting)</text>
          {body}
          {links}
          <line x1={LABEL - 6} x2={LABEL - 6} y1={0} y2={height} stroke={C.grid} />
          {vline(p.status_date, C.status, `Status ${fmtDate(p.status_date)}`, "4 3", 0)}
          {vline(p.deadline, C.deadline, `Deadline ${fmtDate(p.deadline)}`, undefined, 1)}
          {p.original_deadline !== p.deadline && vline(p.original_deadline, C.original, `Original deadline ${fmtDate(p.original_deadline)}`, "2 3", 2)}
        </svg>
      </div>
      <Legend />
    </div>
  );
}

function Legend() {
  const item = (swatch: ReactNode, label: string) => (
    <span className="inline-flex items-center gap-1.5">
      <svg width={26} height={14} aria-hidden>{swatch}</svg>
      {label}
    </span>
  );
  return (
    <div className="flex flex-wrap gap-x-5 gap-y-2 border-t border-slate-100 px-5 py-3 text-xs text-slate-600">
      {item(<rect x={1} y={4} width={24} height={6} rx={2} fill={C.planned} />, "Planned (baseline)")}
      {item(<><rect x={1} y={2} width={24} height={10} rx={2} fill={C.trackBg} stroke={C.track} /><rect x={1} y={2} width={12} height={10} rx={2} fill={C.track} /></>, "Forecast, filled by % complete")}
      {item(<rect x={1} y={2} width={24} height={10} rx={2} fill={C.done} />, "Completed (actual dates)")}
      {item(<rect x={1} y={2} width={24} height={10} rx={2} fill={C.lateBg} stroke={C.late} strokeDasharray="4 2" />, "Delayed (dashed = differs from plan)")}
      {item(<rect x={1} y={2} width={24} height={10} rx={2} fill="#fff" stroke={C.critical} strokeWidth={2} />, "Critical path")}
      {item(<path d="M2 7 H22" stroke={C.link} fill="none" markerEnd="url(#arrow)" />, "Finish-to-start link")}
      {item(<path d="M13 1 l6 6 l-6 6 l-6 -6 z" fill="#fff" stroke={C.text} strokeWidth={1.5} />, "Milestone target")}
      {item(<path d="M13 1 l6 6 l-6 6 l-6 -6 z" fill={C.late} />, "Milestone forecast (at risk)")}
      {item(<line x1={13} x2={13} y1={0} y2={14} stroke={C.status} strokeWidth={2} strokeDasharray="4 3" />, "Status date")}
      {item(<line x1={13} x2={13} y1={0} y2={14} stroke={C.deadline} strokeWidth={2} />, "Current deadline")}
      {item(<line x1={13} x2={13} y1={0} y2={14} stroke={C.original} strokeWidth={2} strokeDasharray="2 3" />, "Original deadline")}
    </div>
  );
}
