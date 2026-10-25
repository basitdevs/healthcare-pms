# Test cases: Phase 3, Schedule & Resource Management

Automated tests: `npm run test` (runs `tsx --test tests/*.test.ts` with `node:test`).
Each test builds a fresh **in-memory** SQLite database from `db/schema.sql` + `db/seed.sql`; the real `healthcare.db` is never touched.
Seed scenario: status date 2026-10-25, CR-001 pending, deadline 2026-12-27, budget PKR 5,000,000.

Last run (whole suite, 2026-10-25 21:23:36 UTC): 55 passed, 0 failed. Details: [test-results.md](test-results.md).

| ID | Module | Description | Input | Expected | Actual | Pass/Fail |
|----|--------|-------------|-------|----------|--------|-----------|
| SCH-01 | Schedule forecast | Activities delayed by their own progress | Seed data, status date 2026-10-25 | T10 +3 (ends 2026-10-30), T12 +3 (2026-11-01), T15 +3 (2026-10-30), T16 +1 (2026-11-03); all "Delayed (own progress)" | As expected | Pass |
| SCH-02 | Schedule forecast | Activities impacted by a predecessor | Seed data | T13, T17–T25 each +3; T13 ends 2026-11-11; T13 cause names T10, T18 cause names T12 | As expected | Pass |
| SCH-03 | Impact analysis | Projected finish, slip and margin | Seed data | Planned finish 2026-12-21, projected finish 2026-12-24, slip +3 days, margin 3 days to 2026-12-27 | As expected | Pass |
| SCH-04 | Schedule forecast | Historical late completion | T08, T09 (Completed, actual end 2 days after planned) | Classified "Completed late" with +2 days; not counted as delayed | As expected | Pass |
| SCH-05 | Planning checks | Clean seed network | Seed data | 0 dependency conflicts, 0 over-allocations, 0 activities to recalculate | As expected | Pass |
| SCH-06 | Critical path (CPM) | Total float from a backward pass anchored at the projected finish | Seed data | Critical (float 0): T10, T13, T17, T19, T21, T22, T23, T24, T25; T20 float 2; T12 float 5 | As expected | Pass |
| SCH-07 | Impact analysis | Transitive downstream list of a delayed activity | T10 | Downstream: T13, T17, T18, T19, T20, T21, T22, T23, T24, T25, each +3; T13 marked as pushed by T10; T16 has 7 downstream activities | As expected | Pass |
| SCH-08 | Integration (milestones) | A milestone tracking a delayed task follows its forecast | Milestone "Backend core modules complete" (target 2026-11-08, task T13) | Forecast date 2026-11-11, displayed as "At Risk"; achieved milestones stay "Achieved" | As expected | Pass |
| SCH-09 | Deadline warning | Deadline earlier than the projected finish | `UPDATE project SET deadline = '2026-12-22'` | Margin −2; banner renders red (`role="alert"`, `bg-red-50`) with "will miss the deadline by 2 days"; no warning when margin is +3 | As expected | Pass |
| SCH-10 | Forward pass | Lag days on a finish-to-start link | Lag 2 days on T13 ← T10 | T13 forecast start 2026-11-02, forecast end 2026-11-13 | As expected | Pass |
| DB-01 | Dependencies (DB trigger) | Circular dependency rejected | Insert T10 ← T25; insert T13 ← T13 | Both rejected ("Circular dependency…") | As expected | Pass |
| DB-02 | Budget rule (DB trigger) | Task estimates cannot exceed the approved budget | New task PKR 1 on a 5.0M fully allocated budget; raise T13 estimate by 1; after approving CR-001 (budget 5.8M) add an AI-module task of PKR 800,001, then PKR 800,000 | 1, 2 and 800,001 rejected with "BUDGET RULE"; 800,000 accepted (total = 5,800,000); work package 1.6.1 now has 1 task | As expected | Pass |
| DB-03 | Progress update | Every update produces a state the tasks CHECK accepts | T13 20%; T10 100%; T12 55% on hold; T16 0%; invalid inputs 101%, end before start, start after status date | T13 In Progress (start = status date); T10 Completed (end = status date); T12 On Hold; T16 Not Started (actual dates cleared); invalid inputs raise errors; raw inconsistent UPDATE rejected by CHECK | As expected | Pass |
| DB-04 | Dependency conflicts + Recalculate | Manual conflict detected and fixed by the forward pass | Move T19 to 2026-11-01 – 2026-11-10 | Conflicts T19/T13 and T19/T16 (required start 2026-11-09); Recalculate moves only T19 to 2026-11-09 – 2026-11-18; then 0 conflicts | As expected | Pass |
| DB-05 | Resource over-allocation | Same person on overlapping activities | Reassign T13 to Usman Tariq | Over-allocations T12/T13 (from 2026-10-28, 2 days) and T13/T18 | As expected | Pass |
| ENG-01 | Engine purity | Analysis runs without a DB connection | Load data, close the DB, run `analyseSchedule` | Projected finish 2026-12-24 | As expected | Pass |

