-- =====================================================================
--  SEED DATA : Smart Healthcare Project Management & Monitoring System
--  Scenario snapshot: status date 2026-10-25 (week 8 of 16).
--  CR-001 (AI diagnosis + mobile app, +PKR 800,000, +21 days) is PENDING
--  so the approval can be demonstrated live: budget 5.0M -> 5.8M,
--  deadline 2026-12-27 -> 2027-01-17, REQ-011/012 become approved scope.
-- =====================================================================
PRAGMA foreign_keys = ON;
BEGIN TRANSACTION;

-- ---------------------------------------------------------------- M1
INSERT INTO project (id, code, name, description, sponsor, objectives, scope_in, scope_out,
                     start_date, original_deadline, deadline, original_budget, current_budget,
                     currency, status_date, status, evm_warning_threshold, evm_critical_threshold)
VALUES (1, 'SHPMS-2026',
  'Smart Healthcare Project Management and Monitoring System',
  'Web platform for a network of five hospitals (City Care Hospital Lahore, Sahiwal Teaching Hospital, Faisalabad Medical Centre, Multan Central Hospital, Islamabad Health Complex) managing appointments, laboratory reports, doctor schedules, online consultations and billing.',
  'Hospital Management Board - Network of Five Hospitals',
  '1. Deliver a working system to all five hospitals within 16 weeks.
2. Complete the project within the approved budget of PKR 5,000,000.
3. Digitise patient appointments, lab reports, doctor schedules, online consultations and billing.
4. Achieve zero unresolved critical defects at go-live.
5. Keep patient records secure with role-based access per hospital.',
  'Patient appointment management; laboratory report management; doctor schedule management; online consultations; hospital billing; patient record management; user and role management; notifications; reporting dashboard; testing, deployment and staff training at five hospitals.',
  'Pharmacy inventory; insurance claim processing; medical imaging (PACS) integration; hardware procurement; data migration of records older than 2020. (AI diagnosis and mobile app are outside the baseline unless approved through a change request.)',
  '2026-09-07', '2026-12-27', '2026-12-27', 5000000, 5000000,
  'PKR', '2026-10-25', 'Executing', 0.95, 0.85);

INSERT INTO pm_plan (project_id, version, scope_plan, schedule_plan, cost_plan, quality_plan, updated_on)
VALUES (1, '1.2',
  'Scope is controlled through the requirements register and WBS. Only APPROVED requirements enter the WBS. Any new requirement needs a change request with justification, cost and schedule impact, approved by the Hospital Management Board.',
  'Baseline duration 16 weeks (2026-09-07 to 2026-12-27) using 25 activities with finish-to-start dependencies. Progress is reviewed every Sunday; delayed activities are propagated through dependencies to the final deadline.',
  'Approved budget PKR 5,000,000 allocated to activities (BAC). Actual costs are booked weekly. Earned Value Management (PV, EV, AC, CPI, SPI) is reviewed weekly; CPI or SPI below 0.95 raises a warning, below 0.85 a critical alert.',
  'Every deliverable has a quality checklist. Defects are logged with severity and owner. No go-live while any critical defect is unresolved. Test planning starts in week 3; integration and UAT testing precede deployment.',
  '2026-10-12');

INSERT INTO team_members (id, project_id, name, role, email) VALUES
 (1, 1, 'Ayesha Khan',   'Project Manager',     'ayesha.khan@example.com'),
 (2, 1, 'Usman Tariq',   'Backend Developer',   'usman.tariq@example.com'),
 (3, 1, 'Hamza Ali',     'Backend Developer',   'hamza.ali@example.com'),
 (4, 1, 'Sana Malik',    'Frontend Developer',  'sana.malik@example.com'),
 (5, 1, 'Bilal Ahmed',   'Frontend Developer',  'bilal.ahmed@example.com'),
 (6, 1, 'Zainab Raza',   'Database Developer',  'zainab.raza@example.com'),
 (7, 1, 'Omar Farooq',   'QA Engineer',         'omar.farooq@example.com');

