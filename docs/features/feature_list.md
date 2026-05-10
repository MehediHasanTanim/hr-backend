# HR Management Software — Production-Grade Feature List

**Stack:** Node.js · TypeScript · PostgreSQL 15+ · Prisma ORM  
**Architecture:** Multi-tenant (company-per-tenant), REST API-first, JWT + SSO auth  
**Phases:** `[V1]` = MVP (months 1–4) · `[V2]` = Full release (months 5–10)

---

## Module 1 — HR Core Engine `[V1]`

### Employee Master Data
- Employee profiles: personal info, contact details, emergency contacts, employment details
- Custom fields per employee type (full-time, contractor, intern, part-time)
- Profile photo upload and avatar management
- Sensitive field encryption at app layer (national ID, passport, bank account number)
- Bulk employee import via CSV with async job processing and error reporting
- Employee self-service profile updates

### Employment Lifecycle
- Hire → Transfer → Promotion → Demotion → Exit event tracking
- Append-only employment history log with full audit trail
- Probation period tracking with confirmation date management
- Notice period configuration per employee
- Termination workflow with last working date, exit type, and reason recording
- Effective-dated changes (promotions, transfers apply on future dates)

### Organization Management
- Hierarchical department tree (self-referencing, unlimited depth)
- Department head assignment
- Cost center and location tagging per department
- Job titles with level classification (junior / mid / senior / lead)
- Pay grades with salary band (min/max) per currency
- Reporting line management: direct line + dotted-line manager
- Headcount tracking per department and location

### Org Chart
- Full company org tree with drill-down
- Subtree view rooted at any employee
- Headcount overlays and vacancy indicators

### Role-Based Access Control (RBAC)
- Four system roles out of the box: Admin, HR Manager, Manager, Employee
- Custom role creation with granular permission assignment
- Permission model: resource + action + scope (company / department / self)
- Per-user role assignment with multi-role support

### Authentication & SSO
- Email + password login with bcrypt hashing
- SSO via Google Workspace, Azure AD, Okta (SAML/OAuth)
- JWT access tokens + refresh token rotation
- MFA via TOTP (Google Authenticator compatible)
- Password reset via email token
- Email verification on signup
- Session management: list and revoke active sessions

### Audit & Compliance
- Full audit log on every create / update / delete with actor, timestamp, before/after diff
- Partitioned audit log table for performance at scale
- Audit log export to CSV

---

## Module 2 — Leave & Attendance `[V1]`

### Leave Policies
- Configurable leave types: annual, sick, casual, unpaid, maternity, paternity, comp-off, bereavement
- Accrual engine: annual, monthly, or no-accrual rules
- Carry-forward limits and year-end lapse policies
- Maximum balance caps per leave type
- Leave encashment configuration
- Document requirement flag per leave type
- Minimum advance notice days enforcement
- Half-day leave support (morning / afternoon session)

### Holiday Calendars
- Multiple calendars per company (by location or entity)
- Holiday types: public, optional, restricted
- Year-based calendar management

### Leave Balances
- Per-employee, per-year balance ledger (opening + accrued + adjusted − used)
- Manual HR adjustment with reason and audit trail
- Balance history across years
- Carry-forward computation at year rollover

### Leave Requests & Approvals
- Employee self-service: apply, view, cancel
- Multi-level approval workflow (employee → manager → HR)
- Half-day and hourly leave support
- Backdating controls with override audit
- Team leave calendar with conflict detection
- Bulk approval for managers
- Automated notifications at every workflow step

### Attendance Tracking `[V1 core]`
- Web-based clock-in / clock-out with IP capture
- Daily attendance status: present, absent, late, half-day, on leave
- Manual correction by HR with reason and approval
- Monthly attendance summary reports
- Late and missing-punch exception reports

### Shifts & Scheduling `[V2]`
- Shift definition: name, start/end time, break duration, night-shift flag
- Employee shift assignment with effective date range
- Weekly schedule grid view for managers
- Shift swap requests and approval workflow
- Mobile geo-fenced punch-in / punch-out
- Biometric device integration (ZKTeco, Anviz)
- Overtime detection and manager approval