## Manual UI checks (browser, `npm run dev`)

| ID | Module | Description | Input | Expected | Actual | Pass/Fail |
|----|--------|-------------|-------|----------|--------|-----------|
| UI-01 | Activities | Update progress | T13 → 20% | Toast "T13: In Progress, 20%, started 25 Oct 2026." | As expected | Pass |
| UI-02 | Activities | Delete refused when costs exist | Delete T10 | Toast "T10 has 2 cost entries booked against it and cannot be deleted." | As expected | Pass |
| UI-03 | Activities | Cycle blocked | Add T25 as predecessor of T01 | Toast "Circular dependency: …" | As expected | Pass |
| UI-04 | Activities | Budget rule surfaced | T13 estimate 330,000 → 330,001 | Toast "BUDGET RULE: …" | As expected | Pass |
| UI-05 | Activities | Re-assignment creates an over-allocation | Edit T10, assignee → Usman Tariq | Toast "Activity updated…"; /schedule "Planning problems" lists Usman Tariq on T10 and T12 at the same time | As expected | Pass |
| UI-06 | All pages | No console errors | /, /plan, /status, /schedule, /schedule/activities | No browser console errors | None | Pass |

# Test cases: Phase 4, Cost Management & Earned Value

Automated tests in `tests/evm.test.ts` (run by `npm run test`). Pure tests use small synthetic datasets; DB tests build a fresh **in-memory** database from `db/schema.sql` + `db/seed.sql`.
Tolerances: ±1 PKR for PV, ±0.001 for ratios, ±1,000 PKR for forecasts. Thresholds: warning 0.95, critical 0.85.

Last run (whole suite, 2026-10-25 21:23:36 UTC): 55 passed, 0 failed. Details: [test-results.md](test-results.md).

