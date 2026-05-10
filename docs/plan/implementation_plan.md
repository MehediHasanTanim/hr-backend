# HR Management System — Technical Implementation Plan

**Framework:** NestJS 11 (Fastify adapter) · TypeScript · PostgreSQL 15 · Prisma ORM  
**Architecture:** Modular Monolith · RBAC · Multi-tenant  
**Phases:** V1 MVP (Months 1–4) · V2 Full Release (Months 5–10)  
**Methodology:** 2-week sprints · TDD encouraged · PR gates enforced

---

## Reading guide

Each task is tagged with:
- **[BE]** Backend · **[FE]** Frontend · **[TEST]** Testing · **[AUDIT]** Audit log
- **Priority:** `P0` must ship · `P1` should ship · `P2` nice to have in phase
- **Effort:** `S` = 0.5–1 day · `M` = 1–3 days · `L` = 3–5 days · `XL` = 5+ days

---

## Phase 0 — Foundation (Week 1–2, pre-sprint)

These tasks must be complete before any feature work begins. They form the skeleton everything else attaches to.

### 0.1 Repository & tooling setup

| # | Task | Tag | Priority | Effort |
|---|---|---|---|---|
| 0.1.1 | Create monorepo structure: `apps/api`, `apps/worker`, `libs/shared`, `libs/prisma` | [BE] | P0 | S |
| 0.1.2 | Configure TypeScript strict mode, path aliases (`@hr/*`), `tsconfig.base.json` | [BE] | P0 | S |
| 0.1.3 | Set up ESLint (Airbnb + NestJS rules), Prettier, `.editorconfig` | [BE] | P0 | S |
| 0.1.4 | Configure Vitest with coverage thresholds (services ≥90%, utils ≥95%) | [TEST] | P0 | S |
| 0.1.5 | Set up Husky pre-commit hooks: lint, type-check, unit tests | [BE] | P0 | S |
| 0.1.6 | Create Docker Compose local dev: PostgreSQL 15, Redis 7, Minio, Mailhog | [BE] | P0 | M |
| 0.1.7 | Configure GitHub Actions CI pipeline: lint → type-check → unit tests → build | [BE] | P0 | M |
| 0.1.8 | Set up Trufflehog secret scanning in CI pre-commit | [BE] | P0 | S |

### 0.2 NestJS application bootstrap

| # | Task | Tag | Priority | Effort |
|---|---|---|---|---|
| 0.2.1 | Bootstrap NestJS app with Fastify adapter (`NestFastifyApplication`) | [BE] | P0 | S |
| 0.2.2 | Configure global exception filter — maps domain errors to HTTP responses | [BE] | P0 | M |
| 0.2.3 | Configure global Zod validation pipe — rejects invalid request bodies early | [BE] | P0 | S |
| 0.2.4 | Configure global response serialization interceptor — strips internal fields | [BE] | P0 | S |
| 0.2.5 | Set up `@nestjs/swagger` with Fastify plugin — auto-generate OpenAPI spec | [BE] | P0 | M |
| 0.2.6 | Configure `@nestjs/config` with Joi schema validation for all env vars | [BE] | P0 | S |
| 0.2.7 | Set up `pino` structured logger with `nestjs-pino` — inject `traceId`, `companyId`, `userId` on every log | [BE] | P0 | M |
| 0.2.8 | Configure OpenTelemetry SDK — auto-instrument HTTP, Prisma, Redis spans | [BE] | P1 | M |

### 0.3 Database & Prisma setup

| # | Task | Tag | Priority | Effort |
|---|---|---|---|---|
| 0.3.1 | Add Prisma schema (`schema.prisma`) with all 76 models and enums | [BE] | P0 | L |
| 0.3.2 | Run `prisma migrate dev` — create initial migration with all tables and indexes | [BE] | P0 | S |
| 0.3.3 | Build Prisma multi-tenant extension: `withTenantScope(companyId)` that appends `WHERE company_id = ? AND deleted_at IS NULL` to all queries | [BE] | P0 | M |
| 0.3.4 | Build `PrismaModule` as a global NestJS module — exports scoped and unscoped clients | [BE] | P0 | S |
| 0.3.5 | Create database seed script: `seed_company_defaults()` — 4 roles, leave types, salary components | [BE] | P0 | M |
| 0.3.6 | Set up `prisma-soft-delete-middleware` extension — auto-filter `deleted_at` | [BE] | P0 | S |
| 0.3.7 | Write unit tests for tenant scope extension — verify `company_id` injected on all query types | [TEST] | P0 | M |

### 0.4 Frontend project bootstrap

| # | Task | Tag | Priority | Effort |
|---|---|---|---|---|
| 0.4.1 | Bootstrap Next.js 14 app with App Router, TypeScript strict mode | [FE] | P0 | S |
| 0.4.2 | Configure Tailwind CSS, design tokens, and global component styles | [FE] | P0 | M |
| 0.4.3 | Set up shadcn/ui as base component library | [FE] | P0 | S |
| 0.4.4 | Configure TanStack Query v5 for server state management | [FE] | P0 | S |
| 0.4.5 | Set up Zustand for client-only UI state (sidebar, modals, toasts) | [FE] | P0 | S |
| 0.4.6 | Create typed API client layer using `axios` + auto-generated types from OpenAPI spec | [FE] | P0 | M |
| 0.4.7 | Configure React Hook Form + Zod for all form validation | [FE] | P0 | S |
| 0.4.8 | Set up Vitest + React Testing Library for frontend unit tests | [TEST] | P0 | S |
| 0.4.9 | Set up Playwright with staging environment configuration | [TEST] | P0 | M |

---

## Phase 1 — V1 MVP (Months 1–4)

**Goal:** The minimum system to legally employ and pay people. Ship 6 modules: Auth, HR Core, Leave & Attendance, Payroll, Documents & Compliance, ESS/MSS Portal.

---

### Sprint 1 (Weeks 3–4): Auth & Company Setup

#### Sprint 1 Backend

