import type { EvmAlert } from "@/lib/evm";
import { Badge } from "./ui";

/** EVM alerts, critical first; long lists collapse after `limit`. */
export function AlertList({ alerts, limit = 8 }: { alerts: EvmAlert[]; limit?: number }) {
  const item = (a: EvmAlert, i: number) => (
    <li key={i} className="flex items-start gap-2">
      <Badge tone={a.level === "critical" ? "red" : "amber"}>{a.level === "critical" ? "Critical" : "Warning"}</Badge>
      <span>{a.message}</span>
    </li>
  );
  return (
    <>
      <ul className="space-y-1.5 text-sm text-slate-800">{alerts.slice(0, limit).map(item)}</ul>
      {alerts.length > limit && (
        <details className="mt-2 text-sm">
          <summary className="cursor-pointer text-xs font-medium text-slate-600 hover:text-slate-900">Show {alerts.length - limit} more alerts</summary>
          <ul className="mt-2 space-y-1.5 text-slate-800">{alerts.slice(limit).map((a, i) => item(a, i + limit))}</ul>
        </details>
      )}
    </>
  );
}
