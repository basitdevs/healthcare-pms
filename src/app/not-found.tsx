import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-xl py-16">
      <div className="rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">404</p>
        <h1 className="mt-1 text-xl font-semibold text-slate-900">Page not found</h1>
        <p className="mt-3 text-sm text-slate-600">The page you asked for does not exist. Use the sidebar or go back to the overview.</p>
        <Link href="/" className="mt-6 inline-flex rounded-lg bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800">Back to overview</Link>
      </div>
    </div>
  );
}