| # | Task | Tag | Priority | Effort |
|---|---|---|---|---|
| 1.1.1 | `AuthModule` — implement `POST /auth/register`: create company + seed defaults + create admin user | [BE] | P0 | M |
| 1.1.2 | `AuthModule` — implement `POST /auth/login`: Argon2 verify → sign JWT (RS256, 15 min) → issue refresh token (7 days, stored as SHA-256 hash in Redis) | [BE] | P0 | M |
| 1.1.3 | `AuthModule` — implement refresh token rotation: verify hash → revoke old → issue new pair | [BE] | P0 | M |
| 1.1.4 | `AuthModule` — implement `POST /auth/forgot-password` and `POST /auth/reset-password` with 1-hour expiry token | [BE] | P0 | M |
| 1.1.5 | `AuthModule` — implement `POST /auth/verify-email` with 24-hour OTP | [BE] | P0 | S |
| 1.1.6 | Build `JwtAuthGuard` — NestJS guard that verifies JWT, injects `RequestContext` into request | [BE] | P0 | M |
| 1.1.7 | Build `PermissionsGuard` + `@Permissions()` decorator — evaluates resource/action/scope against cached RBAC rules | [BE] | P0 | L |
| 1.1.8 | Build `AuditInterceptor` — NestJS global interceptor that logs all mutating requests (POST/PATCH/PUT/DELETE) to `audit_logs` table asynchronously | [BE][AUDIT] | P0 | L |
| 1.1.9 | `CompanyModule` — `GET /company`, `PATCH /company`, `GET /company/settings`, `PUT /company/settings/:key` | [BE] | P0 | M |
| 1.1.10 | `UsersModule` — invite user, list users, update user, deactivate, user–role assignment | [BE] | P0 | M |
| 1.1.11 | `RolesModule` — CRUD for custom roles, permission assignment | [BE] | P0 | M |
| 1.1.12 | SSO `GET /auth/sso/:provider` + callback handler (Google OAuth2 as V1 target) | [BE] | P1 | L |
| 1.1.13 | Rate limiting: `@nestjs/throttler` — 100 req/min unauthenticated, 500 req/min authenticated | [BE] | P0 | S |
| 1.1.14 | CORS configuration: allowlist of origins, credentials handling | [BE] | P0 | S |

#### Sprint 1 Unit Tests

| # | Task | Tag | Priority | Effort |
|---|---|---|---|---|
| 1.1.T1 | `AuthService` unit tests: login success, wrong password → 401, unverified email → 403, expired token → 401, MFA required flag | [TEST] | P0 | M |
| 1.1.T2 | `AuthService` unit tests: refresh rotation — old token revoked, new token issued, reuse of revoked token → 401 | [TEST] | P0 | M |
| 1.1.T3 | `JwtAuthGuard` unit tests: valid token passes, missing token → 401, wrong company_id → 403 | [TEST] | P0 | M |
| 1.1.T4 | `PermissionsGuard` unit tests: Admin passes all, Employee blocked on company-scope write, Manager allowed on department-scope | [TEST] | P0 | M |
| 1.1.T5 | `AuditInterceptor` unit tests: POST creates audit log entry, GET skipped, correct actor/resource/action recorded | [TEST][AUDIT] | P0 | M |
| 1.1.T6 | Tenant scope extension unit tests: `findMany` always includes `companyId` in WHERE, cross-tenant read returns null | [TEST] | P0 | M |

#### Sprint 1 Frontend

| # | Task | Tag | Priority | Effort |
|---|---|---|---|---|
| 1.1.F1 | Login page: email/password form, Zod validation, error states, redirect on success | [FE] | P0 | M |
| 1.1.F2 | Company registration page: multi-step form (company details → admin user → confirmation) | [FE] | P0 | L |
| 1.1.F3 | Forgot password / reset password pages | [FE] | P0 | M |
| 1.1.F4 | Auth token storage: access token in memory, refresh token via HttpOnly cookie; auto-refresh on 401 | [FE] | P0 | M |
| 1.1.F5 | Protected route wrapper — redirects unauthenticated users to `/login` | [FE] | P0 | S |
| 1.1.F6 | App shell: sidebar nav, top bar (user avatar, company name, notifications bell), responsive layout | [FE] | P0 | L |
| 1.1.F7 | Company settings page: profile, timezone, currency, fiscal year | [FE] | P1 | M |

---

### Sprint 2 (Weeks 5–6): HR Core — Employees & Org

#### Sprint 2 Backend

| # | Task | Tag | Priority | Effort |
|---|---|---|---|---|
| 1.2.1 | `EmployeeModule` — `EmployeeRepository`: `findMany` (with filters: dept, status, location, search), `findById`, `create`, `update`, `softDelete` | [BE] | P0 | L |
| 1.2.2 | `EmployeeModule` — `EmployeeService`: full lifecycle methods (`hire`, `promote`, `transfer`, `terminate`) — each emits a domain event and appends to `employment_history` | [BE] | P0 | L |
| 1.2.3 | `EmployeeModule` — REST endpoints: `GET /employees`, `POST /employees`, `GET /employees/:id`, `PATCH /employees/:id`, `DELETE /employees/:id` | [BE] | P0 | M |
| 1.2.4 | `EmployeeModule` — sub-resource endpoints: addresses, emergency contacts, bank accounts (all CRUD) | [BE] | P0 | L |
| 1.2.5 | `EmployeeModule` — `GET /employees/:id/employment-history` | [BE] | P0 | S |
| 1.2.6 | Field-level encryption service: AES-256-GCM encrypt/decrypt for `national_id`, `passport_number`, `account_number`, `mfa_secret` | [BE] | P0 | M |
| 1.2.7 | `BulkImportModule` — CSV import with async job: parse → validate → create employees → return errors per row | [BE] | P1 | L |
| 1.2.8 | `OrgModule` — Locations CRUD, Departments tree CRUD, JobTitles CRUD, PayGrades CRUD | [BE] | P0 | M |
| 1.2.9 | `OrgModule` — `GET /org-chart` — recursive CTE query returning full employee tree | [BE] | P0 | M |
| 1.2.10 | Audit log entries on all employee mutations: hire, promote, transfer, terminate | [BE][AUDIT] | P0 | S |
| 1.2.11 | Domain event `employee.hired` → triggers: welcome email queued, onboarding task queue (V2 stub) | [BE] | P0 | S |
| 1.2.12 | Domain event `employee.terminated` → triggers: `last_working_date` set, access revocation job queued | [BE][AUDIT] | P0 | S |

#### Sprint 2 Unit Tests

| # | Task | Tag | Priority | Effort |
|---|---|---|---|---|
| 1.2.T1 | `EmployeeService.hire` unit tests: valid input creates employee + employment_history + emits event; duplicate employee_number → conflict error | [TEST] | P0 | M |
| 1.2.T2 | `EmployeeService.promote` unit tests: new history row created with correct event_type; effective date in past allowed with audit; invalid grade → validation error | [TEST] | P0 | M |
| 1.2.T3 | `EmployeeService.terminate` unit tests: `last_working_date` set, status = terminated, domain event emitted, re-terminating active block | [TEST] | P0 | M |
| 1.2.T4 | `EmployeeRepository` unit tests: `findMany` always scopes by `companyId`, `deletedAt IS NULL`; soft delete sets `deleted_at` not hard-deletes | [TEST] | P0 | M |
| 1.2.T5 | Encryption service unit tests: encrypt → decrypt round-trip matches; encrypted value differs from plaintext; wrong key → error | [TEST] | P0 | M |
| 1.2.T6 | Audit log entries: every service mutation method logs correct `action`, `resource`, `resourceId`, `old_values`, `new_values` | [TEST][AUDIT] | P0 | M |

#### Sprint 2 Frontend

