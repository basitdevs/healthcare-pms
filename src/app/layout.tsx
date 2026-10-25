import type { Metadata } from "next";
import "./globals.css";
import { Sidebar } from "@/components/Sidebar";
import { ToastProvider } from "@/components/toast";
import { Badge } from "@/components/ui";
import { fmtDate } from "@/lib/format";
import { dbReady } from "@/lib/db";
import { getProject } from "@/lib/queries";

// Every page reads live data from SQLite.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Healthcare Project Management System",
  description: "Smart Healthcare Project Management and Monitoring System (CSE-494)",
};

function SetupScreen() {
  return (
    <main className="mx-auto max-w-xl px-6 py-24">
      <div className="rounded-xl border border-amber-300 bg-white p-8 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Setup needed</p>
        <h1 className="mt-1 text-2xl font-semibold text-slate-900">The database has not been created yet</h1>
        <p className="mt-3 text-sm text-slate-600">Stop the server, run the command below in the project folder, then start it again.</p>
        <pre className="mt-4 rounded-lg bg-slate-900 px-4 py-3 text-sm text-teal-200">npm run db:init{"\n"}npm run dev</pre>
        <p className="mt-3 text-xs text-slate-500">Use <code>npm run db:init -- --empty</code> for an empty database without the sample project.</p>
      </div>
    </main>
  );
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  if (!dbReady()) {
    return (
      <html lang="en" className="h-full antialiased">
        <body className="min-h-full bg-slate-50 font-sans"><SetupScreen /></body>
      </html>
    );
  }
  const project = getProject();
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full font-sans">
        <ToastProvider>
          <div className="flex min-h-screen">
            <Sidebar code={project?.code ?? null} />
            <div className="min-w-0 flex-1">
              <header className="sticky top-0 z-30 flex print:hidden items-center justify-between gap-4 border-b border-slate-200 bg-white/90 px-6 py-3 backdrop-blur">
                <p className="truncate text-sm font-medium text-slate-700">{project?.name ?? "Healthcare Project Management System"}</p>
                {project && (
                  <div className="flex shrink-0 items-center gap-3 text-xs text-slate-500">
                    <span>Status date <strong className="text-slate-800">{fmtDate(project.status_date)}</strong></span>
                    <Badge tone={project.status === "Closed" ? "green" : "teal"}>{project.status}</Badge>
                  </div>
                )}
              </header>
              <main className="mx-auto max-w-6xl px-6 py-8 print:max-w-none print:p-0">{children}</main>
            </div>
          </div>
        </ToastProvider>
      </body>
    </html>
  );
}