---

## Module 3 — Payroll `[V1 core + V2 full]`

### Salary Structure `[V1]`
- Flexible salary component builder: earnings, deductions, benefits
- Component calculation modes: fixed amount, percentage of another component, formula expression
- Salary structures (component bundles) with sequencing
- Per-employee salary assignment with effective dating and history
- Per-employee component override on a salary record
- Salary revision workflow with manager / HR approval

### Payroll Processing `[V1]`
- Monthly / bi-weekly / weekly pay cycle support
- Async payroll computation engine with pre-run validation checklist
- Loss-of-pay (LOP) calculation from attendance data
- Statutory deductions: income tax, PF, ESI — configurable by jurisdiction
- Component-level payroll entry with override support
- Payroll cycle statuses: draft → processing → approved → disbursed
- Payroll reversal with reason and audit trail

### Payslips `[V1]`
- Branded PDF payslip generation per employee per cycle
- Bulk async payslip generation for a full cycle
- Payslip email distribution to all employees
- Employee self-service payslip download (all historical)

### Bank Disbursement `[V1]`
- Bank transfer file export (ACH / NEFT / configurable format)
- Per-employee primary bank account with encrypted account number
- Disbursement status tracking per entry

### Tax Declarations `[V2]`
- Employee tax declaration portal per financial year
- Tax regime selection (configurable per jurisdiction)
- HR verification and approval of declarations
- Year-end tax form generation (Form 16 / W-2 / jurisdiction-configurable)

### Expense Reimbursement `[V2]`
- Expense category library with per-category amount limits
- Employee claim submission with receipt upload
- Multi-level approval workflow (employee → manager → finance)
- Reimbursement merged into payroll cycle or standalone payment
- Expense report by category, department, and employee

### Salary Advances `[V2]`
- Employee advance request with reason
- HR approval with configurable recovery months
- Auto-recovery tracking against subsequent payroll runs

---

## Module 4 — Documents & Compliance `[V1]`

### Document Vault
- Per-employee document store: offer letters, NDAs, ID proofs, contracts, certificates
- Document type classification and version tracking
- Expiry date tracking with renewal alerts
- Role-based document access control
- Bulk document download

### Policy Management
- Company policy library with version control
- Mandatory read-and-acknowledge workflow with deadline
- Policy change broadcast notifications
- Acknowledgement audit report: who read, when, which version
- Soft delete with version history preservation

### eSign
- Built-in eSign for HR documents (no DocuSign dependency in V1)
- SHA-256 file hash for tamper-proof signed document archive
- DocuSign / Adobe Sign integration hooks for V2
- Sign request expiry management

### GDPR & Data Privacy
- Data export on employee request
- Role-based data visibility controls
- Retention policy configuration
- Right-to-erasure workflow (V2)

---

## Module 5 — ESS / MSS Portal `[V1]`

### Employee Self-Service
- View and update personal profile
- View payslips and download PDF (all historical)
- View leave balances and apply for leave
- Track leave request status
- View team leave calendar
- Acknowledge policy documents
- Download HR letters (experience, salary, employment proof)
- Access onboarding task checklist (V2)
- View training assignments and course catalog (V2)
- Benefits enrollment portal (V2)

### Manager Self-Service
- Team leave calendar with pending approval queue
- Approve / reject leave, attendance corrections, expenses
- View team attendance exceptions and summaries
- Team headcount and profile quick-access
- Performance review submission and goal tracking (V2)
- Training completion status for team (V2)

### Notifications & Workflow Engine
- In-app notification inbox with unread badge count
- Email notifications with customizable templates
- Push notifications (mobile, V2)
- Configurable escalation rules for overdue approvals
- Approval delegation when approver is on leave

---

## Module 6 — Basic Reporting `[V1]`