INSERT INTO stakeholders (project_id, name, role, organization, influence, interest, expectations) VALUES
 (1, 'Dr. Imran Siddiqui', 'Project Sponsor - Chair, Hospital Management Board', 'Hospital Management Board', 'High',   'High',   'On-time delivery within budget; unified view across five hospitals'),
 (1, 'Dr. Farah Naveed',   'Chief Medical Officer',                              'City Care Hospital, Lahore', 'High',   'High',   'Safe, accurate patient records and reliable appointment scheduling'),
 (1, 'Mr. Kamran Butt',    'Head of Finance and Billing',                        'Faisalabad Medical Centre',  'Medium', 'High',   'Accurate invoicing and billing reports'),
 (1, 'Ms. Rukhsana Iqbal', 'Laboratory Services Head',                           'Sahiwal Teaching Hospital',  'Medium', 'High',   'Fast, secure lab report delivery to doctors and patients'),
 (1, 'Dr. Tahir Mehmood',  'Doctors Representative (OPD)',                       'Multan Central Hospital',    'Medium', 'High',   'Easy doctor schedule management and online consultations'),
 (1, 'Mr. Adnan Shah',     'IT Director',                                        'Islamabad Health Complex',   'High',   'Medium', 'Secure deployment, maintainable system, clear handover'),
 (1, 'Ms. Nida Hussain',   'Patient Welfare Association Representative',         'Patient Welfare Association','Low',    'Medium', 'Simple patient-facing booking and privacy protection');

INSERT INTO status_log (project_id, report_date, health, summary, reported_by) VALUES
 (1, '2026-10-04', 'Green', 'Design complete on time. Authentication module delivered. Core module development started.', 1),
 (1, '2026-10-11', 'Green', 'Patient records and doctor schedule modules in progress; no major issues.', 1),
 (1, '2026-10-18', 'Amber', 'Patient records and doctor schedule finished 2 days late. Testing found critical defects in appointment scheduling and patient records. Management requested AI diagnosis and mobile app (CR-001).', 1),
 (1, '2026-10-25', 'Amber', 'CPI and SPI below 0.95. Critical defects still open. CR-001 awaiting Board decision.', 1);

-- ---------------------------------------------------------------- M2
INSERT INTO change_requests (id, project_id, code, title, description, justification, cost_impact, schedule_impact_days,
                             status, requested_by, requested_date) VALUES
 (1, 1, 'CR-001', 'Add AI-based preliminary diagnosis module and mobile application',
  'Hospital management requests (a) an AI-based preliminary diagnosis module that suggests likely conditions from patient symptoms for doctor review, and (b) a mobile application for patients and doctors.',
  'Improves triage speed and patient access; strongly requested by the Medical Board after the pilot demonstration. Estimated by the development team.',
  800000, 21, 'Pending', 'Hospital Management Board', '2026-10-12'),
 (2, 1, 'CR-002', 'Add pharmacy inventory integration',
  'Integrate the hospital pharmacy stock system with patient billing and prescriptions.',
  'Would reduce manual billing reconciliation, but pharmacy systems differ in each hospital.',
  450000, 14, 'Pending', 'Head of Finance and Billing', '2026-10-05');