| ID | Module | Description | Input | Expected | Actual | Pass/Fail |
|----|--------|-------------|-------|----------|--------|-----------|
| EVM-01 | EVM formulas | PV is linear over the baseline dates, clamped | Task PKR 100,000, 10 days from 2026-01-01; status dates 31 Dec, 1 Jan, 3 Jan, 10 Jan, 1 Mar | PV 0 / 10,000 / 30,000 / 100,000 / 100,000 | As expected | Pass |
| EVM-02 | EVM formulas | EV = estimate × % complete, AC = booked cost | 35% complete, AC 40,000 | EV 35,000, AC 40,000 | As expected | Pass |
| EVM-03 | EVM formulas | Variances and indices | BAC 1000, PV 500, EV 400, AC 450 | CV −50, SV −100, CPI 0.889, SPI 0.800 | As expected | Pass |
| EVM-04 | EVM edge cases | Zero denominators | Status date before project start, AC = 0; and BAC = AC | PV 0; CPI, SPI, EAC, ETC, VAC = n/a; no alerts; TCPI n/a | As expected | Pass |
| EVM-05 | EVM forecasts | EAC, EAC2, ETC, VAC, TCPI, % complete, % spent | BAC 1000, EV 400, AC 500, approved 1200 | EAC 1250, EAC2 1100, ETC 750, VAC −250 (−50 vs approved), TCPI 1.2, 40% complete, 50% spent | As expected | Pass |
| EVM-06 | EVM alerts | Warning/critical levels and wording | CPI 0.90, CPI 0.80, CPI 0.95, SPI 0.83 | "COST WARNING: CPI 0.90 is below the 0.95 threshold. Every PKR 1 … PKR 1.11"; CPI 0.80 critical; 0.95 no alert; SPI 0.83 "SCHEDULE CRITICAL" | As expected | Pass |
| EVM-07 | EVM alerts | Task over budget, EAC and AC above approved budget | Task estimate 100,000, AC 120,000, approved budget 110,000 | Task over budget by PKR 20,000 (warning); exceed approved budget by PKR 10,000 (9.1%) (warning); AC over approved budget (critical, listed first) | As expected | Pass |
| EVM-08 | EVM edge cases | Everything complete at exactly its estimate | 2 completed tasks, AC = estimate | CPI = SPI = 1, EAC = BAC, no alerts | As expected | Pass |
| EVM-09 | EVM rollups | Group and category rollups | Synthetic metrics in groups A/B; cost entries Labor 70, Licensing 30 | A: 2 tasks, BAC 300, CV −10, CPI 0.933; B: CPI n/a; categories Labor 70 (70%), Licensing 30 | As expected | Pass |
| EVM-10 | S-curve | Weekly series, EV approximation | 1 completed task (finished 12 Jan), 1 in-progress task at 50%, status date 17 Jan | Weekly dates + status date; final PV = BAC; EV 0 before actual finish; in-progress EV linear to the status date; AC/EV null after the status date | As expected | Pass |
| EVM-11 | Cost entry validation | Server-side validation (pure) | Valid entry; future date; before project start; 30 Feb; amount 0 / −5; bad category; Not Started task | Valid passes; each other case rejected with a specific message ("Move the status date forward first", …) | As expected | Pass |
| EVM-12 | Threshold validation | 0 < critical ≤ warning ≤ 1.5 | (0.95, 0.85), (0.9, 0.9), (0.8, 0.9), (0.95, 0), (1.6, 0.85), NaN | First two accepted, the rest rejected | As expected | Pass |
| EVM-13 | EVM (seed) | Project metrics | Seed, status date 2026-10-25 | BAC 5,000,000 = approved, unallocated 0; PV 2,972,286; EV 2,733,500; AC 2,995,000; CV −261,500; SV −238,786; CPI 0.913; SPI 0.920 | As expected | Pass |
| EVM-14 | EVM (seed) | Forecasts | Seed | EAC ≈ 5,478,300; ETC ≈ 2,483,300; VAC ≈ −478,300; TCPI 1.130; 54.7% complete; 59.9% spent | EAC 5,478,324; ETC 2,483,324; VAC −478,324; TCPI 1.130 | Pass |
| EVM-15 | EVM (seed) | Per-activity values | T10, T12, T15, T16, T08, completed tasks | T10 EV 240,000 / AC 310,000 / PV 333,333, CPI 0.774, SPI 0.720; T12 CPI 0.768 (PV 264,286); T15 PV 216,667; T16 PV 48,000, CPI 0.686; completed PV 2,110,000; T08 EV 350,000 / AC 385,000 | As expected | Pass |
| EVM-16 | EVM alerts (seed) | Alert set on the seed | Seed | Project CPI and SPI = WARNING (not critical) with the specified wording; "projected to exceed the approved budget"; T10 CPI+SPI, T12 CPI, T16 CPI critical; T08 over budget by PKR 35,000; no AC-over-budget alert | As expected | Pass |
| EVM-17 | EVM rollups (seed) | Overrun split and categories | Seed | Completed overrun 100,000 + in-progress 161,500 = −CV; Labor 2,855,000, Infrastructure 135,000, Licensing 5,000; deliverable BAC sums to 5,000,000; member AC sums to 2,995,000 | As expected | Pass |
| EVM-18 | Scenario A | Extra cost makes CPI critical | +PKR 400,000 on T10 dated 2026-10-25 | AC 3,395,000; CPI 0.805; project CPI alert CRITICAL | As expected | Pass |
| EVM-19 | Scenario B | Change request then new activities | Approve CR-001; add T26 (450,000) + T27 (350,000) in December on new work packages 1.6.1/1.6.2; then T28 (PKR 1) | After approval: approved budget 5,800,000, BAC 5,000,000, unallocated 800,000, CPI/SPI unchanged. After tasks: BAC 5,800,000, EAC ≈ 6,355,000, VAC ≈ −555,000, PV/EV/CPI/SPI unchanged; T28 rejected (BUDGET RULE) | As expected | Pass |
| EVM-20 | Cost rules (DB) | Cost on a Not Started task | Insert cost on T13 | Rejected: "…task that has not started" | As expected | Pass |
| EVM-21 | Cost rules (DB) | Estimate edit above approved budget | T10 estimate 400,000 → 400,001, then → 390,000 | First rejected (BUDGET RULE); second accepted, BAC 4,990,000 | As expected | Pass |
| EVM-22 | Cost entry validation | Future-dated cost against the seed dates | Cost dated 2026-10-26 (status date 2026-10-25) | Rejected: "after the status date (2026-10-25)" | As expected | Pass |