| # | Task | Tag | Priority | Effort |
|---|---|---|---|---|
| 1.2.F1 | Employee list page: data table with column filters (dept, status, type), search, pagination, sort | [FE] | P0 | L |
| 1.2.F2 | Employee create/edit form: multi-section (personal, employment, org assignment, bank details) with Zod validation | [FE] | P0 | L |
| 1.2.F3 | Employee profile page: tabbed view (overview, documents, history, leave, payroll) | [FE] | P0 | L |
| 1.2.F4 | Employment history timeline component | [FE] | P0 | M |
| 1.2.F5 | Org chart page: tree visualization (react-d3-tree or similar), drill-down, headcount overlay | [FE] | P1 | L |
| 1.2.F6 | Department management page: tree list, add/edit/deactivate | [FE] | P0 | M |
| 1.2.F7 | CSV bulk import: file upload, job status polling, error table with row-level feedback | [FE] | P1 | L |
| 1.2.F8 | Frontend unit tests: EmployeeForm validation (required fields, invalid email, phone format), EmployeeTable filtering | [TEST] | P0 | M |

---

### Sprint 3 (Weeks 7–8): Leave & Attendance

#### Sprint 3 Backend

| # | Task | Tag | Priority | Effort |
|---|---|---|---|---|
| 1.3.1 | `LeaveModule` — `LeaveTypeService`: CRUD, accrual rule validation | [BE] | P0 | M |
| 1.3.2 | `LeaveModule` — `LeaveAccrualEngine`: computes credits per employee per leave type for a given month/year; handles pro-rated accrual for mid-year hires, carry-forward cap, year-end lapse | [BE] | P0 | XL |
| 1.3.3 | `LeaveModule` — `LeaveRequestService.apply`: validate balance, check holiday conflicts, check team capacity, create request, emit `leave.requested` event | [BE] | P0 | L |
| 1.3.4 | `LeaveModule` — `LeaveRequestService.approve/reject`: transition state machine, update `used_days` in balance, emit event | [BE] | P0 | M |
| 1.3.5 | `LeaveModule` — `GET /leave/calendar` — team leave calendar for date range, joined with holiday calendar | [BE] | P0 | M |
| 1.3.6 | `HolidayModule` — Holiday calendar CRUD, holiday CRUD per calendar | [BE] | P0 | M |
| 1.3.7 | `AttendanceModule` — `POST /attendance/clock-in`, `POST /attendance/clock-out`: record with source, IP, coordinates | [BE] | P0 | M |
| 1.3.8 | `AttendanceModule` — `GET /attendance/exceptions`: late/absent/missing-punch report for a date range | [BE] | P0 | M |
| 1.3.9 | `AttendanceModule` — `PATCH /attendance/:id/correct`: HR manual correction with reason, sets `source = manual`, requires approval | [BE] | P0 | M |
| 1.3.10 | `SchedulerModule` — `@nestjs/schedule` cron job: runs `LeaveAccrualEngine` on 1st of each month at 00:05 UTC for all active companies | [BE] | P0 | M |
| 1.3.11 | Audit log: leave request created/approved/rejected; attendance corrected | [BE][AUDIT] | P0 | S |

#### Sprint 3 Unit Tests

| # | Task | Tag | Priority | Effort |
|---|---|---|---|---|
| 1.3.T1 | `LeaveAccrualEngine` unit tests: annual = full credit at year start; monthly = 1/12 per month; mid-year hire gets prorated days; carry-forward capped at policy limit; lapse-all at year end | [TEST] | P0 | L |
| 1.3.T2 | `LeaveRequestService.apply` unit tests: insufficient balance → `InsufficientBalanceError`; holiday conflict → `HolidayConflictError`; valid request → pending status + event emitted | [TEST] | P0 | M |
| 1.3.T3 | `LeaveBalance` closing_days invariant test: `opening + accrued + adjusted - used` always equals closing; balance never goes negative | [TEST] | P0 | M |
| 1.3.T4 | Approval workflow state machine: `pending → approved` valid; `approved → approved` throws; `rejected → approved` throws; cancelled request cannot be approved | [TEST] | P0 | M |
| 1.3.T5 | `AttendanceService` unit tests: clock-out before clock-in → validation error; double clock-in same day → conflict error | [TEST] | P0 | M |

#### Sprint 3 Frontend

| # | Task | Tag | Priority | Effort |
|---|---|---|---|---|
| 1.3.F1 | Leave request form: leave type dropdown, date range picker, half-day toggle, reason field | [FE] | P0 | M |
| 1.3.F2 | Leave balance widget: per-type balance cards showing closing days, accrued, used | [FE] | P0 | M |
| 1.3.F3 | Team leave calendar: monthly view with employee leave blocks, holiday markers, conflict highlighting | [FE] | P0 | L |
| 1.3.F4 | Leave approval queue (manager view): pending requests with approve/reject + remarks | [FE] | P0 | M |
| 1.3.F5 | Attendance dashboard: daily status grid per employee, late/absent badges, missing punch alerts | [FE] | P0 | L |
| 1.3.F6 | Holiday calendar management: year selector, add/edit/delete holidays per location | [FE] | P0 | M |
| 1.3.F7 | Leave type configuration page: create/edit leave types with policy fields | [FE] | P0 | M |
| 1.3.F8 | Frontend unit tests: LeaveRequestForm date validation (end before start → error), balance display with zero/negative values | [TEST] | P0 | M |

---

### Sprint 4 (Weeks 9–10): Payroll Core

#### Sprint 4 Backend

| # | Task | Tag | Priority | Effort |
|---|---|---|---|---|
| 1.4.1 | `PayrollModule` — `SalaryComponentService` and `SalaryStructureService`: CRUD, component formula validation | [BE] | P0 | M |
| 1.4.2 | `PayrollModule` — `EmployeeSalaryService`: salary assignment, revision with effective dating, current salary lookup | [BE] | P0 | M |
| 1.4.3 | `PayrollModule` — `PayrollEngine`: core computation engine — given a cycle, computes gross/deductions/net for every active employee using their salary structure, LOP from attendance, and component formulas | [BE] | P0 | XL |
| 1.4.4 | `PayrollModule` — `PayrollCycleService`: create cycle, `runCycle` (enqueues async job), approve, disburse, reverse | [BE] | P0 | L |
| 1.4.5 | `PayrollWorker` — `@nestjs/bullmq` processor on `payroll_run` queue: calls `PayrollEngine`, writes all entries + components to DB, updates cycle status | [BE] | P0 | L |
| 1.4.6 | `PayrollWorker` — `payslip_gen` processor: for each entry, render PDF via `pdfmake` with company branding; upload to S3; store `payslips` record | [BE] | P0 | L |
| 1.4.7 | `PayrollModule` — `GET /payroll/cycles/:id/bank-file`: generate NEFT/ACH CSV from approved entries | [BE] | P0 | M |
| 1.4.8 | `PayrollModule` — `GET /payslips` and `GET /payslips/:id`: employee payslip history with S3 signed URL | [BE] | P0 | M |
| 1.4.9 | Audit log: salary revision created/approved; payroll cycle run/approved/disbursed/reversed | [BE][AUDIT] | P0 | S |

#### Sprint 4 Unit Tests