INSERT INTO requirements (id, project_id, code, title, description, type, priority, status, source, change_request_id, approved_date) VALUES
 (1,  1, 'REQ-001', 'Patient appointment booking and scheduling', 'Patients/receptionists book, reschedule and cancel appointments; no double booking.', 'Functional', 'Critical', 'Approved', 'Hospital Management', NULL, '2026-09-20'),
 (2,  1, 'REQ-002', 'Doctor schedule management', 'Doctors and admins define shifts, leave and availability per hospital.', 'Functional', 'Critical', 'Approved', 'Doctors Representative', NULL, '2026-09-20'),
 (3,  1, 'REQ-003', 'Laboratory report management', 'Record lab orders and results; secure report access for doctors and patients.', 'Functional', 'High', 'Approved', 'Laboratory Services Head', NULL, '2026-09-20'),
 (4,  1, 'REQ-004', 'Online consultations', 'Video/chat consultation between doctor and patient linked to an appointment.', 'Functional', 'High', 'Approved', 'Chief Medical Officer', NULL, '2026-09-20'),
 (5,  1, 'REQ-005', 'Hospital billing and invoicing', 'Generate invoices from services, record payments, produce billing reports.', 'Functional', 'High', 'Approved', 'Head of Finance and Billing', NULL, '2026-09-20'),
 (6,  1, 'REQ-006', 'Patient record management', 'Create and maintain electronic patient records with history and audit trail.', 'Functional', 'Critical', 'Approved', 'Chief Medical Officer', NULL, '2026-09-20'),
 (7,  1, 'REQ-007', 'User authentication and role-based access', 'Secure login, roles (admin, doctor, lab, billing, reception), per-hospital data isolation.', 'Non-Functional', 'High', 'Approved', 'IT Director', NULL, '2026-09-20'),
 (8,  1, 'REQ-008', 'Reports and analytics dashboard', 'Management dashboard with appointment, lab and billing statistics.', 'Functional', 'Medium', 'Approved', 'Hospital Management', NULL, '2026-09-20'),
 (9,  1, 'REQ-009', 'SMS/email notifications', 'Appointment confirmations and reminders; lab report ready alerts.', 'Functional', 'Medium', 'Approved', 'Patient Welfare Association', NULL, '2026-09-20'),
 (10, 1, 'REQ-010', 'Performance and availability', 'Support 500 concurrent users; pages respond within 3 seconds.', 'Non-Functional', 'Medium', 'Approved', 'IT Director', NULL, '2026-09-20'),
 (11, 1, 'REQ-011', 'AI-based preliminary diagnosis module', 'Symptom-based preliminary diagnosis suggestions for doctor review.', 'Functional', 'High', 'Proposed', 'Hospital Management Board', 1, NULL),
 (12, 1, 'REQ-012', 'Mobile application', 'Patient and doctor mobile app for appointments, reports and consultations.', 'Functional', 'High', 'Proposed', 'Hospital Management Board', 1, NULL),
 (13, 1, 'REQ-013', 'Pharmacy inventory integration', 'Link pharmacy stock with billing and prescriptions.', 'Functional', 'Low', 'Proposed', 'Head of Finance and Billing', 2, NULL);

-- WBS: level 1 = project, level 2 = deliverables, level 3 = work packages
INSERT INTO wbs_items (id, project_id, parent_id, code, name, node_type, requirement_id) VALUES
 (1,  1, NULL, '1',     'Smart Healthcare Project Management and Monitoring System', 'Project',      NULL),
 (2,  1, 1,    '1.1',   'Project Management',                    'Deliverable',  NULL),
 (3,  1, 1,    '1.2',   'Requirements and Design',               'Deliverable',  NULL),
 (4,  1, 1,    '1.3',   'Core Clinical and Billing Modules',     'Deliverable',  NULL),
 (5,  1, 1,    '1.4',   'Platform and Security Services',        'Deliverable',  NULL),
 (6,  1, 1,    '1.5',   'Testing and Deployment',                'Deliverable',  NULL),
 (7,  1, 2,    '1.1.1', 'Initiation and Planning',               'Work Package', NULL),
 (8,  1, 2,    '1.1.2', 'Closure and Handover',                  'Work Package', NULL),
 (9,  1, 3,    '1.2.1', 'Requirements Analysis',                 'Work Package', NULL),
 (10, 1, 3,    '1.2.2', 'System, Database and UI Design',        'Work Package', NULL),
 (11, 1, 4,    '1.3.1', 'Appointment Scheduling',                'Work Package', 1),
 (12, 1, 4,    '1.3.2', 'Doctor Schedule Management',            'Work Package', 2),
 (13, 1, 4,    '1.3.3', 'Laboratory Reports',                    'Work Package', 3),
 (14, 1, 4,    '1.3.4', 'Online Consultations',                  'Work Package', 4),
 (15, 1, 4,    '1.3.5', 'Hospital Billing',                      'Work Package', 5),
 (16, 1, 4,    '1.3.6', 'Patient Records',                       'Work Package', 6),
 (17, 1, 5,    '1.4.1', 'Authentication and Role Management',    'Work Package', 7),
 (18, 1, 5,    '1.4.2', 'Reports and Analytics',                 'Work Package', 8),
 (19, 1, 5,    '1.4.3', 'Notifications',                         'Work Package', 9),
 (20, 1, 6,    '1.5.1', 'Test Planning, Testing and Stabilisation', 'Work Package', 10),
 (21, 1, 6,    '1.5.2', 'Deployment and Training',               'Work Package', NULL);