# Test cases: Phase 5, Quality Management & Risk Control

Automated tests in `tests/quality.test.ts` (run by `npm run test`), against an **in-memory** database built from `db/schema.sql` + `db/seed.sql`.

Last run (whole suite, 2026-10-25 21:23:36 UTC): 55 passed, 0 failed. Details: [test-results.md](test-results.md).

| ID | Module | Description | Input | Expected | Actual | Pass/Fail |
|----|--------|-------------|-------|----------|--------|-----------|
| QR-01 | Defects | Seed counts | Seed defects | 9 total; Open 4, In Progress 2, Resolved 2, Closed 1; Critical 3, Major 4, Minor 2; unresolved 6; unresolved critical 3 (DEF-001, DEF-003, DEF-004) | As expected | Pass |
| QR-02 | Defects | Traceability | DEF-001 | Task T10 → WBS 1.3.1 → REQ-001 | As expected | Pass |
| QR-03 | Checklist | Latest result per item and pass rate | Seed checklist (13 items, 15 inspections) | Pass 6, Fail 4, Pending 3; retested "masks sensitive identifiers" and "locks after three failed logins" count as Pass; 46.2% overall, 60% of the 10 inspected | As expected | Pass |
| QR-04 | Checklist | Pure helpers | Fail→Pass on item 1; same-day Pass/Fail on item 2; item 3 never inspected | Latest: Pass, Fail (higher id), none; inspected pass rate 50%; empty list → n/a | As expected | Pass |
| QR-05 | Risks | Ranked register (ties share a rank) | Seed risks via v_risk_ranked | RSK-02 (20) #1; RSK-01, RSK-07 (16) #2; RSK-05, RSK-06 (12) #4; RSK-03 (10) #6; RSK-08 (9) #7; RSK-04 (6) #8; Critical 3, High 3, Medium 2, Low 0; pure ranking agrees | As expected | Pass |
| QR-06 | Risks | Rating bands | Scores 25..1 and every L×I cell 1..5 | ≥15 Critical, 10-14 High, 5-9 Medium, else Low; matches the generated column for all 25 cells | As expected | Pass |
| QR-07 | PDPC | Seed responses | Seed risk_responses | 14 responses; both RSK-05 responses have no task (General / scope group) | As expected | Pass |
| QR-08 | Integration | Critical defects gate closure | Resolve DEF-001/003/004; add a new Critical defect; complete all tasks; close project | Unresolved critical 3 → 0 → 1; closing rejected "unresolved critical defects" | As expected | Pass |
| QR-09 | Defects | Status transitions | Resolve, Resolved→Closed, reopen; resolve before reported date; raw UPDATEs | Resolve = status date; Closed keeps date; reopen clears it; earlier date rejected; DB CHECK rejects Resolved without date and Open with date | As expected | Pass |
| QR-10 | Validation | Defect input | Blank title, no task / assignee / reporter, Resolved without date, bad severity, future reported date; DB insert without task or blank title | Each rejected with a clear message; DB rejects NOT NULL task and blank title | As expected | Pass |
| QR-11 | Validation | Risk input | Likelihood 0 / 2.5, impact 6, empty title, no owner, bad category; DB likelihood 6; writing score | Each rejected ("must be a whole number from 1 to 5" …); DB CHECK rejects 6; generated score cannot be written | As expected | Pass |