| # | Task | Tag | Priority | Effort |
|---|---|---|---|---|
| 1.4.T1 | `PayrollEngine` property-based tests (fast-check): `net_pay = gross_pay - total_deductions` always; `net_pay ≥ 0`; `gross_pay = sum(earnings)`; LOP reduces paid_days proportionally | [TEST] | P0 | L |
| 1.4.T2 | `PayrollEngine` snapshot tests: standard structure (BASIC 50k, HRA 20k, TDS 7k, PF 6k) → exact component breakdown matches snapshot | [TEST] | P0 | M |
| 1.4.T3 | `PayrollEngine` edge cases: employee with zero LOP; employee with full-month LOP; part-month join; mid-cycle salary revision | [TEST] | P0 | M |
| 1.4.T4 | `PayrollCycleService` unit tests: `runCycle` only allowed from `draft` status; `approve` only from `processing` done; `reverse` only from `disbursed` | [TEST] | P0 | M |
| 1.4.T5 | `PayrollWorker` unit tests: failed DB write → job retried; payslip S3 upload failure → retry; max retries → `failed` status + HR alert emitted | [TEST] | P0 | M |
| 1.4.T6 | Salary component formula evaluator: `BASIC * 0.4` evaluates correctly; unknown variable → validation error; circular reference → error | [TEST] | P0 | M |

#### Sprint 4 Frontend

| # | Task | Tag | Priority | Effort |
|---|---|---|---|---|
| 1.4.F1 | Salary structure builder: drag-drop component ordering, amount/percentage/formula inputs, live gross preview | [FE] | P0 | L |
| 1.4.F2 | Employee salary assignment form: structure selector, CTC input, effective date, per-component override table | [FE] | P0 | M |
| 1.4.F3 | Payroll cycle management: create cycle, run button with progress indicator, entry table with per-employee gross/net/status | [FE] | P0 | L |
| 1.4.F4 | Payroll cycle approval: summary stats (total gross, total net, employee count), approve/reject flow | [FE] | P0 | M |
| 1.4.F5 | Payslip viewer: PDF embed with S3 signed URL, download button, history list | [FE] | P0 | M |
| 1.4.F6 | Salary components library page: CRUD table for earnings/deductions/benefits | [FE] | P0 | M |
| 1.4.F7 | Frontend unit tests: PayrollCycleTable status badge rendering, CTC input validation (negative → error), component formula input | [TEST] | P0 | M |

---

### Sprint 5 (Weeks 11–12): Documents, Compliance & Notifications

#### Sprint 5 Backend

| # | Task | Tag | Priority | Effort |
|---|---|---|---|---|
| 1.5.1 | `DocumentModule` — `EmployeeDocumentService`: upload (multipart via `@fastify/multipart`), categorize, versioned storage in S3, signed URL generation | [BE] | P0 | L |
| 1.5.2 | `PolicyModule` — policy CRUD, publish workflow, acknowledgement endpoint `POST /compliance/policies/:id/acknowledge` | [BE] | P0 | M |
| 1.5.3 | `EsignModule` — built-in eSign: create request, sign (store base64 signature, compute SHA-256 file hash), decline, expiry handling | [BE] | P0 | L |
| 1.5.4 | `AuditModule` — `GET /compliance/audit-logs`: paginated query with filters (user, resource, action, date range) | [BE] | P0 | M |
| 1.5.5 | `AuditModule` — `GET /compliance/audit-logs/export`: async CSV export job → S3 → signed URL | [BE] | P0 | M |
| 1.5.6 | `NotificationModule` — `@nestjs/bullmq` `email_dispatch` processor: render template → SendGrid/SES send; in-app notification insert | [BE] | P0 | L |
| 1.5.7 | `NotificationModule` — `GET /notifications`, `PATCH /notifications/:id/read`, `POST /notifications/read-all` | [BE] | P0 | M |
| 1.5.8 | Wire domain events to notification triggers: `leave.requested` → notify manager; `leave.approved` → notify employee; `payslip.ready` → notify employee | [BE] | P0 | M |
| 1.5.9 | Audit log: policy published, document uploaded, eSign request created/signed/declined | [BE][AUDIT] | P0 | S |

#### Sprint 5 Unit Tests

| # | Task | Tag | Priority | Effort |
|---|---|---|---|---|
| 1.5.T1 | `EsignService` unit tests: SHA-256 hash changes when file is modified; signed document hash stored correctly; declining creates declined status; expired request rejects signing attempt | [TEST] | P0 | M |
| 1.5.T2 | `PolicyService` unit tests: unpublished policy not visible to employees; acknowledgement recorded once per employee per policy version; mandatory policy acknowledgement count accurate | [TEST] | P0 | M |
| 1.5.T3 | `NotificationService` unit tests: template variable substitution renders correctly; missing variable → error; inactive template → no send; correct channel selected per code | [TEST] | P0 | M |
| 1.5.T4 | `AuditService` unit tests: async log write doesn't block request; all required fields present (actor, action, resource, timestamps); PII fields excluded from `new_values` | [TEST][AUDIT] | P0 | M |

#### Sprint 5 Frontend

| # | Task | Tag | Priority | Effort |
|---|---|---|---|---|
| 1.5.F1 | Employee document vault: file upload dropzone, category selector, document list with type icons, download/delete | [FE] | P0 | L |
| 1.5.F2 | Policy library page: list with status badges (draft/published), acknowledgement progress bar, publish action | [FE] | P0 | M |
| 1.5.F3 | Policy acknowledge modal: PDF viewer, "I have read and understood" confirmation button | [FE] | P0 | M |
| 1.5.F4 | eSign request flow: create request, signer view with document preview, signature pad, decline option | [FE] | P0 | L |
| 1.5.F5 | Notification bell: unread count badge, dropdown list, mark-all-read, deep-link to resource | [FE] | P0 | M |
| 1.5.F6 | Audit log viewer: filterable table (actor, action, resource type, date range), before/after diff drawer | [FE] | P1 | L |

---

### Sprint 6 (Weeks 13–14): Reporting, ESS/MSS & V1 Polish

#### Sprint 6 Backend

| # | Task | Tag | Priority | Effort |
|---|---|---|---|---|
| 1.6.1 | `ReportModule` — 7 pre-built reports: headcount, attrition, payroll summary, leave utilization, attendance summary, new hires, exits — all routed to read replica | [BE] | P0 | L |
| 1.6.2 | `ReportModule` — `SavedReportService` and `ReportScheduleService` — save definition, run, async XLSX/PDF export | [BE] | P0 | L |
| 1.6.3 | `ReportWorker` — `report_export` processor: runs query → formats with `exceljs` or `pdf-lib` → uploads to S3 → notifies requester | [BE] | P0 | L |
| 1.6.4 | ESS `GET /auth/me` extensions: enrich with leave balances, pending tasks, unread notification count | [BE] | P0 | M |
| 1.6.5 | MSS endpoints: `GET /employees/:id/summary` (manager view with team stats), `GET /leave/requests/team` | [BE] | P0 | M |
| 1.6.6 | Swagger OpenAPI spec finalization — verify all 200+ V1 endpoints documented with request/response schemas | [BE] | P0 | M |
| 1.6.7 | Integration tests (TestContainers): full leave apply → approve → balance deducted flow; full payroll cycle run → entry computed → payslip generated | [TEST] | P0 | XL |
| 1.6.8 | Security hardening: helmet headers, CSP policy, request size limits, SQL injection review | [BE] | P0 | M |