-- ---------------------------------------------------------------- M3
-- Durations are inclusive calendar days.  Dates follow the finish-to-start network below.
INSERT INTO tasks (id, project_id, code, wbs_item_id, name, assignee_id, duration_days,
                   planned_start, planned_end, actual_start, actual_end, percent_complete, status, estimated_cost) VALUES
 (1,  1, 'T01', 7,  'Project charter and kickoff',                     1, 5,  '2026-09-07', '2026-09-11', '2026-09-07', '2026-09-11', 100, 'Completed',   100000),
 (2,  1, 'T02', 9,  'Requirements gathering and analysis',             1, 9,  '2026-09-12', '2026-09-20', '2026-09-12', '2026-09-20', 100, 'Completed',   150000),
 (3,  1, 'T03', 10, 'System architecture design',                      2, 6,  '2026-09-21', '2026-09-26', '2026-09-21', '2026-09-26', 100, 'Completed',   150000),
 (4,  1, 'T04', 10, 'Database schema design',                          6, 7,  '2026-09-21', '2026-09-27', '2026-09-21', '2026-09-27', 100, 'Completed',   160000),
 (5,  1, 'T05', 10, 'UI/UX design and prototypes',                     4, 8,  '2026-09-21', '2026-09-28', '2026-09-21', '2026-09-28', 100, 'Completed',   180000),
 (6,  1, 'T06', 20, 'Test planning and test case design',              7, 7,  '2026-09-21', '2026-09-27', '2026-09-21', '2026-09-27', 100, 'Completed',    80000),
 (7,  1, 'T07', 17, 'Authentication and role management (backend)',    3, 8,  '2026-09-28', '2026-10-05', '2026-09-28', '2026-10-05', 100, 'Completed',   230000),
 (8,  1, 'T08', 16, 'Patient record management module',                6, 14, '2026-09-28', '2026-10-11', '2026-09-28', '2026-10-13', 100, 'Completed',   350000),
 (9,  1, 'T09', 12, 'Doctor schedule management module',               2, 10, '2026-10-06', '2026-10-15', '2026-10-06', '2026-10-17', 100, 'Completed',   240000),
 (10, 1, 'T10', 11, 'Appointment scheduling module',                   3, 12, '2026-10-16', '2026-10-27', '2026-10-18', NULL,          60, 'In Progress', 400000),
 (11, 1, 'T11', 13, 'Laboratory report management module',             6, 12, '2026-10-12', '2026-10-23', '2026-10-14', '2026-10-23', 100, 'Completed',   320000),
 (12, 1, 'T12', 14, 'Online consultation module',                      2, 14, '2026-10-16', '2026-10-29', '2026-10-18', NULL,          55, 'In Progress', 370000),
 (13, 1, 'T13', 15, 'Hospital billing and invoicing module',           3, 12, '2026-10-28', '2026-11-08', NULL,         NULL,           0, 'Not Started', 330000),
 (14, 1, 'T14', 17, 'Frontend: layout and authentication UI',          5, 8,  '2026-10-06', '2026-10-13', '2026-10-06', '2026-10-13', 100, 'Completed',   150000),
 (15, 1, 'T15', 11, 'Frontend: appointment and doctor schedule UI',    4, 12, '2026-10-16', '2026-10-27', '2026-10-18', NULL,          60, 'In Progress', 260000),
 (16, 1, 'T16', 16, 'Frontend: patient records and lab UI',            5, 10, '2026-10-24', '2026-11-02', '2026-10-24', NULL,          10, 'In Progress', 240000),
 (17, 1, 'T17', 14, 'Frontend: consultation and billing UI',           4, 10, '2026-11-09', '2026-11-18', NULL,         NULL,           0, 'Not Started', 240000),
 (18, 1, 'T18', 19, 'Notifications (SMS/email reminders)',             2, 7,  '2026-10-30', '2026-11-05', NULL,         NULL,           0, 'Not Started', 110000),
 (19, 1, 'T19', 18, 'Reports and analytics dashboard',                 5, 10, '2026-11-09', '2026-11-18', NULL,         NULL,           0, 'Not Started', 190000),
 (20, 1, 'T20', 20, 'Integration testing',                             7, 8,  '2026-11-09', '2026-11-16', NULL,         NULL,           0, 'Not Started', 180000),
 (21, 1, 'T21', 20, 'System and user acceptance testing (UAT)',        7, 8,  '2026-11-19', '2026-11-26', NULL,         NULL,           0, 'Not Started', 180000),
 (22, 1, 'T22', 20, 'Defect fixing and stabilisation',                 2, 7,  '2026-11-27', '2026-12-03', NULL,         NULL,           0, 'Not Started', 130000),
 (23, 1, 'T23', 21, 'Deployment at five hospitals',                    3, 10, '2026-12-04', '2026-12-13', NULL,         NULL,           0, 'Not Started', 150000),
 (24, 1, 'T24', 21, 'Staff training and handover',                     1, 5,  '2026-12-14', '2026-12-18', NULL,         NULL,           0, 'Not Started',  60000),
 (25, 1, 'T25', 8,  'Project closure and lessons learned',             1, 3,  '2026-12-19', '2026-12-21', NULL,         NULL,           0, 'Not Started',  50000);

