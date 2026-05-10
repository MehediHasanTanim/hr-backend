# HR Management System — System Design Document

**Version:** 1.0  
**Stack:** Node.js 20 · TypeScript · PostgreSQL 15+ · Prisma ORM · Redis 7  
**Architecture:** Layered (Service → Repository → DB) · Multi-tenant SaaS  
**Deployment:** Kubernetes (AWS EKS)  
**API Style:** REST · OpenAPI 3.0  
**Auth:** JWT + SSO · MFA · RBAC  
**Scope:** V1 MVP + V2 Full Release · 76 DB Tables · ~389 API Endpoints

---

## Table of Contents

1. [Overview](#1-overview)
2. [System Architecture](#2-system-architecture)
3. [Backend Architecture](#3-backend-architecture)
4. [Data Layer](#4-data-layer)
5. [Infrastructure & Deployment](#5-infrastructure--deployment)
6. [Security Architecture](#6-security-architecture)
7. [Unit Test Strategy](#7-unit-test-strategy)
8. [Regression & Test Automation Strategy](#8-regression--test-automation-strategy)
9. [CI/CD Pipeline](#9-cicd-pipeline)
10. [Observability](#10-observability)

---

## 1. Overview

This document covers the complete system design for the HR Management System, a production-grade multi-tenant SaaS platform. It includes high-level component architecture, backend service internals, database and caching design, infrastructure topology, security controls, and the full testing strategy.

### Key architecture decisions at a glance

| Concern | Decision |
|---|---|
| Architecture pattern | Layered: Controller → Service → Repository → Data |
| Multi-tenancy | Row-level isolation via `company_id` on every table |
| API | REST with OpenAPI 3.0 spec, Bearer JWT auth |
| Auth | JWT (15 min) + rotating refresh tokens (7 days), SSO, MFA |
| Database | PostgreSQL 15 primary + read replica, PgBouncer connection pooling |
| Caching | Redis 7 — app cache, sessions, BullMQ job queues |
| File storage | S3-compatible object storage, signed URLs, lifecycle policies |
| Async processing | BullMQ backed by Redis, per-queue concurrency and retry config |
| Observability | Prometheus + Grafana metrics, OpenTelemetry tracing, pino structured logs |
| Deployment | Kubernetes (EKS), Helm charts, Horizontal Pod Autoscaling |

---

## 2. System Architecture

### 2.1 Component overview

The platform is organized into five tiers: **Clients → Edge → API Services → Message Bus + Workers → Data Stores**, with a cross-cutting Observability layer.

```
┌─────────────────────────────────────────────────────────────────┐
│  CLIENTS                                                        │
│  Web Portal (React/Next.js)  Mobile App (React Native)          │
│  3rd Party (API Keys/Webhooks)  Developer CLI (Claude Code)     │
└─────────────────────────┬───────────────────────────────────────┘
                          │ HTTPS
┌─────────────────────────▼───────────────────────────────────────┐
│  EDGE                                                           │
│  CDN / WAF (CloudFront)  →  Load Balancer (ALB + SSL)           │
│                          →  API Gateway (rate limit · routing)  │
└─────────────────────────┬───────────────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────────────┐
│  API SERVICES  (Kubernetes pods, Node 20 + Fastify)             │
│  ┌────────────┐ ┌──────────────┐ ┌───────────────┐             │
│  │ Core API   │ │Leave & Payroll│ │ Recruiting &  │             │
│  │Employees   │ │Leave·Attend. │ │ Performance   │             │
│  │Org · Auth  │ │Payroll·Pay   │ │ATS·Reviews    │             │
│  └────────────┘ └──────────────┘ └───────────────┘             │
│  ┌──────────────────┐  ┌─────────────────────────┐             │
│  │ Notifications    │  │ Analytics               │             │
│  │ Email·SMS·Push   │  │ Reports · Dashboards    │             │
│  └──────────────────┘  └─────────────────────────┘             │
└─────────────────────────┬───────────────────────────────────────┘
                          │ publish events
┌─────────────────────────▼───────────────────────────────────────┐
│  MESSAGE BUS — Redis Streams / BullMQ                           │
│  payroll_run · payslip_gen · email_dispatch · report_export     │
│  webhook_deliver · bulk_import · leave_accrue                   │
└────────┬──────────────────────────────────────────┬────────────┘
         │ consume                                  │
┌────────▼──────────────────────────────────────────▼────────────┐
│  BACKGROUND WORKERS                                             │
│  Payroll Worker  Email Worker  Report Worker                    │
│  Webhook Worker  Scheduler (cron/accruals)  Bulk Import        │
└─────────────────────────┬───────────────────────────────────────┘
                          │ read/write
┌─────────────────────────▼───────────────────────────────────────┐
│  DATA STORES                                                    │
│  PostgreSQL 15 (primary + replica · RDS Multi-AZ · Prisma ORM) │
│  Redis 7 (cache · sessions · queues · ElastiCache)              │
│  S3 / Object Store (docs · payslips · exports · signed URLs)    │
│  OpenSearch (candidate + employee full-text search · V2)        │
└─────────────────────────────────────────────────────────────────┘

OBSERVABILITY (cross-cutting)
  Prometheus + Grafana · OpenTelemetry + Jaeger · CloudWatch Logs · PagerDuty
```

### 2.2 Multi-tenancy model

Every table carries a `company_id` UUID column. All queries are scoped at the service layer — the `RequestContext` injects `companyId` from the JWT claim before any DB access. A Prisma middleware extension enforces the tenant filter automatically, making it impossible to accidentally return cross-tenant data.

```typescript
// Prisma extension — applied globally at client initialization
const prismaWithTenant = prisma.$extends({
  query: {
    $allModels: {
      async $allOperations({ args, query, operation }) {
        if (['findMany','findFirst','count','aggregate'].includes(operation)) {
          args.where = { ...args.where, companyId: ctx.companyId, deletedAt: null }
        }
        return query(args)
      }
    }
  }
})
```

> **Tenant isolation guarantee:** The base Prisma client is wrapped in a `withTenantScope(ctx)` extension that appends `WHERE company_id = $1` to every query. Service layer unit tests verify this wrapper is called on all repository methods.

---

## 3. Backend Architecture

### 3.1 Layered architecture

Each API service follows a strict four-layer architecture. Dependencies only flow downward — controllers never touch repositories directly, and repositories never contain business logic.

```
┌─────────────────────────────────────────────────────────────────┐
│  HTTP LAYER                                                     │
│  Route handlers · Request validation (Zod) · Auth middleware    │
│  Rate limit middleware · Audit log middleware · Serialization   │
└──────────────────────────────┬──────────────────────────────────┘
                               ↓
┌─────────────────────────────────────────────────────────────────┐
│  SERVICE LAYER                                                  │
│  Business logic · Permission checks · Domain event emission     │
│  Transaction orchestration · Notification triggers             │
│  Workflow state machine                                         │
└──────────────────────────────┬──────────────────────────────────┘
                               ↓
┌─────────────────────────────────────────────────────────────────┐
│  REPOSITORY LAYER                                               │
│  Prisma queries · Tenant scope injection · Query building       │
│  Cursor pagination · Cache read-through · Cache invalidation    │
└──────────────────────────────┬──────────────────────────────────┘
                               ↓
┌─────────────────────────────────────────────────────────────────┐
│  DATA LAYER                                                     │
│  PostgreSQL (Prisma) · Redis (ioredis) · S3 (AWS SDK v3)        │
│  BullMQ queues · OpenSearch client                              │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 Request lifecycle

```
Client
  → [HTTPS] Auth MW (JWT verify, ctx inject)
  → Zod validation (body/query/params)
  → Route handler
  → Service (business logic + permission check)
  → Repository (Prisma query + Redis cache)
  → PostgreSQL
  ← JSON response

  ↕ (async, on every mutating request)
  Audit Log middleware (actor, resource, before/after diff)
```

### 3.3 Key backend patterns

#### Repository pattern

Every domain entity has a typed repository class implementing the `Repository<T>` interface. Services depend on the interface, not the concrete class, enabling easy test mocking.

```typescript
interface Repository<T, CreateInput, UpdateInput> {
  findById(id: string, companyId: string): Promise<T | null>
  findMany(companyId: string, params?: PaginationParams): Promise<PaginatedResult<T>>
  create(companyId: string, data: CreateInput, actorId: string): Promise<T>
  update(id: string, companyId: string, data: UpdateInput, actorId: string): Promise<T>
  softDelete(id: string, companyId: string, actorId: string): Promise<void>
}
```

#### Domain events

State changes emit typed domain events via an in-process EventEmitter. Async side effects (emails, webhooks, audit entries) are handled by listeners — never inside the service method itself.

```typescript
// Service emits
events.emit('employee.hired', { companyId, employeeId, actorId })

// Listener reacts
on('employee.hired', async (ev) => {
  await queue.add('send_welcome', ev)
  await queue.add('webhook_emit', ev)
})
```

#### Transaction management

Multi-step writes use Prisma interactive transactions. The repository receives a `tx` handle optionally; if absent it uses the default client. Services orchestrate transaction boundaries explicitly.

```typescript
await prisma.$transaction(async (tx) => {
  await salaryRepo.create(data, tx)
  await historyRepo.append(event, tx)
  await auditRepo.log(entry, tx)
})
```

#### Approval workflow state machine

All multi-step approvals (leave, payroll, expenses) use a generic state machine. Transitions are validated against allowed states before persistence, and transition events trigger the notification queue.

```typescript
const machine = new WorkflowMachine({
  states: ['pending', 'approved', 'rejected'],
  transitions: {
    approve: { from: 'pending', to: 'approved' },
    reject:  { from: 'pending', to: 'rejected' }
  }
})
await machine.transition(leaveRequest, 'approve', actor)
```

### 3.4 Caching strategy

| Resource | Cache type | TTL | Invalidation trigger |
|---|---|---|---|
| Employee profile | Redis key-value | 5 min | Employee update / delete |
| Org chart tree | Redis key-value | 10 min | Dept change / transfer |
| Leave balances | Redis key-value | 2 min | Leave approve / accrue |
| RBAC permissions | Redis hash per user | 15 min | Role assignment change |
| Company settings | In-process LRU | 30 min | Settings update |
| Payslip PDF URLs | Redis (signed URL) | 60 min | New payroll cycle |
| Holiday calendar | Redis key-value | 24 h | Holiday CRUD |

### 3.5 Async job processing

BullMQ backed by Redis handles all async work. Each job type has its own named queue with concurrency limits, retry configuration, and dead-letter handling.

| Queue | Concurrency | Retries | Max delay | DLQ action |
|---|---|---|---|---|
| `payroll_run` | 1 per company | 3 | 30 min | Alert + manual retry |
| `payslip_gen` | 10 | 3 | 5 min | Mark failed, notify HR |
| `email_dispatch` | 50 | 5 | 10 min | Log + skip |
| `report_export` | 5 | 2 | 15 min | Notify requester |
| `webhook_deliver` | 20 | 5 | 60 min exponential | Disable webhook after 10 fails |
| `bulk_import` | 3 | 1 | 5 min | Return error rows to user |
| `leave_accrue` | 1 | 3 | 1 h | Alert + re-run next day |

---

## 4. Data Layer

### 4.1 PostgreSQL topology

```
API Services (Prisma ORM)
       ↓
  PgBouncer (transaction mode · 200 max connections)
       ↓ writes                    ↓ reads (analytics/reports)
PostgreSQL Primary (RW)     PostgreSQL Read Replica
  Multi-AZ · RDS                Async streaming replication
       ↓
  S3 WAL backup (RPO: 5 min · RTO: 30 min)
```

### 4.2 Key database design decisions

| Decision | Choice | Rationale |
|---|---|---|
| Primary keys | UUID v4 | No sequential ID leakage; safe to expose in URLs; merge-safe across environments |
| Soft deletes | `deleted_at TIMESTAMPTZ` | HR data must never be hard-deleted; supports compliance, audit, and undo |
| Tenant isolation | Row-level via `company_id` | Simpler ops than schema-per-tenant; Prisma middleware enforces automatically |
| Audit log partitioning | Monthly range partitions | Audit log grows unboundedly; partitions enable fast drops of old data |
| Generated columns | `closing_days` on leave_balances | Eliminates update anomalies; balance always consistent with its components |
| JSONB fields | `custom_fields`, `responses`, `declaration_data` | Extensible without migrations; GIN-indexed for fast search |
| Timestamps | All `TIMESTAMPTZ` in UTC | Timezone-safe; display conversion in app layer per user timezone |

---

## 5. Infrastructure & Deployment

### 5.1 Kubernetes topology

**Production:**
- EKS cluster (3 Availability Zones)
- Horizontal Pod Autoscaler on all services
- Cluster Autoscaler for node management
- Pod Disruption Budgets for rolling deploys
- Istio service mesh for mTLS between services
- External Secrets Operator for secrets management from AWS Secrets Manager

**Staging:**
- Namespace isolation from production
- Production-parity configuration
- Synthetic data seeded for testing
- Full regression suite runs on every deploy

**Development:**
- Docker Compose local environment
- PostgreSQL + Redis + Minio (S3-compatible)
- Mailhog for email capture
- Hot reload with source maps

### 5.2 Service sizing (V1 baseline)

| Service | Replicas | CPU req/limit | Mem req/limit | HPA target |
|---|---|---|---|---|
| Core API | 3–10 | 250m / 500m | 256Mi / 512Mi | 70% CPU |
| Leave & Payroll API | 2–8 | 250m / 500m | 256Mi / 512Mi | 70% CPU |
| Notifications API | 2–6 | 100m / 250m | 128Mi / 256Mi | 60% CPU |
| Payroll Worker | 1–4 | 500m / 1 | 512Mi / 1Gi | Queue depth |
| Email Worker | 2–8 | 100m / 250m | 128Mi / 256Mi | Queue depth |
| Report Worker | 1–4 | 500m / 2 | 1Gi / 2Gi | Queue depth |

### 5.3 Environment configuration

All secrets are stored in AWS Secrets Manager and injected at pod startup via External Secrets Operator. Environment-specific configuration (DB URLs, Redis endpoints, S3 bucket names) is managed via Helm values files per environment. No secrets are stored in Git.

---

## 6. Security Architecture

### 6.1 Authentication flow

```
POST /auth/login
  → Argon2 verify password hash
  → Sign JWT (15 min, RS256)
  → Issue refresh token (7 days, stored as hash in Redis)
  → Set refresh token in HttpOnly cookie

POST /auth/refresh
  → Verify refresh token hash in Redis
  → Revoke old refresh token immediately
  → Issue new JWT + new refresh token (rotation)

Every protected request
  → Extract Bearer token from Authorization header
  → Verify JWT signature and expiry
  → Inject RequestContext { userId, companyId, roles[] }
```

JWT payload: `sub` (userId), `companyId`, `roles[]`, `iat`, `exp`. MFA flag included when TOTP is enabled — routes that require MFA check this flag before processing.

### 6.2 PII field-level encryption

Sensitive fields (national ID, passport number, bank account number, TOTP secret) are encrypted at the application layer using AES-256-GCM before writing to PostgreSQL. The encryption key is stored in AWS Secrets Manager and rotated quarterly.

```typescript
// Stored as: base64(iv + ciphertext + auth_tag)
const encrypted = await encrypt(plaintext, await getDataKey(companyId))

// On read
const plaintext = await decrypt(encrypted, await getDataKey(companyId))
```

### 6.3 RBAC enforcement

Every service method begins with a permission check via `AuthorizationService`. Permissions are loaded from Redis (15-min TTL) and checked against the request context. Three scopes:

- `company` — can act on any resource in the company
- `department` — can act only on resources in own department
- `self` — can act only on own resources

```typescript
await authz.require(ctx, {
  resource: 'employee',
  action: 'read',
  scope: 'department',
  subjectId: targetEmployeeId
})
// Throws ForbiddenError if check fails
```

### 6.4 Webhook security

All outbound webhooks are signed with HMAC-SHA256 using a per-webhook secret stored encrypted at rest. Recipients verify the `X-HR-Signature-256` header. Delivery uses TLS 1.3+ only. Payloads never include PII — only resource IDs and event metadata.

```typescript
const signature = 'sha256=' + createHmac('sha256', secret)
  .update(rawBody)
  .digest('hex')
// Set on outbound request as X-HR-Signature-256
```

### 6.5 Security controls checklist

| Control | Implementation | Phase |
|---|---|---|
| Input validation | Zod schemas on every endpoint, no raw DB input | V1 |
| SQL injection prevention | Prisma parameterized queries only; no raw SQL in services | V1 |
| Rate limiting | 100 req/min per IP (unauth), 500 req/min per user | V1 |
| CORS | Allowlist of known origins; credentials flag per domain | V1 |
| WAF | AWS WAF with OWASP rule set in front of ALB | V1 |
| Secret scanning | Trufflehog in CI pre-commit and PR checks | V1 |
| Dependency audit | `npm audit` and Snyk on every CI push | V1 |
| GDPR — data export | Employee data export endpoint; 30-day deletion workflow | V2 |
| SOC 2 controls | Access log review, MFA enforcement, change management | V2 |

---

## 7. Unit Test Strategy

### 7.1 Philosophy and tooling

> **Rule:** Unit tests are fast, deterministic, and isolated. No real database, no real Redis, no HTTP calls. Dependencies are mocked at the boundary of the layer under test. Test one thing per test.

| Tool | Purpose |
|---|---|
| Vitest | Test runner — fast ESM, HMR watch mode |
| `vi.mock()` | Auto-mock and manual mock factory |
| Istanbul (built-in) | Coverage reporting |
| `vitest-mock-extended` | Deep mock proxy for Prisma client |
| `@faker-js/faker` | Deterministic test data via seed |
| fast-check | Property-based testing for computation logic |

### 7.2 Coverage targets

| Layer | Target | CI enforcement | Scope |
|---|---|---|---|
| Service layer | **90%** | Blocks merge | All business logic, permission checks, state transitions |
| Repository layer | **80%** | Blocks merge | Query building, pagination, tenant scope injection |
| Utility functions | **95%** | Blocks merge | Salary computation, leave accrual, date helpers, validators |
| Route handlers | **70%** | Warning only | Request parsing, error formatting (covered mainly by integration tests) |
| Middleware | **85%** | Blocks merge | Auth, rate limit, audit logging |
| Worker processors | **85%** | Blocks merge | Payroll compute logic, email rendering, export generation |

### 7.3 Test file organization

```
src/
  services/
    leave.service.ts
    leave.service.test.ts          ← co-located unit tests
  repositories/
    employee.repository.ts
    employee.repository.test.ts
  workers/
    payroll.worker.ts
    payroll.worker.test.ts
  utils/
    salary.compute.ts
    salary.compute.test.ts
tests/
  integration/                     ← integration tests (TestContainers)
    payroll-cycle.integration.test.ts
    leave-flow.integration.test.ts
  e2e/                             ← Playwright end-to-end
    leave-journey.spec.ts
    payroll-cycle.spec.ts
  regression/                      ← bug-driven regression tests
    issue-247-leave-balance.test.ts
  builders/                        ← factory builders
    employee.builder.ts
    leave.builder.ts
    payroll.builder.ts
```

### 7.4 Unit test patterns

#### Service layer — happy path + all error branches

```typescript
describe('LeaveService.applyForLeave', () => {
  let service: LeaveService
  let leaveRepo: MockLeaveRepository
  let balanceRepo: MockBalanceRepository
  let events: MockEventEmitter

  beforeEach(() => {
    leaveRepo = createMockLeaveRepository()
    balanceRepo = createMockBalanceRepository()
    events = createMockEventEmitter()
    service = new LeaveService(leaveRepo, balanceRepo, events)
  })

  it('creates leave request when balance is sufficient', async () => {
    balanceRepo.getBalance.mockResolvedValue({ closingDays: 10 })
    leaveRepo.create.mockResolvedValue(buildLeaveRequest())

    const result = await service.applyForLeave(ctx, validInput)

    expect(result.status).toBe('pending')
    expect(leaveRepo.create).toHaveBeenCalledWith(
      ctx.companyId, validInput, ctx.userId
    )
    expect(events.emit).toHaveBeenCalledWith('leave.requested',
      expect.objectContaining({ employeeId: validInput.employeeId })
    )
  })

  it('throws InsufficientBalanceError when balance is zero', async () => {
    balanceRepo.getBalance.mockResolvedValue({ closingDays: 0 })
    await expect(service.applyForLeave(ctx, validInput))
      .rejects.toThrow(InsufficientBalanceError)
  })

  it('throws HolidayConflictError when dates overlap a holiday', async () => {
    balanceRepo.getBalance.mockResolvedValue({ closingDays: 10 })
    holidayRepo.hasHoliday.mockResolvedValue(true)
    await expect(service.applyForLeave(ctx, validInput))
      .rejects.toThrow(HolidayConflictError)
  })
})
```

#### Payroll computation — property-based + snapshot tests

```typescript
describe('PayrollEngine.computeEntry', () => {
  it('net pay = gross - total deductions always', () => {
    fc.assert(fc.property(
      fc.record({
        grossPay: fc.float({ min: 0, max: 500000 }),
        deductions: fc.array(fc.float({ min: 0 }))
      }),
      ({ grossPay, deductions }) => {
        const entry = computeEntry({ grossPay, deductions })
        return Math.abs(entry.netPay - (grossPay - sum(deductions))) < 0.01
      }
    ))
  })

  it('matches snapshot for standard salary structure', () => {
    const result = computeEntry({
      components: [
        { code: 'BASIC', amount: 50000 },
        { code: 'HRA',   amount: 20000 },
        { code: 'TDS',   amount:  7000 },
        { code: 'PF',    amount:  6000 },
      ]
    })
    expect(result).toMatchInlineSnapshot(`
      { "grossPay": 70000, "totalDeductions": 13000, "netPay": 57000, "taxAmount": 7000 }
    `)
  })
})
```

#### Repository layer — mock Prisma client

```typescript
import { mockDeep, DeepMockProxy } from 'vitest-mock-extended'
import { PrismaClient } from '@prisma/client'

describe('EmployeeRepository.findMany', () => {
  let prisma: DeepMockProxy<PrismaClient>
  let repo: EmployeeRepository

  beforeEach(() => {
    prisma = mockDeep<PrismaClient>()
    repo = new EmployeeRepository(prisma)
  })

  it('always scopes query by companyId', async () => {
    prisma.employee.findMany.mockResolvedValue([])
    await repo.findMany('company-123', { page: 1, perPage: 25 })

    expect(prisma.employee.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          companyId: 'company-123',
          deletedAt: null
        })
      })
    )
  })

  it('applies soft delete filter', async () => {
    await repo.findMany('company-123', {})
    const call = prisma.employee.findMany.mock.calls[0][0]
    expect(call.where.deletedAt).toBeNull()
  })
})
```

#### Test data builders (Factory pattern)

```typescript
// tests/builders/employee.builder.ts
export const buildEmployee = (overrides: Partial<Employee> = {}): Employee => ({
  id: faker.string.uuid(),
  companyId: faker.string.uuid(),
  employeeNumber: `EMP-${faker.number.int({ min: 1000, max: 9999 })}`,
  firstName: faker.person.firstName(),
  lastName: faker.person.lastName(),
  email: faker.internet.email(),
  status: 'active',
  employmentType: 'full_time',
  hireDate: faker.date.past(),
  noticePeriodDays: 30,
  workSchedule: 'weekdays',
  weeklyHours: new Decimal(40),
  customFields: {},
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
  ...overrides,
})
```

### 7.5 Critical unit test cases per module

| Test area | Cases to cover | Priority |
|---|---|---|
| Leave accrual engine | Annual vs monthly math, carry-forward cap, lapse on year rollover, pro-rated accrual for mid-year hire | P0 |
| Payroll computation | Gross = sum(earnings), Net = Gross − Deductions, LOP deduction, percentage component, formula components | P0 |
| RBAC permission checks | Admin can do everything, Employee reads only self, Manager scoped to team, HR reads all, scope inheritance | P0 |
| JWT auth middleware | Valid token passes, expired rejected, wrong company_id rejected, missing token → 401, MFA required flag | P0 |
| Approval workflow state machine | All valid transitions succeed, invalid transitions throw, final states are terminal, events emitted | P0 |
| Tenant isolation | Every repo method called with companyId in WHERE, cross-tenant read returns null, cross-tenant write throws | P0 |
| Webhook HMAC signing | Signature matches expected, payload mutation changes sig, wrong secret fails verify, PII excluded | P1 |
| Password / token security | Argon2 hash not reversible, reset token single-use, refresh rotation revokes old token | P0 |

---

## 8. Regression & Test Automation Strategy

### 8.1 Test pyramid

```
          ▲  E2E / Smoke
         ▲▲▲  Playwright · ~80 tests · Critical user journeys · ~10 min
        ▲▲▲▲▲
       ▲▲▲▲▲▲▲  Integration / API Tests
      ▲▲▲▲▲▲▲▲▲  Supertest + TestContainers · ~400 tests · Real DB · ~3 min
     ▲▲▲▲▲▲▲▲▲▲▲
    ▲▲▲▲▲▲▲▲▲▲▲▲▲  Unit Tests
   ▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲  Vitest · ~1500 tests · Mocked deps · < 60s total
```

### 8.2 Integration test strategy

Integration tests run against a real PostgreSQL instance and Redis, spun up via **TestContainers** in CI. Each test file gets a fresh database schema migration and seed. Tests call the service layer directly (no HTTP) and assert on real DB state after the operation.

```typescript
describe('Payroll integration: full cycle run', () => {
  let db: PostgreSqlContainer
  let redis: RedisContainer
  let prisma: PrismaClient

  beforeAll(async () => {
    db = await new PostgreSqlContainer().start()
    redis = await new RedisContainer().start()
    prisma = new PrismaClient({ datasourceUrl: db.getConnectionUri() })
    await runMigrations(prisma)
    await seedTestCompany(prisma)
  })

  afterAll(async () => {
    await prisma.$disconnect()
    await db.stop()
    await redis.stop()
  })

  it('computes correct net pay for employee with LOP', async () => {
    const emp = await createEmployee(prisma, companyId, { salary: 60000 })
    await createAttendanceLogs(prisma, emp.id, { lopDays: 2, workingDays: 22 })

    const cycle = await payrollService.createCycle(ctx, cycleInput)
    await payrollService.runCycle(ctx, cycle.id)

    const entry = await prisma.payrollEntry.findFirst({
      where: { employeeId: emp.id }
    })

    expect(entry!.lopDays.toNumber()).toBe(2)
    expect(entry!.netPay.toNumber()).toBeCloseTo(57272.72, 1)
    expect(entry!.status).toBe('computed')
  })
})
```

### 8.3 End-to-end test scenarios (Playwright)

| Journey | Steps covered | Runs on |
|---|---|---|
| New company onboarding | Register → verify email → create first employee → assign salary → run payroll | Staging · Every deploy |
| Leave request flow | Employee applies → manager notified → approves → balance deducted → ESS updated | Staging · Every deploy |
| Payroll cycle | HR creates cycle → runs compute → reviews → approves → bank file → payslips emailed | Staging · Nightly |
| Employee lifecycle | Create → hire → probation confirm → transfer → promote → terminate → verify history | Staging · Nightly |
| Candidate to hire (V2) | Post job → apply → schedule interview → feedback → offer → accept → onboarding | Staging · Nightly |
| Performance review (V2) | Create cycle → self-review → manager review → calibration → acknowledge | Staging · Weekly |
| SSO login | SAML redirect → IdP auth → callback → JWT issued → dashboard redirect | Staging · Every deploy |

### 8.4 Regression prevention rules

#### Rule 1 — Bug-driven test creation

Every bug fix must be accompanied by a failing test that reproduces the bug, then passes after the fix. This test lives permanently in the regression suite and is tagged with the issue ID.

```typescript
// tests/regression/issue-247-leave-balance.test.ts
// Bug: Leave balance went negative when applying for more days than balance
describe('GH-247: leave balance cannot go below zero', () => {
  it('throws InsufficientBalanceError when totalDays > closingDays', async () => {
    // ... reproduces the original bug scenario
  })
})
```

#### Rule 2 — Contract testing (Pact)

API contracts are verified with Pact. Consumer-driven contract tests ensure the frontend and integration partners can rely on response shapes not changing unexpectedly between deploys.

```typescript
// pact/leave-consumer.pact.ts
consumer.addInteraction({
  state: 'employee has pending leave request',
  uponReceiving: 'GET /leave/requests',
  withRequest: { method: 'GET', path: '/leave/requests' },
  willRespondWith: {
    status: 200,
    body: like({ data: eachLike(leaveRequestShape) })
  }
})
```

#### Rule 3 — Performance regression (k6)

Key API endpoints have p95 latency budgets enforced in CI. k6 load tests run nightly on staging against a production-like dataset (100k employees synthetic).

| Endpoint | p95 budget |
|---|---|
| `GET /employees` | < 120ms |
| `GET /leave/balances` | < 80ms |
| `GET /org-chart` | < 200ms |
| `POST /payroll/cycles/:id/run` | < 30s |
| `GET /reports/headcount` | < 500ms |

Any endpoint exceeding its budget blocks the nightly release.

#### Rule 4 — Mutation testing (Stryker)

Stryker mutation testing runs weekly on the service layer. A mutation score below 75% flags test gaps. High-priority mutants (payroll computation, permission checks) must achieve 90%+ mutation score.

```typescript
// stryker.config.ts
export default {
  mutate: ['src/services/**/*.ts'],
  reporters: ['html', 'github-actions'],
  thresholds: { high: 90, low: 75, break: 65 }
}
```

### 8.5 PR gate checklist

| Check | Tool | Threshold | Blocks merge? |
|---|---|---|---|
| Unit test pass | Vitest | 100% pass | Yes |
| Unit test coverage (services) | Istanbul | ≥ 90% | Yes |
| Integration test pass | Vitest + TestContainers | 100% pass | Yes |
| TypeScript type check | `tsc --noEmit` | 0 errors | Yes |
| Linting | ESLint (Airbnb + custom rules) | 0 errors | Yes |
| Dependency audit | `npm audit` + Snyk | 0 critical CVEs | Yes |
| Secret scan | Trufflehog | 0 secrets detected | Yes |
| API contract tests | Pact | 100% pass | Yes |
| E2E smoke tests | Playwright (staging) | 100% pass | Yes (on deploy) |
| Mutation score | Stryker | ≥ 65% | Weekly, advisory |
| Performance budgets | k6 | p95 within budget | Nightly, blocks release |

---

## 9. CI/CD Pipeline

### 9.1 Pipeline stages

```
Code push / PR open
      ↓
  [~1 min]  Quality gate — ESLint · tsc · npm audit · Trufflehog
      ↓
  [~1 min]  Unit tests — Vitest ~1500 tests · Istanbul coverage check
      ↓
  [~3 min]  Integration tests — Vitest + TestContainers (real Postgres + Redis)
      ↓
  [~2 min]  Docker build — multi-stage, distroless base · Push to ECR
      ↓
  [~2 min]  Staging deploy — Helm upgrade · Prisma migrate deploy
      ↓
  [~10 min] E2E tests — Playwright ~80 smoke journeys on staging
      ↓
  [~3 min]  Production deploy — Helm rolling update · Health check gate

Total: ~22 minutes PR to production
```

### 9.2 Database migration strategy

> **Zero-downtime migrations:** All schema changes must be backward-compatible for at least one deploy cycle. Additive changes (new columns with defaults, new tables) deploy first. Destructive changes (column removal) are deferred to a cleanup migration in the following release.

**Safe migration sequence for adding a NOT NULL column:**
1. Add nullable column with default value (deploy v1.1)
2. App code writes to new column
3. Backfill script fills existing rows
4. Add NOT NULL constraint (deploy v1.2, once all rows populated)

```bash
# Run on deploy (never on startup — use separate migration job)
npx prisma migrate deploy

# Rollback: migrations are additive only.
# Destructive changes use separate down-migration scripts gated by feature flags.
```

### 9.3 Blue/green and canary releases

- **Staging:** Full rolling deploy on every merged PR
- **Production:** Canary at 10% traffic for 15 min, promote to 100% if error rate and latency are within SLO
- **Rollback:** Helm rollback to previous release tag in under 2 min

---

## 10. Observability

### 10.1 Structured logging

All services use `pino` for JSON logging. Every log entry carries: `traceId`, `spanId`, `companyId`, `userId`, `requestId`, `service`, `level`, `msg`. PII fields are never logged — IDs only.

```typescript
logger.info({
  traceId: ctx.traceId,
  companyId: ctx.companyId,
  userId: ctx.userId,
  resource: 'employee',
  resourceId: employee.id,
  action: 'created',
}, 'Employee created successfully')
```

### 10.2 Key metrics

| Metric | Type | Alert threshold |
|---|---|---|
| API request rate | Counter | — |
| API p95 latency | Histogram | > 500ms for 5 min |
| API error rate | Counter | > 1% for 5 min |
| Payroll job duration | Histogram | > 60s |
| Queue depth (payroll) | Gauge | > 5 waiting jobs |
| DB connection pool exhaustion | Gauge | > 80% utilized |
| Redis memory usage | Gauge | > 75% of max |
| Failed webhook deliveries | Counter | > 10/min |

### 10.3 Distributed tracing

All services are instrumented with OpenTelemetry. Every inbound HTTP request generates a trace span. Child spans are created for: database queries, Redis operations, S3 calls, outbound HTTP (webhooks), and BullMQ job enqueue/process. Traces are exported to Jaeger and accessible via Grafana Tempo.

### 10.4 SLOs (Service Level Objectives)

| SLO | Target | Measurement window |
|---|---|---|
| API availability | 99.9% | Rolling 30 days |
| API p95 latency | < 300ms (excluding payroll compute) | Rolling 7 days |
| Payroll run completion | < 30s for 500 employees | Per run |
| Webhook delivery | p95 < 30s from event to delivery | Rolling 24 h |
| Report export | < 60s for standard reports | Per job |

### 10.5 Alerting escalation

```
Metric breach detected
  → PagerDuty alert (immediate, on-call engineer)
  → Slack #alerts channel (all engineering)
  → Auto-create incident in incident.io

P0 incident (API down / data loss risk)
  → Page on-call immediately
  → Escalate to engineering lead in 5 min if unacknowledged
  → Company-wide status page update

P1 incident (degraded performance / single feature broken)
  → Slack alert
  → 30-min acknowledgement SLA
  → Status page update if customer-facing
```

---

## Appendix: Technology Stack Summary

| Layer | Technology | Version | Notes |
|---|---|---|---|
| Runtime | Node.js | 20 LTS | ESM, V8 isolates for worker threads |
| Language | TypeScript | 5.x | Strict mode, no implicit any |
| Web framework | Fastify | 4.x | JSON schema validation, plugin system |
| ORM | Prisma | 5.x | Type-safe queries, migrations, multi-tenant extension |
| Validation | Zod | 3.x | Runtime type + parse, coercion |
| Database | PostgreSQL | 15 | JSONB, generated columns, partitioning, row-level security |
| Cache / Queue | Redis | 7 | Streams, BullMQ, ioredis |
| Job queue | BullMQ | 4.x | Backed by Redis, retry, DLQ, concurrency |
| File storage | AWS S3 | SDK v3 | Signed URLs, multipart, lifecycle |
| Search | OpenSearch | 2.x | Full-text, fuzzy, V2 only |
| Test runner | Vitest | 1.x | ESM-native, HMR, Istanbul coverage |
| E2E tests | Playwright | 1.x | Multi-browser, CI-ready |
| Integration tests | TestContainers | — | Real Postgres + Redis in Docker |
| Contract tests | Pact | 12.x | Consumer-driven contracts |
| Load testing | k6 | — | Performance regression gate |
| Mutation testing | Stryker | 8.x | Mutation score gate |
| Container | Docker | 24+ | Multi-stage, distroless base |
| Orchestration | Kubernetes | 1.28+ | EKS, Helm, HPA, PDB |
| Service mesh | Istio | 1.19+ | mTLS, traffic management |
| Secrets | AWS Secrets Manager | — | External Secrets Operator |
| Metrics | Prometheus + Grafana | — | Custom dashboards, alerting |
| Tracing | OpenTelemetry + Jaeger | — | Auto-instrumented |
| Logging | pino + CloudWatch | — | Structured JSON, retention policy |
| Alerting | PagerDuty + Slack | — | Escalation runbooks |

---

*HR Management System · System Design Document v1.0*  
*Covers V1 MVP (months 1–4) and V2 full release (months 5–10)*  
*76 DB tables · ~389 API endpoints · 14 feature modules*
