# HR Management System — Database Schema Reference

**Database:** PostgreSQL 15+  
**Total tables:** 76 (37 V1 MVP · 39 V2)  
**Conventions:** `snake_case` columns · UUID primary keys · `deleted_at` soft deletes · all timestamps UTC · every table scoped by `company_id`

---

## Global field conventions

| Pattern | Description |
|---|---|
| `id UUID PK` | Auto-generated UUID v4 via `uuid_generate_v4()`. Never sequential — safe to expose in URLs, merge-safe across environments. |
| `company_id UUID FK` | Foreign key to `companies.id`. Present on every tenant-scoped table. The application layer enforces this in every query — no data crosses tenant boundaries. |
| `created_at TIMESTAMPTZ` | Row creation timestamp. Set once by `DEFAULT NOW()`, never updated. Always UTC. |
| `updated_at TIMESTAMPTZ` | Last modification timestamp. Automatically maintained by a `set_updated_at()` trigger on every applicable table. Always UTC. |
| `deleted_at TIMESTAMPTZ` | Soft-delete timestamp. `NULL` means active. Non-null means logically deleted. All queries filter `WHERE deleted_at IS NULL`. Hard deletes are never used on HR data. |

---

## Section 00 — Multi-tenancy `[V1]`

### `companies`

The root tenant table. Every other record in the system belongs to a company via `company_id`.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | UUID | NOT NULL | `uuid_generate_v4()` | Primary key. Unique identifier for the company (tenant). |
| `name` | VARCHAR(255) | NOT NULL | — | Full legal or trading name of the company. Displayed in the UI header and on documents. |
| `slug` | VARCHAR(100) | NOT NULL | — | URL-safe lowercase identifier used for subdomain routing (e.g. `acme` → `acme.yourhrapp.com`). Globally unique across all tenants. |
| `logo_url` | TEXT | NULL | — | S3 signed URL or CDN URL to the company logo image. Used on payslips, emails, and the portal header. |
| `industry` | VARCHAR(100) | NULL | — | Industry classification (e.g. `Technology`, `Healthcare`). Used for benchmarking and analytics segmentation. |
| `employee_count_band` | VARCHAR(20) | NULL | — | Banded headcount range: `1-50`, `51-200`, `201-500`, `501-2000`, `2000+`. Used for plan tiering and feature gating. |
| `country_code` | CHAR(2) | NOT NULL | `'US'` | ISO 3166-1 alpha-2 country code for the company's primary operating country. Drives statutory compliance defaults (tax, leave law). |
| `timezone` | VARCHAR(60) | NOT NULL | `'UTC'` | IANA timezone identifier (e.g. `Asia/Dhaka`, `America/New_York`). Used as the default for all date/time display throughout the tenant. |
| `currency_code` | CHAR(3) | NOT NULL | `'USD'` | ISO 4217 currency code (e.g. `USD`, `BDT`, `EUR`). Default currency for salary and financial reporting. |
| `fiscal_year_start` | SMALLINT | NOT NULL | `1` | Month number (1–12) when the company's financial year begins. Used for leave carry-forward rollover, annual accrual resets, and financial reports. |
| `is_active` | BOOLEAN | NOT NULL | `TRUE` | Whether this tenant account is active. Setting to `FALSE` blocks all logins and API access for the tenant without deleting data. |
| `plan_tier` | VARCHAR(30) | NOT NULL | `'mvp'` | Subscription tier: `mvp`, `growth`, `enterprise`. Controls feature access and API rate limits. |
| `created_at` | TIMESTAMPTZ | NOT NULL | `NOW()` | Timestamp when the company account was first registered. |
| `updated_at` | TIMESTAMPTZ | NOT NULL | `NOW()` | Timestamp of last profile update, auto-maintained by trigger. |
| `deleted_at` | TIMESTAMPTZ | NULL | — | Soft-delete timestamp. Set when a tenant account is permanently deactivated. Retained for legal and audit purposes. |

---

### `company_settings`

Flexible key-value store for per-company configuration. Avoids schema migrations for new configuration options.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | UUID | NOT NULL | `uuid_generate_v4()` | Primary key. |
| `company_id` | UUID FK | NOT NULL | — | The company this setting belongs to. `ON DELETE CASCADE` — settings are removed with the company. |
| `key` | VARCHAR(120) | NOT NULL | — | Dot-notation configuration key (e.g. `payroll.tax_regime`, `leave.allow_backdating`, `notifications.email_enabled`). Unique per company. |
| `value` | JSONB | NOT NULL | `'{}'` | Setting value as JSON. Can be a boolean, number, string, or nested object depending on the key. |
| `updated_at` | TIMESTAMPTZ | NOT NULL | `NOW()` | Last time this setting was changed, auto-maintained by trigger. |

**Unique constraint:** `(company_id, key)`

---

## Section 01 — Authentication & Users `[V1]`

### `users`

System login accounts. One user per email per company. An employee can have a linked user account (via `employees.user_id`), but not all users are employees (e.g. external HR consultants).

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | UUID | NOT NULL | `uuid_generate_v4()` | Primary key. |
| `company_id` | UUID FK | NOT NULL | — | Tenant scoping. |
| `email` | VARCHAR(255) | NOT NULL | — | Login email address. Unique per company. Used as the primary login identifier. |
| `password_hash` | TEXT | NULL | — | Argon2id hash of the user's password. `NULL` for SSO-only accounts that authenticate exclusively via `sso_provider`. Never stored in plain text. |
| `full_name` | VARCHAR(255) | NOT NULL | — | Display name shown in the UI, on approvals, and in notifications. |
| `avatar_url` | TEXT | NULL | — | URL to the user's profile photo. Falls back to generated initials avatar in the UI if null. |
| `is_active` | BOOLEAN | NOT NULL | `TRUE` | Whether the user can log in. Set to `FALSE` when an employee is offboarded or a user is suspended. Does not delete the record. |
| `email_verified_at` | TIMESTAMPTZ | NULL | — | Timestamp when the user clicked the email verification link. `NULL` means unverified. Unverified users cannot access the system. |
| `last_login_at` | TIMESTAMPTZ | NULL | — | Timestamp of the most recent successful login. Used for inactivity detection and audit reporting. |
| `mfa_secret` | TEXT | NULL | — | AES-256-GCM encrypted TOTP secret key (Base32, RFC 6238). `NULL` when MFA is not enrolled. Decrypted only at verification time. |
| `mfa_enabled` | BOOLEAN | NOT NULL | `FALSE` | Whether TOTP-based MFA is active. Only set to `TRUE` after the user has successfully verified their first TOTP code. |
| `sso_provider` | VARCHAR(50) | NULL | — | Identity provider used for Single Sign-On: `google`, `azure`, or `okta`. `NULL` for password-only accounts. |
| `sso_subject` | VARCHAR(255) | NULL | — | The unique user identifier from the SSO provider (the `sub` claim in OIDC tokens). Used to match the IdP identity to this user on every SSO login. |
| `password_reset_token` | TEXT | NULL | — | SHA-256 hashed one-time token sent via email for password reset. Cleared after use or expiry. |
| `password_reset_expires` | TIMESTAMPTZ | NULL | — | Expiry timestamp for the password reset token. Tokens expire after 1 hour. |
| `created_at` | TIMESTAMPTZ | NOT NULL | `NOW()` | When the user account was created. |
| `updated_at` | TIMESTAMPTZ | NOT NULL | `NOW()` | Last profile update, auto-maintained by trigger. |
| `deleted_at` | TIMESTAMPTZ | NULL | — | Soft-delete. Set on offboarding or account closure. |

**Unique constraint:** `(company_id, email)`

---

### `roles`

Named permission groups assigned to users. Four system roles are seeded per company (`Admin`, `HR Manager`, `Manager`, `Employee`). Additional custom roles can be created.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | UUID | NOT NULL | `uuid_generate_v4()` | Primary key. |
| `company_id` | UUID FK | NOT NULL | — | Tenant scoping. |
| `name` | VARCHAR(80) | NOT NULL | — | Human-readable role name (e.g. `Payroll Admin`, `Department Lead`). Unique per company. |
| `description` | TEXT | NULL | — | Optional explanation of what this role grants access to. Shown in the role management UI. |
| `is_system` | BOOLEAN | NOT NULL | `FALSE` | `TRUE` for the four built-in roles seeded on company creation. System roles cannot be deleted. |
| `created_at` | TIMESTAMPTZ | NOT NULL | `NOW()` | When the role was created. |

---

### `permissions`

Atomic permission definitions. These are system-level records, not per-company. They are combined via `role_permissions`.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | UUID | NOT NULL | `uuid_generate_v4()` | Primary key. |
| `resource` | VARCHAR(80) | NOT NULL | — | The resource being governed: `employee`, `payroll`, `leave`, `recruitment`, `performance`, etc. |
| `action` | VARCHAR(40) | NOT NULL | — | The operation permitted: `read`, `write`, `delete`, `approve`, `export`. |
| `scope` | VARCHAR(40) | NOT NULL | `'company'` | The data scope: `company` (all records), `department` (own department only), `self` (own record only). |

**Unique constraint:** `(resource, action, scope)`

---

### `role_permissions`

Junction table linking roles to their permitted actions. Many-to-many.

| Column | Type | Nullable | Description |
|---|---|---|---|
| `role_id` | UUID FK | NOT NULL | References `roles.id`. `ON DELETE CASCADE`. |
| `permission_id` | UUID FK | NOT NULL | References `permissions.id`. `ON DELETE CASCADE`. |

**Primary key:** `(role_id, permission_id)`

---

### `user_roles`

Junction table assigning roles to users. A user can hold multiple roles simultaneously.

| Column | Type | Nullable | Description |
|---|---|---|---|
| `user_id` | UUID FK | NOT NULL | References `users.id`. `ON DELETE CASCADE`. |
| `role_id` | UUID FK | NOT NULL | References `roles.id`. `ON DELETE CASCADE`. |

**Primary key:** `(user_id, role_id)`

---

### `refresh_tokens`

Long-lived tokens used to obtain new JWT access tokens without re-authentication. Rotated on every use — the old token is revoked immediately when a new one is issued.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | UUID | NOT NULL | `uuid_generate_v4()` | Primary key. |
| `user_id` | UUID FK | NOT NULL | — | The user this token belongs to. `ON DELETE CASCADE`. |
| `token_hash` | TEXT | NOT NULL | — | SHA-256 hash of the actual refresh token string. The plain token is only returned to the client at issuance and never stored. |
| `expires_at` | TIMESTAMPTZ | NOT NULL | — | When this token expires (7 days from issuance by default). |
| `revoked_at` | TIMESTAMPTZ | NULL | — | Timestamp when this token was explicitly revoked (on use, logout, or security event). `NULL` means still valid. |
| `ip_address` | INET | NULL | — | Client IP address at the time of issuance. Used for suspicious session detection. |
| `user_agent` | TEXT | NULL | — | Browser/client user agent string at issuance. Used in the active sessions list shown to the user. |
| `created_at` | TIMESTAMPTZ | NOT NULL | `NOW()` | When the token was issued. |

---

## Section 02 — Organization Structure `[V1]`

### `locations`

Physical office locations or remote work designations. Employees are assigned a location, which drives holiday calendars and timezone defaults.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | UUID | NOT NULL | `uuid_generate_v4()` | Primary key. |
| `company_id` | UUID FK | NOT NULL | — | Tenant scoping. |
| `name` | VARCHAR(150) | NOT NULL | — | Location display name (e.g. `Dhaka HQ`, `London Office`, `Remote - US`). |
| `address` | TEXT | NULL | — | Full street address. Used on formal documents and for visitor directions. |
| `city` | VARCHAR(100) | NULL | — | City name. Used in org chart display and address formatting. |
| `state` | VARCHAR(100) | NULL | — | State, province, or region. |
| `country_code` | CHAR(2) | NULL | — | ISO 3166-1 alpha-2 country code. Used to determine applicable statutory leave laws and public holidays. |
| `timezone` | VARCHAR(60) | NOT NULL | `'UTC'` | IANA timezone for this location. Attendance clock-in/out times are recorded in this timezone. |
| `is_active` | BOOLEAN | NOT NULL | `TRUE` | Whether this location is available for assignment. Inactive locations are hidden from dropdowns but retain historical data. |
| `created_at` | TIMESTAMPTZ | NOT NULL | `NOW()` | Creation timestamp. |
| `updated_at` | TIMESTAMPTZ | NOT NULL | `NOW()` | Last update, auto-maintained. |
| `deleted_at` | TIMESTAMPTZ | NULL | — | Soft delete. |

---

### `departments`

Organizational units arranged in a self-referencing tree. Supports unlimited nesting depth (though the UI recommends max 4 levels for readability).

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | UUID | NOT NULL | `uuid_generate_v4()` | Primary key. |
| `company_id` | UUID FK | NOT NULL | — | Tenant scoping. |
| `name` | VARCHAR(150) | NOT NULL | — | Department name (e.g. `Engineering`, `Product`, `Human Resources`). |
| `code` | VARCHAR(20) | NULL | — | Short alphanumeric code for the department (e.g. `ENG`, `HR`). Used in payroll reports and GL export. |
| `parent_id` | UUID FK | NULL | — | Self-referencing foreign key to `departments.id`. `NULL` for top-level (root) departments. Creates the org tree hierarchy. |
| `cost_center` | VARCHAR(50) | NULL | — | Accounting cost center code. Used in payroll journal export to map salary costs to financial accounts. |
| `location_id` | UUID FK | NULL | — | Primary physical location of this department. Used for holiday calendar assignment. |
| `head_user_id` | UUID FK | NULL | — | References `users.id`. The department head. Receives department-level reports and escalation notifications. |
| `is_active` | BOOLEAN | NOT NULL | `TRUE` | Whether this department is available for employee assignment. |
| `created_at` | TIMESTAMPTZ | NOT NULL | `NOW()` | Creation timestamp. |
| `updated_at` | TIMESTAMPTZ | NOT NULL | `NOW()` | Last update, auto-maintained. |
| `deleted_at` | TIMESTAMPTZ | NULL | — | Soft delete. Historical employees retain the reference. |

---

### `job_titles`

Canonical job title definitions for the company. Employees reference these rather than free-text titles, ensuring consistency in reporting.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | UUID | NOT NULL | `uuid_generate_v4()` | Primary key. |
| `company_id` | UUID FK | NOT NULL | — | Tenant scoping. |
| `name` | VARCHAR(150) | NOT NULL | — | Job title text (e.g. `Senior Software Engineer`, `HR Business Partner`). |
| `level` | VARCHAR(50) | NULL | — | Seniority level classification: `junior`, `mid`, `senior`, `lead`, `manager`, `director`, `executive`. Used for org chart display and compensation benchmarking. |
| `is_active` | BOOLEAN | NOT NULL | `TRUE` | Whether this title appears in dropdowns for new assignments. |
| `created_at` | TIMESTAMPTZ | NOT NULL | `NOW()` | Creation timestamp. |

**Unique constraint:** `(company_id, name)`

---

### `pay_grades`

Salary band definitions. Employees are assigned a pay grade that defines the minimum and maximum salary range for their role level.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | UUID | NOT NULL | `uuid_generate_v4()` | Primary key. |
| `company_id` | UUID FK | NOT NULL | — | Tenant scoping. |
| `name` | VARCHAR(80) | NOT NULL | — | Grade name (e.g. `Grade 3`, `IC4`, `Band E`). Unique per company. |
| `min_salary` | NUMERIC(15,2) | NULL | — | Minimum annual salary for this grade in the company's base currency. Used for compensation equity analysis and offer letter generation. |
| `max_salary` | NUMERIC(15,2) | NULL | — | Maximum annual salary for this grade. Salary revisions that exceed this trigger a warning in the approval workflow. |
| `currency_code` | CHAR(3) | NOT NULL | `'USD'` | ISO 4217 currency code for the salary band values. |
| `created_at` | TIMESTAMPTZ | NOT NULL | `NOW()` | Creation timestamp. |
| `updated_at` | TIMESTAMPTZ | NOT NULL | `NOW()` | Last update, auto-maintained. |

**Unique constraint:** `(company_id, name)`

---

## Section 03 — Employees `[V1]`

### `employees`