-- Finish-to-start dependencies (task_id = successor)
INSERT INTO task_dependencies (task_id, predecessor_id) VALUES
 (2,1),
 (3,2),(4,2),(5,2),(6,2),
 (7,3),(7,4),
 (8,3),(8,4),
 (9,7),
 (10,8),(10,9),
 (11,8),
 (12,9),
 (13,10),(13,8),
 (14,5),(14,7),
 (15,14),(15,9),
 (16,14),(16,11),
 (17,12),(17,13),(17,15),
 (18,10),(18,12),
 (19,16),(19,13),
 (20,13),(20,15),(20,16),(20,18),
 (21,20),(21,17),(21,19),
 (22,21),
 (23,22),
 (24,23),
 (25,24);

INSERT INTO milestones (id, project_id, name, target_date, actual_date, task_id, owner_id, status) VALUES
 (1, 1, 'Requirements baseline approved',      '2026-09-20', '2026-09-20', 2,  1, 'Achieved'),
 (2, 1, 'Design complete',                     '2026-09-28', '2026-09-28', 5,  1, 'Achieved'),
 (3, 1, 'Backend core modules complete',       '2026-11-08', NULL,         13, 3, 'At Risk'),
 (4, 1, 'Integration testing complete',        '2026-11-16', NULL,         20, 7, 'Pending'),
 (5, 1, 'UAT sign-off',                        '2026-11-26', NULL,         21, 7, 'Pending'),
 (6, 1, 'Go-live at five hospitals',           '2026-12-13', NULL,         23, 3, 'Pending'),
 (7, 1, 'Project closure',                     '2026-12-21', NULL,         25, 1, 'Pending');

