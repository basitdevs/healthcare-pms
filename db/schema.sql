-- =====================================================================
--  Smart Healthcare Project Management & Monitoring System
--  CSE-494 Software Project Management  |  Database schema (SQLite)
--
--  Conventions
--   * Dates are ISO text 'YYYY-MM-DD'  (validated with  date(col) IS col)
--   * Money is whole PKR (INTEGER)
--   * Durations are CALENDAR days, inclusive:  end = start + duration - 1
--   * Business rules live in constraints/triggers so every screen and API
--     route is protected, not just the UI.
-- =====================================================================
PRAGMA foreign_keys = ON;

-- =====================================================================
--  MODULE 1 : Project Initiation & Integration Management
-- =====================================================================
CREATE TABLE project (
  id                      INTEGER PRIMARY KEY,
  code                    TEXT    NOT NULL UNIQUE,
  name                    TEXT    NOT NULL CHECK (length(trim(name)) > 0),
  description             TEXT,
  sponsor                 TEXT    NOT NULL,
  objectives              TEXT    NOT NULL,
  scope_in                TEXT    NOT NULL,            -- scope boundary: included
  scope_out               TEXT    NOT NULL,            -- scope boundary: excluded
  start_date              TEXT    NOT NULL CHECK (date(start_date) IS start_date),
  original_deadline       TEXT    NOT NULL CHECK (date(original_deadline) IS original_deadline),
  deadline                TEXT    NOT NULL CHECK (date(deadline) IS deadline),   -- current (after approved CRs)
  original_budget         INTEGER NOT NULL CHECK (original_budget > 0),
  current_budget          INTEGER NOT NULL CHECK (current_budget > 0),           -- current (after approved CRs)
  currency                TEXT    NOT NULL DEFAULT 'PKR',
  status_date             TEXT    NOT NULL CHECK (date(status_date) IS status_date),  -- "as of" date for EVM / schedule
  status                  TEXT    NOT NULL DEFAULT 'Initiating'
                          CHECK (status IN ('Initiating','Planning','Executing','Monitoring','Closing','Closed')),
  evm_warning_threshold   REAL    NOT NULL DEFAULT 0.95,   -- CPI/SPI below this  => WARNING
  evm_critical_threshold  REAL    NOT NULL DEFAULT 0.85,   -- CPI/SPI below this  => CRITICAL
  CHECK (original_deadline >= start_date AND deadline >= start_date),
  CHECK (evm_critical_threshold > 0 AND evm_critical_threshold <= evm_warning_threshold)
);

CREATE TABLE pm_plan (
  id               INTEGER PRIMARY KEY,
  project_id       INTEGER NOT NULL UNIQUE REFERENCES project(id) ON DELETE CASCADE,
  version          TEXT    NOT NULL DEFAULT '1.0',
  scope_plan       TEXT    NOT NULL,
  schedule_plan    TEXT    NOT NULL,
  cost_plan        TEXT    NOT NULL,
  quality_plan     TEXT    NOT NULL,
  updated_on       TEXT    NOT NULL CHECK (date(updated_on) IS updated_on)
);

CREATE TABLE stakeholders (
  id            INTEGER PRIMARY KEY,
  project_id    INTEGER NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  name          TEXT    NOT NULL CHECK (length(trim(name)) > 0),
  role          TEXT    NOT NULL,
  organization  TEXT    NOT NULL,
  influence     TEXT    NOT NULL CHECK (influence IN ('Low','Medium','High')),
  interest      TEXT    NOT NULL CHECK (interest  IN ('Low','Medium','High')),
  expectations  TEXT
);

CREATE TABLE team_members (
  id          INTEGER PRIMARY KEY,
  project_id  INTEGER NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  name        TEXT    NOT NULL CHECK (length(trim(name)) > 0),
  role        TEXT    NOT NULL CHECK (role IN ('Project Manager','Backend Developer','Frontend Developer','Database Developer','QA Engineer')),
  email       TEXT,
  UNIQUE (project_id, name)
);