#### Sprint 6 Unit Tests

| # | Task | Tag | Priority | Effort |
|---|---|---|---|---|
| 1.6.T1 | `ReportService` unit tests: headcount groupBy dept returns correct counts; date filter excludes employees outside range; read replica used for all report queries | [TEST] | P0 | M |
| 1.6.T2 | Integration test: employee hire → salary assign → payroll cycle run → net pay correct → payslip PDF generated → S3 URL valid | [TEST] | P0 | L |
| 1.6.T3 | Integration test: leave apply → approve → balance updated → leave request status approved → calendar reflects | [TEST] | P0 | L |
| 1.6.T4 | E2E smoke tests (Playwright): register company → create employee → assign salary → run payroll → download payslip | [TEST] | P0 | L |

#### Sprint 6 Frontend

| # | Task | Tag | Priority | Effort |
|---|---|---|---|---|
| 1.6.F1 | HR dashboard (landing page): key metrics cards (headcount, open leaves, payroll status, recent hires) | [FE] | P0 | L |
| 1.6.F2 | Reports page: 7 pre-built report cards with filter panel, results table, Excel/PDF download | [FE] | P0 | L |
| 1.6.F3 | ESS home page: my payslips, my leave balances, my pending policy acknowledgements, my documents | [FE] | P0 | L |
| 1.6.F4 | MSS approval page: pending approvals queue (leave, attendance corrections), approve/reject with remarks | [FE] | P0 | M |
| 1.6.F5 | Settings pages: roles & permissions matrix editor, notification template editor | [FE] | P1 | L |
| 1.6.F6 | Mobile-responsive audit: all pages usable on 375px width (PWA baseline) | [FE] | P0 | M |
| 1.6.F7 | Playwright E2E: full leave request flow; full payroll cycle; login + view payslip; audit log access | [TEST] | P0 | L |

---

### V1 Definition of Done checklist

Before declaring V1 shipped:

- [ ] All P0 backend tasks complete and merged
- [ ] Unit test coverage: services ≥ 90%, utils ≥ 95%, repositories ≥ 80%
- [ ] Integration tests pass on CI (TestContainers)
- [ ] All P0 Playwright E2E journeys green on staging
- [ ] OpenAPI spec exported and versioned
- [ ] Audit log verified: every POST/PATCH/DELETE creates a log entry with correct actor + diff
- [ ] Zero critical `npm audit` vulnerabilities
- [ ] Zero Trufflehog secret scan findings
- [ ] Performance: `GET /employees` p95 < 120ms on staging with 1000 employees seeded
- [ ] Performance: payroll cycle run for 100 employees < 15s
- [ ] All database indexes verified via `EXPLAIN ANALYZE` on key queries
- [ ] Soft delete verified: no hard deletes possible via any API endpoint
- [ ] Multi-tenant isolation verified: cross-company data read returns 404

---

## Phase 2 — V2 Full Release (Months 5–10)

**Goal:** Complete the product — recruiting, performance, learning, benefits, analytics, offboarding, integrations, native mobile.

---

### Sprint 7 (Weeks 15–16): Recruitment & ATS — Core Pipeline

#### Sprint 7 Backend

| # | Task | Tag | Priority | Effort |
|---|---|---|---|---|
| 2.1.1 | `RecruitmentModule` — `JobRequisitionService`: CRUD, approval workflow (draft → open), headcount tracking | [BE] | P0 | M |
| 2.1.2 | `RecruitmentModule` — Public careers page endpoints: `GET /careers`, `GET /careers/:id` (no auth), `POST /careers/:id/apply` | [BE] | P0 | M |
| 2.1.3 | `RecruitmentModule` — `CandidateService`: create/update/deduplicate by email, AI resume parsing stub (JSONB `profile_data`) | [BE] | P0 | M |
| 2.1.4 | `RecruitmentModule` — `ApplicationService`: create application, move stage, reject with reason, score update | [BE] | P0 | M |
| 2.1.5 | `RecruitmentModule` — `InterviewService`: schedule panel, assign panelists, submit feedback scorecard | [BE] | P0 | L |
| 2.1.6 | `RecruitmentModule` — `OfferService`: create offer, send (triggers eSign), accept (creates employee), decline | [BE] | P0 | L |
| 2.1.7 | Audit log: requisition approved; offer sent/accepted/declined; application stage moved | [BE][AUDIT] | P0 | S |

#### Sprint 7 Unit Tests

| # | Task | Tag | Priority | Effort |
|---|---|---|---|---|
| 2.1.T1 | `ApplicationService` unit tests: stage transitions — only valid moves succeed; rejected app cannot be moved forward; hired app is terminal | [TEST] | P0 | M |
| 2.1.T2 | `OfferService` unit tests: accepted offer triggers employee creation event; declined offer records reason; expired offer rejects signing | [TEST] | P0 | M |
| 2.1.T3 | `InterviewService` unit tests: feedback submission idempotent per panelist; overall rating computed correctly from rubric weights | [TEST] | P0 | M |

#### Sprint 7 Frontend

| # | Task | Tag | Priority | Effort |
|---|---|---|---|---|
| 2.1.F1 | Kanban pipeline board: drag-drop stage cards per requisition, candidate card with score/stage | [FE] | P0 | XL |
| 2.1.F2 | Careers public page: branded job listing, apply form, confirmation page | [FE] | P0 | L |
| 2.1.F3 | Interview scheduling: panel builder, calendar slot picker, meeting link input | [FE] | P0 | L |
| 2.1.F4 | Feedback scorecard form: per-attribute ratings, recommendation radio, notes; read-only consensus view | [FE] | P0 | M |
| 2.1.F5 | Offer letter builder: CTC input, join-by date, template selector, eSign trigger | [FE] | P0 | M |

---

### Sprint 8 (Weeks 17–18): Onboarding & Performance Management

#### Sprint 8 Backend

| # | Task | Tag | Priority | Effort |
|---|---|---|---|---|
| 2.2.1 | `OnboardingModule` — template CRUD, task definitions (role, due_day_offset, category); assign template to employee on hire; task instance creation | [BE] | P0 | L |
| 2.2.2 | `PerformanceModule` — `ReviewCycleService`: create, activate, close; deadline management | [BE] | P0 | M |
| 2.2.3 | `PerformanceModule` — `GoalService`: CRUD with parent-child alignment, check-in posts, OKR tree query | [BE] | P0 | L |
| 2.2.4 | `PerformanceModule` — `ReviewService`: create review form instances for a cycle, save/submit responses, calibration override, acknowledge | [BE] | P0 | L |
| 2.2.5 | `PerformanceModule` — `PipService`: initiate PIP, check-in tracking, close with outcome | [BE] | P0 | M |
| 2.2.6 | `FeedbackModule` — anytime feedback (give, list received, list given), 1:1 meeting notes with action items | [BE] | P0 | M |
| 2.2.7 | Audit log: review cycle activated/closed; PIP initiated/closed; calibration override | [BE][AUDIT] | P0 | S |