-- ---------------------------------------------------------------- M4
-- Actual expenditure to 2026-10-25 (sum = PKR 2,995,000)
INSERT INTO cost_entries (task_id, entry_date, amount, category, description) VALUES
 (1,  '2026-09-11', 100000, 'Labor',          'Charter and kickoff effort'),
 (2,  '2026-09-20', 155000, 'Labor',          'Requirements workshops with five hospitals'),
 (3,  '2026-09-26', 150000, 'Labor',          'Architecture design'),
 (4,  '2026-09-27', 170000, 'Labor',          'Schema design and review rework'),
 (5,  '2026-09-21',   5000, 'Licensing',      'Design tool licence'),
 (5,  '2026-09-28', 180000, 'Labor',          'UI/UX design and prototypes'),
 (6,  '2026-09-27',  80000, 'Labor',          'Test plan and cases'),
 (7,  '2026-10-05', 250000, 'Labor',          'Authentication and roles'),
 (8,  '2026-10-04', 200000, 'Labor',          'Patient records - first sprint'),
 (8,  '2026-10-13', 185000, 'Labor',          'Patient records - completion and overtime'),
 (9,  '2026-10-17', 255000, 'Labor',          'Doctor schedule module'),
 (10, '2026-10-20', 150000, 'Labor',          'Appointment scheduling - development'),
 (10, '2026-10-25', 160000, 'Labor',          'Appointment scheduling - defect rework'),
 (11, '2026-10-23', 330000, 'Labor',          'Laboratory report module'),
 (12, '2026-10-20', 130000, 'Labor',          'Online consultation - development'),
 (12, '2026-10-25', 135000, 'Infrastructure', 'Video service setup and development'),
 (14, '2026-10-13', 150000, 'Labor',          'Frontend layout and auth UI'),
 (15, '2026-10-25', 175000, 'Labor',          'Appointment UI development'),
 (16, '2026-10-25',  35000, 'Labor',          'Records UI start');

-- ---------------------------------------------------------------- M5
INSERT INTO defects (id, code, title, description, task_id, severity, status, assigned_to, reported_by, reported_date, resolved_date) VALUES
 (1, 'DEF-001', 'Double booking possible for the same doctor slot',       'Two receptionists can book the same slot at the same time (race condition).',            10, 'Critical', 'Open',        3, 7, '2026-10-20', NULL),
 (2, 'DEF-002', 'Cancelled appointment does not release the doctor slot', 'Slot stays blocked after cancellation until the next night job.',                          10, 'Major',    'In Progress', 3, 7, '2026-10-21', NULL),
 (3, 'DEF-003', 'Concurrent edits overwrite patient record changes',      'Last write wins; no locking or versioning on patient records.',                          8,  'Critical', 'In Progress', 6, 7, '2026-10-19', NULL),
 (4, 'DEF-004', 'Patient search returns records of another hospital',     'Hospital data isolation filter missing in search endpoint.',                              8,  'Critical', 'Open',        6, 7, '2026-10-22', NULL),
 (5, 'DEF-005', 'Reminder time shown in wrong timezone',                  'Reminder preview displays UTC instead of local time.',                                    10, 'Minor',    'Open',        3, 7, '2026-10-23', NULL),
 (6, 'DEF-006', 'Schedule date picker allows past dates',                 'Doctor schedule UI lets users pick dates in the past.',                                   15, 'Minor',    'Open',        4, 7, '2026-10-24', NULL),
 (7, 'DEF-007', 'Lab report PDF shows full patient ID number',            'Sensitive identifier is not masked on exported lab report.',                              11, 'Major',    'Resolved',    6, 7, '2026-10-20', '2026-10-24'),
 (8, 'DEF-008', 'Account not locked after repeated failed logins',        'Lockout after 3 failures was not applied.',                                               7,  'Major',    'Closed',      3, 7, '2026-10-06', '2026-10-08'),
 (9, 'DEF-009', 'Patient history page slower than 3 seconds',             'History query lacks an index.',                                                           8,  'Major',    'Resolved',    6, 7, '2026-10-14', '2026-10-17');