CREATE TABLE milestones (
  id           INTEGER PRIMARY KEY,
  project_id   INTEGER NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  name         TEXT    NOT NULL,
  target_date  TEXT    NOT NULL CHECK (date(target_date) IS target_date),
  actual_date  TEXT    CHECK (date(actual_date) IS actual_date),
  task_id      INTEGER REFERENCES tasks(id) ON DELETE SET NULL,   -- optional: milestone tracks a task's finish
  owner_id     INTEGER REFERENCES team_members(id),
  status       TEXT    NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending','Achieved','At Risk','Missed')),
  CHECK ((status = 'Achieved') = (actual_date IS NOT NULL))
);

CREATE TABLE status_log (
  id            INTEGER PRIMARY KEY,
  project_id    INTEGER NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  report_date   TEXT    NOT NULL CHECK (date(report_date) IS report_date),
  health        TEXT    NOT NULL CHECK (health IN ('Green','Amber','Red')),
  summary       TEXT    NOT NULL,
  reported_by   INTEGER REFERENCES team_members(id)
);

CREATE TABLE project_closure (
  id                    INTEGER PRIMARY KEY,
  project_id            INTEGER NOT NULL UNIQUE REFERENCES project(id) ON DELETE CASCADE,
  closure_date          TEXT    NOT NULL CHECK (date(closure_date) IS closure_date),
  deliverables_accepted INTEGER NOT NULL CHECK (deliverables_accepted IN (0,1)),
  final_cost            INTEGER NOT NULL CHECK (final_cost >= 0),
  lessons_learned       TEXT    NOT NULL,
  signed_off_by         TEXT    NOT NULL
);

-- =====================================================================
--  MODULE 2 : Scope Management & WBS
-- =====================================================================
CREATE TABLE change_requests (
  id                    INTEGER PRIMARY KEY,
  project_id            INTEGER NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  code                  TEXT    NOT NULL,
  title                 TEXT    NOT NULL CHECK (length(trim(title)) > 0),
  description           TEXT    NOT NULL,
  justification         TEXT    NOT NULL CHECK (length(trim(justification)) > 0),
  cost_impact           INTEGER NOT NULL,                                   -- PKR (may be negative)
  schedule_impact_days  INTEGER NOT NULL CHECK (schedule_impact_days BETWEEN -365 AND 365),
  status                TEXT    NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending','Approved','Rejected')),
  requested_by          TEXT    NOT NULL,
  requested_date        TEXT    NOT NULL CHECK (date(requested_date) IS requested_date),
  decision_by           TEXT,
  decision_date         TEXT    CHECK (date(decision_date) IS decision_date),
  decision_notes        TEXT,
  UNIQUE (project_id, code),
  CHECK (decision_date IS NULL OR decision_date >= requested_date)
);

CREATE TABLE requirements (
  id                 INTEGER PRIMARY KEY,
  project_id         INTEGER NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  code               TEXT    NOT NULL,
  title              TEXT    NOT NULL CHECK (length(trim(title)) > 0),
  description        TEXT,
  type               TEXT    NOT NULL CHECK (type IN ('Functional','Non-Functional')),
  priority           TEXT    NOT NULL CHECK (priority IN ('Critical','High','Medium','Low')),
  status             TEXT    NOT NULL DEFAULT 'Proposed' CHECK (status IN ('Proposed','Approved','Rejected','Deferred')),
  source             TEXT,
  change_request_id  INTEGER REFERENCES change_requests(id) ON DELETE SET NULL,
  approved_date      TEXT    CHECK (date(approved_date) IS approved_date),
  UNIQUE (project_id, code)
);

