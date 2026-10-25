# Demo script (about 5 minutes)

Start from the sample data: **Dashboard → Reset demo data** (or `npm run db:init`). The status date is **25 Oct 2026** and CR-001 is pending. Toasts (top right) show every success and every rule the database refuses.

## 1. Dashboard: the baseline
- `/` (dashboard): overall health **AMBER** (alerts, 14 delayed activities, 1 pending CR, 3 unresolved critical defects).
  - Progress: earned **54.7%** vs planned **59.4%**.
  - CPI **0.913**, SPI **0.920** (both warnings), AC **PKR 2,995,000**, EAC **≈ PKR 5,478,324**.
  - Projected finish **24 Dec 2026**, 3 days before the deadline.
  - Top risk **RSK-02 (score 20)**, checklist pass rate **46.2%**.
  - "Baseline vs current" is unchanged.

## 2. Scope control: REQ-011 cannot be approved directly
- `/requirements` → REQ-011 (AI-based preliminary diagnosis, part of CR-001) → **Approve**.
- Toast: *"SCOPE RULE: requirement belongs to a change request that is not approved"*.

## 3. The WBS refuses unapproved scope
- `/wbs` → Add work package under 1.3, requirement REQ-011 → refused with *"SCOPE RULE: only APPROVED requirements can be included in the WBS"*.

## 4. Approve CR-001: budget, deadline and scope change together
- `/changes` → CR-001 shows the "If approved" impact → **Approve change request**.
- Budget **5,000,000 → 5,800,000**, deadline **27 Dec 2026 → 17 Jan 2027** (16 → 19 weeks), REQ-011 and REQ-012 become Approved, and the change history records it.
- Dashboard "Baseline vs current": budget, deadline, duration and approved requirements (**10 → 12**) are highlighted.
- `/report` section 6 (consistency checks): **WARN** for REQ-011/REQ-012 not in the WBS and PKR 800,000 unallocated. No FAIL.
- `/cost`: approved budget 5,800,000, BAC still 5,000,000, unallocated 800,000. CPI and SPI are unchanged.

## 5. Plan the new work within the new budget
- `/wbs`: add deliverable **1.6 AI Diagnosis and Mobile App**, then work packages **1.6.1** (REQ-011) and **1.6.2** (REQ-012).
- `/schedule/activities`: both new work packages appear under "Work packages with no activities yet" → **Add activity**:
  - 1.6.1, Sana Malik, 22 days from 19 Nov 2026, PKR **450,000**.
  - 1.6.2, Bilal Ahmed, 22 days from 19 Nov 2026, PKR **350,001**: refused with *"BUDGET RULE: total task estimates would exceed the approved project budget"*. Change it to **350,000** and it is accepted.
- `/report` section 6: all checks pass. `/cost`: BAC **5,800,000**, EAC **≈ 6,355,000**.

## 6. Schedule: delay and impact analysis
- `/schedule`:
  - Directly delayed: **T10 +3, T12 +3, T15 +3, T16 +1**.
  - Impacted: **T13 → T25 +3** (e.g. T13 ends 11 Nov).
  - Critical path T10 → T13 → T17/T19 → T21 … T25.
  - T08 and T09 finished 2 days late (history only).
- Gantt: planned vs forecast bars, red = delayed, amber outline = critical, status-date and deadline lines, milestone diamonds.

## 7. Cost: EVM alerts, and a cost entry that turns CPI critical
- `/cost`:
  - PV **2,972,286**, EV **2,733,500**, AC **2,995,000**, CV **−261,500**, SV **−238,786**.
  - Alerts: *"COST WARNING: CPI 0.91 is below the 0.95 threshold. Every PKR 1 of planned work is costing PKR 1.10"* and *"projected to exceed the approved budget"*.
  - T10, T12 and T16 are critical.
- `/cost/entries` → book **PKR 400,000** on **T10**, dated 25 Oct 2026 → AC **3,395,000**, CPI **0.805**. The project CPI alert becomes **CRITICAL** and the dashboard turns **RED**.
- Try a date after 25 Oct: refused, *"…after the status date… Move the status date forward first"*.

## 8. Quality and risk
- `/quality`: 9 defects. **3 unresolved critical** (DEF-001, DEF-003, DEF-004) are highlighted. Each defect traces task → WBS → requirement.
- `/quality/checklist`: latest results Pass 6, Fail 4, Pending 3 (**46.2%**). A failed item has a **Log defect** shortcut.
- `/risks`: 5×5 heat map. The register ranks RSK-02 (20) #1, RSK-01/RSK-07 (16) #2, RSK-05/RSK-06 (12) #4.
- `/risks/pdpc`: steps → potential problems → preventive (blue) and corrective (purple) countermeasures. RSK-05 sits under "General / scope".

## 9. Closing the project is refused
- `/status` → closure checklist shows incomplete tasks and unresolved critical defects. Save a closure record with "deliverables accepted" → **Close project** → refused: *"Cannot close the project: incomplete tasks remain"*.

## 10. Reset
- Dashboard → **Reset demo data**. Everything returns to the baseline (CR-001 pending again). `/report` prints the full project report (one module per A4 page).