The central entity of the system. Every HR operation references this table. One employee per person per company. Linked 1:1 to a `users` record for system access.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | UUID | NOT NULL | `uuid_generate_v4()` | Primary key. |
| `company_id` | UUID FK | NOT NULL | — | Tenant scoping. |
| `user_id` | UUID FK | NULL | — | References `users.id`. `UNIQUE`. The linked login account. `NULL` for employees who have no system login (e.g. field workers in V1 before ESS is enabled). |
| `employee_number` | VARCHAR(50) | NOT NULL | — | Company-assigned employee ID (e.g. `EMP-0042`). Unique per company. Used on payslips, letters, and reports. |
| `first_name` | VARCHAR(100) | NOT NULL | — | Legal first name, used on formal documents. |
| `last_name` | VARCHAR(100) | NOT NULL | — | Legal last name, used on formal documents. |
| `preferred_name` | VARCHAR(100) | NULL | — | The name the employee prefers to go by (e.g. a nickname). Used in UI greetings and informal communications instead of `first_name`. |
| `email` | VARCHAR(255) | NOT NULL | — | Work email address. Used for payslip delivery, notifications, and communications. Distinct from `users.email` which is the login email. |
| `personal_email` | VARCHAR(255) | NULL | — | Personal email. Used for communications after offboarding (e.g. experience letter delivery) and as a backup contact. |
| `phone` | VARCHAR(30) | NULL | — | Work or personal phone number. Used for SMS notifications and emergency contact. |
| `date_of_birth` | DATE | NULL | — | Employee's date of birth. Used for age-based statutory benefits and birthday notifications. Never displayed to peers — HR/Admin only. |
| `gender` | VARCHAR(30) | NULL | — | Gender identity. Free text to accommodate diverse identities (e.g. `Male`, `Female`, `Non-binary`). Used in diversity analytics. |
| `nationality` | CHAR(2) | NULL | — | ISO 3166-1 alpha-2 country code of citizenship. Relevant for work permit tracking and international compliance. |
| `national_id` | TEXT | NULL | — | National ID number (NID, SSN, NRIC, etc.). **Encrypted at the application layer** using AES-256-GCM before storage. Access is HR/Admin restricted. |
| `passport_number` | TEXT | NULL | — | Passport number for international employees. **Encrypted at the application layer**. Used for travel and visa processing. |
| `marital_status` | VARCHAR(20) | NULL | — | Marital status: `single`, `married`, `divorced`, `widowed`, `other`. Used for tax calculation (e.g. filing status) and benefits eligibility. |
| `profile_photo_url` | TEXT | NULL | — | URL to the employee's profile photo stored in S3. Displayed in org chart, directory, and notification emails. |
| `employment_type` | VARCHAR(30) | NOT NULL | `'full_time'` | Employment classification: `full_time`, `part_time`, `contractor`, `intern`. Drives leave policy eligibility, payroll calculation method, and benefits access. |
| `status` | VARCHAR(30) | NOT NULL | `'active'` | Current employment status: `active`, `probation`, `notice`, `terminated`, `on_leave`. Controls access and drives workflow logic throughout the system. |
| `hire_date` | DATE | NOT NULL | — | The official first working day. Used as the baseline for all tenure calculations, probation end date, leave accrual start, and employment duration reporting. |
| `probation_end_date` | DATE | NULL | — | Date when the probation period ends. Auto-calculated from hire date + company probation policy. Triggers a confirmation task for the manager. |
| `confirmation_date` | DATE | NULL | — | Date the employee was confirmed as a permanent employee post-probation. Recorded in employment history. |
| `last_working_date` | DATE | NULL | — | The final day of employment. Populated during termination workflow. All subsequent payroll, leave, and access are cut off from this date. |
| `notice_period_days` | SMALLINT | NOT NULL | `30` | Number of calendar days in the employee's contractual notice period. Used to calculate expected last working date from resignation date. |
| `department_id` | UUID FK | NULL | — | References `departments.id`. Current department assignment. Determines approval chains, leave calendar grouping, and reporting hierarchy. |
| `job_title_id` | UUID FK | NULL | — | References `job_titles.id`. Current job title. Used on org chart, payslips, and formal correspondence. |
| `location_id` | UUID FK | NULL | — | References `locations.id`. The employee's primary work location. Determines applicable holiday calendar and timezone. |
| `pay_grade_id` | UUID FK | NULL | — | References `pay_grades.id`. Current pay grade / band. Used in compensation equity analysis and offer benchmarking. |
| `reporting_manager_id` | UUID FK | NULL | — | Self-referencing to `employees.id`. Direct-line manager. Drives leave approval routing, performance review assignments, and manager dashboard. |
| `dotted_line_manager_id` | UUID FK | NULL | — | Self-referencing to `employees.id`. Secondary functional manager for matrix org structures. Receives informational notifications on key events. |
| `work_schedule` | VARCHAR(20) | NOT NULL | `'weekdays'` | Working pattern: `weekdays` (Mon–Fri standard), `shifts` (rotating schedule), `flexible` (flex hours). Determines how attendance and leave days are counted. |
| `weekly_hours` | NUMERIC(4,1) | NOT NULL | `40` | Contracted weekly working hours. Used for part-time leave proration and overtime calculation. |
| `custom_fields` | JSONB | NOT NULL | `'{}'` | Extensible store for company-specific employee attributes not in the standard schema (e.g. `{"blood_group": "O+", "emergency_badge_id": "12345"}`). GIN-indexed for search. |
| `created_at` | TIMESTAMPTZ | NOT NULL | `NOW()` | When the employee record was created. |
| `updated_at` | TIMESTAMPTZ | NOT NULL | `NOW()` | Last update, auto-maintained by trigger. |
| `deleted_at` | TIMESTAMPTZ | NULL | — | Soft delete. Set on termination. The record is retained permanently for legal, audit, and historical reporting. |

**Unique constraint:** `(company_id, employee_number)`

---

### `employee_addresses`

Stores multiple addresses per employee (current residence, permanent address).

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | UUID | NOT NULL | `uuid_generate_v4()` | Primary key. |
| `employee_id` | UUID FK | NOT NULL | — | References `employees.id`. `ON DELETE CASCADE`. |
| `type` | VARCHAR(20) | NOT NULL | `'current'` | Address type: `current` (where the employee currently lives) or `permanent` (legal/home address). |
| `line1` | TEXT | NOT NULL | — | First line of the street address. |
| `line2` | TEXT | NULL | — | Second address line (apartment, suite, floor). |
| `city` | VARCHAR(100) | NULL | — | City or municipality. |
| `state` | VARCHAR(100) | NULL | — | State, province, or district. |
| `postal_code` | VARCHAR(20) | NULL | — | ZIP or postal code. |
| `country_code` | CHAR(2) | NULL | — | ISO 3166-1 alpha-2 country code. |
| `is_primary` | BOOLEAN | NOT NULL | `FALSE` | Flags the address used for formal correspondence (payslips, letters, tax forms). Only one address should be primary per employee. |
| `created_at` | TIMESTAMPTZ | NOT NULL | `NOW()` | Creation timestamp. |
| `updated_at` | TIMESTAMPTZ | NOT NULL | `NOW()` | Last update. |

---

### `emergency_contacts`

People to contact if an employee is unreachable or in an emergency.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | UUID | NOT NULL | `uuid_generate_v4()` | Primary key. |
| `employee_id` | UUID FK | NOT NULL | — | References `employees.id`. `ON DELETE CASCADE`. |
| `name` | VARCHAR(150) | NOT NULL | — | Full name of the emergency contact. |
| `relationship` | VARCHAR(50) | NULL | — | Relationship to the employee (e.g. `Spouse`, `Parent`, `Sibling`, `Friend`). |
| `phone` | VARCHAR(30) | NOT NULL | — | Primary phone number to call in an emergency. |
| `email` | VARCHAR(255) | NULL | — | Email address for written communication. |
| `is_primary` | BOOLEAN | NOT NULL | `FALSE` | Marks the first contact to reach. At most one primary contact should be set per employee. |
| `created_at` | TIMESTAMPTZ | NOT NULL | `NOW()` | Creation timestamp. |

---

### `employee_documents`

Stores metadata about documents uploaded to the employee's vault. The actual file lives in S3; this table stores the reference and access metadata.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | UUID | NOT NULL | `uuid_generate_v4()` | Primary key. |
| `company_id` | UUID FK | NOT NULL | — | Tenant scoping. |
| `employee_id` | UUID FK | NOT NULL | — | References `employees.id`. `ON DELETE CASCADE`. |
| `document_type` | VARCHAR(80) | NOT NULL | — | Classification: `offer_letter`, `nda`, `id_proof`, `contract`, `salary_revision`, `experience_letter`, `certificate`, `other`. |
| `title` | VARCHAR(255) | NOT NULL | — | Human-readable document name shown in the vault (e.g. `Offer Letter - March 2024`). |
| `file_url` | TEXT | NOT NULL | — | S3 key or full URL to the stored file. Always accessed via a short-lived signed URL generated at read time, never stored as a public URL. |
| `file_size_bytes` | BIGINT | NULL | — | File size in bytes. Displayed to the user in the document vault and used for storage quota tracking. |
| `mime_type` | VARCHAR(100) | NULL | — | MIME type of the file (e.g. `application/pdf`, `image/jpeg`). Used to determine how to render or download the file. |
| `version` | SMALLINT | NOT NULL | `1` | Version counter. Incremented when a document is replaced (e.g. an updated contract). Earlier versions are retained for audit. |
| `expires_at` | DATE | NULL | — | Expiry date for time-limited documents (visas, certifications, work permits). The system sends renewal alerts before this date. |
| `uploaded_by_id` | UUID FK | NULL | — | References `users.id`. The user who uploaded this document. Recorded for audit. |
| `created_at` | TIMESTAMPTZ | NOT NULL | `NOW()` | Upload timestamp. |
| `deleted_at` | TIMESTAMPTZ | NULL | — | Soft delete. Deleted documents are hidden from the employee vault but retained in storage for audit. |

---

### `employment_history`

Append-only log of all employment lifecycle events. Never updated — a new row is inserted for every state change. This provides a complete, tamper-evident audit trail.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | UUID | NOT NULL | `uuid_generate_v4()` | Primary key. |
| `employee_id` | UUID FK | NOT NULL | — | References `employees.id`. `ON DELETE CASCADE`. |
| `event_type` | VARCHAR(50) | NOT NULL | — | Type of lifecycle event: `hire`, `promotion`, `transfer`, `demotion`, `title_change`, `grade_change`, `exit`. |
| `effective_date` | DATE | NOT NULL | — | The date the change took effect. May be in the past (backdated) or future (pre-dated for scheduled changes). |
| `department_id` | UUID FK | NULL | — | Department at the time of this event. `NULL` if department did not change. |
| `job_title_id` | UUID FK | NULL | — | Job title at the time of this event. `NULL` if title did not change. |
| `pay_grade_id` | UUID FK | NULL | — | Pay grade at the time of this event. `NULL` if grade did not change. |
| `reporting_manager_id` | UUID FK | NULL | — | Manager at the time of this event. `NULL` if reporting line did not change. |
| `remarks` | TEXT | NULL | — | Free-text notes explaining the reason for the change (e.g. `Promoted for outstanding performance in Q2`). |
| `created_by_id` | UUID FK | NULL | — | The HR user or system process that recorded this event. |
| `created_at` | TIMESTAMPTZ | NOT NULL | `NOW()` | When this history record was inserted. |

---

### `employee_bank_accounts`