CREATE TABLE wbs_items (
  id              INTEGER PRIMARY KEY,
  project_id      INTEGER NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  parent_id       INTEGER REFERENCES wbs_items(id) ON DELETE CASCADE,
  code            TEXT    NOT NULL,                     -- e.g. 1.3.2
  name            TEXT    NOT NULL CHECK (length(trim(name)) > 0),
  node_type       TEXT    NOT NULL CHECK (node_type IN ('Project','Deliverable','Work Package')),
  requirement_id  INTEGER REFERENCES requirements(id),
  description     TEXT,
  UNIQUE (project_id, code),
  CHECK ((node_type = 'Project') = (parent_id IS NULL))
);

-- =====================================================================
--  MODULE 3 : Schedule & Resource Management
-- =====================================================================
CREATE TABLE tasks (
  id               INTEGER PRIMARY KEY,
  project_id       INTEGER NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  code             TEXT    NOT NULL,
  wbs_item_id      INTEGER NOT NULL REFERENCES wbs_items(id),
  name             TEXT    NOT NULL CHECK (length(trim(name)) > 0),
  assignee_id      INTEGER NOT NULL REFERENCES team_members(id),
  duration_days    INTEGER NOT NULL CHECK (duration_days >= 1),
  planned_start    TEXT    NOT NULL CHECK (date(planned_start) IS planned_start),
  planned_end      TEXT    NOT NULL CHECK (date(planned_end)   IS planned_end),
  actual_start     TEXT    CHECK (date(actual_start) IS actual_start),
  actual_end       TEXT    CHECK (date(actual_end)   IS actual_end),
  percent_complete INTEGER NOT NULL DEFAULT 0 CHECK (percent_complete BETWEEN 0 AND 100),
  status           TEXT    NOT NULL DEFAULT 'Not Started' CHECK (status IN ('Not Started','In Progress','On Hold','Completed')),
  estimated_cost   INTEGER NOT NULL CHECK (estimated_cost >= 0),      -- budgeted cost of the activity (BAC share)
  UNIQUE (project_id, code),
  -- duration must agree with the dates (inclusive calendar days)
  CHECK (julianday(planned_end) - julianday(planned_start) + 1 = duration_days),
  -- status / progress / actual dates must tell one consistent story
  CHECK (
    (status = 'Not Started' AND percent_complete = 0 AND actual_start IS NULL AND actual_end IS NULL)
    OR (status IN ('In Progress','On Hold') AND percent_complete BETWEEN 0 AND 99 AND actual_start IS NOT NULL AND actual_end IS NULL)
    OR (status = 'Completed' AND percent_complete = 100 AND actual_start IS NOT NULL AND actual_end IS NOT NULL AND actual_end >= actual_start)
  )
);

CREATE TABLE task_dependencies (
  id               INTEGER PRIMARY KEY,
  task_id          INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,   -- successor
  predecessor_id   INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  dependency_type  TEXT    NOT NULL DEFAULT 'FS' CHECK (dependency_type = 'FS'),  -- finish-to-start
  lag_days         INTEGER NOT NULL DEFAULT 0 CHECK (lag_days >= 0),
  UNIQUE (task_id, predecessor_id),
  CHECK (task_id <> predecessor_id)
);

-- =====================================================================
--  MODULE 4 : Cost Management & Earned Value
--  (EV = estimated_cost x percent_complete ; AC = SUM(cost_entries);
--   PV / CPI / SPI are computed in application code from these facts.)
-- =====================================================================
CREATE TABLE cost_entries (
  id           INTEGER PRIMARY KEY,
  task_id      INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  entry_date   TEXT    NOT NULL CHECK (date(entry_date) IS entry_date),
  amount       INTEGER NOT NULL CHECK (amount > 0),
  category     TEXT    NOT NULL DEFAULT 'Labor' CHECK (category IN ('Labor','Infrastructure','Licensing','Other')),
  description  TEXT
);