INSERT INTO checklist_items (id, wbs_item_id, criterion) VALUES
 (1,  11, 'A doctor time slot cannot be double booked'),
 (2,  11, 'Cancelling an appointment releases the slot immediately'),
 (3,  11, 'Patient receives confirmation and reminder'),
 (4,  16, 'Role-based access enforced per hospital'),
 (5,  16, 'Every edit is recorded in an audit trail'),
 (6,  16, 'Concurrent edits do not overwrite each other'),
 (7,  13, 'Lab report is linked to the patient visit'),
 (8,  13, 'Exported report masks sensitive identifiers'),
 (9,  15, 'Invoice totals match billed services'),
 (10, 17, 'Account locks after three failed logins'),
 (11, 17, 'Password policy is enforced'),
 (12, 14, 'Video consultation is stable for 30 minutes'),
 (13, 12, 'Conflicting doctor schedules are rejected');

INSERT INTO inspections (checklist_item_id, inspection_type, result, inspected_on, inspector_id, notes) VALUES
 (1,  'Test',       'Fail',    '2026-10-20', 7, 'Double booking reproduced - see DEF-001'),
 (2,  'Test',       'Fail',    '2026-10-21', 7, 'Slot not released - see DEF-002'),
 (3,  'Test',       'Pending', '2026-10-25', 7, 'Waiting for notification module (T18)'),
 (4,  'Test',       'Fail',    '2026-10-22', 7, 'Cross-hospital search leak - see DEF-004'),
 (5,  'Inspection', 'Pass',    '2026-10-19', 7, 'Audit trail present for all edits'),
 (6,  'Test',       'Fail',    '2026-10-19', 7, 'Overwrite reproduced - see DEF-003'),
 (7,  'Inspection', 'Pass',    '2026-10-23', 7, 'Linked to visit ID correctly'),
 (8,  'Test',       'Fail',    '2026-10-20', 7, 'ID not masked - see DEF-007'),
 (8,  'Test',       'Pass',    '2026-10-24', 7, 'Retest after DEF-007 fix'),
 (9,  'Inspection', 'Pending', '2026-10-25', 7, 'Billing module not built yet'),
 (10, 'Test',       'Fail',    '2026-10-06', 7, 'See DEF-008'),
 (10, 'Test',       'Pass',    '2026-10-08', 7, 'Retest passed after fix'),
 (11, 'Inspection', 'Pass',    '2026-10-08', 7, 'Policy meets agreed standard'),
 (12, 'Test',       'Pending', '2026-10-25', 7, 'Module still in development'),
 (13, 'Test',       'Pass',    '2026-10-19', 7, 'Overlapping shifts correctly rejected');

