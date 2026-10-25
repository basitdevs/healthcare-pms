// Hand-built SVG S-curve (cumulative PV / EV / AC), server component, no chart library.
import { daysBetween, fmtDate } from "@/lib/format";
import type { Evm } from "@/lib/evm-data";

const W = 960, H = 380, L = 84, R = 150, T = 18, B = 44;
const C = { pv: "#64748b", ev: "#0d9488", ac: "#dc2626", bac: "#334155", budget: "#7c3aed", status: "#0284c7", grid: "#e2e8f0", text: "#475569" };

const money = (v: number) => (v >= 1_000_000 ? `PKR ${(v / 1_000_000).toFixed(v % 1_000_000 ? 1 : 0)}M` : `PKR ${Math.round(v / 1000)}k`);

export function SCurve({ e }: { e: Evm }) {
  const { curve, project: p } = e;
  const f = e.analysis.forecast;
  if (curve.length < 2) return <p className="text-sm text-slate-500">Not enough dates to draw the curve.</p>;
  const start = curve[0].date, end = curve[curve.length - 1].date;
  const span = Math.max(1, daysBetween(start, end));
  const top = Math.max(f.bac, f.approvedBudget, ...curve.map((c) => Math.max(c.pv, c.ac ?? 0, c.ev ?? 0))) * 1.08 || 1;
  const step = [100_000, 250_000, 500_000, 1_000_000, 2_000_000, 5_000_000].find((s) => top / s <= 7) ?? 10_000_000;
  const x = (d: string) => L + (daysBetween(start, d) / span) * (W - L - R);
  const y = (v: number) => T + (1 - v / top) * (H - T - B);
  const path = (k: "pv" | "ev" | "ac") =>
    curve.filter((c) => c[k] !== null).map((c, i) => `${i ? "L" : "M"}${x(c.date).toFixed(1)} ${y(c[k]!).toFixed(1)}`).join(" ");
  const ticks: number[] = [];
  for (let v = 0; v <= top; v += step) ticks.push(v);
  const weekly = curve.filter((c, i) => i % 2 === 0 && daysBetween(start, c.date) % 7 === 0);
  const last = [...curve].reverse().find((c) => c.ac !== null);
  const statusIn = p.status_date >= start && p.status_date <= end;

  const refLine = (v: number, color: string, label: string, dy = 0) => (
    <g key={label}>
      <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke={color} strokeDasharray="6 4" strokeWidth={1.2} />
      <text x={W - R + 6} y={y(v) + 4 + dy} fontSize={11} fontWeight={600} fill={color}>{label}</text>
    </g>
  );

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full font-sans" role="img" aria-label="S-curve of planned value, earned value and actual cost">
        <rect x={0} y={0} width={W} height={H} fill="#fff" />
        {ticks.map((v) => (
          <g key={v}>
            <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke={C.grid} />
            <text x={L - 8} y={y(v) + 4} fontSize={11} textAnchor="end" fill={C.text}>{money(v)}</text>
          </g>
        ))}
        {weekly.map((c) => (
          <g key={c.date}>
            <line x1={x(c.date)} x2={x(c.date)} y1={H - B} y2={H - B + 4} stroke={C.text} />
            <text x={x(c.date)} y={H - B + 17} fontSize={10.5} textAnchor="middle" fill={C.text}>{fmtDate(c.date).replace(/ \d{4}$/, "")}</text>
          </g>
        ))}
        <line x1={L} x2={W - R} y1={H - B} y2={H - B} stroke={C.text} />
        <line x1={L} x2={L} y1={T} y2={H - B} stroke={C.text} />
        {refLine(f.bac, C.bac, `BAC ${money(f.bac)}`, f.approvedBudget !== f.bac && f.approvedBudget > f.bac ? 10 : 0)}
        {f.approvedBudget !== f.bac && refLine(f.approvedBudget, C.budget, `Approved ${money(f.approvedBudget)}`, f.approvedBudget > f.bac ? -4 : 10)}
        {statusIn && (
          <g>
            <line x1={x(p.status_date)} x2={x(p.status_date)} y1={T} y2={H - B} stroke={C.status} strokeDasharray="4 3" strokeWidth={1.5} />
            <text x={x(p.status_date) + 4} y={T + 10} fontSize={11} fontWeight={600} fill={C.status}>Status {fmtDate(p.status_date)}</text>
          </g>
        )}
        <path d={path("pv")} fill="none" stroke={C.pv} strokeWidth={2.2} strokeDasharray="7 4" />
        <path d={path("ac")} fill="none" stroke={C.ac} strokeWidth={2.4} />
        <path d={path("ev")} fill="none" stroke={C.ev} strokeWidth={2.4} />
        {last && (
          <g fontSize={11} fontWeight={600}>
            <circle cx={x(last.date)} cy={y(last.ac!)} r={3.5} fill={C.ac} />
            <circle cx={x(last.date)} cy={y(last.ev!)} r={3.5} fill={C.ev} />
            <text x={x(last.date) - 6} y={y(last.ac!) - 8} textAnchor="end" fill={C.ac}>AC {money(last.ac!)}</text>
            <text x={x(last.date) + 8} y={y(last.ev!) + 14} fill={C.ev}>EV {money(last.ev!)}</text>
          </g>
        )}
      </svg>
      <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-slate-600">
        {[
          { c: C.pv, dash: "7 4", label: "PV planned value (baseline)" },
          { c: C.ev, label: "EV earned value" },
          { c: C.ac, label: "AC actual cost" },
          { c: C.bac, dash: "6 4", label: "BAC (allocated)" },
          { c: C.budget, dash: "6 4", label: "Approved budget" },
          { c: C.status, dash: "4 3", label: "Status date" },
        ].map((l) => (
          <span key={l.label} className="inline-flex items-center gap-1.5">
            <svg width={24} height={8} aria-hidden><line x1={0} x2={24} y1={4} y2={4} stroke={l.c} strokeWidth={2.4} strokeDasharray={l.dash} /></svg>
            {l.label}
          </span>
        ))}
      </div>
    </div>
  );
}