### Pre-built Reports
- Headcount by department, location, employment type, status
- Monthly attrition rate report
- Payroll summary per cycle (gross, deductions, net)
- Leave utilization by type, department, employee
- Attendance summary (present days, late, absent, LOP) per month
- New hire report for date range
- Employee exit report for date range

### Report Delivery
- Report export to Excel (.xlsx) and PDF
- Scheduled report delivery via email (daily / weekly / monthly)
- Date-range and department filters on all reports

---

## Module 7 — Recruitment & ATS `[V2]`

### Job Requisitions
- Job requisition with approval chain (manager → HR → finance)
- Headcount tracking per requisition
- Salary band and job type specification
- Priority levels: low / normal / high / urgent
- Requisition status flow: draft → open → on_hold → filled → cancelled
- Target fill date tracking

### Careers Page
- Hosted branded careers page (custom domain, logo, colors)
- Public job listing with apply form
- Application submission by external candidates (no login required)

### Applicant Tracking Pipeline
- Kanban pipeline: Applied → Screening → Interview → Offer → Hired
- AI-powered resume parsing with auto-population of candidate profile
- Candidate tagging, scoring rubrics, and shortlisting
- Duplicate candidate detection and merging
- Bulk candidate import from CSV
- Source-of-hire tracking (LinkedIn, Indeed, referral, careers page)
- Candidate portal for status tracking

### Interviews
- Interview panel scheduling with round tracking
- Calendar sync (Google, Outlook)
- Per-interviewer structured scorecard submission
- Anonymous peer feedback support
- Meeting link integration (Zoom, Teams, Google Meet)
- Interview recommendations: strong_hire / hire / hold / no_hire
- Interviewer schedule view

### Offers & Pre-Onboarding
- Offer letter generation from templates with built-in eSign
- Offer approval workflow with compensation benchmarking view
- Offer status tracking: draft → sent → accepted / declined / expired
- Background check trigger integration
- Pre-boarding portal: document collection before day 1

### Onboarding
- Onboarding task checklist builder (IT setup, legal, HR, buddy assignment)
- Task assignment by role (employee / manager / HR / IT)
- Due date offset from hire date (e.g. Day 1, Day 7, Day 30)
- Automated welcome email sequences
- Digital document signing (NDA, offer letter, policy acknowledgement)
- New hire 30/60/90-day journey tracker
- Pulse surveys at onboarding milestones

---

## Module 8 — Performance Management `[V2]`

### Review Cycles
- Configurable appraisal cycles: annual, bi-annual, quarterly, continuous
- Cycle statuses: draft → active → reviewing → calibrating → closed
- Per-cycle deadlines for self-review, manager review, and calibration
- Bulk reminder emails to pending reviewers

### Review Templates
- Configurable sections and questions per template
- Question types: text, rating, multiple choice, ranking
- Weighted question scoring
- Configurable rating scales with behavioral anchors

### Goal Setting & OKRs
- OKR alignment tree: company → department → individual
- Goal types: company, department, individual
- Weighted goals with progress tracking
- Mid-cycle check-in posts with progress value updates
- Goal status: active / completed / cancelled
- Parent–child goal linking for alignment visibility

### Appraisal Workflow
- Multi-step review: self → peer → manager → calibration → HR
- 360° feedback with anonymous peer and subordinate reviews
- Calibration view with forced distribution overlay
- HR override of final rating post-calibration
- Employee acknowledgement of final rating

### Continuous Feedback
- Anytime praise / constructive feedback with visibility controls
- Feedback tagging for skill and competency mapping
- 1:1 meeting notes with action item tracker
- Meeting history and action item follow-up

### Performance Improvement Plans (PIP)
- PIP initiation with documented cause, objectives, and timeline
- Milestone check-in tracking with on_track / at_risk / off_track status
- HR oversight and co-signer on PIP records
- Outcome recording: closed successfully / extended / exit

---

## Module 9 — Learning & Development `[V2]`

