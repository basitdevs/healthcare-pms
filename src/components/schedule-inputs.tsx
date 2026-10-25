"use client";

import { useState } from "react";
import { addDays, fmtDate } from "@/lib/format";
import { Field, inputCls } from "./ui";

const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

/** Duration + planned start, with the planned end calculated live (end = start + duration - 1). */
export function DurationDates({ duration, start, startRequired = true }: { duration?: number; start?: string; startRequired?: boolean }) {
  const [d, setD] = useState(String(duration ?? ""));
  const [s, setS] = useState(start ?? "");
  const n = Number(d);
  const end = isDate(s) && Number.isInteger(n) && n >= 1 ? addDays(s, n - 1) : null;
  return (
    <>
      <Field label="Duration (days)">
        <input name="duration_days" type="number" min={1} value={d} onChange={(e) => setD(e.target.value)} className={inputCls} required />
      </Field>
      <Field label="Planned start" hint={startRequired ? undefined : "Blank = day after its predecessors finish"}>
        <input name="planned_start" type="date" value={s} onChange={(e) => setS(e.target.value)} className={inputCls} required={startRequired} />
      </Field>
      <Field label="Planned end (calculated)">
        <input value={end ? fmtDate(end) : "-"} className={inputCls} disabled readOnly />
      </Field>
    </>
  );
}