-- =====================================================================
--  MODULE 5 : Quality Management & Risk Control
-- =====================================================================
CREATE TABLE defects (
  id             INTEGER PRIMARY KEY,
  code           TEXT    NOT NULL UNIQUE,
  title          TEXT    NOT NULL CHECK (length(trim(title)) > 0),
  description    TEXT,
  task_id        INTEGER NOT NULL REFERENCES tasks(id),               -- ties the defect to a task (and via WBS to a requirement)
  severity       TEXT    NOT NULL CHECK (severity IN ('Critical','Major','Minor','Trivial')),
  status         TEXT    NOT NULL DEFAULT 'Open' CHECK (status IN ('Open','In Progress','Resolved','Closed')),
  assigned_to    INTEGER NOT NULL REFERENCES team_members(id),
  reported_by    INTEGER NOT NULL REFERENCES team_members(id),
  reported_date  TEXT    NOT NULL CHECK (date(reported_date) IS reported_date),
  resolved_date  TEXT    CHECK (date(resolved_date) IS resolved_date),
  CHECK ((status IN ('Resolved','Closed')) = (resolved_date IS NOT NULL)),
  CHECK (resolved_date IS NULL OR resolved_date >= reported_date)
);

CREATE TABLE checklist_items (
  id           INTEGER PRIMARY KEY,
  wbs_item_id  INTEGER NOT NULL REFERENCES wbs_items(id) ON DELETE CASCADE,   -- deliverable / work package being checked
  criterion    TEXT    NOT NULL CHECK (length(trim(criterion)) > 0)
);

CREATE TABLE inspections (
  id                 INTEGER PRIMARY KEY,
  checklist_item_id  INTEGER NOT NULL REFERENCES checklist_items(id) ON DELETE CASCADE,
  inspection_type    TEXT    NOT NULL CHECK (inspection_type IN ('Inspection','Test')),
  result             TEXT    NOT NULL CHECK (result IN ('Pass','Fail','Pending')),
  inspected_on       TEXT    NOT NULL CHECK (date(inspected_on) IS inspected_on),
  inspector_id       INTEGER NOT NULL REFERENCES team_members(id),
  notes              TEXT
);

CREATE TABLE risks (
  id                INTEGER PRIMARY KEY,
  project_id        INTEGER NOT NULL REFERENCES project(id) ON DELETE CASCADE,
  code              TEXT    NOT NULL,
  title             TEXT    NOT NULL CHECK (length(trim(title)) > 0),
  description       TEXT,
  category          TEXT    NOT NULL CHECK (category IN ('Scope','Schedule','Cost','Quality','Technical','Security','People','External')),
  likelihood        INTEGER NOT NULL CHECK (likelihood BETWEEN 1 AND 5),
  impact            INTEGER NOT NULL CHECK (impact BETWEEN 1 AND 5),
  score             INTEGER GENERATED ALWAYS AS (likelihood * impact) STORED,
  rating            TEXT    GENERATED ALWAYS AS (
                      CASE WHEN likelihood * impact >= 15 THEN 'Critical'
                           WHEN likelihood * impact >= 10 THEN 'High'
                           WHEN likelihood * impact >= 5  THEN 'Medium'
                           ELSE 'Low' END) STORED,
  status            TEXT    NOT NULL DEFAULT 'Open' CHECK (status IN ('Open','Mitigating','Occurred','Closed')),
  owner_id          INTEGER NOT NULL REFERENCES team_members(id),
  related_task_id   INTEGER REFERENCES tasks(id) ON DELETE SET NULL,
  identified_date   TEXT    NOT NULL CHECK (date(identified_date) IS identified_date),
  UNIQUE (project_id, code)
);

-- Process Decision Program Chart rows: step (task) -> potential problem -> countermeasure
CREATE TABLE risk_responses (
  id                INTEGER PRIMARY KEY,
  risk_id           INTEGER NOT NULL REFERENCES risks(id) ON DELETE CASCADE,
  task_id           INTEGER REFERENCES tasks(id) ON DELETE SET NULL,
  potential_problem TEXT    NOT NULL CHECK (length(trim(potential_problem)) > 0),
  response_type     TEXT    NOT NULL CHECK (response_type IN ('Preventive','Corrective')),
  action            TEXT    NOT NULL CHECK (length(trim(action)) > 0),
  owner_id          INTEGER REFERENCES team_members(id),
  status            TEXT    NOT NULL DEFAULT 'Planned' CHECK (status IN ('Planned','In Progress','Done'))
);