### Course Management
- Course builder: video, SCORM, PDF, quiz, mixed content types
- Course catalog with category and skill-tag taxonomy
- Internal and third-party course integration (Coursera, LinkedIn Learning via LTI/API)
- Course version control and deprecation
- Passing score configuration per course

### Learning Paths
- Curated learning journeys per role, department, or career goal
- Required vs. optional course designation within a path
- Sequenced course ordering

### Training Assignments
- Mandatory training assignment with deadlines and escalation
- Bulk assignment by department or role
- Completion tracking dashboard for managers and HR
- Automated reminders and manager visibility into team progress

### Certifications & Compliance Training
- Company certification registry with expiry tracking
- Renewal reminders and escalation to manager/HR
- Compliance training (POSH, Safety, Data Privacy) with annual reset
- Compliance training audit report

### Skills Matrix
- Company-wide skills taxonomy builder with categories
- Self-assessed + manager-validated proficiency levels (1–5 scale)
- Gap analysis: role requirements vs. current proficiency
- Skills heatmap across teams and departments
- Skill tagging on courses for learning recommendation

---

## Module 10 — Benefits & Compensation `[V2]`

### Benefits Administration
- Benefits catalog: health, dental, vision, life insurance, wellness, retirement
- Flexible Benefits Plan (FBP / cafeteria plan) with annual declaration
- Enrollment windows with employee self-service selection
- Dependent management (spouse, children) with document upload
- Benefits claims portal with insurer integration or manual tracking

### Compensation Management
- Salary bands and pay equity analysis dashboard
- Total compensation statement (salary + benefits + equity + bonus)
- Compensation benchmarking import (Radford, Mercer, or custom CSV)
- Merit increase cycle: budget pool allocation → manager input → HR approval

### Equity & ESOP
- Stock option / RSU / phantom equity grant tracking
- Grant date, cliff, and vesting schedule management
- Vested shares tracking
- Grant status lifecycle (active / exercised / cancelled)

### Bonus Management
- Bonus cycle: planning → open → approved → disbursed
- Department budget pool allocation
- Target percentage and performance-linked payout calculation
- Manager input with HR approval
- Bonus disbursement via payroll cycle merge

---

## Module 11 — Analytics & Reporting `[V2]`

### Custom Report Builder
- Drag-and-drop field selector across all HR modules
- Cross-module data joins (e.g. performance vs. compensation)
- Filters, grouping, and sorting on any field
- Saved report library with sharing controls
- Scheduled report delivery (daily / weekly / monthly) to email recipients
- Export to Excel and PDF via async job

### Executive Dashboards
- Real-time HR scorecard: headcount, attrition rate, open positions, avg. tenure
- Workforce demographics: age, gender, department distribution
- Payroll trend charts (monthly gross / net over 12 months)
- Leave liability balance (outstanding leave days × daily salary)
- Recruitment funnel metrics: time-to-hire, offer acceptance rate, source-of-hire

### People Analytics
- Attrition risk score per employee (rule-based signals: tenure, engagement, performance, absences)
- Engagement index from pulse surveys and sentiment scoring
- Diversity & inclusion metrics dashboard
- Compensation equity gap analysis (gender pay gap, grade parity)

---

## Module 12 — Surveys & Engagement `[V2]`

- Survey builder with question types: text, rating, multiple choice, boolean
- Survey types: pulse, onboarding, exit, custom
- Anonymous survey support (employee ID not stored with response)
- Bulk assignment to employees with sent-at and reminded-at tracking
- Survey launch and close lifecycle management
- Aggregated results view for HR (anonymous mode)
- Scheduled pulse surveys (weekly / bi-weekly)

---

## Module 13 — Offboarding `[V2]`

- Resignation / exit request submission by employee or HR
- Exit types: voluntary, involuntary, retirement
- Last working date and notice period calculation
- Notice waiver with approval workflow
- Exit interview scheduling and response collection
- Exit checklist builder by category (IT, finance, HR, access revocation)
- Checklist task assignment to relevant teams
- Final settlement trigger to payroll

---

## Module 14 — Integrations & API `[V2]`

