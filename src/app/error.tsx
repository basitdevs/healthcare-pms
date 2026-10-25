"use client";

import Link from "next/link";

export default function ErrorPage({ error, retry }: { error: unknown; retry: () => void }) {
  const e = error instanceof Error ? (error as Error & { digest?: string }) : null;
  return (
    <div className="mx-auto max-w-xl py-16">
      <div className="rounded-xl border border-red-200 bg-white p-8 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-red-700">Something went wrong</p>
        <h1 className="mt-1 text-xl font-semibold text-slate-900">This page could not be loaded</h1>
        <p className="mt-3 text-sm text-slate-600">{e?.message || "An unexpected error occurred."}</p>
        {e?.digest && <p className="mt-1 text-xs text-slate-400">Reference: {e.digest}</p>}
        <div className="mt-6 flex gap-2">
          <button type="button" onClick={() => retry()} className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800">Try again</button>
          <Link href="/" className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Back to overview</Link>
        </div>
      </div>
    </div>
  );
}