# Test cases: Phase 6, System Integration, Validation & Reporting

Automated tests in `tests/integration.test.ts` (run by `npm run test`), against an **in-memory** database built from `db/schema.sql` + `db/seed.sql`.

Last run (whole suite, 2026-10-25 21:23:36 UTC): 55 passed, 0 failed. Details: [test-results.md](test-results.md).

| ID | Module | Description | Input | Expected | Actual | Pass/Fail |
|----|--------|-------------|-------|----------|--------|-----------|
| INT-01 | Dashboard | Aggregates on the seed | Seed, status date 2026-10-25 | Health AMBER; EV/BAC 54.7%, PV/BAC 59.4%; CPI 0.913, SPI 0.920, AC 2,995,000, EAC ≈ 5,478,300; delayed T10/T12/T15/T16 + 10 impacted; projected finish 2026-12-24 vs 2026-12-27 (3 days); 1 pending CR (CR-001 +800,000, +21 days); 3 unresolved critical; top risk RSK-02 (20); pass rate 46.2%; next milestone forecast 2026-11-11 | As expected | Pass |
| INT-02 | Dashboard | Health rule | CPI 0.84; SPI 0.80; projected finish after deadline; one alert / delayed task / pending CR / critical defect; CPI and SPI n/a | RED, RED, RED; AMBER for each; GREEN when n/a and nothing else; both red reasons listed | As expected | Pass |
| INT-03 | Consistency | All 13 checks on the seed | Seed | 13 PASS, 0 WARN, 0 FAIL | As expected | Pass |
| INT-04 | Consistency | Broken data is detected | Future cost on a Not Started task, WBS item on a rejected requirement, orphan defect, task before its predecessor, task after the deadline, BAC > budget, CR approved with a Proposed requirement, late milestone, double-booked assignee | C03, C04, C06, C08, C09, C10, C11 = FAIL; C01, C02, C05, C12, C13 = WARN with the offending records | As expected | Pass |
| INT-05 | Integration | After approving CR-001 | Approve CR-001 | Baseline vs current: budget 5,000,000 → 5,800,000; deadline 2026-12-27 → 2027-01-17; 16 → 19 weeks; approved requirements 10 → 12; BAC 5,000,000, unallocated 800,000; WARN: REQ-011 and REQ-012 not in WBS, PKR 800,000 unallocated; no FAIL | As expected | Pass |
| INT-06 | Integration (end-to-end) | Change request to new scope | REQ-011 approved directly / put in WBS (refused); approve CR-001; add deliverable 1.6 + work packages for REQ-011/REQ-012; add T26 450,000; T27 350,001 then 350,000 | Direct approval and WBS refused (SCOPE RULE); empty work packages WARN; T27 at 350,001 refused (BUDGET RULE); afterwards all 13 checks PASS, BAC 5,800,000, EAC ≈ 6,355,000, work packages 17, tasks 25 → 27 | As expected | Pass |
