// Shared helpers for server actions: input validation + friendly error translation.
// (Not a "use server" file - only imported by them.)
import { revalidatePath } from "next/cache";
import db from "./db";
import type { ActionResult } from "./action-types";

export class InputError extends Error {}

export function friendly(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e);
  if (e instanceof InputError) return m;
  if (m.startsWith("CHECK constraint failed:")) {
    if (m.includes("date(")) return "Invalid date. Use the YYYY-MM-DD format.";
    if (m.includes("julianday")) return "The duration does not match the start and end dates.";
    if (m.includes("status =") || m.includes("percent_complete")) return "Status, progress and actual dates are inconsistent.";
    return `Value rejected by a database rule (${m.replace("CHECK constraint failed: ", "")}).`;
  }
  if (m.includes("UNIQUE constraint failed")) return "That code or name already exists. Use a different one.";
  if (m.includes("FOREIGN KEY constraint failed")) return "This record is linked to other records (or points to one that does not exist).";
  if (m.includes("NOT NULL constraint failed")) return "A required field is missing.";
  return m;
}

export async function perform(fn: () => string | void): Promise<ActionResult> {
  try {
    const msg = fn();
    revalidatePath("/", "layout");
    return { ok: true, message: msg || "Saved.", ts: Date.now() };
  } catch (e) {
    return { ok: false, message: friendly(e), ts: Date.now() };
  }
}

export function validDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export function str(fd: FormData, key: string, label: string, o: { required?: boolean; max?: number } = {}): string {
  const required = o.required ?? true;
  const v = String(fd.get(key) ?? "").trim();
  if (required && !v) throw new InputError(`${label} is required.`);
  if (o.max && v.length > o.max) throw new InputError(`${label} must be at most ${o.max} characters.`);
  return v;
}

export function intReq(fd: FormData, key: string, label: string, o: { min?: number; max?: number } = {}): number {
  const raw = String(fd.get(key) ?? "").trim().replace(/,/g, "");
  if (raw === "") throw new InputError(`${label} is required.`);
  const n = Number(raw);
  if (!Number.isInteger(n)) throw new InputError(`${label} must be a whole number.`);
  if (o.min !== undefined && n < o.min) throw new InputError(`${label} must be at least ${o.min.toLocaleString("en-US")}.`);
  if (o.max !== undefined && n > o.max) throw new InputError(`${label} must be at most ${o.max.toLocaleString("en-US")}.`);
  return n;
}

export function idOpt(fd: FormData, key: string): number | null {
  const raw = String(fd.get(key) ?? "").trim();
  if (!raw) return null;
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) throw new InputError("Invalid selection.");
  return n;
}

export function idReq(fd: FormData, key: string, label = "Record"): number {
  const v = idOpt(fd, key);
  if (v === null) throw new InputError(`${label} is required.`);
  return v;
}

export function dateReq(fd: FormData, key: string, label: string): string {
  const v = String(fd.get(key) ?? "").trim();
  if (!v) throw new InputError(`${label} is required.`);
  if (!validDate(v)) throw new InputError(`${label} is not a valid date (use YYYY-MM-DD).`);
  return v;
}

export function oneOf<T extends string>(fd: FormData, key: string, label: string, allowed: readonly T[]): T {
  const v = String(fd.get(key) ?? "").trim();
  if (!(allowed as readonly string[]).includes(v)) throw new InputError(`${label} must be one of: ${allowed.join(", ")}.`);
  return v as T;
}

/** "Today" for the project = its status date (falls back to the system date before a project exists). */
export function today(): string {
  const p = db.prepare("SELECT status_date FROM project ORDER BY id LIMIT 1").get() as { status_date: string } | undefined;
  return p?.status_date ?? new Date().toISOString().slice(0, 10);
}

export function nextCode(prefix: string, existing: string[], pad = 3): string {
  const max = existing.reduce((m, c) => {
    const n = Number(c.replace(/^\D+/, ""));
    return Number.isFinite(n) && n > m ? n : m;
  }, 0);
  return `${prefix}${String(max + 1).padStart(pad, "0")}`;
}
