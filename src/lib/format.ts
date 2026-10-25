const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export const num = (n: number) => Math.round(n).toLocaleString("en-US");
export const pkr = (n: number) => `PKR ${num(n)}`;
export const signedPkr = (n: number) => `${n >= 0 ? "+" : "-"}PKR ${num(Math.abs(n))}`;

export function fmtDate(d?: string | null): string {
  if (!d) return "-";
  const [y, m, day] = d.split("-");
  return `${Number(day)} ${MONTHS[Number(m) - 1]} ${y}`;
}

const dayNum = (d: string) => Date.parse(`${d}T00:00:00Z`) / 86400000;

export function daysBetween(start: string, end: string): number {
  return dayNum(end) - dayNum(start);
}

/** Inclusive length of the project window in weeks (e.g. 2026-09-07..2026-12-27 = 16). */
export function weeksInclusive(start: string, end: string): number {
  return Math.round(((daysBetween(start, end) + 1) / 7) * 10) / 10;
}

export const todayIso = () => new Date().toISOString().slice(0, 10);

export function addDays(d: string, n: number): string {
  return new Date((dayNum(d) + n) * 86400000).toISOString().slice(0, 10);
}