-- =====================================================================
--  MODULE 6 : Integration support
-- =====================================================================
CREATE TABLE audit_log (
  id          INTEGER PRIMARY KEY,
  entity      TEXT NOT NULL,
  entity_id   INTEGER,
  action      TEXT NOT NULL,
  details     TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_tasks_wbs        ON tasks(wbs_item_id);
CREATE INDEX idx_tasks_assignee   ON tasks(assignee_id);
CREATE INDEX idx_deps_task        ON task_dependencies(task_id);
CREATE INDEX idx_deps_pred        ON task_dependencies(predecessor_id);
CREATE INDEX idx_costs_task       ON cost_entries(task_id);
CREATE INDEX idx_defects_task     ON defects(task_id, status);
CREATE INDEX idx_wbs_parent       ON wbs_items(parent_id);
CREATE INDEX idx_req_status       ON requirements(status);

-- =====================================================================
--  HELPER VIEWS
-- =====================================================================
CREATE VIEW v_task_actual_cost AS
  SELECT t.id AS task_id, COALESCE(SUM(c.amount), 0) AS actual_cost
  FROM tasks t LEFT JOIN cost_entries c ON c.task_id = t.id
  GROUP BY t.id;

CREATE VIEW v_risk_ranked AS
  SELECT r.*, RANK() OVER (ORDER BY r.score DESC, r.impact DESC) AS priority_rank
  FROM risks r
  WHERE r.status <> 'Closed';

CREATE VIEW v_unresolved_critical_defects AS
  SELECT d.*, t.project_id
  FROM defects d JOIN tasks t ON t.id = d.task_id
  WHERE d.severity = 'Critical' AND d.status IN ('Open','In Progress');

-- =====================================================================
--  INTEGRITY TRIGGERS  (business rules enforced at the database level)
-- =====================================================================

-- ---- WBS: hierarchy shape + approved-scope filter -------------------
CREATE TRIGGER trg_wbs_rules_ins BEFORE INSERT ON wbs_items
BEGIN
  SELECT RAISE(ABORT, 'A Deliverable must sit directly under the Project node')
   WHERE NEW.node_type = 'Deliverable'
     AND COALESCE((SELECT node_type FROM wbs_items WHERE id = NEW.parent_id), '') <> 'Project';
  SELECT RAISE(ABORT, 'A Work Package must sit directly under a Deliverable')
   WHERE NEW.node_type = 'Work Package'
     AND COALESCE((SELECT node_type FROM wbs_items WHERE id = NEW.parent_id), '') <> 'Deliverable';
  SELECT RAISE(ABORT, 'SCOPE RULE: only APPROVED requirements can be included in the WBS')
   WHERE NEW.requirement_id IS NOT NULL
     AND (SELECT status FROM requirements WHERE id = NEW.requirement_id) <> 'Approved';
END;

CREATE TRIGGER trg_wbs_rules_upd BEFORE UPDATE ON wbs_items
BEGIN
  SELECT RAISE(ABORT, 'A Deliverable must sit directly under the Project node')
   WHERE NEW.node_type = 'Deliverable'
     AND COALESCE((SELECT node_type FROM wbs_items WHERE id = NEW.parent_id), '') <> 'Project';
  SELECT RAISE(ABORT, 'A Work Package must sit directly under a Deliverable')
   WHERE NEW.node_type = 'Work Package'
     AND COALESCE((SELECT node_type FROM wbs_items WHERE id = NEW.parent_id), '') <> 'Deliverable';
  SELECT RAISE(ABORT, 'SCOPE RULE: only APPROVED requirements can be included in the WBS')
   WHERE NEW.requirement_id IS NOT NULL
     AND (SELECT status FROM requirements WHERE id = NEW.requirement_id) <> 'Approved';
END;

-- ---- Requirements: scope can only grow through an approved CR -------
CREATE TRIGGER trg_req_cr_gate_ins BEFORE INSERT ON requirements
WHEN NEW.status = 'Approved' AND NEW.change_request_id IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'SCOPE RULE: requirement belongs to a change request that is not approved')
   WHERE (SELECT status FROM change_requests WHERE id = NEW.change_request_id) <> 'Approved';