#### Sprint 8 Unit Tests

| # | Task | Tag | Priority | Effort |
|---|---|---|---|---|
| 2.2.T1 | `GoalService` unit tests: parent goal alignment creates correct tree; `current_value / target_value` progress calculation; weight sum validation (100 per cycle) | [TEST] | P0 | M |
| 2.2.T2 | `ReviewService` unit tests: `submitted` review cannot be edited; calibrated rating differs from overall_rating correctly; employee acknowledgement requires submitted status | [TEST] | P0 | M |
| 2.2.T3 | `OnboardingService` unit tests: task instances created for correct assignee roles; due dates computed from hire_date + offset; completion percentage correct | [TEST] | P0 | M |

#### Sprint 8 Frontend

| # | Task | Tag | Priority | Effort |
|---|---|---|---|---|
| 2.2.F1 | Onboarding task checklist: per-employee progress view, assignee task cards, mark-done, completion percentage | [FE] | P0 | L |
| 2.2.F2 | OKR tree view: company → dept → individual alignment; progress bars; check-in drawer | [FE] | P0 | XL |
| 2.2.F3 | Performance review form: dynamic sections from template, rating scales, comment fields, save draft/submit | [FE] | P0 | L |
| 2.2.F4 | Calibration view (HR): all employees in a cycle with ratings, distribution chart, override input | [FE] | P0 | L |
| 2.2.F5 | PIP management: initiate form, milestone timeline, check-in log, outcome close | [FE] | P0 | M |
| 2.2.F6 | Continuous feedback: give praise/constructive, received feedback card list, 1:1 notes editor | [FE] | P0 | M |

---

### Sprint 9 (Weeks 19–20): Learning & Development

#### Sprint 9 Backend

| # | Task | Tag | Priority | Effort |
|---|---|---|---|---|
| 2.3.1 | `LmsModule` — `CourseService`: CRUD, thumbnail upload, skills tagging; `CourseEnrollmentService`: enroll, update progress, complete, certificate generation | [BE] | P0 | L |
| 2.3.2 | `LmsModule` — `LearningPathService`: path CRUD, course sequence; `TrainingAssignmentService`: bulk assign by dept/role, deadline reminders | [BE] | P0 | M |
| 2.3.3 | `SkillsModule` — skills taxonomy CRUD; `EmployeeSkillService`: self-assess, manager validate; skills matrix query; gap analysis | [BE] | P0 | L |
| 2.3.4 | `CertificationModule` — certification registry CRUD; employee certification records; expiry alert cron job | [BE] | P0 | M |
| 2.3.5 | Audit log: mandatory training assigned; certification verified/expired | [BE][AUDIT] | P0 | S |

#### Sprint 9 Frontend

| # | Task | Tag | Priority | Effort |
|---|---|---|---|---|
| 2.3.F1 | Course catalog: searchable grid with category filter, duration, mandatory badge, enroll button | [FE] | P0 | L |
| 2.3.F2 | Course player: video/PDF embed, progress tracking, quiz component, completion certificate download | [FE] | P0 | XL |
| 2.3.F3 | Learning path viewer: course sequence with completion checkmarks, locked/unlocked states | [FE] | P0 | M |
| 2.3.F4 | Skills matrix heatmap: dept × skill grid, proficiency color scale, gap indicators | [FE] | P0 | L |
| 2.3.F5 | My training page (ESS): assigned courses, progress bars, overdue alerts, certification expiry countdown | [FE] | P0 | M |

---

### Sprint 10 (Weeks 21–22): Benefits, Compensation & Surveys

#### Sprint 10 Backend

| # | Task | Tag | Priority | Effort |
|---|---|---|---|---|
| 2.4.1 | `BenefitsModule` — benefit plans CRUD, enrollment lifecycle, dependent management, enrollment window | [BE] | P0 | L |
| 2.4.2 | `CompensationModule` — bonus cycle workflow: planning → open → approve → disburse; allocation management | [BE] | P0 | L |
| 2.4.3 | `CompensationModule` — equity grants: CRUD, vesting schedule computation, monthly vesting cron job | [BE] | P0 | M |
| 2.4.4 | `CompensationModule` — `GET /compensation/statement/:employeeId`: total comp statement | [BE] | P0 | M |
| 2.4.5 | `SurveyModule` — survey builder, launch, assignment, anonymous response collection, aggregated results | [BE] | P0 | L |
| 2.4.6 | `PayrollModule` — tax declarations portal; expense reimbursement in payroll; salary advances with recovery | [BE] | P0 | L |

#### Sprint 10 Frontend

| # | Task | Tag | Priority | Effort |
|---|---|---|---|---|
| 2.4.F1 | Benefits enrollment wizard: plan catalog, dependent form, confirm + eSign trigger | [FE] | P0 | L |
| 2.4.F2 | Total compensation statement: visual breakdown (salary / benefits / bonus / equity) with download | [FE] | P0 | M |
| 2.4.F3 | Bonus cycle manager: budget tracker, allocation table (target %, recommended, approved), approve button | [FE] | P0 | L |
| 2.4.F4 | Survey builder: question type selector, preview, launch scheduler | [FE] | P0 | L |
| 2.4.F5 | Survey response form: per-question widgets (rating stars, radio, text), submit confirmation | [FE] | P0 | M |
| 2.4.F6 | Expense claim form: category, amount, date, receipt upload, submit; approval queue for managers | [FE] | P0 | M |

---

### Sprint 11 (Weeks 23–24): Advanced Analytics & Offboarding

#### Sprint 11 Backend

| # | Task | Tag | Priority | Effort |
|---|---|---|---|---|
| 2.5.1 | `AnalyticsModule` — executive dashboard endpoints: workforce demographics, payroll trends, leave liability — all routed to read replica | [BE] | P0 | L |
| 2.5.2 | `AnalyticsModule` — custom report builder: `POST /reports/saved` accepts field/filter/column definition; `POST /reports/saved/:id/run` executes safe parameterized query | [BE] | P0 | XL |
| 2.5.3 | `AnalyticsModule` — attrition risk scoring: rule-based signal engine (tenure < 6m + low review + high absences) → risk_score 0–100 | [BE] | P1 | L |
| 2.5.4 | `OffboardingModule` — exit request workflow: submit, approve, exit interview, checklist tasks, trigger `employee.terminated` event | [BE] | P0 | L |
| 2.5.5 | Audit log: exit request approved; checklist task completed; attrition risk score generated | [BE][AUDIT] | P0 | S |

#### Sprint 11 Frontend