Banking details for salary disbursement. Account numbers are encrypted at the application layer.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | UUID | NOT NULL | `uuid_generate_v4()` | Primary key. |
| `employee_id` | UUID FK | NOT NULL | — | References `employees.id`. `ON DELETE CASCADE`. |
| `account_name` | VARCHAR(150) | NOT NULL | — | Name as it appears on the bank account (usually the employee's legal name). Used for bank file generation. |
| `bank_name` | VARCHAR(150) | NULL | — | Name of the bank (e.g. `Dutch-Bangla Bank`, `HSBC`, `Chase`). |
| `bank_code` | VARCHAR(50) | NULL | — | Bank routing identifier: ABA routing number (US), IFSC code (India), SWIFT/BIC (international), or equivalent. |
| `account_number` | TEXT | NOT NULL | — | Bank account number. **Encrypted at the application layer** using AES-256-GCM. Only the last 4 digits are displayed in the UI. |
| `account_type` | VARCHAR(30) | NOT NULL | `'checking'` | Account type: `checking`, `savings`. Required for some bank file formats. |
| `is_primary` | BOOLEAN | NOT NULL | `TRUE` | The account used for salary disbursement. Only one account should be primary. When a new primary is set, the old one is demoted. |
| `is_active` | BOOLEAN | NOT NULL | `TRUE` | Whether this account is available for use. Inactive accounts are hidden but retained for historical payroll records. |
| `created_at` | TIMESTAMPTZ | NOT NULL | `NOW()` | Creation timestamp. |
| `updated_at` | TIMESTAMPTZ | NOT NULL | `NOW()` | Last update. |

---

## Section 04 — Leave & Attendance `[V1]`

### `leave_types`

Configurable leave policy definitions per company (Annual, Sick, Casual, etc.).

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | UUID | NOT NULL | `uuid_generate_v4()` | Primary key. |
| `company_id` | UUID FK | NOT NULL | — | Tenant scoping. |
| `name` | VARCHAR(100) | NOT NULL | — | Display name (e.g. `Annual Leave`, `Sick Leave`, `Maternity Leave`). Shown to employees on the ESS portal. |
| `code` | VARCHAR(20) | NOT NULL | — | Short uppercase code (e.g. `AL`, `SL`, `MAT`). Used in reports, payslips, and API filters. Unique per company. |
| `description` | TEXT | NULL | — | Policy description explaining eligibility, rules, and any special conditions. Displayed in the leave policy section of ESS. |
| `is_paid` | BOOLEAN | NOT NULL | `TRUE` | Whether approved leave days are paid. `FALSE` for unpaid leave — triggers LOP deduction in payroll. |
| `accrual_type` | VARCHAR(30) | NOT NULL | `'annual'` | How balance accumulates: `annual` (full balance credited at year start), `monthly` (1/12 of annual credited each month), `none` (no accrual — HR manually sets balance). |
| `accrual_days` | NUMERIC(5,2) | NOT NULL | `0` | Total days credited per accrual cycle. For monthly accrual, this is the annual total divided by 12 per month. |
| `max_balance_days` | NUMERIC(5,2) | NULL | — | Maximum days an employee can accumulate. If null, no cap. Prevents excessive unused leave liability. |
| `carry_forward_days` | NUMERIC(5,2) | NOT NULL | `0` | Maximum unused days that roll over to the next year. `0` means lapse-all at year end. |
| `encashable` | BOOLEAN | NOT NULL | `FALSE` | Whether unused balance can be paid out as cash (e.g. during exit or annually). |
| `requires_document` | BOOLEAN | NOT NULL | `FALSE` | Whether the employee must upload a supporting document (e.g. medical certificate for sick leave exceeding 3 days). |
| `min_notice_days` | SMALLINT | NOT NULL | `0` | Minimum advance notice required before the leave start date. Leave applied with less notice triggers a warning to the approver. |
| `allow_half_day` | BOOLEAN | NOT NULL | `FALSE` | Whether this leave type can be taken in half-day increments (morning or afternoon). |
| `is_active` | BOOLEAN | NOT NULL | `TRUE` | Whether this leave type is available for new applications. Inactive types are hidden but retained for historical balance records. |
| `created_at` | TIMESTAMPTZ | NOT NULL | `NOW()` | Creation timestamp. |
| `updated_at` | TIMESTAMPTZ | NOT NULL | `NOW()` | Last update. |

**Unique constraint:** `(company_id, code)`

---

### `leave_balances`

Per-employee, per-year leave balance ledger. The `closing_days` column is a PostgreSQL generated column — always mathematically consistent.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | UUID | NOT NULL | `uuid_generate_v4()` | Primary key. |
| `employee_id` | UUID FK | NOT NULL | — | References `employees.id`. `ON DELETE CASCADE`. |
| `leave_type_id` | UUID FK | NOT NULL | — | References `leave_types.id`. `ON DELETE CASCADE`. |
| `year` | SMALLINT | NOT NULL | — | Calendar year this balance row covers (e.g. `2025`). A new row is created at year rollover. |
| `opening_days` | NUMERIC(6,2) | NOT NULL | `0` | Balance carried forward from the previous year (capped by `leave_types.carry_forward_days`). |
| `accrued_days` | NUMERIC(6,2) | NOT NULL | `0` | Total days credited by the accrual engine during this year. Incremented monthly or set once annually. |
| `used_days` | NUMERIC(6,2) | NOT NULL | `0` | Total days consumed by approved leave requests in this year. Incremented when a request is approved. |
| `adjusted_days` | NUMERIC(6,2) | NOT NULL | `0` | Manual corrections by HR (e.g. compensatory off credit, error corrections). Can be positive or negative. |
| `closing_days` | NUMERIC(6,2) | GENERATED | — | **PostgreSQL generated column:** `opening_days + accrued_days + adjusted_days - used_days`. Always mathematically correct — no application code can create an inconsistency. |
| `updated_at` | TIMESTAMPTZ | NOT NULL | `NOW()` | Last update time. |

**Unique constraint:** `(employee_id, leave_type_id, year)`

---

### `leave_requests`

Individual leave applications submitted by employees.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | UUID | NOT NULL | `uuid_generate_v4()` | Primary key. |
| `company_id` | UUID FK | NOT NULL | — | Tenant scoping (denormalized for query performance). |
| `employee_id` | UUID FK | NOT NULL | — | The employee applying for leave. |
| `leave_type_id` | UUID FK | NOT NULL | — | The leave type being applied for. |
| `start_date` | DATE | NOT NULL | — | First day of the leave period (inclusive). |
| `end_date` | DATE | NOT NULL | — | Last day of the leave period (inclusive). |
| `total_days` | NUMERIC(5,2) | NOT NULL | — | Computed total working days within the date range, excluding weekends and public holidays. Stored explicitly at application time to freeze the calculation. |
| `is_half_day` | BOOLEAN | NOT NULL | `FALSE` | Whether this is a half-day leave request (`start_date` and `end_date` are the same date). |
| `half_day_session` | VARCHAR(10) | NULL | — | When `is_half_day` is `TRUE`: `morning` or `afternoon`. |
| `reason` | TEXT | NULL | — | Employee-provided reason for the leave. Optional depending on leave type policy. |
| `attachment_url` | TEXT | NULL | — | S3 URL to any supporting document (medical certificate, travel itinerary). Required when `leave_types.requires_document` is `TRUE`. |
| `status` | VARCHAR(20) | NOT NULL | `'pending'` | Workflow state: `pending`, `approved`, `rejected`, `cancelled`. |
| `applied_at` | TIMESTAMPTZ | NOT NULL | `NOW()` | When the employee submitted the request. |
| `reviewed_by_id` | UUID FK | NULL | — | The user who approved or rejected the request. |
| `reviewed_at` | TIMESTAMPTZ | NULL | — | When the review decision was made. |
| `reviewer_remarks` | TEXT | NULL | — | Optional comments from the reviewer (e.g. reason for rejection). Visible to the employee. |
| `created_at` | TIMESTAMPTZ | NOT NULL | `NOW()` | Record creation timestamp. |
| `updated_at` | TIMESTAMPTZ | NOT NULL | `NOW()` | Last update. |

---

### `holiday_calendars`

Named holiday calendar definitions per company and year. A company can have multiple calendars for different locations.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | UUID | NOT NULL | `uuid_generate_v4()` | Primary key. |
| `company_id` | UUID FK | NOT NULL | — | Tenant scoping. |
| `name` | VARCHAR(150) | NOT NULL | — | Calendar name (e.g. `Bangladesh 2025`, `UK Office 2025`). |
| `year` | SMALLINT | NOT NULL | — | Calendar year. A new calendar must be created for each year. |
| `location_id` | UUID FK | NULL | — | The office location this calendar applies to. `NULL` means company-wide default. |
| `created_at` | TIMESTAMPTZ | NOT NULL | `NOW()` | Creation timestamp. |

---

### `holidays`

Individual holiday entries within a calendar.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | UUID | NOT NULL | `uuid_generate_v4()` | Primary key. |
| `calendar_id` | UUID FK | NOT NULL | — | Parent holiday calendar. `ON DELETE CASCADE`. |
| `name` | VARCHAR(150) | NOT NULL | — | Holiday name (e.g. `Eid ul-Fitr`, `Independence Day`, `Christmas`). |
| `holiday_date` | DATE | NOT NULL | — | The specific date of the holiday. |
| `type` | VARCHAR(30) | NOT NULL | `'public'` | Holiday classification: `public` (mandatory, all employees off), `optional` (employee can choose to take it), `restricted` (limited quota per team). |
| `created_at` | TIMESTAMPTZ | NOT NULL | `NOW()` | Creation timestamp. |

---

### `attendance_logs`

Daily attendance record per employee. One row per employee per working day. The `work_minutes` field is a PostgreSQL generated column.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | UUID | NOT NULL | `uuid_generate_v4()` | Primary key. |
| `company_id` | UUID FK | NOT NULL | — | Tenant scoping (denormalized for performance). |
| `employee_id` | UUID FK | NOT NULL | — | References `employees.id`. `ON DELETE CASCADE`. |
| `log_date` | DATE | NOT NULL | — | The working day this log covers. Unique per employee per day. |
| `clock_in` | TIMESTAMPTZ | NULL | — | Exact timestamp when the employee clocked in. `NULL` if no clock-in was recorded (absent or on leave). |
| `clock_out` | TIMESTAMPTZ | NULL | — | Exact timestamp when the employee clocked out. `NULL` if still clocked in or if no clock-out was recorded (exception report). |
| `source` | VARCHAR(30) | NOT NULL | `'web'` | How the attendance was recorded: `web` (portal), `mobile` (app), `biometric` (device integration), `manual` (HR correction). |
| `ip_address` | INET | NULL | — | Client IP address at the time of clock-in. Used for location validation and fraud detection. |
| `latitude` | NUMERIC(9,6) | NULL | — | GPS latitude at clock-in (6 decimal places ≈ 0.11m precision). Used for geo-fencing validation in mobile punch. |
| `longitude` | NUMERIC(9,6) | NULL | — | GPS longitude at clock-in. Used alongside `latitude` for geo-fencing. |
| `status` | VARCHAR(30) | NOT NULL | `'present'` | Computed day status: `present`, `absent`, `late`, `half_day`, `on_leave`. Determines payroll LOP calculation. |
| `work_minutes` | SMALLINT | GENERATED | — | **PostgreSQL generated column:** `EXTRACT(EPOCH FROM (clock_out - clock_in)) / 60`. `NULL` if either clock value is missing. |
| `is_approved` | BOOLEAN | NOT NULL | `FALSE` | Whether a manual correction to this log has been approved by a manager or HR. |
| `approved_by_id` | UUID FK | NULL | — | The user who approved the corrected entry. |
| `notes` | TEXT | NULL | — | Free-text notes from HR explaining a manual correction (required when `source = 'manual'`). |
| `created_at` | TIMESTAMPTZ | NOT NULL | `NOW()` | Record creation timestamp. |
| `updated_at` | TIMESTAMPTZ | NOT NULL | `NOW()` | Last update. |

**Unique constraint:** `(employee_id, log_date)`

---

### `shifts` `[V2]`

Shift definitions used in shift-based work schedules.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | UUID | NOT NULL | `uuid_generate_v4()` | Primary key. |
| `company_id` | UUID FK | NOT NULL | — | Tenant scoping. |
| `name` | VARCHAR(100) | NOT NULL | — | Shift name (e.g. `Morning Shift`, `Night Shift`, `Split Shift`). |
| `start_time` | TIME | NOT NULL | — | Shift start time (wall clock, no date component). Applied relative to the employee's location timezone. |
| `end_time` | TIME | NOT NULL | — | Shift end time. For night shifts where end time < start time, `is_night_shift` must be `TRUE` to calculate duration correctly. |
| `break_minutes` | SMALLINT | NOT NULL | `0` | Total scheduled break time in minutes. Subtracted from gross hours to compute net working hours. |
| `is_night_shift` | BOOLEAN | NOT NULL | `FALSE` | Set to `TRUE` when end time crosses midnight (e.g. 22:00–06:00). Required for correct duration and day-boundary calculations. |
| `is_active` | BOOLEAN | NOT NULL | `TRUE` | Whether this shift can be assigned to new employees. |
| `created_at` | TIMESTAMPTZ | NOT NULL | `NOW()` | Creation timestamp. |

---

### `shift_assignments` `[V2]`

Maps employees to shifts for a given date range. An employee has at most one active shift assignment at any time.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | UUID | NOT NULL | `uuid_generate_v4()` | Primary key. |
| `employee_id` | UUID FK | NOT NULL | — | References `employees.id`. `ON DELETE CASCADE`. |
| `shift_id` | UUID FK | NOT NULL | — | References `shifts.id`. The shift being assigned. |
| `effective_from` | DATE | NOT NULL | — | First day this shift assignment is active. |
| `effective_to` | DATE | NULL | — | Last day this shift assignment is active. `NULL` means open-ended (current assignment). |
| `created_by_id` | UUID FK | NULL | — | The manager or HR user who created this assignment. |
| `created_at` | TIMESTAMPTZ | NOT NULL | `NOW()` | Creation timestamp. |

---

## Section 05 — Payroll `[V1 + V2]`

### `salary_components`

Atomic building blocks of a salary structure: earnings (basic, HRA), deductions (tax, PF), and benefits.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | UUID | NOT NULL | `uuid_generate_v4()` | Primary key. |
| `company_id` | UUID FK | NOT NULL | — | Tenant scoping. |
| `name` | VARCHAR(100) | NOT NULL | — | Display name (e.g. `Basic Salary`, `HRA`, `Income Tax`, `Provident Fund`). Shown on payslips. |
| `code` | VARCHAR(30) | NOT NULL | — | Unique uppercase code (e.g. `BASIC`, `HRA`, `TDS`, `PF`). Used in formulas, reports, and bank file generation. |
| `type` | VARCHAR(20) | NOT NULL | — | Component classification: `earning` (adds to gross), `deduction` (subtracted from gross), `benefit` (employer contribution, informational). |
| `calculation` | VARCHAR(20) | NOT NULL | `'fixed'` | How the amount is determined: `fixed` (explicit amount), `percentage` (% of another component, defined by `percentage_of_code` in the structure), `formula` (expression referencing component codes). |
| `formula` | TEXT | NULL | — | Expression used when `calculation = 'formula'` (e.g. `BASIC * 0.4`, `(BASIC + HRA) * 0.12`). Evaluated by the payroll engine using component codes as variables. |
| `is_taxable` | BOOLEAN | NOT NULL | `TRUE` | Whether this component is included in the taxable income calculation. `FALSE` for tax-exempt allowances like transport or meals up to statutory limits. |
| `is_statutory` | BOOLEAN | NOT NULL | `FALSE` | Whether this component is mandated by law (e.g. PF, ESI, statutory bonus). Statutory components cannot be removed from salary structures. |
| `is_active` | BOOLEAN | NOT NULL | `TRUE` | Whether this component can be added to new salary structures. |
| `created_at` | TIMESTAMPTZ | NOT NULL | `NOW()` | Creation timestamp. |

**Unique constraint:** `(company_id, code)`

---

### `salary_structures`

Named bundles of salary components. Employees are assigned a structure that determines what components appear on their payslip.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | UUID | NOT NULL | `uuid_generate_v4()` | Primary key. |
| `company_id` | UUID FK | NOT NULL | — | Tenant scoping. |
| `name` | VARCHAR(150) | NOT NULL | — | Structure name (e.g. `Standard Full-Time`, `Senior Engineer Structure`, `Contractor Structure`). |
| `description` | TEXT | NULL | — | Optional notes describing when to use this structure. |
| `is_active` | BOOLEAN | NOT NULL | `TRUE` | Whether this structure can be assigned to new employees. |
| `created_at` | TIMESTAMPTZ | NOT NULL | `NOW()` | Creation timestamp. |
| `updated_at` | TIMESTAMPTZ | NOT NULL | `NOW()` | Last update. |

---

### `salary_structure_components`

The components within a salary structure and their default computation rules.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | UUID | NOT NULL | `uuid_generate_v4()` | Primary key. |
| `structure_id` | UUID FK | NOT NULL | — | The structure this component belongs to. `ON DELETE CASCADE`. |
| `component_id` | UUID FK | NOT NULL | — | The salary component included in this structure. |
| `sequence` | SMALLINT | NOT NULL | `1` | Processing order. Components are evaluated in ascending sequence order so that higher-sequence components can reference lower-sequence results in formulas. |
| `amount` | NUMERIC(15,2) | NULL | — | Default fixed amount for this component within this structure. `NULL` if the amount is percentage- or formula-based. Can be overridden per employee via `employee_salary_overrides`. |
| `percentage_of_code` | VARCHAR(30) | NULL | — | The component `code` this is calculated as a percentage of (e.g. `BASIC` means this component = `amount% of BASIC`). `NULL` for non-percentage components. |

**Unique constraint:** `(structure_id, component_id)`

---

### `employee_salaries`

Salary assignment history per employee. A new row is inserted for every revision, maintaining a complete salary history. Only one row has `is_current = TRUE` per employee at any time.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | UUID | NOT NULL | `uuid_generate_v4()` | Primary key. |
| `employee_id` | UUID FK | NOT NULL | — | References `employees.id`. `ON DELETE CASCADE`. |
| `structure_id` | UUID FK | NOT NULL | — | The salary structure applied. Determines which components appear on payslips. |
| `ctc_annual` | NUMERIC(15,2) | NOT NULL | — | Total Cost to Company (CTC) per year in the company's base currency. The payroll engine uses this to back-calculate per-component monthly amounts based on the structure's proportions. |
| `effective_from` | DATE | NOT NULL | — | The date from which this salary record is effective. Used to select the correct salary for a given payroll period. |
| `effective_to` | DATE | NULL | — | The last date this salary is effective. `NULL` for the current salary. Set when a new revision supersedes this record. |
| `is_current` | BOOLEAN | NOT NULL | `TRUE` | Quick filter flag for the currently active salary. Only one row per employee should have this `TRUE`. |
| `approved_by_id` | UUID FK | NULL | — | The user who approved this salary revision. Required for audit. |
| `created_at` | TIMESTAMPTZ | NOT NULL | `NOW()` | When this salary record was created. |
| `created_by_id` | UUID FK | NULL | — | The HR user who entered this salary revision. |

---

### `employee_salary_overrides`

Per-employee overrides to component amounts within their assigned salary structure. Allows individual customisation without creating a new structure.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | UUID | NOT NULL | `uuid_generate_v4()` | Primary key. |
| `employee_salary_id` | UUID FK | NOT NULL | — | The employee salary record being overridden. `ON DELETE CASCADE`. |
| `component_id` | UUID FK | NOT NULL | — | The component whose default amount is being overridden. |
| `amount` | NUMERIC(15,2) | NOT NULL | — | The override amount that replaces the structure default for this employee. |

**Unique constraint:** `(employee_salary_id, component_id)`

---

### `payroll_cycles`

A payroll run covering a specific pay period. All employees in the company are processed against a single cycle.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | UUID | NOT NULL | `uuid_generate_v4()` | Primary key. |
| `company_id` | UUID FK | NOT NULL | — | Tenant scoping. |
| `name` | VARCHAR(100) | NOT NULL | — | Descriptive cycle name (e.g. `January 2025 Payroll`, `Supplemental Run Q1`). |
| `period_start` | DATE | NOT NULL | — | First day of the pay period (inclusive). Used to determine which attendance logs and leave records apply to this cycle. |
| `period_end` | DATE | NOT NULL | — | Last day of the pay period (inclusive). |
| `pay_date` | DATE | NOT NULL | — | The date employees are paid. Used in the bank transfer file and payslip header. |
| `status` | VARCHAR(20) | NOT NULL | `'draft'` | Lifecycle state: `draft` (not yet run), `processing` (compute job running), `approved` (HR signed off), `disbursed` (bank file generated and payments sent). |
| `run_by_id` | UUID FK | NULL | — | The user who initiated the payroll compute job. |
| `run_at` | TIMESTAMPTZ | NULL | — | When the compute job was triggered. |
| `approved_by_id` | UUID FK | NULL | — | The HR or Finance user who approved the final payroll. |
| `approved_at` | TIMESTAMPTZ | NULL | — | When approval was granted. |
| `created_at` | TIMESTAMPTZ | NOT NULL | `NOW()` | When this payroll cycle was created. |
| `updated_at` | TIMESTAMPTZ | NOT NULL | `NOW()` | Last update. |

---

### `payroll_entries`

Computed payroll outcome for one employee in one payroll cycle. Created by the payroll compute job.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | UUID | NOT NULL | `uuid_generate_v4()` | Primary key. |
| `cycle_id` | UUID FK | NOT NULL | — | The payroll cycle this entry belongs to. `ON DELETE CASCADE`. |
| `employee_id` | UUID FK | NOT NULL | — | The employee being paid. |
| `gross_pay` | NUMERIC(15,2) | NOT NULL | `0` | Total earnings before deductions (sum of all `earning` type components). |
| `total_deductions` | NUMERIC(15,2) | NOT NULL | `0` | Sum of all `deduction` type components (tax, PF, ESI, etc.). |
| `net_pay` | NUMERIC(15,2) | NOT NULL | `0` | Take-home amount: `gross_pay - total_deductions`. This is the amount transferred to the employee's bank account. |
| `tax_amount` | NUMERIC(15,2) | NOT NULL | `0` | Income tax portion of total deductions. Broken out separately for tax reporting (Form 16, W-2, etc.). |
| `working_days` | SMALLINT | NULL | — | Total working days in the pay period based on the employee's work schedule and holiday calendar. Used as the divisor for LOP calculation. |
| `paid_days` | NUMERIC(5,2) | NULL | — | Actual paid days = `working_days - lop_days`. Used to prorate salary for partial months. |
| `lop_days` | NUMERIC(5,2) | NOT NULL | `0` | Loss of Pay days — days absent without approved leave. Salary is reduced proportionally by `lop_days / working_days`. |
| `status` | VARCHAR(20) | NOT NULL | `'computed'` | Entry lifecycle: `computed` (calculated, not yet reviewed), `approved` (included in the approved cycle), `disbursed` (payment sent), `reversed` (corrected in a reversal run). |
| `bank_account_id` | UUID FK | NULL | — | The employee bank account used for this disbursement. Snapshotted at cycle run time. |
| `payment_ref` | VARCHAR(100) | NULL | — | Bank transaction reference number after disbursement. Used for reconciliation. |
| `payment_date` | DATE | NULL | — | Actual date the payment was processed by the bank. |
| `created_at` | TIMESTAMPTZ | NOT NULL | `NOW()` | When this entry was computed. |
| `updated_at` | TIMESTAMPTZ | NOT NULL | `NOW()` | Last update. |

**Unique constraint:** `(cycle_id, employee_id)`

---

### `payroll_entry_components`

Line-item breakdown of each component amount for a payroll entry. Powers the detailed payslip view.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | UUID | NOT NULL | `uuid_generate_v4()` | Primary key. |
| `entry_id` | UUID FK | NOT NULL | — | The payroll entry this line belongs to. `ON DELETE CASCADE`. |
| `component_id` | UUID FK | NOT NULL | — | The salary component (BASIC, HRA, TDS, etc.). |
| `amount` | NUMERIC(15,2) | NOT NULL | `0` | Computed amount for this component for this employee in this cycle, after all prorations and overrides. |
| `is_override` | BOOLEAN | NOT NULL | `FALSE` | Whether this amount was manually overridden by HR before cycle approval rather than computed by the engine. |

---

### `payslips`

Metadata for generated payslip PDF files. One payslip per payroll entry.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | UUID | NOT NULL | `uuid_generate_v4()` | Primary key. |
| `entry_id` | UUID FK | NOT NULL UNIQUE | — | The payroll entry this payslip represents. `ON DELETE CASCADE`. |
| `file_url` | TEXT | NOT NULL | — | S3 key for the generated PDF. Accessed via a time-limited signed URL. |
| `generated_at` | TIMESTAMPTZ | NOT NULL | `NOW()` | When the PDF was generated by the payslip worker. |
| `emailed_at` | TIMESTAMPTZ | NULL | — | When the payslip was emailed to the employee. `NULL` if not yet sent. |

---

### `tax_declarations` `[V2]`

Employee tax investment declarations submitted for the financial year. Used by the payroll engine to compute TDS (tax deduction at source).

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | UUID | NOT NULL | `uuid_generate_v4()` | Primary key. |
| `employee_id` | UUID FK | NOT NULL | — | References `employees.id`. `ON DELETE CASCADE`. |
| `financial_year` | VARCHAR(10) | NOT NULL | — | Financial year in local format (e.g. `2025-26` for India, `2025` for calendar-year jurisdictions). |
| `regime` | VARCHAR(30) | NOT NULL | `'new'` | Tax regime chosen by the employee (e.g. `new` or `old` in India). Determines deduction allowances. |
| `declaration_data` | JSONB | NOT NULL | `'{}'` | Structured JSON of declared investments and exemptions (e.g. `{"80C": 150000, "HRA_exemption": 60000}`). Schema varies by jurisdiction. |
| `submitted_at` | TIMESTAMPTZ | NULL | — | When the employee submitted their declaration. `NULL` while still in draft. |
| `verified_at` | TIMESTAMPTZ | NULL | — | When HR verified and accepted the declaration. |
| `verified_by_id` | UUID FK | NULL | — | The HR user who verified the submission. |
| `created_at` | TIMESTAMPTZ | NOT NULL | `NOW()` | Creation timestamp. |
| `updated_at` | TIMESTAMPTZ | NOT NULL | `NOW()` | Last update. |

**Unique constraint:** `(employee_id, financial_year)`

---

### `expense_categories` `[V2]`

Configurable categories for expense reimbursement claims.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | UUID | NOT NULL | `uuid_generate_v4()` | Primary key. |
| `company_id` | UUID FK | NOT NULL | — | Tenant scoping. |
| `name` | VARCHAR(100) | NOT NULL | — | Category name (e.g. `Travel`, `Meals`, `Office Supplies`, `Client Entertainment`). |
| `limit_amount` | NUMERIC(12,2) | NULL | — | Maximum claimable amount per request in this category. Claims exceeding this require a justification note. `NULL` means no limit. |
| `requires_receipt` | BOOLEAN | NOT NULL | `TRUE` | Whether a receipt upload is mandatory for claims in this category. |
| `is_active` | BOOLEAN | NOT NULL | `TRUE` | Whether this category appears in the expense claim form. |
| `created_at` | TIMESTAMPTZ | NOT NULL | `NOW()` | Creation timestamp. |

---

### `expense_claims` `[V2]`

Individual expense reimbursement claims submitted by employees.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | UUID | NOT NULL | `uuid_generate_v4()` | Primary key. |
| `company_id` | UUID FK | NOT NULL | — | Tenant scoping. |
| `employee_id` | UUID FK | NOT NULL | — | The employee submitting the claim. `ON DELETE CASCADE`. |
| `category_id` | UUID FK | NOT NULL | — | The expense category. |
| `title` | VARCHAR(255) | NOT NULL | — | Brief description of the expense (e.g. `Client dinner - Acme Corp`). |
| `amount` | NUMERIC(12,2) | NOT NULL | — | Claimed amount. |
| `currency_code` | CHAR(3) | NOT NULL | `'USD'` | Currency of the expense. Reimbursement is converted to the company's base currency at the prevailing rate. |
| `expense_date` | DATE | NOT NULL | — | The date the expense was incurred. Must be within the reimbursement eligibility window. |
| `receipt_url` | TEXT | NULL | — | S3 URL to the uploaded receipt image or PDF. |
| `description` | TEXT | NULL | — | Additional context or justification for the expense. |
| `status` | VARCHAR(20) | NOT NULL | `'pending'` | Approval state: `pending`, `approved`, `rejected`, `cancelled`. |
| `reviewed_by_id` | UUID FK | NULL | — | The manager or HR who approved or rejected the claim. |
| `reviewed_at` | TIMESTAMPTZ | NULL | — | When the review decision was made. |
| `remarks` | TEXT | NULL | — | Reviewer comments (especially important for rejections). |
| `payroll_cycle_id` | UUID FK | NULL | — | When approved, the payroll cycle through which reimbursement will be paid. `NULL` for standalone payment runs. |
| `created_at` | TIMESTAMPTZ | NOT NULL | `NOW()` | Submission timestamp. |
| `updated_at` | TIMESTAMPTZ | NOT NULL | `NOW()` | Last update. |

---

### `salary_advances` `[V2]`

Records of salary advance requests — early disbursement of a portion of salary to be recovered from future payroll.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | UUID | NOT NULL | `uuid_generate_v4()` | Primary key. |
| `employee_id` | UUID FK | NOT NULL | — | References `employees.id`. `ON DELETE CASCADE`. |
| `amount` | NUMERIC(12,2) | NOT NULL | — | Amount requested as advance. |
| `reason` | TEXT | NULL | — | Employee-provided reason for the advance request. |
| `requested_at` | TIMESTAMPTZ | NOT NULL | `NOW()` | When the request was submitted. |
| `status` | VARCHAR(20) | NOT NULL | `'pending'` | State: `pending`, `approved`, `rejected`, `recovered`. |
| `approved_by_id` | UUID FK | NULL | — | The HR/Finance user who approved the advance. |
| `recovery_months` | SMALLINT | NOT NULL | `1` | Number of months over which the advance will be deducted from future payroll. The deduction per month = `amount / recovery_months`. |
| `recovered_amount` | NUMERIC(12,2) | NOT NULL | `0` | Cumulative amount recovered so far via payroll deductions. When `recovered_amount = amount`, the advance is fully repaid. |
| `created_at` | TIMESTAMPTZ | NOT NULL | `NOW()` | Creation timestamp. |

---

## Section 06 — Documents & Compliance `[V1]`

### `policy_documents`

Company policy documents requiring employee acknowledgement.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | UUID | NOT NULL | `uuid_generate_v4()` | Primary key. |
| `company_id` | UUID FK | NOT NULL | — | Tenant scoping. |
| `title` | VARCHAR(255) | NOT NULL | — | Policy document title (e.g. `Code of Conduct v2.1`, `Work From Home Policy`). |
| `category` | VARCHAR(80) | NULL | — | Document category (e.g. `HR Policy`, `IT Security`, `Compliance`, `Benefits`). Used for filtering in the document library. |
| `file_url` | TEXT | NOT NULL | — | S3 key to the policy PDF. Accessed via signed URL. |
| `version` | VARCHAR(20) | NOT NULL | `'1.0'` | Version string (e.g. `1.0`, `2.3`). When a new version is uploaded, all previous acknowledgements become stale and the new version requires fresh acknowledgement. |
| `is_mandatory` | BOOLEAN | NOT NULL | `FALSE` | Whether all active employees must acknowledge this policy. Mandatory policies appear as pending tasks in the ESS portal. |
| `acknowledge_by` | DATE | NULL | — | Deadline by which all employees must have acknowledged. After this date, HR sees a report of unacknowledged employees. |
| `published_at` | TIMESTAMPTZ | NULL | — | When the policy was made visible to employees. `NULL` means still in draft. |
| `published_by_id` | UUID FK | NULL | — | The HR user who published the policy. |
| `created_at` | TIMESTAMPTZ | NOT NULL | `NOW()` | Creation timestamp. |
| `updated_at` | TIMESTAMPTZ | NOT NULL | `NOW()` | Last update. |
| `deleted_at` | TIMESTAMPTZ | NULL | — | Soft delete. Deleted policies are hidden but acknowledgement records are retained. |

---

### `policy_acknowledgements`

Records each employee's acknowledgement of a policy document.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | UUID | NOT NULL | `uuid_generate_v4()` | Primary key. |
| `policy_id` | UUID FK | NOT NULL | — | The policy being acknowledged. `ON DELETE CASCADE`. |
| `employee_id` | UUID FK | NOT NULL | — | The employee acknowledging. `ON DELETE CASCADE`. |
| `acknowledged_at` | TIMESTAMPTZ | NOT NULL | `NOW()` | When the employee clicked "I have read and understood this policy". |
| `ip_address` | INET | NULL | — | Client IP at the time of acknowledgement. Provides non-repudiation evidence for compliance audits. |

**Unique constraint:** `(policy_id, employee_id)` — one acknowledgement per version per employee.

---

### `esign_requests`

Tracks requests for electronic signatures on documents.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | UUID | NOT NULL | `uuid_generate_v4()` | Primary key. |
| `company_id` | UUID FK | NOT NULL | — | Tenant scoping. |
| `document_id` | UUID FK | NULL | — | Optional link to an `employee_documents` record if this request is for an existing vault document. |
| `title` | VARCHAR(255) | NOT NULL | — | Document title shown to the signer (e.g. `Employment Contract`, `Salary Revision Letter`). |
| `file_url` | TEXT | NOT NULL | — | S3 URL of the document to be signed. |
| `requested_by_id` | UUID FK | NOT NULL | — | The HR user initiating the signature request. |
| `signed_by_id` | UUID FK | NULL | — | The user who signed the document. `NULL` until signed. |
| `status` | VARCHAR(20) | NOT NULL | `'pending'` | Lifecycle state: `pending`, `signed`, `declined`, `expired`. |
| `signed_at` | TIMESTAMPTZ | NULL | — | When the signature was applied. |
| `file_hash` | TEXT | NULL | — | SHA-256 hash of the signed document file. Used for tamper detection — any post-signature modification changes the hash. |
| `expires_at` | TIMESTAMPTZ | NULL | — | When the signature link expires. After expiry, the signer must be sent a new request. |
| `created_at` | TIMESTAMPTZ | NOT NULL | `NOW()` | Creation timestamp. |

---

### `audit_logs`

Immutable, append-only record of every significant action in the system. Partitioned by month for performance.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | BIGSERIAL | NOT NULL | auto | Sequential integer primary key (not UUID — enables fast range scans on the partitioned table). |
| `company_id` | UUID | NOT NULL | — | Tenant scoping. Not a FK — allows logging even when related records are soft-deleted. |
| `user_id` | UUID FK | NULL | — | The user who performed the action. `NULL` for system-initiated actions (cron jobs, workers). |
| `action` | VARCHAR(50) | NOT NULL | — | The action performed: `create`, `update`, `delete`, `approve`, `reject`, `login`, `logout`, `export`, `view`. |
| `resource` | VARCHAR(80) | NOT NULL | — | The entity type acted upon: `employee`, `payroll_cycle`, `leave_request`, etc. |
| `resource_id` | UUID | NULL | — | UUID of the specific record that was acted upon. Used to retrieve the full history of a single record. |
| `old_values` | JSONB | NULL | — | Snapshot of the record's key fields **before** the change. `NULL` for create actions. Used to show what changed in the audit UI. |
| `new_values` | JSONB | NULL | — | Snapshot of the record's key fields **after** the change. `NULL` for delete actions. |
| `ip_address` | INET | NULL | — | Client IP address of the acting user. |
| `user_agent` | TEXT | NULL | — | Browser/client user agent string. |
| `created_at` | TIMESTAMPTZ | NOT NULL | `NOW()` | When this log entry was created. Also the partition key. |

**Partitioning:** `PARTITION BY RANGE (created_at)` with monthly child partitions (e.g. `audit_logs_2025_01`). Old partitions can be archived or dropped without affecting active data.

---

### `notification_templates`

Reusable templates for email, SMS, in-app, and push notifications. `company_id = NULL` means a system-level template; company-specific templates override system defaults.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | UUID | NOT NULL | `uuid_generate_v4()` | Primary key. |
| `company_id` | UUID FK | NULL | — | Tenant scoping. `NULL` for system-wide default templates. Company-specific templates with a matching `code` take precedence over system templates. |
| `code` | VARCHAR(100) | NOT NULL | — | Machine-readable event code (e.g. `leave.request.submitted`, `payslip.ready`, `employee.hired`). The notification engine looks up templates by this code. |
| `channel` | VARCHAR(20) | NOT NULL | — | Delivery channel: `email`, `sms`, `push`, `in_app`. One template per code per channel. |
| `subject` | TEXT | NULL | — | Email subject line. Supports Mustache-style variable interpolation (e.g. `{{employee_name}}'s leave request`). `NULL` for non-email channels. |
| `body` | TEXT | NOT NULL | — | Template body with variable placeholders. Rendered by the notification worker before sending. |
| `variables` | JSONB | NOT NULL | `'[]'` | JSON array of variable definitions: `[{"name": "employee_name", "description": "Full name of employee"}]`. Used for template documentation and validation. |
| `is_active` | BOOLEAN | NOT NULL | `TRUE` | Whether this template is active. Inactive templates cause the notification worker to skip sending for this event/channel combination. |
| `created_at` | TIMESTAMPTZ | NOT NULL | `NOW()` | Creation timestamp. |

---

### `notifications`

Per-user notification inbox. The in-app notification bell reads from this table.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | UUID | NOT NULL | `uuid_generate_v4()` | Primary key. |
| `company_id` | UUID FK | NOT NULL | — | Tenant scoping. |
| `user_id` | UUID FK | NOT NULL | — | The user this notification is addressed to. `ON DELETE CASCADE`. |
| `type` | VARCHAR(80) | NOT NULL | — | Notification type code matching `notification_templates.code` (e.g. `leave.request.submitted`). Used for grouping and client-side rendering. |
| `title` | VARCHAR(255) | NOT NULL | — | Rendered notification title after variable substitution. |
| `body` | TEXT | NULL | — | Rendered notification body after variable substitution. |
| `data` | JSONB | NOT NULL | `'{}'` | Structured payload for the client to deep-link to the relevant record (e.g. `{"resource": "leave_request", "resourceId": "uuid"}`). |
| `read_at` | TIMESTAMPTZ | NULL | — | When the user marked this notification as read. `NULL` = unread. Drives the unread badge count. |
| `created_at` | TIMESTAMPTZ | NOT NULL | `NOW()` | When the notification was created. |

---

## Section 07 — Reporting `[V1]`

### `saved_reports`

User-defined custom report configurations saved for reuse.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | UUID | NOT NULL | `uuid_generate_v4()` | Primary key. |
| `company_id` | UUID FK | NOT NULL | — | Tenant scoping. |
| `name` | VARCHAR(200) | NOT NULL | — | Human-readable report name (e.g. `Q3 Headcount by Department`). |
| `report_type` | VARCHAR(80) | NOT NULL | — | Report data source / category (e.g. `headcount`, `payroll_summary`, `leave_utilization`, `custom`). The reporting engine uses this to select the base query and available fields. |
| `filters` | JSONB | NOT NULL | `'{}'` | Applied filter criteria as a JSON object (e.g. `{"department_ids": ["uuid1"], "status": "active", "date_range": {"from": "2025-01-01", "to": "2025-03-31"}}`). |
| `columns` | JSONB | NOT NULL | `'[]'` | Ordered list of columns to include in the report output (e.g. `["employee_number", "full_name", "department", "hire_date"]`). |
| `created_by_id` | UUID FK | NOT NULL | — | The user who created this saved report. |
| `is_shared` | BOOLEAN | NOT NULL | `FALSE` | Whether other HR users in the company can view and run this report. |
| `created_at` | TIMESTAMPTZ | NOT NULL | `NOW()` | Creation timestamp. |
| `updated_at` | TIMESTAMPTZ | NOT NULL | `NOW()` | Last update. |

---

### `report_schedules`

Automated delivery schedules for saved reports.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | UUID | NOT NULL | `uuid_generate_v4()` | Primary key. |
| `report_id` | UUID FK | NOT NULL | — | The saved report to run on this schedule. `ON DELETE CASCADE`. |
| `frequency` | VARCHAR(20) | NOT NULL | — | How often to run: `daily`, `weekly`, `monthly`. |
| `day_of_week` | SMALLINT | NULL | — | For `weekly` frequency: day to run (0=Sunday to 6=Saturday). |
| `day_of_month` | SMALLINT | NULL | — | For `monthly` frequency: day of the month to run (1–28). Capped at 28 to avoid issues with short months. |
| `time_utc` | TIME | NOT NULL | — | Time of day to run the report (UTC). |
| `recipients` | JSONB | NOT NULL | `'[]'` | JSON array of email addresses to receive the report (e.g. `["ceo@company.com", "hr@company.com"]`). |
| `format` | VARCHAR(10) | NOT NULL | `'xlsx'` | Output format: `xlsx`, `pdf`, or `csv`. |
| `is_active` | BOOLEAN | NOT NULL | `TRUE` | Whether this schedule is currently active. Inactive schedules are skipped by the scheduler. |
| `last_run_at` | TIMESTAMPTZ | NULL | — | When this schedule was last successfully executed. Used for monitoring and manual re-run detection. |
| `created_at` | TIMESTAMPTZ | NOT NULL | `NOW()` | Creation timestamp. |

---

## Section 08 — Recruitment & ATS `[V2]`

### `job_requisitions`

Open headcount requests that drive the recruiting pipeline.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | UUID | NOT NULL | `uuid_generate_v4()` | Primary key. |
| `company_id` | UUID FK | NOT NULL | — | Tenant scoping. |
| `title` | VARCHAR(200) | NOT NULL | — | Job title being hired for. Appears on the public careers page. |
| `department_id` | UUID FK | NULL | — | Department the role will sit in. Drives the reporting line for the eventual hire. |
| `location_id` | UUID FK | NULL | — | Office location for the role. `NULL` for fully remote positions. |
| `job_type` | VARCHAR(30) | NOT NULL | `'full_time'` | Employment type: `full_time`, `part_time`, `contract`, `internship`. |
| `min_salary` | NUMERIC(15,2) | NULL | — | Minimum annual salary for this role. Used in offer benchmarking. May be shown on the careers page depending on company settings. |
| `max_salary` | NUMERIC(15,2) | NULL | — | Maximum annual salary for this role. |
| `currency_code` | CHAR(3) | NOT NULL | `'USD'` | Currency for the salary range. |
| `headcount` | SMALLINT | NOT NULL | `1` | Number of open positions for this requisition. A requisition can be marked filled when `headcount` candidates have been hired. |
| `description` | TEXT | NULL | — | Full job description shown on the careers page. Supports rich text (stored as HTML). |
| `requirements` | TEXT | NULL | — | Required qualifications, skills, and experience. |
| `status` | VARCHAR(30) | NOT NULL | `'draft'` | Requisition lifecycle: `draft`, `open` (accepting applications), `on_hold`, `filled`, `cancelled`. |
| `priority` | VARCHAR(20) | NOT NULL | `'normal'` | Hiring urgency: `low`, `normal`, `high`, `urgent`. Displayed to the recruiting team for triage. |
| `target_fill_date` | DATE | NULL | — | Target date to fill the position. Used in recruiting velocity tracking and time-to-fill reporting. |
| `requested_by_id` | UUID FK | NULL | — | The hiring manager who raised the headcount request. |
| `approved_by_id` | UUID FK | NULL | — | The HR or Finance user who approved the headcount. |
| `approved_at` | TIMESTAMPTZ | NULL | — | When the requisition was approved. |
| `created_at` | TIMESTAMPTZ | NOT NULL | `NOW()` | Creation timestamp. |
| `updated_at` | TIMESTAMPTZ | NOT NULL | `NOW()` | Last update. |

---

### `candidates`

Applicant profiles. Deduplicated by email per company — the same person applying to multiple roles has one candidate record with multiple `applications`.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | UUID | NOT NULL | `uuid_generate_v4()` | Primary key. |
| `company_id` | UUID FK | NOT NULL | — | Tenant scoping. |
| `first_name` | VARCHAR(100) | NOT NULL | — | Candidate's first name. |
| `last_name` | VARCHAR(100) | NOT NULL | — | Candidate's last name. |
| `email` | VARCHAR(255) | NOT NULL | — | Primary email. Unique per company — used for deduplication when a new application arrives. |
| `phone` | VARCHAR(30) | NULL | — | Phone number for interview scheduling and communication. |
| `resume_url` | TEXT | NULL | — | S3 URL to the uploaded resume/CV file. |
| `linkedin_url` | TEXT | NULL | — | LinkedIn profile URL. Used by recruiters for background research. |
| `source` | VARCHAR(60) | NULL | — | How the candidate found the role: `linkedin`, `indeed`, `referral`, `careers_page`, `recruiter_outreach`, `job_fair`, `other`. Used in source-of-hire analytics. |
| `referred_by_id` | UUID FK | NULL | — | References `employees.id`. The employee who referred this candidate if `source = 'referral'`. Used for referral bonus tracking. |
| `profile_data` | JSONB | NOT NULL | `'{}'` | Structured data extracted from the resume by the AI parsing service (e.g. `{"skills": ["Python", "React"], "experience_years": 5, "education": [...]}}`). Used for smart search and filtering. |
| `tags` | TEXT[] | NOT NULL | `'{}'` | Array of free-text tags added by recruiters (e.g. `["passive_candidate", "strong_technical"]`). Used for pipeline filtering. |
| `created_at` | TIMESTAMPTZ | NOT NULL | `NOW()` | Creation timestamp. |
| `updated_at` | TIMESTAMPTZ | NOT NULL | `NOW()` | Last update. |

**Unique constraint:** `(company_id, email)`

---

### `applications`

A candidate's application to a specific job requisition. Tracks the candidate's position in the hiring pipeline.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | UUID | NOT NULL | `uuid_generate_v4()` | Primary key. |
| `requisition_id` | UUID FK | NOT NULL | — | The job being applied for. `ON DELETE CASCADE`. |
| `candidate_id` | UUID FK | NOT NULL | — | The candidate applying. `ON DELETE CASCADE`. |
| `stage` | VARCHAR(40) | NOT NULL | `'applied'` | Current pipeline stage: `applied`, `screening`, `interview`, `offer`, `hired`, `rejected`, `withdrawn`. Drives the Kanban board. |
| `score` | SMALLINT | NULL | — | Recruiter's overall score for this application (e.g. 1–100). Used for shortlisting and comparative ranking. |
| `rejection_reason` | VARCHAR(100) | NULL | — | Reason category when stage is `rejected` (e.g. `skills_mismatch`, `overqualified`, `withdrew`, `better_candidate`). Used in pipeline analytics. |
| `applied_at` | TIMESTAMPTZ | NOT NULL | `NOW()` | When the application was submitted. |
| `updated_at` | TIMESTAMPTZ | NOT NULL | `NOW()` | Last pipeline update. |

**Unique constraint:** `(requisition_id, candidate_id)` — a candidate can only apply once per requisition.

---

### `interview_panels`

A scheduled interview round for a specific application.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | UUID | NOT NULL | `uuid_generate_v4()` | Primary key. |
| `application_id` | UUID FK | NOT NULL | — | The application this interview is for. `ON DELETE CASCADE`. |
| `round` | SMALLINT | NOT NULL | `1` | Round number (1 = first interview, 2 = second, etc.). Multiple rounds can exist per application. |
| `title` | VARCHAR(150) | NULL | — | Optional round label (e.g. `Technical Screen`, `Culture Fit`, `Bar Raiser`). Shown to panelists. |
| `scheduled_at` | TIMESTAMPTZ | NULL | — | When the interview is scheduled to begin. `NULL` for a panel created but not yet scheduled. |
| `duration_minutes` | SMALLINT | NOT NULL | `60` | Expected duration. Used when generating calendar invites. |
| `meeting_link` | TEXT | NULL | — | Video conferencing link (Zoom, Teams, Google Meet URL). Included in the calendar invite and interview notification. |
| `status` | VARCHAR(20) | NOT NULL | `'scheduled'` | Panel state: `scheduled`, `completed`, `cancelled`. |
| `created_at` | TIMESTAMPTZ | NOT NULL | `NOW()` | Creation timestamp. |

---

### `interview_panelists`

Maps interviewers (users) to an interview panel. Many-to-many.

| Column | Type | Nullable | Description |
|---|---|---|---|
| `panel_id` | UUID FK | NOT NULL | The interview panel. `ON DELETE CASCADE`. |
| `interviewer_id` | UUID FK | NOT NULL | The user conducting the interview. `ON DELETE CASCADE`. |

**Primary key:** `(panel_id, interviewer_id)`

---

### `interview_feedback`

Structured feedback submitted by each panelist after an interview.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | UUID | NOT NULL | `uuid_generate_v4()` | Primary key. |
| `panel_id` | UUID FK | NOT NULL | — | The interview panel this feedback is for. `ON DELETE CASCADE`. |
| `interviewer_id` | UUID FK | NOT NULL | — | The interviewer submitting feedback. |
| `overall_rating` | SMALLINT | NULL | — | 1–5 numeric rating. `CHECK (overall_rating BETWEEN 1 AND 5)`. |
| `recommendation` | VARCHAR(30) | NOT NULL | — | Hire decision: `strong_hire`, `hire`, `hold`, `no_hire`. Aggregated across panelists to compute a consensus recommendation. |
| `feedback_data` | JSONB | NOT NULL | `'{}'` | Per-attribute rubric scores and comments (e.g. `{"problem_solving": 4, "communication": 5, "notes": "..."}`). Schema defined by the company's interview scorecard template. |
| `notes` | TEXT | NULL | — | Free-text overall notes. Visible only to the recruiting team, not to the candidate. |
| `submitted_at` | TIMESTAMPTZ | NOT NULL | `NOW()` | When the feedback was submitted. |

**Unique constraint:** `(panel_id, interviewer_id)` — one feedback submission per panelist per round.

---

### `offers`

Employment offer issued to a successful candidate.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | UUID | NOT NULL | `uuid_generate_v4()` | Primary key. |
| `application_id` | UUID FK | NOT NULL UNIQUE | — | The application this offer is for. `ON DELETE CASCADE`. One offer per application. |
| `template_id` | UUID FK | NULL | — | References `employee_documents.id`. Optional offer letter template from the document vault. |
| `ctc_annual` | NUMERIC(15,2) | NOT NULL | — | Annual CTC offered. Used to auto-populate the `employee_salaries` record when the offer is accepted. |
| `join_by_date` | DATE | NULL | — | The deadline for the candidate to respond and commit to a start date. |
| `status` | VARCHAR(20) | NOT NULL | `'draft'` | Offer lifecycle: `draft`, `sent`, `accepted`, `declined`, `expired`. |
| `sent_at` | TIMESTAMPTZ | NULL | — | When the offer was sent to the candidate. |
| `responded_at` | TIMESTAMPTZ | NULL | — | When the candidate accepted or declined the offer. |
| `file_url` | TEXT | NULL | — | S3 URL of the generated offer letter PDF. |
| `esign_request_id` | UUID FK | NULL | — | References `esign_requests.id`. The eSign workflow for the offer letter, if initiated. |
| `created_at` | TIMESTAMPTZ | NOT NULL | `NOW()` | Creation timestamp. |
| `updated_at` | TIMESTAMPTZ | NOT NULL | `NOW()` | Last update. |

---

### `onboarding_templates`

Reusable checklist templates for new hire onboarding.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | UUID | NOT NULL | `uuid_generate_v4()` | Primary key. |
| `company_id` | UUID FK | NOT NULL | — | Tenant scoping. |
| `name` | VARCHAR(150) | NOT NULL | — | Template name (e.g. `Standard Engineering Onboarding`, `Remote Hire Checklist`). |
| `description` | TEXT | NULL | — | Notes on when to use this template (e.g. `For all full-time engineering hires`). |
| `is_active` | BOOLEAN | NOT NULL | `TRUE` | Whether this template appears in the onboarding assignment dropdown. |
| `created_at` | TIMESTAMPTZ | NOT NULL | `NOW()` | Creation timestamp. |

---

### `onboarding_tasks`

Task definitions within an onboarding template.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | UUID | NOT NULL | `uuid_generate_v4()` | Primary key. |
| `template_id` | UUID FK | NOT NULL | — | Parent template. `ON DELETE CASCADE`. |
| `title` | VARCHAR(200) | NOT NULL | — | Task title (e.g. `Set up laptop`, `Sign NDA`, `Meet with buddy`). |
| `description` | TEXT | NULL | — | Detailed instructions or links for completing this task. |
| `category` | VARCHAR(50) | NULL | — | Task category: `it_setup`, `legal`, `hr`, `buddy`, `benefits`, `access`. Used for grouping in the checklist UI. |
| `due_day_offset` | SMALLINT | NOT NULL | `1` | Days from `hire_date` by which this task must be completed (e.g. `1` = must complete on Day 1, `7` = within first week, `30` = within first month). |
| `assignee_role` | VARCHAR(30) | NULL | — | Who is responsible for completing this task: `employee`, `manager`, `hr`, `it`. Used to route the task to the right person when an onboarding instance is created. |
| `is_required` | BOOLEAN | NOT NULL | `TRUE` | Whether this task must be completed before the onboarding can be marked complete. |
| `sequence` | SMALLINT | NOT NULL | `1` | Display order within the checklist. |
| `created_at` | TIMESTAMPTZ | NOT NULL | `NOW()` | Creation timestamp. |

---

### `employee_onboarding`

A specific onboarding process instance for a hired employee.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | UUID | NOT NULL | `uuid_generate_v4()` | Primary key. |
| `employee_id` | UUID FK | NOT NULL | — | The new hire being onboarded. `ON DELETE CASCADE`. |
| `template_id` | UUID FK | NOT NULL | — | The template used to generate this onboarding checklist. |
| `started_at` | TIMESTAMPTZ | NOT NULL | `NOW()` | When the onboarding process was initiated (usually on or before hire date). |
| `completed_at` | TIMESTAMPTZ | NULL | — | When all required tasks were completed. `NULL` while onboarding is in progress. |
| `created_at` | TIMESTAMPTZ | NOT NULL | `NOW()` | Creation timestamp. |

---

### `onboarding_task_instances`

A single task from the template, instantiated for a specific employee's onboarding.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | UUID | NOT NULL | `uuid_generate_v4()` | Primary key. |
| `onboarding_id` | UUID FK | NOT NULL | — | The employee onboarding this task belongs to. `ON DELETE CASCADE`. |
| `task_id` | UUID FK | NOT NULL | — | The template task this instance was created from. |
| `assignee_id` | UUID FK | NULL | — | The specific user assigned to complete this task instance (resolved from `onboarding_tasks.assignee_role` at onboarding creation). |
| `due_date` | DATE | NULL | — | Computed due date: `hire_date + due_day_offset`. |
| `completed_at` | TIMESTAMPTZ | NULL | — | When the assignee marked this task as done. `NULL` = pending. |
| `notes` | TEXT | NULL | — | Completion notes or comments from the assignee. |
| `created_at` | TIMESTAMPTZ | NOT NULL | `NOW()` | Creation timestamp. |

---

## Section 09 — Performance Management `[V2]`

### `review_cycles`

A bounded period during which performance reviews are conducted.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | UUID | NOT NULL | `uuid_generate_v4()` | Primary key. |
| `company_id` | UUID FK | NOT NULL | — | Tenant scoping. |
| `name` | VARCHAR(150) | NOT NULL | — | Cycle name (e.g. `Annual Review 2025`, `H1 2025 Mid-Year`). |
| `period_start` | DATE | NOT NULL | — | Start of the performance evaluation period (the time employees are being reviewed for). |
| `period_end` | DATE | NOT NULL | — | End of the performance evaluation period. |
| `type` | VARCHAR(30) | NOT NULL | `'annual'` | Cycle type: `annual`, `biannual`, `quarterly`, `pip`. |
| `status` | VARCHAR(20) | NOT NULL | `'draft'` | Lifecycle: `draft` (not yet launched), `active` (reviews open), `reviewing` (manager reviews in progress), `calibrating` (HR calibration in progress), `closed` (cycle complete, ratings finalised). |
| `self_review_deadline` | DATE | NULL | — | Date by which all employees must complete their self-assessment. |
| `manager_review_deadline` | DATE | NULL | — | Date by which all managers must submit their reviews. |
| `calibration_date` | DATE | NULL | — | Scheduled date for the HR calibration session. |
| `created_at` | TIMESTAMPTZ | NOT NULL | `NOW()` | Creation timestamp. |
| `updated_at` | TIMESTAMPTZ | NOT NULL | `NOW()` | Last update. |

---

### `review_templates`

Configurable questionnaire templates for performance reviews.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | UUID | NOT NULL | `uuid_generate_v4()` | Primary key. |
| `company_id` | UUID FK | NOT NULL | — | Tenant scoping. |
| `name` | VARCHAR(150) | NOT NULL | — | Template name (e.g. `Engineering Annual Review 2025`, `Manager 360 Template`). |
| `sections` | JSONB | NOT NULL | `'[]'` | Array of section definitions: `[{"title": "Goals", "questions": [{"id": "q1", "text": "Rate achievement...", "type": "rating", "weight": 40}]}]`. `weight` sums to 100 across all questions. |
| `rating_scale` | JSONB | NOT NULL | `'{}'` | Rating scale configuration: `{"min": 1, "max": 5, "labels": {"1": "Needs Improvement", "3": "Meets Expectations", "5": "Exceptional"}}`. |
| `created_at` | TIMESTAMPTZ | NOT NULL | `NOW()` | Creation timestamp. |
| `updated_at` | TIMESTAMPTZ | NOT NULL | `NOW()` | Last update. |

---

### `goals`

Individual, department, or company-level OKRs/goals. Self-referencing tree for parent-child alignment.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | UUID | NOT NULL | `uuid_generate_v4()` | Primary key. |
| `company_id` | UUID FK | NOT NULL | — | Tenant scoping. |
| `owner_id` | UUID FK | NOT NULL | — | References `employees.id`. The employee responsible for this goal. `ON DELETE CASCADE`. |
| `parent_goal_id` | UUID FK | NULL | — | Self-referencing to `goals.id`. Links an individual goal to a department or company goal for OKR alignment. `NULL` for top-level goals. |
| `review_cycle_id` | UUID FK | NULL | — | The review cycle this goal is associated with. `NULL` for ongoing goals not tied to a specific cycle. |
| `title` | VARCHAR(255) | NOT NULL | — | Goal statement (e.g. `Reduce API p95 latency below 200ms`). |
| `description` | TEXT | NULL | — | Detailed explanation of the goal, its context, and why it matters. |
| `type` | VARCHAR(20) | NOT NULL | `'individual'` | Goal scope: `company` (set by leadership), `department` (set by department head), `individual` (set by or for the employee). |
| `metric` | TEXT | NULL | — | The measurable indicator of success (e.g. `p95 latency in ms`, `# of customer tickets resolved`). |
| `target_value` | NUMERIC(15,4) | NULL | — | The numeric target to achieve (e.g. `200` for 200ms latency). Used to calculate `progress_pct`. |
| `current_value` | NUMERIC(15,4) | NOT NULL | `0` | Current measured value. Updated via check-ins. Progress = `current_value / target_value × 100`. |
| `weight` | SMALLINT | NOT NULL | `100` | Percentage weight of this goal in the overall goal score (0–100). All goals for an employee should sum to 100 for the cycle. |
| `status` | VARCHAR(20) | NOT NULL | `'active'` | Goal state: `active`, `completed`, `cancelled`. |
| `due_date` | DATE | NULL | — | Target completion date. |
| `created_at` | TIMESTAMPTZ | NOT NULL | `NOW()` | Creation timestamp. |
| `updated_at` | TIMESTAMPTZ | NOT NULL | `NOW()` | Last update. |

---

### `goal_check_ins`

Progress updates posted against a goal. Maintains a time-series log of goal progress.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | UUID | NOT NULL | `uuid_generate_v4()` | Primary key. |
| `goal_id` | UUID FK | NOT NULL | — | The goal being updated. `ON DELETE CASCADE`. |
| `progress_value` | NUMERIC(15,4) | NULL | — | New current value at the time of this check-in (e.g. `185` meaning 185ms latency achieved). |
| `status` | VARCHAR(20) | NULL | — | Status assessment at check-in: `on_track`, `at_risk`, `off_track`, `completed`. |
| `notes` | TEXT | NULL | — | Narrative update explaining progress, blockers, or changes since the last check-in. |
| `created_by_id` | UUID FK | NOT NULL | — | The user who posted this check-in (usually the goal owner or their manager). |
| `created_at` | TIMESTAMPTZ | NOT NULL | `NOW()` | Check-in timestamp. |

---

### `performance_reviews`

A review form instance — one per combination of cycle, employee being reviewed, reviewer, and reviewer type. Multiple reviewer types per employee per cycle enable 360° feedback.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | UUID | NOT NULL | `uuid_generate_v4()` | Primary key. |
| `cycle_id` | UUID FK | NOT NULL | — | The review cycle. `ON DELETE CASCADE`. |
| `template_id` | UUID FK | NOT NULL | — | The questionnaire template used. |
| `employee_id` | UUID FK | NOT NULL | — | The employee being reviewed (the subject). `ON DELETE CASCADE`. |
| `reviewer_id` | UUID FK | NOT NULL | — | The employee filling in this review form (the reviewer). |
| `reviewer_type` | VARCHAR(20) | NOT NULL | — | The reviewer's relationship to the subject: `self`, `manager`, `peer`, `subordinate`. Determines visibility rules. |
| `status` | VARCHAR(20) | NOT NULL | `'pending'` | Form state: `pending` (not started), `in_progress` (partially filled), `submitted` (completed), `acknowledged` (employee has read their results). |
| `responses` | JSONB | NOT NULL | `'{}'` | All answers keyed by question ID: `{"q1": {"rating": 4, "comment": "..."}, "q2": {"rating": 3}}`. |
| `overall_rating` | NUMERIC(3,2) | NULL | — | Computed weighted average of all question ratings after submission. |
| `final_rating` | NUMERIC(3,2) | NULL | — | Post-calibration rating set by HR (may differ from `overall_rating` after forced distribution calibration). |
| `calibrated_by_id` | UUID FK | NULL | — | The HR user who adjusted the final rating during calibration. |
| `calibrated_at` | TIMESTAMPTZ | NULL | — | When calibration was applied. |
| `submitted_at` | TIMESTAMPTZ | NULL | — | When the reviewer submitted the completed form. |
| `acknowledged_at` | TIMESTAMPTZ | NULL | — | When the employee acknowledged (read) their final review and rating. |
| `created_at` | TIMESTAMPTZ | NOT NULL | `NOW()` | Creation timestamp. |
| `updated_at` | TIMESTAMPTZ | NOT NULL | `NOW()` | Last update. |

**Unique constraint:** `(cycle_id, employee_id, reviewer_id, reviewer_type)`

---

### `feedback_items`

Continuous, anytime feedback given between employees outside of formal review cycles.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | UUID | NOT NULL | `uuid_generate_v4()` | Primary key. |
| `company_id` | UUID FK | NOT NULL | — | Tenant scoping. |
| `giver_id` | UUID FK | NOT NULL | — | The employee giving the feedback. |
| `receiver_id` | UUID FK | NOT NULL | — | The employee receiving the feedback. |
| `review_id` | UUID FK | NULL | — | Optional link to a `performance_reviews.id` record if this feedback was submitted as part of a 360° review. |
| `type` | VARCHAR(20) | NOT NULL | `'praise'` | Feedback type: `praise` (recognition), `constructive` (improvement suggestion), `three_sixty` (formal 360° input). |
| `visibility` | VARCHAR(20) | NOT NULL | `'private'` | Who can see this feedback: `public` (visible to all), `private` (giver + receiver + manager + HR), `manager_only`. |
| `content` | TEXT | NOT NULL | — | The feedback message. |
| `tags` | TEXT[] | NOT NULL | `'{}'` | Skill or competency tags (e.g. `["leadership", "collaboration", "delivery"]`). Used in skills development recommendations. |
| `created_at` | TIMESTAMPTZ | NOT NULL | `NOW()` | When the feedback was given. |

---

### `one_on_ones`

Scheduled 1:1 meeting records between a manager and their direct report.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | UUID | NOT NULL | `uuid_generate_v4()` | Primary key. |
| `manager_id` | UUID FK | NOT NULL | — | References `employees.id`. The manager conducting the 1:1. |
| `employee_id` | UUID FK | NOT NULL | — | References `employees.id`. The direct report participating. |
| `scheduled_at` | TIMESTAMPTZ | NOT NULL | — | Date and time of the meeting. |
| `notes` | TEXT | NULL | — | Meeting notes and discussion points. Editable by both parties after the meeting. |
| `action_items` | JSONB | NOT NULL | `'[]'` | Array of follow-up action items: `[{"text": "Complete onboarding docs", "owner": "employee", "due": "2025-02-15", "done": false}]`. |
| `created_at` | TIMESTAMPTZ | NOT NULL | `NOW()` | Creation timestamp. |
| `updated_at` | TIMESTAMPTZ | NOT NULL | `NOW()` | Last update. |

---

### `pips`

Performance Improvement Plans initiated for employees not meeting performance expectations.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | UUID | NOT NULL | `uuid_generate_v4()` | Primary key. |
| `employee_id` | UUID FK | NOT NULL | — | The employee on the PIP. `ON DELETE CASCADE`. |
| `initiated_by_id` | UUID FK | NOT NULL | — | The HR or manager user who initiated the PIP. |
| `reason` | TEXT | NOT NULL | — | Documented reason for placing the employee on a PIP. Required for legal defensibility. |
| `objectives` | JSONB | NOT NULL | `'[]'` | Array of improvement objectives: `[{"title": "Improve code review turnaround", "target": "< 24h response time", "by_date": "2025-03-01"}]`. |
| `start_date` | DATE | NOT NULL | — | PIP effective start date. |
| `end_date` | DATE | NOT NULL | — | PIP review deadline. |
| `status` | VARCHAR(20) | NOT NULL | `'active'` | PIP state: `active`, `extended`, `closed_success` (employee met objectives), `closed_exit` (employment ended). |
| `outcome_notes` | TEXT | NULL | — | Notes describing the outcome when the PIP is closed. |
| `closed_at` | DATE | NULL | — | Date the PIP was formally closed. |
| `created_at` | TIMESTAMPTZ | NOT NULL | `NOW()` | Creation timestamp. |
| `updated_at` | TIMESTAMPTZ | NOT NULL | `NOW()` | Last update. |

---

### `pip_check_ins`

Regular progress check-in records during the PIP period.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | UUID | NOT NULL | `uuid_generate_v4()` | Primary key. |
| `pip_id` | UUID FK | NOT NULL | — | The PIP this check-in belongs to. `ON DELETE CASCADE`. |
| `check_in_date` | DATE | NOT NULL | — | The date of the check-in meeting. |
| `notes` | TEXT | NULL | — | Discussion notes from the check-in (objectives review, feedback, blockers). |
| `status` | VARCHAR(20) | NOT NULL | `'on_track'` | Progress assessment: `on_track`, `at_risk`, `off_track`. Used to flag HR when intervention is needed. |
| `reviewed_by_id` | UUID FK | NULL | — | The manager or HR conducting the check-in. |
| `created_at` | TIMESTAMPTZ | NOT NULL | `NOW()` | Creation timestamp. |

---

## Section 10 — Learning & Development `[V2]`

### `skills`

Company's skill taxonomy — the canonical list of skills tracked in the system.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | UUID | NOT NULL | `uuid_generate_v4()` | Primary key. |
| `company_id` | UUID FK | NOT NULL | — | Tenant scoping. |
| `name` | VARCHAR(150) | NOT NULL | — | Skill name (e.g. `Python`, `Project Management`, `Public Speaking`, `SQL`). Unique per company. |
| `category` | VARCHAR(80) | NULL | — | Skill category for grouping (e.g. `Technical`, `Leadership`, `Communication`, `Domain Knowledge`). |
| `description` | TEXT | NULL | — | What proficiency in this skill looks like — used to calibrate self-assessments. |
| `is_active` | BOOLEAN | NOT NULL | `TRUE` | Whether this skill appears in assessment and search interfaces. |
| `created_at` | TIMESTAMPTZ | NOT NULL | `NOW()` | Creation timestamp. |

---

### `employee_skills`

An employee's proficiency level for a specific skill, with optional manager validation.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | UUID | NOT NULL | `uuid_generate_v4()` | Primary key. |
| `employee_id` | UUID FK | NOT NULL | — | References `employees.id`. `ON DELETE CASCADE`. |
| `skill_id` | UUID FK | NOT NULL | — | References `skills.id`. `ON DELETE CASCADE`. |
| `proficiency` | SMALLINT | NOT NULL | `1` | Proficiency level on a 1–5 scale: `1` = Awareness, `2` = Basic, `3` = Intermediate, `4` = Advanced, `5` = Expert. `CHECK (proficiency BETWEEN 1 AND 5)`. |
| `self_assessed` | BOOLEAN | NOT NULL | `TRUE` | `TRUE` if the employee rated themselves; `FALSE` if manager or HR set the level. |
| `validated_by_id` | UUID FK | NULL | — | Manager or HR who validated this proficiency level. `NULL` for self-assessments not yet validated. |
| `validated_at` | TIMESTAMPTZ | NULL | — | When the proficiency was validated. |
| `updated_at` | TIMESTAMPTZ | NOT NULL | `NOW()` | Last update. |

**Unique constraint:** `(employee_id, skill_id)`

---

### `courses`

Learning content in the company's LMS catalog.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | UUID | NOT NULL | `uuid_generate_v4()` | Primary key. |
| `company_id` | UUID FK | NOT NULL | — | Tenant scoping. |
| `title` | VARCHAR(255) | NOT NULL | — | Course title (e.g. `Introduction to Machine Learning`, `POSH Training 2025`). |
| `description` | TEXT | NULL | — | Course overview, learning outcomes, and prerequisites. |
| `category` | VARCHAR(80) | NULL | — | Course topic category (e.g. `Technical`, `Compliance`, `Leadership`, `Onboarding`). |
| `provider` | VARCHAR(100) | NULL | — | Content provider: `internal` (created in-house), `coursera`, `linkedin`, `udemy`, or a custom provider name. |
| `external_url` | TEXT | NULL | — | URL to the course on an external platform (for third-party courses). The LMS deep-links to this instead of hosting content. |
| `duration_minutes` | INT | NULL | — | Estimated completion time. Shown in the course catalog to help employees plan. |
| `passing_score` | SMALLINT | NULL | — | Minimum quiz score percentage (0–100) required to mark the course as completed. `NULL` for courses with no assessment. |
| `is_mandatory` | BOOLEAN | NOT NULL | `FALSE` | Whether all employees must complete this course. Mandatory courses appear as pending tasks in ESS. |
| `content_type` | VARCHAR(30) | NOT NULL | `'mixed'` | Content format: `video`, `scorm`, `pdf`, `quiz`, `mixed`. Used to render the appropriate player in the LMS. |
| `thumbnail_url` | TEXT | NULL | — | S3 URL to the course card thumbnail image. |
| `is_active` | BOOLEAN | NOT NULL | `TRUE` | Whether the course is visible in the catalog. |
| `version` | VARCHAR(20) | NOT NULL | `'1.0'` | Course version string. Enrollments on older versions are preserved when a new version is published. |
| `created_by_id` | UUID FK | NULL | — | The user (usually HR or L&D) who added this course. |
| `created_at` | TIMESTAMPTZ | NOT NULL | `NOW()` | Creation timestamp. |
| `updated_at` | TIMESTAMPTZ | NOT NULL | `NOW()` | Last update. |

---

### `course_skills`

Maps courses to the skills they teach or develop. Many-to-many.

| Column | Type | Nullable | Description |
|---|---|---|---|
| `course_id` | UUID FK | NOT NULL | References `courses.id`. `ON DELETE CASCADE`. |
| `skill_id` | UUID FK | NOT NULL | References `skills.id`. `ON DELETE CASCADE`. |

**Primary key:** `(course_id, skill_id)`

---

### `learning_paths`

Curated sequences of courses forming a structured learning journey.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | UUID | NOT NULL | `uuid_generate_v4()` | Primary key. |
| `company_id` | UUID FK | NOT NULL | — | Tenant scoping. |
| `name` | VARCHAR(200) | NOT NULL | — | Path name (e.g. `New Engineering Manager Onboarding`, `Data Science Fundamentals`). |
| `description` | TEXT | NULL | — | What this learning path covers and who it's designed for. |
| `target_role` | VARCHAR(100) | NULL | — | The job title or role this path is designed to prepare employees for. Used in gap analysis and career development recommendations. |
| `is_active` | BOOLEAN | NOT NULL | `TRUE` | Whether this path is available for assignment. |
| `created_at` | TIMESTAMPTZ | NOT NULL | `NOW()` | Creation timestamp. |

---

### `learning_path_courses`

Ordered list of courses within a learning path.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `path_id` | UUID FK | NOT NULL | — | References `learning_paths.id`. `ON DELETE CASCADE`. |
| `course_id` | UUID FK | NOT NULL | — | References `courses.id`. `ON DELETE CASCADE`. |
| `sequence` | SMALLINT | NOT NULL | `1` | Display and recommended completion order within the path. |
| `is_required` | BOOLEAN | NOT NULL | `TRUE` | Whether this course must be completed for the path to be considered complete. `FALSE` for optional supplementary courses. |

**Primary key:** `(path_id, course_id)`

---

### `training_assignments`

Records when a course or path is assigned to an employee (by HR, manager, or the system).

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | UUID | NOT NULL | `uuid_generate_v4()` | Primary key. |
| `company_id` | UUID FK | NOT NULL | — | Tenant scoping. |
| `course_id` | UUID FK | NULL | — | References `courses.id`. Mutually exclusive with `path_id` — exactly one must be set. |
| `path_id` | UUID FK | NULL | — | References `learning_paths.id`. Mutually exclusive with `course_id`. |
| `employee_id` | UUID FK | NOT NULL | — | The employee being assigned. `ON DELETE CASCADE`. |
| `assigned_by_id` | UUID FK | NULL | — | The user who made the assignment. `NULL` for system-triggered assignments (e.g. new hire auto-assignment). |
| `due_date` | DATE | NULL | — | Deadline for completing the assigned course or path. The LMS sends reminders as the date approaches. |
| `is_mandatory` | BOOLEAN | NOT NULL | `FALSE` | Whether this assignment is mandatory for this employee (may differ from course-level `is_mandatory`). |
| `created_at` | TIMESTAMPTZ | NOT NULL | `NOW()` | Creation timestamp. |

**Constraint:** `CHECK (course_id IS NOT NULL OR path_id IS NOT NULL)` — at least one must be set.

---

### `course_enrollments`

Tracks an employee's progress through a course.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | UUID | NOT NULL | `uuid_generate_v4()` | Primary key. |
| `employee_id` | UUID FK | NOT NULL | — | References `employees.id`. `ON DELETE CASCADE`. |
| `course_id` | UUID FK | NOT NULL | — | References `courses.id`. |
| `progress_pct` | SMALLINT | NOT NULL | `0` | Completion percentage (0–100). Updated by the LMS as the employee progresses through content. `CHECK (progress_pct BETWEEN 0 AND 100)`. |
| `score` | NUMERIC(5,2) | NULL | — | Final quiz/assessment score as a percentage. Populated when the employee completes the final assessment. |
| `status` | VARCHAR(20) | NOT NULL | `'enrolled'` | Enrollment state: `enrolled` (not started), `in_progress`, `completed` (passed), `failed` (below `passing_score`). |
| `enrolled_at` | TIMESTAMPTZ | NOT NULL | `NOW()` | When the employee was enrolled. |
| `completed_at` | TIMESTAMPTZ | NULL | — | When the employee successfully completed the course. |
| `certificate_url` | TEXT | NULL | — | S3 URL to the auto-generated completion certificate PDF. |

**Unique constraint:** `(employee_id, course_id)` — one enrollment per employee per course.

---

### `certifications`

Company's registry of recognized external certifications (AWS, PMP, IELTS, etc.).

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | UUID | NOT NULL | `uuid_generate_v4()` | Primary key. |
| `company_id` | UUID FK | NOT NULL | — | Tenant scoping. |
| `name` | VARCHAR(200) | NOT NULL | — | Certification name (e.g. `AWS Certified Solutions Architect`, `PMP`, `CISSP`). |
| `issuing_body` | VARCHAR(150) | NULL | — | Organization that issues the certification (e.g. `Amazon Web Services`, `PMI`, `ISC²`). |
| `validity_months` | SMALLINT | NULL | — | How many months the certification is valid for before renewal is required. `NULL` for certifications that don't expire. |
| `is_active` | BOOLEAN | NOT NULL | `TRUE` | Whether this certification is tracked by the company. |
| `created_at` | TIMESTAMPTZ | NOT NULL | `NOW()` | Creation timestamp. |

---

### `employee_certifications`

An employee's earned certification record.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | UUID | NOT NULL | `uuid_generate_v4()` | Primary key. |
| `employee_id` | UUID FK | NOT NULL | — | References `employees.id`. `ON DELETE CASCADE`. |
| `certification_id` | UUID FK | NOT NULL | — | References `certifications.id`. The certification type. |
| `issue_date` | DATE | NOT NULL | — | When the certification was awarded. |
| `expiry_date` | DATE | NULL | — | When the certification expires (computed: `issue_date + validity_months`). The system sends renewal reminders 60/30/7 days before expiry. `NULL` for non-expiring certifications. |
| `certificate_number` | VARCHAR(100) | NULL | — | The unique certificate ID issued by the certifying body. Used for verification. |
| `certificate_url` | TEXT | NULL | — | S3 URL to the uploaded certificate document. |
| `is_verified` | BOOLEAN | NOT NULL | `FALSE` | Whether HR has verified the certificate is authentic (e.g. by checking the issuing body's verification portal). |
| `created_at` | TIMESTAMPTZ | NOT NULL | `NOW()` | Creation timestamp. |

---

## Section 11 — Benefits & Compensation `[V2]`

### `benefit_plans`

Company-offered benefit plan definitions.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | UUID | NOT NULL | `uuid_generate_v4()` | Primary key. |
| `company_id` | UUID FK | NOT NULL | — | Tenant scoping. |
| `name` | VARCHAR(150) | NOT NULL | — | Plan name (e.g. `Basic Health Insurance`, `Dental Plan B`, `Wellness Allowance`). |
| `type` | VARCHAR(50) | NOT NULL | — | Benefit category: `health`, `dental`, `vision`, `life`, `wellness`, `retirement`, `other`. |
| `description` | TEXT | NULL | — | Plan summary shown to employees during enrollment. Includes key coverage points. |
| `provider` | VARCHAR(150) | NULL | — | Insurance or benefit provider name (e.g. `Blue Shield`, `Prudential`, `Employee Wellness Fund`). |
| `coverage_details` | JSONB | NOT NULL | `'{}'` | Structured coverage information (e.g. `{"sum_insured": 500000, "cashless_hospitals": true, "deductible": 500}`). Schema varies by benefit type. |
| `employee_contribution` | NUMERIC(10,2) | NULL | — | Monthly amount the employee pays towards this plan. Shown clearly during enrollment. |
| `employer_contribution` | NUMERIC(10,2) | NULL | — | Monthly amount the company contributes per enrolled employee. Used in total compensation calculations. |
| `is_active` | BOOLEAN | NOT NULL | `TRUE` | Whether this plan appears in enrollment dropdowns. |
| `created_at` | TIMESTAMPTZ | NOT NULL | `NOW()` | Creation timestamp. |
| `updated_at` | TIMESTAMPTZ | NOT NULL | `NOW()` | Last update. |

---

### `benefit_enrollments`

An employee's enrollment in a specific benefit plan.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | UUID | NOT NULL | `uuid_generate_v4()` | Primary key. |
| `plan_id` | UUID FK | NOT NULL | — | The benefit plan the employee is enrolling in. |
| `employee_id` | UUID FK | NOT NULL | — | References `employees.id`. `ON DELETE CASCADE`. |
| `enrollment_date` | DATE | NOT NULL | — | The date coverage begins. |
| `end_date` | DATE | NULL | — | When coverage ends (e.g. on exit or annual re-enrollment). `NULL` for active enrollments. |
| `status` | VARCHAR(20) | NOT NULL | `'active'` | Enrollment status: `active`, `terminated`, `pending_renewal`. |
| `dependents` | JSONB | NOT NULL | `'[]'` | Array of enrolled dependents: `[{"name": "Jane Doe", "relationship": "Spouse", "date_of_birth": "1990-05-15"}]`. |
| `created_at` | TIMESTAMPTZ | NOT NULL | `NOW()` | Enrollment creation timestamp. |
| `updated_at` | TIMESTAMPTZ | NOT NULL | `NOW()` | Last update. |

**Unique constraint:** `(plan_id, employee_id)`

---

### `bonus_cycles`

A defined period and budget for bonus payouts.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | UUID | NOT NULL | `uuid_generate_v4()` | Primary key. |
| `company_id` | UUID FK | NOT NULL | — | Tenant scoping. |
| `name` | VARCHAR(150) | NOT NULL | — | Cycle name (e.g. `Annual Bonus 2025`, `Q4 Performance Bonus`). |
| `period_start` | DATE | NOT NULL | — | Start of the performance period this bonus is for. |
| `period_end` | DATE | NOT NULL | — | End of the performance period. |
| `budget_amount` | NUMERIC(15,2) | NULL | — | Total company budget allocated for this bonus cycle. Used to show budget utilisation as managers input allocations. |
| `status` | VARCHAR(20) | NOT NULL | `'planning'` | Lifecycle: `planning`, `open` (managers entering allocations), `approved` (Finance signed off), `disbursed` (paid via payroll). |
| `created_at` | TIMESTAMPTZ | NOT NULL | `NOW()` | Creation timestamp. |
| `updated_at` | TIMESTAMPTZ | NOT NULL | `NOW()` | Last update. |

---

### `bonus_allocations`

Per-employee bonus allocation for a cycle.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | UUID | NOT NULL | `uuid_generate_v4()` | Primary key. |
| `cycle_id` | UUID FK | NOT NULL | — | The bonus cycle. `ON DELETE CASCADE`. |
| `employee_id` | UUID FK | NOT NULL | — | The employee receiving the bonus. |
| `target_pct` | NUMERIC(5,2) | NOT NULL | `0` | Target bonus as a percentage of annual salary (e.g. `15.00` = 15%). |
| `performance_rating` | NUMERIC(3,2) | NULL | — | The employee's performance rating used to scale the bonus (pulled from the linked review cycle). |
| `recommended_amount` | NUMERIC(15,2) | NULL | — | System-calculated recommended bonus: `ctc_annual × (target_pct / 100) × performance_multiplier`. |
| `approved_amount` | NUMERIC(15,2) | NULL | — | Final approved bonus after any manager adjustments. This is the amount actually paid. |
| `approved_by_id` | UUID FK | NULL | — | The HR or Finance user who approved the final amount. |
| `approved_at` | TIMESTAMPTZ | NULL | — | When approval was given. |
| `payroll_cycle_id` | UUID FK | NULL | — | The payroll cycle through which this bonus will be disbursed. Set when the bonus cycle moves to `disbursed`. |
| `created_at` | TIMESTAMPTZ | NOT NULL | `NOW()` | Creation timestamp. |

**Unique constraint:** `(cycle_id, employee_id)`

---

### `equity_grants`

Stock option, RSU, and phantom equity grant records.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | UUID | NOT NULL | `uuid_generate_v4()` | Primary key. |
| `company_id` | UUID FK | NOT NULL | — | Tenant scoping. |
| `employee_id` | UUID FK | NOT NULL | — | The employee receiving the grant. `ON DELETE CASCADE`. |
| `grant_type` | VARCHAR(30) | NOT NULL | `'options'` | Type of equity: `options` (stock options with a strike price), `rsu` (restricted stock units, vest at FMV), `phantom` (cash-settled, no actual shares). |
| `shares` | NUMERIC(15,4) | NOT NULL | — | Total number of shares (or units) granted. |
| `strike_price` | NUMERIC(10,4) | NULL | — | Exercise price per share for stock options. `NULL` for RSUs and phantom equity. |
| `grant_date` | DATE | NOT NULL | — | Date the grant was issued. The vesting schedule starts from this date. |
| `cliff_months` | SMALLINT | NOT NULL | `12` | Number of months before any shares vest. Standard is 12 months (1-year cliff). No shares vest before the cliff. |
| `vesting_months` | SMALLINT | NOT NULL | `48` | Total vesting period in months. Standard is 48 months (4 years). After `cliff_months`, shares vest monthly. |
| `vested_shares` | NUMERIC(15,4) | NOT NULL | `0` | Cumulative shares that have vested so far. Updated by the scheduler as each vesting event occurs. |
| `status` | VARCHAR(20) | NOT NULL | `'active'` | Grant status: `active`, `exercised`, `cancelled`, `expired`. |
| `created_at` | TIMESTAMPTZ | NOT NULL | `NOW()` | Creation timestamp. |

---

## Section 12 — Surveys & Engagement `[V2]`

### `surveys`

Survey definitions for pulse checks, onboarding surveys, exit surveys, and custom surveys.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | UUID | NOT NULL | `uuid_generate_v4()` | Primary key. |
| `company_id` | UUID FK | NOT NULL | — | Tenant scoping. |
| `title` | VARCHAR(200) | NOT NULL | — | Survey title (e.g. `Q1 2025 Pulse Survey`, `30-Day New Hire Check-In`). |
| `type` | VARCHAR(30) | NOT NULL | `'pulse'` | Survey purpose: `pulse` (regular engagement check), `onboarding` (new hire milestone), `exit` (departing employee), `custom`. |
| `questions` | JSONB | NOT NULL | `'[]'` | Array of question definitions: `[{"id": "q1", "text": "How satisfied are you?", "type": "rating", "scale": 5, "required": true}]`. Supported types: `rating`, `multiple_choice`, `text`, `boolean`. |
| `is_anonymous` | BOOLEAN | NOT NULL | `TRUE` | When `TRUE`, `survey_responses.employee_id` is stored as `NULL`. HR can only see aggregated results, never individual attributions. |
| `status` | VARCHAR(20) | NOT NULL | `'draft'` | Lifecycle: `draft`, `active` (open for responses), `closed`. |
| `starts_at` | TIMESTAMPTZ | NULL | — | When the survey opens. `NULL` for manual launch. |
| `ends_at` | TIMESTAMPTZ | NULL | — | When the survey closes automatically. `NULL` for manually closed surveys. |
| `created_by_id` | UUID FK | NULL | — | The HR user who created the survey. |
| `created_at` | TIMESTAMPTZ | NOT NULL | `NOW()` | Creation timestamp. |

---

### `survey_assignments`

Tracks which employees have been assigned a survey and whether they've responded.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | UUID | NOT NULL | `uuid_generate_v4()` | Primary key. |
| `survey_id` | UUID FK | NOT NULL | — | The survey assigned. `ON DELETE CASCADE`. |
| `employee_id` | UUID FK | NOT NULL | — | The assigned employee. `ON DELETE CASCADE`. |
| `sent_at` | TIMESTAMPTZ | NOT NULL | `NOW()` | When the survey invitation was sent to the employee. |
| `reminded_at` | TIMESTAMPTZ | NULL | — | When a reminder notification was last sent. `NULL` if no reminder has been sent. |

**Unique constraint:** `(survey_id, employee_id)`

---

### `survey_responses`

Submitted survey answers from employees.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | UUID | NOT NULL | `uuid_generate_v4()` | Primary key. |
| `survey_id` | UUID FK | NOT NULL | — | The survey this response is for. `ON DELETE CASCADE`. |
| `employee_id` | UUID FK | NULL | — | The responding employee. `NULL` when `surveys.is_anonymous = TRUE` — HR cannot determine who responded. |
| `responses` | JSONB | NOT NULL | `'{}'` | Answers keyed by question ID: `{"q1": 4, "q2": "Team communication needs improvement", "q3": true}`. |
| `submitted_at` | TIMESTAMPTZ | NOT NULL | `NOW()` | When the response was submitted. |

---

## Section 13 — Offboarding `[V2]`

### `exit_requests`

Records a formal resignation or exit initiation.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | UUID | NOT NULL | `uuid_generate_v4()` | Primary key. |
| `employee_id` | UUID FK | NOT NULL | — | The departing employee. `ON DELETE CASCADE`. |
| `resignation_date` | DATE | NULL | — | The date the employee formally submitted their resignation. Used to compute notice period and expected last working date. |
| `last_working_date` | DATE | NULL | — | The agreed final working day. May differ from `resignation_date + notice_period_days` if notice is waived or extended. |
| `exit_type` | VARCHAR(30) | NOT NULL | `'voluntary'` | Nature of exit: `voluntary` (employee-initiated resignation), `involuntary` (company-initiated termination), `retirement`. |
| `reason_category` | VARCHAR(80) | NULL | — | High-level reason category for the exit: `better_opportunity`, `compensation`, `work_life_balance`, `relocation`, `personal`, `performance`, `restructuring`, etc. Drives analytics on attrition patterns. |
| `reason_detail` | TEXT | NULL | — | Employee-provided detailed reason. Captured in the ESS offboarding form or during the exit interview. |
| `notice_waived` | BOOLEAN | NOT NULL | `FALSE` | `TRUE` if the contractual notice period was waived (e.g. garden leave, immediate termination). |
| `status` | VARCHAR(20) | NOT NULL | `'pending'` | Approval state: `pending` (awaiting HR acknowledgement), `approved`, `rejected` (HR contested the exit). |
| `approved_by_id` | UUID FK | NULL | — | The HR user who processed the exit. |
| `approved_at` | TIMESTAMPTZ | NULL | — | When the exit was formally acknowledged. |
| `created_at` | TIMESTAMPTZ | NOT NULL | `NOW()` | When the exit request was submitted. |
| `updated_at` | TIMESTAMPTZ | NOT NULL | `NOW()` | Last update. |

---

### `exit_interviews`

Structured exit interview records for departing employees.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | UUID | NOT NULL | `uuid_generate_v4()` | Primary key. |
| `exit_request_id` | UUID FK | NOT NULL | — | The exit request this interview is associated with. `ON DELETE CASCADE`. |
| `interviewer_id` | UUID FK | NOT NULL | — | The HR user conducting the interview. |
| `scheduled_at` | TIMESTAMPTZ | NULL | — | When the exit interview is scheduled. `NULL` until scheduled. |
| `completed_at` | TIMESTAMPTZ | NULL | — | When the interview was completed. `NULL` until done. |
| `responses` | JSONB | NOT NULL | `'{}'` | Answers to exit interview questions in structured format. Schema defined by the company's exit interview template. |
| `notes` | TEXT | NULL | — | Interviewer's supplementary notes. Not shown to the departing employee. |
| `created_at` | TIMESTAMPTZ | NOT NULL | `NOW()` | Creation timestamp. |

---

### `exit_checklists`

Individual offboarding tasks that must be completed before an employee's last day.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | UUID | NOT NULL | `uuid_generate_v4()` | Primary key. |
| `exit_request_id` | UUID FK | NOT NULL | — | The exit request this checklist item belongs to. `ON DELETE CASCADE`. |
| `task` | VARCHAR(200) | NOT NULL | — | Task description (e.g. `Revoke GitHub access`, `Collect company laptop`, `Process final settlement`, `Issue experience letter`). |
| `category` | VARCHAR(50) | NULL | — | Task category: `it` (access revocation), `finance` (final pay, F&F settlement), `hr` (documents, certificates), `access` (badges, keys). |
| `assigned_to_id` | UUID FK | NULL | — | The user responsible for completing this task (e.g. IT admin for access revocation, HR for letter issuance). |
| `due_date` | DATE | NULL | — | When this task must be completed (usually on or before last working date). |
| `completed_at` | TIMESTAMPTZ | NULL | — | When the task was marked done. `NULL` = pending. |
| `notes` | TEXT | NULL | — | Completion notes or any relevant details. |
| `created_at` | TIMESTAMPTZ | NOT NULL | `NOW()` | Creation timestamp. |

---

## Section 14 — Integrations & Webhooks `[V2]`

### `api_keys`

API keys for external system integrations. The actual key is returned only once at creation; only a hash is stored.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | UUID | NOT NULL | `uuid_generate_v4()` | Primary key. |
| `company_id` | UUID FK | NOT NULL | — | Tenant scoping. |
| `name` | VARCHAR(100) | NOT NULL | — | Descriptive key name (e.g. `HRIS Integration`, `Payroll Export Service`). Shown in the API key management UI. |
| `key_hash` | TEXT | NOT NULL UNIQUE | — | SHA-256 hash of the full API key. The plain key is shown **once** at creation and never stored. Verification: `hash(incoming_key) == key_hash`. |
| `prefix` | VARCHAR(8) | NOT NULL | — | First 8 characters of the plain key (e.g. `hr_live_`). Shown in the UI for identification without exposing the full key. |
| `scopes` | TEXT[] | NOT NULL | `'{}'` | Array of permission scopes granted to this key (e.g. `["employees:read", "payroll:read", "webhooks:write"]`). Enforced by the API gateway on every request. |
| `last_used_at` | TIMESTAMPTZ | NULL | — | When this key was last used for a successful authenticated request. Used for identifying stale keys. |
| `expires_at` | TIMESTAMPTZ | NULL | — | Optional expiry. After this timestamp, the key is rejected. `NULL` for non-expiring keys. |
| `created_by_id` | UUID FK | NULL | — | The user who created this API key. |
| `created_at` | TIMESTAMPTZ | NOT NULL | `NOW()` | Creation timestamp. |
| `revoked_at` | TIMESTAMPTZ | NULL | — | When the key was revoked. Revoked keys are rejected immediately. `NULL` for active keys. |

---

### `webhooks`

Registered webhook endpoints that receive event notifications.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | UUID | NOT NULL | `uuid_generate_v4()` | Primary key. |
| `company_id` | UUID FK | NOT NULL | — | Tenant scoping. |
| `url` | TEXT | NOT NULL | — | The HTTPS endpoint that receives webhook POST requests. Must use TLS 1.2+. Validated before saving. |
| `secret` | TEXT | NOT NULL | — | HMAC signing secret. **Stored encrypted** at rest. Used by the webhook worker to compute `X-HR-Signature-256: sha256=HMAC(secret, payload)`. The recipient uses this to verify the payload's authenticity. |
| `events` | TEXT[] | NOT NULL | `'{}'` | Array of subscribed event types (e.g. `["employee.created", "payroll.disbursed", "leave.approved"]`). Only matching events are delivered to this endpoint. |
| `is_active` | BOOLEAN | NOT NULL | `TRUE` | Whether this webhook receives deliveries. Inactive webhooks are skipped by the delivery worker. |
| `failure_count` | SMALLINT | NOT NULL | `0` | Consecutive delivery failure count. When this reaches 10, the webhook is automatically deactivated and the company admin is notified. |
| `last_delivery_at` | TIMESTAMPTZ | NULL | — | Timestamp of the most recent delivery attempt (success or failure). Used in monitoring. |
| `created_at` | TIMESTAMPTZ | NOT NULL | `NOW()` | Creation timestamp. |

---

### `webhook_deliveries`

Audit log of every webhook delivery attempt, including request payload and response.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | UUID | NOT NULL | `uuid_generate_v4()` | Primary key. |
| `webhook_id` | UUID FK | NOT NULL | — | The webhook this delivery is for. `ON DELETE CASCADE`. |
| `event` | VARCHAR(80) | NOT NULL | — | The event type that triggered this delivery (e.g. `employee.hired`). |
| `payload` | JSONB | NOT NULL | — | The full JSON payload that was sent in the POST body. Contains the event type, timestamp, company ID, and resource ID (never PII). |
| `response_status` | SMALLINT | NULL | — | HTTP status code returned by the recipient endpoint (e.g. `200`, `404`, `500`). `NULL` if the request timed out or DNS failed. |
| `response_body` | TEXT | NULL | — | First 1000 characters of the response body. Used for debugging failed deliveries. |
| `duration_ms` | INT | NULL | — | Round-trip time in milliseconds from request dispatch to response. Used for latency monitoring. |
| `delivered_at` | TIMESTAMPTZ | NOT NULL | `NOW()` | When the delivery attempt was made. |
| `is_success` | BOOLEAN | NOT NULL | `FALSE` | `TRUE` if the recipient returned a 2xx status code. `FALSE` for all failures, timeouts, and DNS errors. |

---

### `background_jobs`

Mirrors the state of BullMQ queue jobs in the database for HR visibility and manual intervention.

| Column | Type | Nullable | Default | Description |
|---|---|---|---|---|
| `id` | UUID | NOT NULL | `uuid_generate_v4()` | Primary key. |
| `company_id` | UUID FK | NULL | — | Tenant scoping. `NULL` for system-wide jobs (e.g. global accrual sweep). |
| `queue` | VARCHAR(50) | NOT NULL | `'default'` | Queue name the job was placed in (e.g. `payroll_run`, `email_dispatch`, `report_export`). |
| `job_type` | VARCHAR(100) | NOT NULL | — | The job processor to invoke (e.g. `RunPayrollCycleJob`, `GeneratePayslipsPDFJob`, `DeliverWebhookJob`). |
| `payload` | JSONB | NOT NULL | `'{}'` | Job input data passed to the processor (e.g. `{"cycleId": "uuid", "companyId": "uuid"}`). |
| `status` | VARCHAR(20) | NOT NULL | `'pending'` | Current job state: `pending` (waiting in queue), `running` (being processed), `done` (succeeded), `failed` (max retries exceeded), `retrying` (backing off before retry). |
| `attempts` | SMALLINT | NOT NULL | `0` | Number of times this job has been attempted. Incremented on each attempt. |
| `max_attempts` | SMALLINT | NOT NULL | `3` | Maximum number of attempts before the job is moved to the dead-letter queue and marked `failed`. |
| `error_message` | TEXT | NULL | — | Error message or stack trace from the last failed attempt. Used for debugging and support. |
| `scheduled_for` | TIMESTAMPTZ | NOT NULL | `NOW()` | When the job is eligible to run. Can be a future timestamp for delayed jobs (e.g. scheduled leave accrual at month end). |
| `started_at` | TIMESTAMPTZ | NULL | — | When the worker picked up and started processing this job. |
| `completed_at` | TIMESTAMPTZ | NULL | — | When the job finished (success or final failure). |
| `created_at` | TIMESTAMPTZ | NOT NULL | `NOW()` | When the job was enqueued. |

---

## Indexes Reference

| Index | Table | Columns | Type | Purpose |
|---|---|---|---|---|
| `idx_users_company` | `users` | `(company_id)` WHERE `deleted_at IS NULL` | B-tree | Fast user lookup per tenant |
| `idx_users_email` | `users` | `(email)` | B-tree | Login lookup by email |
| `idx_refresh_tokens_user` | `refresh_tokens` | `(user_id)` WHERE `revoked_at IS NULL` | B-tree | Active session lookup |
| `idx_employees_company` | `employees` | `(company_id)` WHERE `deleted_at IS NULL` | B-tree | Tenant-scoped employee list |
| `idx_employees_dept` | `employees` | `(department_id)` | B-tree | Department roster queries |
| `idx_employees_manager` | `employees` | `(reporting_manager_id)` | B-tree | Manager's direct reports |
| `idx_employees_status` | `employees` | `(company_id, status)` | B-tree | Active/inactive filter |
| `idx_employees_name` | `employees` | GIN `to_tsvector(first_name \|\| last_name)` | GIN | Full-text employee name search |
| `idx_leave_req_employee` | `leave_requests` | `(employee_id, status)` | B-tree | Employee's leave history |
| `idx_leave_req_dates` | `leave_requests` | `(start_date, end_date)` | B-tree | Overlap / calendar queries |
| `idx_leave_balance_emp` | `leave_balances` | `(employee_id, year)` | B-tree | Balance lookup by employee/year |
| `idx_attendance_emp` | `attendance_logs` | `(employee_id, log_date)` | B-tree | Daily attendance lookup |
| `idx_payroll_cycle` | `payroll_entries` | `(cycle_id)` | B-tree | All entries for a cycle |
| `idx_payroll_employee` | `payroll_entries` | `(employee_id)` | B-tree | Employee's pay history |
| `idx_expense_employee` | `expense_claims` | `(employee_id, status)` | B-tree | Employee's claims |
| `idx_applications_req` | `applications` | `(requisition_id, stage)` | B-tree | Pipeline board query |
| `idx_applications_cand` | `applications` | `(candidate_id)` | B-tree | Candidate's application history |
| `idx_goals_owner` | `goals` | `(owner_id, status)` | B-tree | Employee's active goals |
| `idx_reviews_cycle` | `performance_reviews` | `(cycle_id, employee_id)` | B-tree | Cycle review lookup |
| `idx_reviews_status` | `performance_reviews` | `(status)` | B-tree | Pending review dashboard |
| `idx_enrollments_emp` | `course_enrollments` | `(employee_id, status)` | B-tree | Employee's training progress |
| `idx_audit_company` | `audit_logs` | `(company_id, created_at DESC)` | B-tree | Tenant audit log (most recent first) |
| `idx_audit_resource` | `audit_logs` | `(resource, resource_id)` | B-tree | History of a specific record |
| `idx_notif_user_unread` | `notifications` | `(user_id, created_at DESC)` WHERE `read_at IS NULL` | B-tree | Unread notification badge |
| `idx_jobs_queue` | `background_jobs` | `(queue, status, scheduled_for)` WHERE `status IN ('pending','retrying')` | B-tree | Queue worker polling |
| `idx_webhook_deliveries` | `webhook_deliveries` | `(webhook_id, delivered_at DESC)` | B-tree | Delivery history per webhook |

---

## Auto-update trigger

The `set_updated_at()` trigger function is attached to all tables with an `updated_at` column. It fires `BEFORE UPDATE` and sets `NEW.updated_at = NOW()` automatically — no application code needs to manage this.

```sql
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;
```

Applied to: `companies`, `employees`, `users`, `departments`, `locations`, `leave_requests`, `leave_balances`, `attendance_logs`, `payroll_cycles`, `payroll_entries`, `employee_salaries`, `salary_structures`, `expense_claims`, `job_requisitions`, `applications`, `offers`, `review_cycles`, `performance_reviews`, `goals`, `one_on_ones`, `pips`, `courses`, `training_assignments`, `benefit_plans`, `benefit_enrollments`, `bonus_cycles`, `exit_requests`.

---

*HR Management System — Database Schema Reference v1.0*  
*76 tables · V1 MVP (sections 00–07, 37 tables) · V2 full release (sections 08–14, 39 tables)*