END;

CREATE TRIGGER trg_req_cr_gate_upd BEFORE UPDATE OF status ON requirements
WHEN NEW.status = 'Approved' AND NEW.change_request_id IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'SCOPE RULE: requirement belongs to a change request that is not approved')
   WHERE (SELECT status FROM change_requests WHERE id = NEW.change_request_id) <> 'Approved';
END;

CREATE TRIGGER trg_req_in_use BEFORE UPDATE OF status ON requirements
WHEN OLD.status = 'Approved' AND NEW.status <> 'Approved'
BEGIN
  SELECT RAISE(ABORT, 'Requirement is already in the WBS - remove its WBS items and tasks first')
   WHERE EXISTS (SELECT 1 FROM wbs_items WHERE requirement_id = OLD.id);
END;

-- ---- Change requests: lifecycle + automatic effect on the baseline --
CREATE TRIGGER trg_cr_starts_pending BEFORE INSERT ON change_requests
WHEN NEW.status <> 'Pending'
BEGIN
  SELECT RAISE(ABORT, 'A new change request must start as Pending');
END;

CREATE TRIGGER trg_cr_final BEFORE UPDATE OF status ON change_requests
WHEN OLD.status <> 'Pending' AND NEW.status <> OLD.status
BEGIN
  SELECT RAISE(ABORT, 'A decided change request is final and cannot be reopened');
END;

CREATE TRIGGER trg_cr_needs_decision BEFORE UPDATE OF status ON change_requests
WHEN OLD.status = 'Pending' AND NEW.status IN ('Approved','Rejected')
BEGIN
  SELECT RAISE(ABORT, 'Decision date and decision maker are required')
   WHERE NEW.decision_date IS NULL OR NEW.decision_by IS NULL OR length(trim(NEW.decision_by)) = 0;
END;

-- APPROVAL: raises budget, moves deadline, promotes linked requirements to Approved scope
CREATE TRIGGER trg_cr_approved AFTER UPDATE OF status ON change_requests
WHEN OLD.status = 'Pending' AND NEW.status = 'Approved'
BEGIN
  INSERT INTO audit_log (entity, entity_id, action, details)
  SELECT 'change_request', NEW.id, 'APPROVED',
         NEW.code || ': budget ' || p.current_budget || ' -> ' || (p.current_budget + NEW.cost_impact)
         || ' ; deadline ' || p.deadline || ' -> ' || date(p.deadline, printf('%+d days', NEW.schedule_impact_days))
  FROM project p WHERE p.id = NEW.project_id;

  UPDATE project
     SET current_budget = current_budget + NEW.cost_impact,
         deadline       = date(deadline, printf('%+d days', NEW.schedule_impact_days))
   WHERE id = NEW.project_id;

  UPDATE requirements
     SET status = 'Approved', approved_date = NEW.decision_date
   WHERE change_request_id = NEW.id AND status IN ('Proposed','Deferred');
END;

-- REJECTION: linked requirements are rejected, scope/budget/deadline unchanged
CREATE TRIGGER trg_cr_rejected AFTER UPDATE OF status ON change_requests
WHEN OLD.status = 'Pending' AND NEW.status = 'Rejected'
BEGIN
  UPDATE requirements SET status = 'Rejected'
   WHERE change_request_id = NEW.id AND status IN ('Proposed','Deferred');
  INSERT INTO audit_log (entity, entity_id, action, details)
  VALUES ('change_request', NEW.id, 'REJECTED', NEW.code || ': no change to scope, budget or deadline');
END;