INSERT INTO risks (id, project_id, code, title, description, category, likelihood, impact, status, owner_id, related_task_id, identified_date) VALUES
 (1, 1, 'RSK-01', 'Scope creep from hospital management',            'Management keeps adding requirements (AI module, mobile app, pharmacy).',            'Scope',     4, 4, 'Occurred',   1, 2,    '2026-09-12'),
 (2, 1, 'RSK-02', 'Critical defects delay appointment scheduling',    'Double booking and record defects delay delivery of the core modules.',              'Quality',   4, 5, 'Occurred',   3, 10,   '2026-10-20'),
 (3, 1, 'RSK-03', 'Patient data breach or cross-hospital data leak',  'Weak access control exposes patient records.',                                       'Security',  2, 5, 'Mitigating', 6, 8,    '2026-09-21'),
 (4, 1, 'RSK-04', 'Key developer becomes unavailable',                'Illness or resignation of a backend developer stalls critical tasks.',               'People',    2, 3, 'Open',       1, NULL, '2026-09-12'),
 (5, 1, 'RSK-05', 'AI diagnosis accuracy and regulatory compliance',  'Suggestions may be inaccurate or fail medical-software regulations.',                'Technical', 3, 4, 'Open',       2, NULL, '2026-10-12'),
 (6, 1, 'RSK-06', 'Integration with legacy hospital systems',         'Each hospital stores existing data differently.',                                    'Technical', 3, 4, 'Open',       3, 23,   '2026-09-21'),
 (7, 1, 'RSK-07', 'Budget overrun from rework',                       'Rework and added scope push cost above the approved budget.',                         'Cost',      4, 4, 'Mitigating', 1, NULL, '2026-10-12'),
 (8, 1, 'RSK-08', 'Staff resistance to the new system',               'Doctors and receptionists may not adopt the system quickly.',                        'People',    3, 3, 'Open',       1, 24,   '2026-09-12');

-- PDPC rows: step (task) -> potential problem -> countermeasure
INSERT INTO risk_responses (risk_id, task_id, potential_problem, response_type, action, owner_id, status) VALUES
 (1, 2,  'New requirements are requested without approval',            'Preventive', 'Enforce change control: no work starts on a requirement that is not Approved',                     1, 'Done'),
 (1, 2,  'Approved changes push the schedule and budget',              'Corrective', 'Re-baseline budget and deadline through an approved change request',                               1, 'In Progress'),
 (2, 10, 'Race condition lets two users book the same slot',           'Preventive', 'Add unique slot constraint and transaction locking; run daily regression tests',                   3, 'In Progress'),
 (2, 10, 'Defect fixing delays dependent billing and UI tasks',        'Corrective', 'Assign second backend developer to scheduling fixes; defer low-priority UI polish',                2, 'Planned'),
 (3, 8,  'Search leaks records across hospitals',                      'Preventive', 'Apply hospital-id filter at the query layer; add automated access tests',                          6, 'In Progress'),
 (3, 8,  'A data exposure occurs after go-live',                       'Corrective', 'Invoke incident response plan; notify hospitals and lock affected accounts',                       1, 'Planned'),
 (4, 9,  'A backend developer is unavailable during a critical task',  'Corrective', 'Reassign the task to the other backend developer; pair-programming handover',                      1, 'Planned'),
 (5, NULL,'AI suggestions are clinically unsafe',                      'Preventive', 'Clinical validation with the Chief Medical Officer before release',                                2, 'Planned'),
 (5, NULL,'Regulator rejects the AI module',                           'Corrective', 'Release as a clinician-assist feature behind a feature flag that can be disabled',                 2, 'Planned'),
 (6, 23, 'Legacy data cannot be imported at go-live',                  'Preventive', 'Run an early interface spike with each hospital IT team',                                          3, 'Planned'),
 (6, 23, 'Import fails during deployment',                             'Corrective', 'Fallback to CSV import with manual verification',                                                  3, 'Planned'),
 (7, 13, 'Actual cost grows faster than earned value',                 'Preventive', 'Review EVM weekly; stop work when CPI < 0.85 until the cause is fixed',                            1, 'In Progress'),
 (8, 24, 'Staff do not attend training',                               'Preventive', 'Schedule role-based training sessions at each hospital with management support',                   1, 'Planned'),
 (8, 23, 'Staff struggle during the first weeks of go-live',           'Corrective', 'Provide on-site support at each hospital for the first two weeks',                                 3, 'Planned');

-- ---------------------------------------------------------------- Decide CR-002 (rejected): demonstrates the rejection path
UPDATE change_requests
   SET status = 'Rejected', decision_by = 'Hospital Management Board', decision_date = '2026-10-14',
       decision_notes = 'Out of scope for the 16-week plan; revisit in a later phase.'
 WHERE id = 2;

COMMIT;
