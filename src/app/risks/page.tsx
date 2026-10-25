import Link from "next/link";
import { ActionForm, RowAction, SubmitButton } from "@/components/forms";
import { Badge, Card, EmptyRow, Field, NoProject, PageHeader, StatusBadge, inputCls, tdCls, thCls, type Tone } from "@/components/ui";
import { getProject, getQuality, getTasksLite, getTeam } from "@/lib/queries";
import { RISK_CATEGORIES, RISK_STATUSES, ratingOf, type Rating } from "@/lib/quality";
import type { RiskRow } from "@/lib/quality-data";
import { addRisk, deleteRisk, setRiskStatus, updateRisk } from "../actions/risks";

const linkCls = "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50";
const ratingTone: Record<Rating, Tone> = { Critical: "red", High: "amber", Medium: "blue", Low: "green" };
const cellBg: Record<Rating, string> = { Critical: "bg-red-500 text-white", High: "bg-orange-400 text-white", Medium: "bg-yellow-200 text-yellow-950", Low: "bg-emerald-100 text-emerald-900" };
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

function RiskForm({ r, pid, tasks, team, statusDate }: { r?: RiskRow; pid: number; tasks: { id: number; code: string; name: string }[]; team: { id: number; name: string }[]; statusDate: string }) {
  const scale = (name: string, v?: number) => (
    <select name={name} defaultValue={v ?? 3} className={inputCls}>{[1, 2, 3, 4, 5].map((n) => <option key={n}>{n}</option>)}</select>
  );
  return (
    <ActionForm key={r?.id ?? "new"} action={r ? updateRisk : addRisk} resetOnSuccess={!r} className="grid gap-4 md:grid-cols-6">
      <input type="hidden" name="project_id" value={pid} />
      {r && <input type="hidden" name="id" value={r.id} />}
      <Field label="Title" className="md:col-span-3"><input name="title" defaultValue={r?.title} className={inputCls} required /></Field>
      <Field label="Category"><select name="category" defaultValue={r?.category ?? "Technical"} className={inputCls}>{RISK_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></Field>
      <Field label="Likelihood (1-5)">{scale("likelihood", r?.likelihood)}</Field>
      <Field label="Impact (1-5)">{scale("impact", r?.impact)}</Field>
      <Field label="Description" className="md:col-span-3"><input name="description" defaultValue={r?.description ?? ""} className={inputCls} placeholder="Optional" /></Field>
      <Field label="Owner">
        <select name="owner_id" defaultValue={r?.owner_id ?? ""} className={inputCls} required><option value="" disabled>Choose</option>{team.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select>
      </Field>
      <Field label="Related task">
        <select name="related_task_id" defaultValue={r?.related_task_id ?? ""} className={inputCls}><option value="">None</option>{tasks.map((t) => <option key={t.id} value={t.id}>{t.code} {t.name}</option>)}</select>
      </Field>
      <Field label="Status"><select name="status" defaultValue={r?.status ?? "Open"} className={inputCls}>{RISK_STATUSES.map((s) => <option key={s}>{s}</option>)}</select></Field>
      <Field label="Identified"><input type="date" name="identified_date" defaultValue={r?.identified_date ?? statusDate} className={inputCls} required /></Field>
      <div className="flex items-end md:col-span-5"><SubmitButton label={r ? "Save risk" : "Add risk"} pendingLabel="Saving..." /></div>
    </ActionForm>
  );
}

export default async function RisksPage({ searchParams }: { searchParams: Promise<{ [k: string]: string | string[] | undefined }> }) {
  const p = getProject();
  if (!p) return <NoProject />;
  const q = getQuality(p.id);
  const tasks = getTasksLite(p.id);
  const team = getTeam(p.id);
  const editId = one((await searchParams).edit);
  const editing = [...q.risks, ...q.closedRisks].find((r) => String(r.id) === editId);
  const counts = (["Critical", "High", "Medium", "Low"] as Rating[]).map((r) => ({ r, n: q.risks.filter((x) => x.rating === r).length }));

  return (
    <>
      <PageHeader title="Risk prioritization matrix" subtitle="Likelihood × impact (1-5 each). Score and rating are calculated by the database; the register is ranked by score, then impact (ties share a rank).">
        <Link href="/risks/pdpc" className={linkCls}>PDPC</Link>
        <Link href="/quality" className={linkCls}>Defects</Link>
      </PageHeader>

      <div className="mb-6 grid gap-6 lg:grid-cols-5">
        <Card title="Heat map (active risks)" className="lg:col-span-3">
          <div className="flex gap-2">
            <div className="flex w-5 items-center justify-center"><span className="-rotate-90 whitespace-nowrap text-xs font-semibold uppercase tracking-wide text-slate-500">Impact →</span></div>
            <div className="flex-1">
              <div className="grid grid-cols-[1.5rem_repeat(5,minmax(0,1fr))] gap-1">
                {[5, 4, 3, 2, 1].map((imp) => (
                  <div key={imp} className="contents">
                    <div className="flex items-center justify-center text-xs font-semibold text-slate-500">{imp}</div>
                    {[1, 2, 3, 4, 5].map((lik) => {
                      const rating = ratingOf(lik * imp);
                      const here = q.risks.filter((r) => r.likelihood === lik && r.impact === imp);
                      return (
                        <div key={lik} title={`Likelihood ${lik} × impact ${imp} = ${lik * imp} (${rating})`} className={`flex min-h-16 flex-col items-center justify-center gap-0.5 rounded-md p-1 ${cellBg[rating]}`}>
                          <span className="text-[10px] opacity-70">{lik * imp}</span>
                          {here.map((r) => <Link key={r.id} href={`/risks?edit=${r.id}#form`} title={r.title} className="rounded bg-white/90 px-1.5 text-[11px] font-bold text-slate-900 shadow-sm hover:bg-white">{r.code}</Link>)}
                        </div>
                      );
                    })}
                  </div>
                ))}
                <div />
                {[1, 2, 3, 4, 5].map((l) => <div key={l} className="text-center text-xs font-semibold text-slate-500">{l}</div>)}
              </div>
              <p className="mt-1 text-center text-xs font-semibold uppercase tracking-wide text-slate-500">Likelihood →</p>
            </div>
          </div>
        </Card>
        <Card title="By rating" className="lg:col-span-2">
          <ul className="space-y-2 text-sm">
            {counts.map(({ r, n }) => (
              <li key={r} className="flex items-center justify-between"><span className="flex items-center gap-2"><span className={`h-3 w-3 rounded-sm ${cellBg[r]}`} /> {r} <span className="text-xs text-slate-500">({r === "Critical" ? "≥ 15" : r === "High" ? "10-14" : r === "Medium" ? "5-9" : "1-4"})</span></span><strong>{n}</strong></li>
            ))}
          </ul>
          <p className="mt-4 text-xs text-slate-500">{q.closedRisks.length} closed risk{q.closedRisks.length === 1 ? "" : "s"} not shown on the map.</p>
        </Card>
      </div>

      <Card title="Ranked risk register" padded={false} className="mb-6">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[66rem]">
            <thead className="bg-slate-50"><tr>
              {["Rank", "Risk", "Category", "L", "I", "Score", "Rating", "Status", "Owner", "Task", ""].map((h, i) => <th key={i} className={thCls}>{h}</th>)}
            </tr></thead>
            <tbody className="divide-y divide-slate-100">
              {q.risks.length + q.closedRisks.length === 0 && <EmptyRow cols={11}>No risks recorded.</EmptyRow>}
              {[...q.risks, ...q.closedRisks].map((r) => (
                <tr key={r.id} className={r.status === "Closed" ? "opacity-60" : undefined}>
                  <td className={`${tdCls} font-semibold`}>{r.rank ?? "-"}</td>
                  <td className={tdCls}><p className="font-medium text-slate-900"><span className="font-mono text-slate-500">{r.code}</span> {r.title}</p>{r.description && <p className="text-xs text-slate-500">{r.description}</p>}</td>
                  <td className={tdCls}>{r.category}</td>
                  <td className={tdCls}>{r.likelihood}</td><td className={tdCls}>{r.impact}</td>
                  <td className={`${tdCls} font-semibold`}>{r.score}</td>
                  <td className={tdCls}><Badge tone={ratingTone[r.rating as Rating]}>{r.rating}</Badge></td>
                  <td className={tdCls}>
                    <ActionForm action={setRiskStatus} inlineError={false} className="flex items-center gap-1">
                      <input type="hidden" name="id" value={r.id} />
                      <select name="status" defaultValue={r.status} aria-label={`Status of ${r.code}`} className="rounded-md border border-slate-300 bg-white px-1.5 py-1 text-xs">{RISK_STATUSES.map((s) => <option key={s}>{s}</option>)}</select>
                      <SubmitButton label="Set" small variant="secondary" />
                    </ActionForm>
                  </td>
                  <td className={tdCls}>{r.owner}</td>
                  <td className={`${tdCls} font-mono text-xs`}>{r.task_code ?? "-"}</td>
                  <td className={`${tdCls} whitespace-nowrap`}>
                    <div className="flex gap-1">
                      <Link href={`/risks?edit=${r.id}#form`} className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50">Edit</Link>
                      <RowAction action={deleteRisk} fields={{ id: r.id }} label="Delete" variant="danger" confirm={`Delete ${r.code} and its PDPC responses?`} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div id="form">
        <Card title={editing ? `Edit ${editing.code}` : "Add a risk"} className={editing ? "border-teal-300 ring-1 ring-teal-200" : ""}
          actions={editing ? <Link href="/risks" className="text-xs font-medium text-slate-500 hover:text-slate-800">Cancel</Link> : undefined}>
          <RiskForm r={editing} pid={p.id} tasks={tasks} team={team} statusDate={p.status_date} />
          {editing && <p className="mt-2 text-xs text-slate-500"><StatusBadge value={editing.status} /> Score {editing.score} ({editing.rating}) is recalculated by the database when you save.</p>}
        </Card>
      </div>
    </>
  );
}