| # | Task | Tag | Priority | Effort |
|---|---|---|---|---|
| 2.5.F1 | Executive HR dashboard: KPI cards (headcount, attrition rate, avg tenure), trend charts (Recharts), workforce distribution donut | [FE] | P0 | L |
| 2.5.F2 | Custom report builder: field selector panel, filter builder, results table, save + schedule | [FE] | P0 | XL |
| 2.5.F3 | Attrition risk table: risk score badges, signal chips (hover for detail), sorted by risk level | [FE] | P1 | M |
| 2.5.F4 | Offboarding portal: resignation form (employee), exit checklist (assignee view), exit interview form | [FE] | P0 | L |

---

### Sprint 12 (Weeks 25–26): Integrations, API, Mobile & V2 Polish

#### Sprint 12 Backend

| # | Task | Tag | Priority | Effort |
|---|---|---|---|---|
| 2.6.1 | `IntegrationModule` — API key management: create (return once), list (prefix only), revoke; scope enforcement on incoming requests | [BE] | P0 | M |
| 2.6.2 | `WebhookModule` — register, update, test ping, deactivate on 10 failures; `WebhookWorker` signs and delivers with exponential retry | [BE] | P0 | L |
| 2.6.3 | Wire all major domain events to webhook emitter: `employee.created`, `employee.terminated`, `payroll.disbursed`, `leave.approved`, `review.completed` | [BE] | P0 | M |
| 2.6.4 | `IntegrationModule` — Slack notification integration: connect workspace, send approval notifications to configured channels | [BE] | P1 | M |
| 2.6.5 | Full Pact contract test suite for all V2 API modules | [TEST] | P0 | L |
| 2.6.6 | k6 load test suite: all p95 latency budgets validated on staging with 100k employee dataset | [TEST] | P0 | L |

#### Sprint 12 Frontend

| # | Task | Tag | Priority | Effort |
|---|---|---|---|---|
| 2.6.F1 | API key management page: create with scope selector, list (masked), revoke | [FE] | P0 | M |
| 2.6.F2 | Webhook management: register URL/events, test ping, delivery log table (status, latency, retry) | [FE] | P0 | M |
| 2.6.F3 | React Native mobile app: auth, ESS home, leave apply/balance, payslips, notification inbox | [FE] | P0 | XL |
| 2.6.F4 | Playwright V2 E2E suite: candidate-to-hire flow, performance review cycle, benefits enrollment, offboarding | [TEST] | P0 | L |

---

## Audit Log — Complete Implementation Specification

The audit log is a cross-cutting concern. This section defines exactly what must be logged and how.

### AuditInterceptor implementation

```typescript
// src/common/interceptors/audit.interceptor.ts
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private readonly auditService: AuditService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest()
    const ctx: RequestContext = request.user

    // Only audit mutating methods
    const AUDITED_METHODS = ['POST', 'PATCH', 'PUT', 'DELETE']
    if (!AUDITED_METHODS.includes(request.method)) {
      return next.handle()
    }

    const startState = request['__audit_before'] // set by route handler if needed

    return next.handle().pipe(
      tap((responseData) => {
        // Fire-and-forget: never block the HTTP response
        setImmediate(() => {
          this.auditService.log({
            companyId: ctx.companyId,
            userId: ctx.userId,
            action: this.resolveAction(request.method),
            resource: this.resolveResource(request.route.path),
            resourceId: responseData?.id ?? request.params?.id,
            oldValues: startState ?? null,
            newValues: this.stripPii(responseData),
            ipAddress: request.ip,
            userAgent: request.headers['user-agent'],
          })
        })
      }),
      catchError((error) => {
        // Still log failed mutations (e.g. attempted unauthorized delete)
        setImmediate(() => {
          this.auditService.log({
            companyId: ctx?.companyId,
            userId: ctx?.userId,
            action: 'attempt_failed',
            resource: this.resolveResource(request.route.path),
            resourceId: request.params?.id,
            newValues: { error: error.message },
            ipAddress: request.ip,
          })
        })
        throw error
      }),
    )
  }

  private stripPii(data: any): any {
    if (!data) return data
    const PII_FIELDS = ['nationalId', 'passportNumber', 'accountNumber', 'mfaSecret', 'passwordHash']
    const clean = { ...data }
    PII_FIELDS.forEach(f => { if (f in clean) clean[f] = '[REDACTED]' })
    return clean
  }
}
```

### Audit log entries by module

| Module | Trigger | Action | Resource |
|---|---|---|---|
| Auth | Successful login | `login` | `user` |
| Auth | Failed login (3+ attempts) | `login_failed` | `user` |
| Auth | Password changed | `update` | `user` |
| Auth | MFA enabled/disabled | `update` | `user` |
| Auth | API key created/revoked | `create` / `delete` | `api_key` |
| Employee | Employee created | `create` | `employee` |
| Employee | Employee profile updated | `update` | `employee` |
| Employee | Employee promoted/transferred | `update` | `employment_history` |
| Employee | Employee terminated | `delete` | `employee` |
| Leave | Leave request submitted | `create` | `leave_request` |
| Leave | Leave approved/rejected | `approve` / `reject` | `leave_request` |
| Leave | Leave balance manually adjusted | `update` | `leave_balance` |
| Payroll | Salary revision created | `create` | `employee_salary` |
| Payroll | Salary revision approved | `approve` | `employee_salary` |
| Payroll | Payroll cycle run initiated | `create` | `payroll_cycle` |
| Payroll | Payroll cycle approved | `approve` | `payroll_cycle` |
| Payroll | Payroll cycle disbursed | `update` | `payroll_cycle` |
| Payroll | Payroll cycle reversed | `update` | `payroll_cycle` |
| Documents | Document uploaded | `create` | `employee_document` |
| Documents | Document deleted | `delete` | `employee_document` |
| eSign | Signature request created | `create` | `esign_request` |
| eSign | Document signed | `update` | `esign_request` |
| eSign | Document declined | `update` | `esign_request` |
| Policy | Policy published | `update` | `policy_document` |
| Policy | Policy acknowledged by employee | `create` | `policy_acknowledgement` |
| RBAC | Role created/updated | `create` / `update` | `role` |
| RBAC | User role assigned/removed | `create` / `delete` | `user_role` |
| Performance | Review cycle activated | `update` | `review_cycle` |
| Performance | Review submitted | `update` | `performance_review` |
| Performance | Rating calibrated by HR | `update` | `performance_review` |
| Performance | PIP initiated | `create` | `pip` |
| Performance | PIP closed | `update` | `pip` |
| Offboarding | Exit request submitted | `create` | `exit_request` |
| Offboarding | Exit approved | `approve` | `exit_request` |
| Webhooks | Webhook registered | `create` | `webhook` |
| Webhooks | Webhook deactivated (failure limit) | `update` | `webhook` |
| Reports | Report exported | `export` | `saved_report` |

### Audit log unit test matrix