-- ---- Tasks: placement, dates, and budget ceiling --------------------
CREATE TRIGGER trg_task_rules_ins BEFORE INSERT ON tasks
BEGIN
  SELECT RAISE(ABORT, 'Tasks must be attached to a WBS Work Package')
   WHERE (SELECT node_type FROM wbs_items WHERE id = NEW.wbs_item_id) <> 'Work Package';
  SELECT RAISE(ABORT, 'A task cannot start before the project start date')
   WHERE NEW.planned_start < (SELECT start_date FROM project WHERE id = NEW.project_id);
END;

CREATE TRIGGER trg_task_rules_upd BEFORE UPDATE ON tasks
BEGIN
  SELECT RAISE(ABORT, 'Tasks must be attached to a WBS Work Package')
   WHERE (SELECT node_type FROM wbs_items WHERE id = NEW.wbs_item_id) <> 'Work Package';
  SELECT RAISE(ABORT, 'A task cannot start before the project start date')
   WHERE NEW.planned_start < (SELECT start_date FROM project WHERE id = NEW.project_id);
END;

CREATE TRIGGER trg_task_budget_ins AFTER INSERT ON tasks
BEGIN
  SELECT RAISE(ABORT, 'BUDGET RULE: total task estimates would exceed the approved project budget')
   WHERE (SELECT COALESCE(SUM(estimated_cost), 0) FROM tasks WHERE project_id = NEW.project_id)
       > (SELECT current_budget FROM project WHERE id = NEW.project_id);
END;

CREATE TRIGGER trg_task_budget_upd AFTER UPDATE OF estimated_cost ON tasks
BEGIN
  SELECT RAISE(ABORT, 'BUDGET RULE: total task estimates would exceed the approved project budget')
   WHERE (SELECT COALESCE(SUM(estimated_cost), 0) FROM tasks WHERE project_id = NEW.project_id)
       > (SELECT current_budget FROM project WHERE id = NEW.project_id);
END;

CREATE TRIGGER trg_project_budget_floor BEFORE UPDATE OF current_budget ON project
BEGIN
  SELECT RAISE(ABORT, 'Budget cannot be set below the total of existing task estimates')
   WHERE NEW.current_budget < (SELECT COALESCE(SUM(estimated_cost), 0) FROM tasks WHERE project_id = NEW.id);
END;

-- ---- Dependencies: no circular chains --------------------------------
CREATE TRIGGER trg_dep_no_cycle BEFORE INSERT ON task_dependencies
BEGIN
  SELECT RAISE(ABORT, 'Circular dependency: that link would make a task depend on itself')
   WHERE EXISTS (
     WITH RECURSIVE upstream(id) AS (
       SELECT NEW.predecessor_id
       UNION
       SELECT d.predecessor_id FROM task_dependencies d JOIN upstream u ON d.task_id = u.id
     )
     SELECT 1 FROM upstream WHERE id = NEW.task_id
   );
END;

-- ---- Costs: no spending on tasks that have not started ---------------
CREATE TRIGGER trg_cost_task_started BEFORE INSERT ON cost_entries
BEGIN
  SELECT RAISE(ABORT, 'Cannot record actual cost against a task that has not started')
   WHERE (SELECT status FROM tasks WHERE id = NEW.task_id) = 'Not Started';
END;

-- ---- Project closure gate ---------------------------------------------
CREATE TRIGGER trg_project_close_gate BEFORE UPDATE OF status ON project
WHEN NEW.status = 'Closed' AND OLD.status <> 'Closed'
BEGIN
  SELECT RAISE(ABORT, 'Cannot close the project: incomplete tasks remain')
   WHERE EXISTS (SELECT 1 FROM tasks WHERE project_id = NEW.id AND status <> 'Completed');
  SELECT RAISE(ABORT, 'Cannot close the project: unresolved critical defects remain')
   WHERE EXISTS (SELECT 1 FROM v_unresolved_critical_defects WHERE project_id = NEW.id);
END;