### Public REST API
- Full REST API with OpenAPI 3.0 specification
- API key management with scope-based access control
- Key prefix display (full key shown only once on creation)
- Rate limiting per API key

### Webhooks
- Webhook registration with HMAC secret signing
- Event-based subscription (employee.created, payroll.run, review.completed, etc.)
- Delivery log with status, response code, and latency
- Automatic retry with exponential backoff on failure
- Test ping endpoint for webhook validation

### Third-Party Integrations
- Slack / Microsoft Teams notifications for approval actions
- Accounting software export (QuickBooks, Xero, Tally-compatible format)
- Calendar sync (Google Workspace, Outlook) for interview scheduling
- Biometric device integration for attendance (ZKTeco, Anviz)
- Job board publishing (LinkedIn, Indeed via API)

### Background Jobs
- Queue-based async processing for: payroll runs, payslip generation, report exports, bulk imports, email dispatch
- Job status polling endpoint
- Configurable retry attempts with error logging

---

## V1 MVP — Months 1–4

The minimum system that lets a company legally employ and pay people.

| Module | Scope in V1 |
|---|---|
| HR Core Engine | Full: profiles, org chart, RBAC, SSO, audit log, bulk import |
| Leave & Attendance | Leave types, balances, requests/approvals, holiday calendar, web clock-in |
| Payroll | Salary components, structures, employee salary, payroll cycle, payslips, bank file export |
| ESS / MSS Portal | Payslips, leave apply/view, policy acknowledgement, approval queue |
| Documents & Compliance | Document vault, eSign, policy library, audit log |
| Basic Reporting | 7 pre-built reports, Excel/PDF export, scheduled delivery |

**V1 technical targets:**
- Multi-tenant architecture from day one (company_id isolation on every table)
- JWT + refresh token auth, SSO, MFA-ready
- REST API with OpenAPI spec
- S3-compatible file storage
- Background job queue for async tasks
- Structured logging and error alerting

---

## V2 Full Release — Months 5–10

| Module | Status |
|---|---|
| Recruitment & ATS | New — full pipeline, careers page, interviews, offers, onboarding |
| Performance Management | New — OKRs, appraisals, 360°, PIP, 1:1s |
| Learning & Development | New — LMS, courses, learning paths, skills matrix, certifications |
| Benefits & Compensation | New — benefits enrollment, bonus cycles, equity grants |
| Advanced Analytics | New — custom report builder, dashboards, attrition risk scoring |
| Surveys & Engagement | New — pulse surveys, onboarding/exit surveys |
| Offboarding | New — exit requests, exit interviews, checklist management |
| Payroll (upgraded) | Auto-tax computation, year-end forms, expense reimbursement, salary advances |
| Attendance (upgraded) | Shifts, shift scheduling, geo-fenced mobile punch, biometric integration |
| Integrations & API | New — webhooks, public API, Slack/Teams, job board, accounting exports |
| Native Mobile App | iOS + Android (replaces V1 PWA) |

---

## Cross-Cutting Technical Requirements

| Concern | Approach |
|---|---|
| Multi-tenancy | Row-level isolation via `company_id` on every table |
| Authentication | JWT + refresh tokens, SSO/SAML, MFA (TOTP) |
| API | REST with OpenAPI 3.0 spec |
| Events | Webhook emission on all major HR events |
| Localization | i18n UI, multi-currency, multi-timezone, configurable date formats |
| File storage | S3-compatible with signed URLs and per-file ACL |
| Async processing | Queue-based jobs (payroll compute, report export, email dispatch) |
| Observability | Structured logging, metrics, distributed tracing |
| Data security | Encryption at rest + in transit; field-level encryption for PII (national ID, bank account) |
| Soft deletes | `deleted_at` on all major tables — no hard deletes on HR data |
| Audit | Append-only partitioned audit log table on all state changes |

---

*Total modules: 14 · V1 tables: 37 · V2 tables: 39 · Total DB tables: 76 · Total API endpoints: ~389*