```typescript
describe('AuditInterceptor', () => {
  it('logs POST requests with correct action=create and resourceId from response', ...)
  it('logs PATCH requests with action=update', ...)
  it('logs DELETE requests with action=delete', ...)
  it('does NOT log GET requests', ...)
  it('strips PII fields (nationalId, accountNumber) from new_values', ...)
  it('logs failed mutations with action=attempt_failed without blocking response', ...)
  it('does not block the HTTP response — fire-and-forget', ...)
  it('includes companyId, userId, ipAddress, userAgent on every entry', ...)
})
```

---

## Unit Testing — Complete Strategy Reference

### NestJS-specific test patterns

#### Pattern 1: Service test with DI mock module

```typescript
// Every service test uses Test.createTestingModule
describe('LeaveService', () => {
  let service: LeaveService

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        LeaveService,
        { provide: LeaveRepository,    useValue: createMockLeaveRepository() },
        { provide: BalanceRepository,  useValue: createMockBalanceRepository() },
        { provide: HolidayRepository,  useValue: createMockHolidayRepository() },
        { provide: EventEmitter2,      useValue: { emit: vi.fn() } },
      ],
    }).compile()

    service = module.get(LeaveService)
  })
})
```

#### Pattern 2: Repository test with deep-mocked Prisma

```typescript
import { mockDeep } from 'vitest-mock-extended'

describe('EmployeeRepository', () => {
  const prisma = mockDeep<PrismaClient>()
  const repo   = new EmployeeRepository(prisma)

  it('always adds companyId to WHERE', async () => {
    prisma.employee.findMany.mockResolvedValue([])
    await repo.findMany('company-abc', {})
    expect(prisma.employee.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ companyId: 'company-abc' }) })
    )
  })
})
```

#### Pattern 3: Guard test

```typescript
describe('PermissionsGuard', () => {
  it('allows Admin on company-scope resource', async () => {
    const ctx = buildMockExecutionContext({ roles: ['Admin'] })
    const guard = new PermissionsGuard(authzService)
    Reflect.defineMetadata(PERMISSIONS_KEY, [{ resource: 'employee', action: 'write', scope: 'company' }], ctx.getHandler())
    await expect(guard.canActivate(ctx)).resolves.toBe(true)
  })

  it('blocks Employee on company-scope write', async () => {
    const ctx = buildMockExecutionContext({ roles: ['Employee'] })
    await expect(guard.canActivate(ctx)).resolves.toBe(false)
  })
})
```

#### Pattern 4: BullMQ worker test

```typescript
describe('PayrollWorker', () => {
  it('calls PayrollEngine with correct cycleId', async () => {
    const engine = { computeCycle: vi.fn().mockResolvedValue(undefined) }
    const worker = new PayrollWorker(engine as any)
    await worker.process({ data: { cycleId: 'cycle-1', companyId: 'co-1' } } as any)
    expect(engine.computeCycle).toHaveBeenCalledWith('cycle-1', 'co-1')
  })

  it('throws and allows retry on engine error', async () => {
    const engine = { computeCycle: vi.fn().mockRejectedValue(new Error('DB timeout')) }
    const worker = new PayrollWorker(engine as any)
    await expect(worker.process({ data: { cycleId: 'c1', companyId: 'c2' } } as any))
      .rejects.toThrow('DB timeout')
  })
})
```

### Coverage targets (enforced in CI)

| Layer | Target | Vitest threshold key |
|---|---|---|
| Services (`src/**/*.service.ts`) | ≥ 90% | `branches: 90, lines: 90` |
| Repositories (`src/**/*.repository.ts`) | ≥ 80% | `branches: 80, lines: 80` |
| Utilities / engines (`src/**/*.util.ts`, `*.engine.ts`) | ≥ 95% | `branches: 95, lines: 95` |
| Guards / interceptors / pipes | ≥ 85% | `branches: 85, lines: 85` |
| Workers (`src/**/*.worker.ts`) | ≥ 85% | `branches: 85, lines: 85` |
| Controllers (`src/**/*.controller.ts`) | ≥ 70% | Warning only |

```typescript
// vitest.config.ts
export default defineConfig({
  test: {
    coverage: {
      provider: 'istanbul',
      thresholds: {
        'src/**/*.service.ts':    { branches: 90, lines: 90, functions: 90 },
        'src/**/*.repository.ts': { branches: 80, lines: 80, functions: 80 },
        'src/**/*.util.ts':       { branches: 95, lines: 95, functions: 95 },
        'src/**/*.engine.ts':     { branches: 95, lines: 95, functions: 95 },
        'src/**/*.guard.ts':      { branches: 85, lines: 85, functions: 85 },
        'src/**/*.worker.ts':     { branches: 85, lines: 85, functions: 85 },
      },
    },
  },
})
```

---

## Sprint Summary & Timeline

| Sprint | Weeks | Focus | Key deliverables |
|---|---|---|---|
| 0 | 1–2 | Foundation | Repo, NestJS bootstrap, Prisma, Next.js, CI pipeline |
| 1 | 3–4 | Auth & company | Login, JWT, RBAC, AuditInterceptor, company setup |
| 2 | 5–6 | HR core | Employee CRUD, org chart, encryption, bulk import |
| 3 | 7–8 | Leave & attendance | Leave types, accrual engine, requests, clock-in/out |
| 4 | 9–10 | Payroll | Salary structures, payroll engine, payslip PDFs |
| 5 | 11–12 | Docs & notifications | Document vault, eSign, policies, email worker |
| 6 | 13–14 | Reporting & ESS | 7 reports, ESS portal, MSS approvals, E2E tests |
| — | — | **V1 SHIPPED** | **All 6 MVP modules live** |
| 7 | 15–16 | Recruitment | ATS pipeline, careers page, interviews, offers |
| 8 | 17–18 | Onboarding & perf. | Onboarding checklists, OKRs, reviews, PIP |
| 9 | 19–20 | Learning & dev | LMS, courses, skills matrix, certifications |
| 10 | 21–22 | Benefits & surveys | Benefits enrollment, bonus cycles, pulse surveys |
| 11 | 23–24 | Analytics & offboarding | Dashboards, custom reports, exit management |
| 12 | 25–26 | Integrations & mobile | API keys, webhooks, React Native app, V2 E2E |
| — | — | **V2 SHIPPED** | **All 14 modules live** |

---

## PR Gate (enforced on every merge)

```yaml
# .github/workflows/ci.yml — gate steps
- name: Type check       # tsc --noEmit — zero errors required
- name: Lint             # ESLint — zero errors required
- name: Secret scan      # Trufflehog — zero findings required
- name: Unit tests       # Vitest — 100% pass + coverage thresholds
- name: Integration tests # Vitest + TestContainers — 100% pass
- name: Build            # docker build — must succeed
- name: Deploy staging   # Helm upgrade
- name: E2E smoke        # Playwright — 100% pass on staging
```

---

*HR Management System · Technical Implementation Plan v1.0*  
*NestJS 11 (Fastify adapter) · PostgreSQL 15 · Prisma · TypeScript · Multi-tenant SaaS*  
*V1 MVP: 6 modules · 14 sprints total · V2: 14 modules*
