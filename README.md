# Smart Healthcare Project Management & Monitoring System

CSE-494 Software Project Management. A web application that plans, tracks and controls a 16-week software project for a network of five hospitals. It integrates project initiation, scope/WBS with change control, scheduling and resources, cost and earned value, quality and risk, and reporting. Every module reads and writes one SQLite database, and the business rules are enforced by database triggers and CHECK constraints.

- **Stack:** Next.js 16 (App Router, server components and server actions), TypeScript, Tailwind CSS 4, better-sqlite3 (raw SQL, no ORM). Charts (Gantt, S-curve, heat map, PDPC) are hand-built SVG/CSS with no chart libraries, so the app works fully offline.
- **Data:** `healthcare.db` (SQLite), built from `db/schema.sql` + `db/seed.sql`. The sample project is at status date **25 Oct 2026** (week 8 of 16) with change request CR-001 pending.

## Requirements

- Node.js **20 or newer** (with npm)
- macOS, Linux or Windows. No internet connection is needed after `npm install`.

## Setup and run

```bash
npm install          # install dependencies
npm run db:init      # create healthcare.db with the sample project (use -- --empty for an empty database)
npm run dev          # development server on http://localhost:3000
```

Production mode: `npm run build && npm start`.

One-step start: `./run.sh` (macOS/Linux) or `run.bat` (Windows). It installs dependencies if needed, creates the database if it is missing, builds the app and opens http://localhost:3000.

### Other commands

| Command | Purpose |
|---------|---------|
| `npm run db:verify` | Smoke test of the database rules, run on an in-memory copy (25 checks) |
| `npm run test` | All automated tests (55), using in-memory databases |
| `npm run test:report` | Runs the tests and writes `docs/test-results.md` plus the Actual/Pass-Fail columns of `docs/test-cases.md` |
| `npm run screenshots` | Full-page screenshots of every page into `docs/screenshots/` (the app must be running) |
| `npm run package` | Builds `submission.zip` (source, db, docs, database; no node_modules/.next/.git) |

## Resetting the demo data

- In the app: **Dashboard → Reset demo data**. This restores the seed with CR-001 pending again.
- Or stop the server and run `npm run db:init`.

## Module to page map

| Module (question paper) | Pages |
|--------|-------|
| Dashboard (6) | `/` health, progress, pending change requests, delayed activities, budget status, critical defects, baseline vs current |
| 1. Initiation & integration | `/charter`, `/plan`, `/status` (status reports, milestones, responsibilities, closure) |
| 2. Scope & WBS | `/requirements`, `/wbs`, `/changes` |
| 3. Schedule & resources | `/schedule` (delay impact + Gantt), `/schedule/activities` (activities, team assignment, durations, dependencies, progress) |
| 4. Cost & EVM | `/cost` (PV, EV, AC, CPI, SPI, warnings), `/cost/estimates` (activity estimates, total budget), `/cost/entries` (actual expenditure) |
| 5. Quality & risk | `/quality`, `/quality/checklist`, `/risks` (prioritization matrix), `/risks/pdpc` |
| 6. Reporting | `/report` printable report (includes consistency checks) |

## Project structure

```
db/            schema.sql (tables, triggers, views), seed.sql (sample project), init.ts, verify.ts
src/app/       one folder per page; actions/ holds the "use server" write operations
src/components UI kit (ui.tsx), forms with toasts (forms.tsx), Gantt, S-curve, alert list, ...
src/lib/       db.ts (connection), queries.ts (reads), action.ts (validation helpers)
               schedule.ts, evm.ts, quality.ts, consistency.ts, dashboard.ts: pure calculation engines
               *-data.ts: loaders that feed the engines from SQLite (take the connection as a parameter)
tests/         node:test suites (schedule, evm, quality, integration) on in-memory databases
scripts/       test-report.ts, screenshots.mjs, package.mjs
docs/          DATABASE.md, DEMO.md, test-cases.md, test-results.md, screenshots/
```

## 5-minute demo

The full script with the exact numbers to point out is in [docs/DEMO.md](docs/DEMO.md). In short:

1. **Dashboard:** health AMBER, CPI 0.913, SPI 0.920, projected finish 24 Dec (3 days margin), CR-001 pending.
2. **Requirements:** approving REQ-011 directly is refused (scope rule).
3. **WBS:** a work package for REQ-011 is refused.
4. **Change requests:** approving CR-001 raises the budget to 5.8M and the deadline to 17 Jan 2027, and REQ-011/012 become approved scope. See the effect on the dashboard (baseline vs current) and in the report's consistency checks.
5. **WBS + activities:** add work packages and activities for the new scope within the 5.8M budget. Going over budget is refused.
6. **Schedule:** delay analysis and the Gantt chart.
7. **Cost:** EVM alerts. A PKR 400,000 cost entry on T10 turns CPI critical.
8. **Quality & risk:** defects, the risk matrix and the PDPC.
9. **Closure:** closing the project is refused while work and critical defects remain.
10. **Reset** the demo data.

More documentation: [docs/DATABASE.md](docs/DATABASE.md) (tables, ER diagram, business rules) and [docs/test-cases.md](docs/test-cases.md).
# healthcare-pms
