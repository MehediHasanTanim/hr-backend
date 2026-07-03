# Security Decisions — HR Platform V1

## Helmet Configuration
- Security headers are registered via `registerSecurityHeaders()` in `main.ts` using Fastify `onSend` hook.
- `crossOriginEmbedderPolicy` is disabled because the API is consumed by external clients.
- `frame-ancestors 'none'` is included to prevent clickjacking.
- All standard security headers are set on every response.

## Content Security Policy
This is a pure REST API server. No HTML is served from this origin.
CSP headers are included as a defence-in-depth measure only.

| Directive | Value | Reason |
|---|---|---|
| `default-src` | `'self'` | Deny all unlisted resource types by default |
| `script-src` | `'self'` | No external scripts ever served |
| `style-src` | `'self' 'unsafe-inline'` | Required for Swagger UI |
| `img-src` | `'self' data: https:` | Swagger UI loads badge images over HTTPS |
| `connect-src` | `'self'` | XHR/fetch limited to same origin |
| `object-src` | `'none'` | Deny Flash/plugins |
| `frame-src` | `'none'` | No iframes served |
| `font-src` | `'self'` | Local fonts only |
| `frame-ancestors` | `'none'` | Prevents this page being embedded in iframes |

## Request Size Limits
- Global body limit: **10 MB** (set on FastifyAdapter via `BODY_LIMIT_BYTES` env var).
- Per-endpoint file upload limit: **5 MB** (configurable via `MAX_UPLOAD_BYTES` env var).
- Rationale: document/policy uploads are typically PDFs/DOCX; 5 MB covers 99% of expected files.

## SQL Injection
- All Prisma queries use parameterized bindings exclusively.
- Raw query templates (`$queryRaw`, `$executeRaw`) use Prisma's tagged template literal syntax — values are always passed as parameters, never interpolated into the SQL string.
- String interpolation in query building is **prohibited** and blocked by ESLint rule `no-template-curly-in-string` (scoped to repository/service files).
- Reviewed call sites:
  - [x] ReportQueryService (Sprint 6)
  - [x] EmployeeService (Sprints 1-5)
  - [x] LeaveService (Sprints 1-5)
  - [x] AttendanceService (Sprints 1-5)
  - [x] PayrollService (Sprints 1-5)

## Rate Limiting
| Endpoint Group | Limit |
|---|---|
| `POST /auth/login` | 10 req/min per IP |
| `POST /auth/register` | 3 req/hour per IP |
| `POST /auth/forgot-password` | 5 req/min per IP |
| `POST /auth/resend-verification` | 3 req/hour per IP |
| `POST /documents` (upload) | 20 req/min per user |
| `POST /reports/saved/:id/export` | 10 req/min per user |

## Audit Log PII Exclusions
The `stripPii` deny-list excludes the following fields from all audit log metadata:
`base64Signature`, `passwordHash`, `otpCode`, `rawToken`, `signedUrl`

## Known Intentional Deviations
- No `@fastify/helmet` package is used — security headers are set via Fastify `onSend` hook for full control over CSP directives without unnecessary dependencies.
- There is no read replica configured in the current deployment. Report queries use `prisma.unscopedClient` directly. A read replica connection should be added when the deployment topology supports it (documented in `config.interface.ts` as `db.replicaUrl`).
