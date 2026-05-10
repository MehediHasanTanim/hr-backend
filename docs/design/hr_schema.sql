-- =============================================================================
-- HR MANAGEMENT SYSTEM — COMPLETE DATABASE SCHEMA
-- PostgreSQL 15+
-- Covers: V1 MVP + V2 full feature set
-- Convention: snake_case, UUID PKs, soft deletes via deleted_at,
--             all timestamps in UTC, tenant isolation via company_id
-- =============================================================================

-- ---------------------------------------------------------------------------
-- EXTENSIONS
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";       -- fuzzy name search
CREATE EXTENSION IF NOT EXISTS "btree_gist";     -- date range overlaps


-- =============================================================================
-- 00. MULTI-TENANCY
-- =============================================================================

CREATE TABLE companies (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name                VARCHAR(255)    NOT NULL,
    slug                VARCHAR(100)    NOT NULL UNIQUE,         -- subdomain key
    logo_url            TEXT,
    industry            VARCHAR(100),
    employee_count_band VARCHAR(20),                             -- '1-50','51-200',...
    country_code        CHAR(2)         NOT NULL DEFAULT 'US',
    timezone            VARCHAR(60)     NOT NULL DEFAULT 'UTC',
    currency_code       CHAR(3)         NOT NULL DEFAULT 'USD',
    fiscal_year_start   SMALLINT        NOT NULL DEFAULT 1,      -- month 1-12
    is_active           BOOLEAN         NOT NULL DEFAULT TRUE,
    plan_tier           VARCHAR(30)     NOT NULL DEFAULT 'mvp',  -- mvp | growth | enterprise
    created_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ
);

CREATE TABLE company_settings (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    key         VARCHAR(120) NOT NULL,
    value       JSONB        NOT NULL DEFAULT '{}',
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    UNIQUE (company_id, key)
);


-- =============================================================================
-- 01. AUTHENTICATION & USERS  [V1]
-- =============================================================================

CREATE TABLE users (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id          UUID        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    email               VARCHAR(255) NOT NULL,
    password_hash       TEXT,                                    -- NULL if SSO-only
    full_name           VARCHAR(255) NOT NULL,
    avatar_url          TEXT,
    is_active           BOOLEAN     NOT NULL DEFAULT TRUE,
    email_verified_at   TIMESTAMPTZ,
    last_login_at       TIMESTAMPTZ,
    mfa_secret          TEXT,                                    -- TOTP secret (encrypted)
    mfa_enabled         BOOLEAN     NOT NULL DEFAULT FALSE,
    sso_provider        VARCHAR(50),                             -- google | azure | okta
    sso_subject         VARCHAR(255),
    password_reset_token TEXT,
    password_reset_expires TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ,
    UNIQUE (company_id, email)
);

CREATE TABLE roles (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id  UUID         NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    name        VARCHAR(80)  NOT NULL,
    description TEXT,
    is_system   BOOLEAN      NOT NULL DEFAULT FALSE,             -- built-in roles
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    UNIQUE (company_id, name)
);

CREATE TABLE permissions (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    resource    VARCHAR(80)  NOT NULL,                           -- 'employee','payroll',...
    action      VARCHAR(40)  NOT NULL,                           -- 'read','write','approve'
    scope       VARCHAR(40)  NOT NULL DEFAULT 'company',         -- 'company'|'department'|'self'
    UNIQUE (resource, action, scope)
);

CREATE TABLE role_permissions (
    role_id       UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE user_roles (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, role_id)
);

CREATE TABLE refresh_tokens (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash  TEXT        NOT NULL UNIQUE,
    expires_at  TIMESTAMPTZ NOT NULL,
    revoked_at  TIMESTAMPTZ,
    ip_address  INET,
    user_agent  TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- =============================================================================
-- 02. ORGANIZATION STRUCTURE  [V1]
-- =============================================================================

CREATE TABLE locations (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id  UUID         NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    name        VARCHAR(150) NOT NULL,
    address     TEXT,
    city        VARCHAR(100),
    state       VARCHAR(100),
    country_code CHAR(2),
    timezone    VARCHAR(60)  NOT NULL DEFAULT 'UTC',
    is_active   BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    deleted_at  TIMESTAMPTZ
);

CREATE TABLE departments (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id    UUID         NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    name          VARCHAR(150) NOT NULL,
    code          VARCHAR(20),
    parent_id     UUID REFERENCES departments(id),
    cost_center   VARCHAR(50),
    location_id   UUID REFERENCES locations(id),
    head_user_id  UUID REFERENCES users(id),
    is_active     BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    deleted_at    TIMESTAMPTZ
);

CREATE TABLE job_titles (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id  UUID         NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    name        VARCHAR(150) NOT NULL,
    level       VARCHAR(50),                                     -- junior|mid|senior|lead
    is_active   BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    UNIQUE (company_id, name)
);

CREATE TABLE pay_grades (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id      UUID         NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    name            VARCHAR(80)  NOT NULL,
    min_salary      NUMERIC(15,2),
    max_salary      NUMERIC(15,2),
    currency_code   CHAR(3)      NOT NULL DEFAULT 'USD',
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    UNIQUE (company_id, name)
);


-- =============================================================================
-- 03. EMPLOYEES  [V1]
-- =============================================================================

CREATE TABLE employees (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id          UUID         NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    user_id             UUID         UNIQUE REFERENCES users(id),
    employee_number     VARCHAR(50)  NOT NULL,
    first_name          VARCHAR(100) NOT NULL,
    last_name           VARCHAR(100) NOT NULL,
    preferred_name      VARCHAR(100),
    email               VARCHAR(255) NOT NULL,
    personal_email      VARCHAR(255),
    phone               VARCHAR(30),
    date_of_birth       DATE,
    gender              VARCHAR(30),
    nationality         CHAR(2),
    national_id         TEXT,                                    -- encrypted at app layer
    passport_number     TEXT,                                    -- encrypted
    marital_status      VARCHAR(20),
    profile_photo_url   TEXT,

    -- Employment details
    employment_type     VARCHAR(30)  NOT NULL DEFAULT 'full_time',  -- full_time|part_time|contractor|intern
    status              VARCHAR(30)  NOT NULL DEFAULT 'active',     -- active|probation|notice|terminated|on_leave
    hire_date           DATE         NOT NULL,
    probation_end_date  DATE,
    confirmation_date   DATE,
    last_working_date   DATE,
    notice_period_days  SMALLINT     NOT NULL DEFAULT 30,

    -- Org placement
    department_id       UUID REFERENCES departments(id),
    job_title_id        UUID REFERENCES job_titles(id),
    location_id         UUID REFERENCES locations(id),
    pay_grade_id        UUID REFERENCES pay_grades(id),
    reporting_manager_id UUID REFERENCES employees(id),
    dotted_line_manager_id UUID REFERENCES employees(id),

    -- Work schedule
    work_schedule       VARCHAR(20)  NOT NULL DEFAULT 'weekdays',   -- weekdays|shifts|flexible
    weekly_hours        NUMERIC(4,1) NOT NULL DEFAULT 40,

    -- Metadata
    custom_fields       JSONB        NOT NULL DEFAULT '{}',
    created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ,
    UNIQUE (company_id, employee_number)
);

CREATE TABLE employee_addresses (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    employee_id     UUID         NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    type            VARCHAR(20)  NOT NULL DEFAULT 'current',    -- current|permanent
    line1           TEXT         NOT NULL,
    line2           TEXT,
    city            VARCHAR(100),
    state           VARCHAR(100),
    postal_code     VARCHAR(20),
    country_code    CHAR(2),
    is_primary      BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE emergency_contacts (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    employee_id     UUID         NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    name            VARCHAR(150) NOT NULL,
    relationship    VARCHAR(50),
    phone           VARCHAR(30)  NOT NULL,
    email           VARCHAR(255),
    is_primary      BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE employee_documents (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id      UUID         NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    employee_id     UUID         NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    document_type   VARCHAR(80)  NOT NULL,                      -- offer_letter|nda|id_proof|contract
    title           VARCHAR(255) NOT NULL,
    file_url        TEXT         NOT NULL,
    file_size_bytes BIGINT,
    mime_type       VARCHAR(100),
    version         SMALLINT     NOT NULL DEFAULT 1,
    expires_at      DATE,
    uploaded_by_id  UUID         REFERENCES users(id),
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ
);

CREATE TABLE employment_history (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    employee_id     UUID         NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    event_type      VARCHAR(50)  NOT NULL,                      -- hire|promotion|transfer|demotion|exit
    effective_date  DATE         NOT NULL,
    department_id   UUID REFERENCES departments(id),
    job_title_id    UUID REFERENCES job_titles(id),
    pay_grade_id    UUID REFERENCES pay_grades(id),
    reporting_manager_id UUID REFERENCES employees(id),
    remarks         TEXT,
    created_by_id   UUID REFERENCES users(id),
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE employee_bank_accounts (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    employee_id     UUID         NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    account_name    VARCHAR(150) NOT NULL,
    bank_name       VARCHAR(150),
    bank_code       VARCHAR(50),                                -- routing/SWIFT/IFSC
    account_number  TEXT         NOT NULL,                     -- encrypted
    account_type    VARCHAR(30)  NOT NULL DEFAULT 'checking',
    is_primary      BOOLEAN      NOT NULL DEFAULT TRUE,
    is_active       BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);


-- =============================================================================
-- 04. LEAVE & ATTENDANCE  [V1]
-- =============================================================================

CREATE TABLE leave_types (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id          UUID         NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    name                VARCHAR(100) NOT NULL,
    code                VARCHAR(20)  NOT NULL,
    description         TEXT,
    is_paid             BOOLEAN      NOT NULL DEFAULT TRUE,
    accrual_type        VARCHAR(30)  NOT NULL DEFAULT 'annual',  -- annual|monthly|none
    accrual_days        NUMERIC(5,2) NOT NULL DEFAULT 0,
    max_balance_days    NUMERIC(5,2),
    carry_forward_days  NUMERIC(5,2) NOT NULL DEFAULT 0,
    encashable          BOOLEAN      NOT NULL DEFAULT FALSE,
    requires_document   BOOLEAN      NOT NULL DEFAULT FALSE,
    min_notice_days     SMALLINT     NOT NULL DEFAULT 0,
    allow_half_day      BOOLEAN      NOT NULL DEFAULT FALSE,
    is_active           BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    UNIQUE (company_id, code)
);

CREATE TABLE leave_balances (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    employee_id     UUID         NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    leave_type_id   UUID         NOT NULL REFERENCES leave_types(id) ON DELETE CASCADE,
    year            SMALLINT     NOT NULL,
    opening_days    NUMERIC(6,2) NOT NULL DEFAULT 0,
    accrued_days    NUMERIC(6,2) NOT NULL DEFAULT 0,
    used_days       NUMERIC(6,2) NOT NULL DEFAULT 0,
    adjusted_days   NUMERIC(6,2) NOT NULL DEFAULT 0,            -- manual HR corrections
    closing_days    NUMERIC(6,2) GENERATED ALWAYS AS
                    (opening_days + accrued_days + adjusted_days - used_days) STORED,
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    UNIQUE (employee_id, leave_type_id, year)
);

CREATE TABLE leave_requests (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id          UUID         NOT NULL REFERENCES companies(id),
    employee_id         UUID         NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    leave_type_id       UUID         NOT NULL REFERENCES leave_types(id),
    start_date          DATE         NOT NULL,
    end_date            DATE         NOT NULL,
    total_days          NUMERIC(5,2) NOT NULL,
    is_half_day         BOOLEAN      NOT NULL DEFAULT FALSE,
    half_day_session    VARCHAR(10),                             -- morning|afternoon
    reason              TEXT,
    attachment_url      TEXT,
    status              VARCHAR(20)  NOT NULL DEFAULT 'pending', -- pending|approved|rejected|cancelled
    applied_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    reviewed_by_id      UUID REFERENCES users(id),
    reviewed_at         TIMESTAMPTZ,
    reviewer_remarks    TEXT,
    created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE holiday_calendars (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id  UUID         NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    name        VARCHAR(150) NOT NULL,
    year        SMALLINT     NOT NULL,
    location_id UUID REFERENCES locations(id),
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE holidays (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    calendar_id     UUID         NOT NULL REFERENCES holiday_calendars(id) ON DELETE CASCADE,
    name            VARCHAR(150) NOT NULL,
    holiday_date    DATE         NOT NULL,
    type            VARCHAR(30)  NOT NULL DEFAULT 'public',     -- public|optional|restricted
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Attendance (V1: web punch only; V2: biometric/geo extended via source field)
CREATE TABLE attendance_logs (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id      UUID         NOT NULL REFERENCES companies(id),
    employee_id     UUID         NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    log_date        DATE         NOT NULL,
    clock_in        TIMESTAMPTZ,
    clock_out       TIMESTAMPTZ,
    source          VARCHAR(30)  NOT NULL DEFAULT 'web',        -- web|mobile|biometric|manual
    ip_address      INET,
    latitude        NUMERIC(9,6),
    longitude       NUMERIC(9,6),
    status          VARCHAR(30)  NOT NULL DEFAULT 'present',    -- present|absent|late|half_day|on_leave
    work_minutes    SMALLINT     GENERATED ALWAYS AS
                    (CASE WHEN clock_in IS NOT NULL AND clock_out IS NOT NULL
                     THEN EXTRACT(EPOCH FROM (clock_out - clock_in))::SMALLINT / 60
                     ELSE NULL END) STORED,
    is_approved     BOOLEAN      NOT NULL DEFAULT FALSE,
    approved_by_id  UUID REFERENCES users(id),
    notes           TEXT,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    UNIQUE (employee_id, log_date)
);

-- V2: Shifts & scheduling
CREATE TABLE shifts (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id      UUID         NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    name            VARCHAR(100) NOT NULL,
    start_time      TIME         NOT NULL,
    end_time        TIME         NOT NULL,
    break_minutes   SMALLINT     NOT NULL DEFAULT 0,
    is_night_shift  BOOLEAN      NOT NULL DEFAULT FALSE,
    is_active       BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE shift_assignments (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    employee_id     UUID         NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    shift_id        UUID         NOT NULL REFERENCES shifts(id),
    effective_from  DATE         NOT NULL,
    effective_to    DATE,
    created_by_id   UUID REFERENCES users(id),
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);


-- =============================================================================
-- 05. PAYROLL  [V1 + V2]
-- =============================================================================

CREATE TABLE salary_components (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id      UUID         NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    name            VARCHAR(100) NOT NULL,
    code            VARCHAR(30)  NOT NULL,
    type            VARCHAR(20)  NOT NULL,                      -- earning|deduction|benefit
    calculation     VARCHAR(20)  NOT NULL DEFAULT 'fixed',      -- fixed|percentage|formula
    formula         TEXT,                                       -- e.g. "basic * 0.4"
    is_taxable      BOOLEAN      NOT NULL DEFAULT TRUE,
    is_statutory    BOOLEAN      NOT NULL DEFAULT FALSE,
    is_active       BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    UNIQUE (company_id, code)
);

CREATE TABLE salary_structures (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id      UUID         NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    name            VARCHAR(150) NOT NULL,
    description     TEXT,
    is_active       BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE salary_structure_components (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    structure_id        UUID         NOT NULL REFERENCES salary_structures(id) ON DELETE CASCADE,
    component_id        UUID         NOT NULL REFERENCES salary_components(id),
    sequence            SMALLINT     NOT NULL DEFAULT 1,
    amount              NUMERIC(15,2),
    percentage_of_code  VARCHAR(30),                            -- component code it's % of
    UNIQUE (structure_id, component_id)
);

CREATE TABLE employee_salaries (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    employee_id         UUID         NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    structure_id        UUID         NOT NULL REFERENCES salary_structures(id),
    ctc_annual          NUMERIC(15,2) NOT NULL,
    effective_from      DATE         NOT NULL,
    effective_to        DATE,
    is_current          BOOLEAN      NOT NULL DEFAULT TRUE,
    approved_by_id      UUID REFERENCES users(id),
    created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    created_by_id       UUID REFERENCES users(id)
);

CREATE TABLE employee_salary_overrides (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    employee_salary_id UUID NOT NULL REFERENCES employee_salaries(id) ON DELETE CASCADE,
    component_id    UUID NOT NULL REFERENCES salary_components(id),
    amount          NUMERIC(15,2) NOT NULL,
    UNIQUE (employee_salary_id, component_id)
);

CREATE TABLE payroll_cycles (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id      UUID         NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    name            VARCHAR(100) NOT NULL,
    period_start    DATE         NOT NULL,
    period_end      DATE         NOT NULL,
    pay_date        DATE         NOT NULL,
    status          VARCHAR(20)  NOT NULL DEFAULT 'draft',      -- draft|processing|approved|disbursed
    run_by_id       UUID REFERENCES users(id),
    run_at          TIMESTAMPTZ,
    approved_by_id  UUID REFERENCES users(id),
    approved_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE payroll_entries (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    cycle_id            UUID         NOT NULL REFERENCES payroll_cycles(id) ON DELETE CASCADE,
    employee_id         UUID         NOT NULL REFERENCES employees(id),
    gross_pay           NUMERIC(15,2) NOT NULL DEFAULT 0,
    total_deductions    NUMERIC(15,2) NOT NULL DEFAULT 0,
    net_pay             NUMERIC(15,2) NOT NULL DEFAULT 0,
    tax_amount          NUMERIC(15,2) NOT NULL DEFAULT 0,
    working_days        SMALLINT,
    paid_days           NUMERIC(5,2),
    lop_days            NUMERIC(5,2)  NOT NULL DEFAULT 0,       -- loss of pay
    status              VARCHAR(20)  NOT NULL DEFAULT 'computed', -- computed|approved|disbursed|reversed
    bank_account_id     UUID REFERENCES employee_bank_accounts(id),
    payment_ref         VARCHAR(100),
    payment_date        DATE,
    created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    UNIQUE (cycle_id, employee_id)
);

CREATE TABLE payroll_entry_components (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    entry_id        UUID         NOT NULL REFERENCES payroll_entries(id) ON DELETE CASCADE,
    component_id    UUID         NOT NULL REFERENCES salary_components(id),
    amount          NUMERIC(15,2) NOT NULL DEFAULT 0,
    is_override     BOOLEAN      NOT NULL DEFAULT FALSE
);

CREATE TABLE payslips (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    entry_id        UUID         NOT NULL REFERENCES payroll_entries(id) ON DELETE CASCADE UNIQUE,
    file_url        TEXT         NOT NULL,
    generated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    emailed_at      TIMESTAMPTZ
);

-- V2: Tax declarations
CREATE TABLE tax_declarations (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    employee_id     UUID         NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    financial_year  VARCHAR(10)  NOT NULL,                      -- e.g. "2025-26"
    regime          VARCHAR(30)  NOT NULL DEFAULT 'new',
    declaration_data JSONB       NOT NULL DEFAULT '{}',
    submitted_at    TIMESTAMPTZ,
    verified_at     TIMESTAMPTZ,
    verified_by_id  UUID REFERENCES users(id),
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    UNIQUE (employee_id, financial_year)
);

-- V2: Expenses
CREATE TABLE expense_categories (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id  UUID         NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    name        VARCHAR(100) NOT NULL,
    limit_amount NUMERIC(12,2),
    requires_receipt BOOLEAN NOT NULL DEFAULT TRUE,
    is_active   BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE expense_claims (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id      UUID         NOT NULL REFERENCES companies(id),
    employee_id     UUID         NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    category_id     UUID         NOT NULL REFERENCES expense_categories(id),
    title           VARCHAR(255) NOT NULL,
    amount          NUMERIC(12,2) NOT NULL,
    currency_code   CHAR(3)      NOT NULL DEFAULT 'USD',
    expense_date    DATE         NOT NULL,
    receipt_url     TEXT,
    description     TEXT,
    status          VARCHAR(20)  NOT NULL DEFAULT 'pending',
    reviewed_by_id  UUID REFERENCES users(id),
    reviewed_at     TIMESTAMPTZ,
    remarks         TEXT,
    payroll_cycle_id UUID REFERENCES payroll_cycles(id),
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- V2: Salary advances
CREATE TABLE salary_advances (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    employee_id     UUID         NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    amount          NUMERIC(12,2) NOT NULL,
    reason          TEXT,
    requested_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    status          VARCHAR(20)  NOT NULL DEFAULT 'pending',
    approved_by_id  UUID REFERENCES users(id),
    recovery_months SMALLINT     NOT NULL DEFAULT 1,
    recovered_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);


-- =============================================================================
-- 06. DOCUMENTS & COMPLIANCE  [V1]
-- =============================================================================

CREATE TABLE policy_documents (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id      UUID         NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    title           VARCHAR(255) NOT NULL,
    category        VARCHAR(80),
    file_url        TEXT         NOT NULL,
    version         VARCHAR(20)  NOT NULL DEFAULT '1.0',
    is_mandatory    BOOLEAN      NOT NULL DEFAULT FALSE,
    acknowledge_by  DATE,
    published_at    TIMESTAMPTZ,
    published_by_id UUID REFERENCES users(id),
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ
);

CREATE TABLE policy_acknowledgements (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    policy_id       UUID         NOT NULL REFERENCES policy_documents(id) ON DELETE CASCADE,
    employee_id     UUID         NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    acknowledged_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    ip_address      INET,
    UNIQUE (policy_id, employee_id)
);

CREATE TABLE esign_requests (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id      UUID         NOT NULL REFERENCES companies(id),
    document_id     UUID REFERENCES employee_documents(id),
    title           VARCHAR(255) NOT NULL,
    file_url        TEXT         NOT NULL,
    requested_by_id UUID         NOT NULL REFERENCES users(id),
    signed_by_id    UUID REFERENCES users(id),
    status          VARCHAR(20)  NOT NULL DEFAULT 'pending',    -- pending|signed|declined|expired
    signed_at       TIMESTAMPTZ,
    file_hash       TEXT,                                       -- SHA-256 of signed doc
    expires_at      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE audit_logs (
    id              BIGSERIAL    PRIMARY KEY,
    company_id      UUID         NOT NULL,
    user_id         UUID REFERENCES users(id),
    action          VARCHAR(50)  NOT NULL,                      -- create|update|delete|login|export
    resource        VARCHAR(80)  NOT NULL,
    resource_id     UUID,
    old_values      JSONB,
    new_values      JSONB,
    ip_address      INET,
    user_agent      TEXT,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
) PARTITION BY RANGE (created_at);
-- Create monthly partitions as needed: audit_logs_2025_01, etc.

CREATE TABLE notification_templates (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id  UUID         REFERENCES companies(id) ON DELETE CASCADE,  -- NULL = system
    code        VARCHAR(100) NOT NULL,
    channel     VARCHAR(20)  NOT NULL,                          -- email|sms|push|in_app
    subject     TEXT,
    body        TEXT         NOT NULL,
    variables   JSONB        NOT NULL DEFAULT '[]',
    is_active   BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    UNIQUE (company_id, code, channel)
);

CREATE TABLE notifications (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id      UUID         NOT NULL REFERENCES companies(id),
    user_id         UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type            VARCHAR(80)  NOT NULL,
    title           VARCHAR(255) NOT NULL,
    body            TEXT,
    data            JSONB        NOT NULL DEFAULT '{}',
    read_at         TIMESTAMPTZ,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);


-- =============================================================================
-- 07. BASIC REPORTING  [V1]
-- =============================================================================

CREATE TABLE saved_reports (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id      UUID         NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    name            VARCHAR(200) NOT NULL,
    report_type     VARCHAR(80)  NOT NULL,
    filters         JSONB        NOT NULL DEFAULT '{}',
    columns         JSONB        NOT NULL DEFAULT '[]',
    created_by_id   UUID         NOT NULL REFERENCES users(id),
    is_shared       BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE report_schedules (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    report_id       UUID         NOT NULL REFERENCES saved_reports(id) ON DELETE CASCADE,
    frequency       VARCHAR(20)  NOT NULL,                      -- daily|weekly|monthly
    day_of_week     SMALLINT,
    day_of_month    SMALLINT,
    time_utc        TIME         NOT NULL,
    recipients      JSONB        NOT NULL DEFAULT '[]',         -- array of email strings
    format          VARCHAR(10)  NOT NULL DEFAULT 'xlsx',
    is_active       BOOLEAN      NOT NULL DEFAULT TRUE,
    last_run_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);


-- =============================================================================
-- 08. RECRUITMENT & ATS  [V2]
-- =============================================================================

CREATE TABLE job_requisitions (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id      UUID         NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    title           VARCHAR(200) NOT NULL,
    department_id   UUID REFERENCES departments(id),
    location_id     UUID REFERENCES locations(id),
    job_type        VARCHAR(30)  NOT NULL DEFAULT 'full_time',
    min_salary      NUMERIC(15,2),
    max_salary      NUMERIC(15,2),
    currency_code   CHAR(3)      NOT NULL DEFAULT 'USD',
    headcount       SMALLINT     NOT NULL DEFAULT 1,
    description     TEXT,
    requirements    TEXT,
    status          VARCHAR(30)  NOT NULL DEFAULT 'draft',      -- draft|open|on_hold|filled|cancelled
    priority        VARCHAR(20)  NOT NULL DEFAULT 'normal',
    target_fill_date DATE,
    requested_by_id UUID         REFERENCES users(id),
    approved_by_id  UUID         REFERENCES users(id),
    approved_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE candidates (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id      UUID         NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    first_name      VARCHAR(100) NOT NULL,
    last_name       VARCHAR(100) NOT NULL,
    email           VARCHAR(255) NOT NULL,
    phone           VARCHAR(30),
    resume_url      TEXT,
    linkedin_url    TEXT,
    source          VARCHAR(60),                                -- linkedin|indeed|referral|careers_page
    referred_by_id  UUID REFERENCES employees(id),
    profile_data    JSONB        NOT NULL DEFAULT '{}',         -- parsed resume data
    tags            TEXT[]       NOT NULL DEFAULT '{}',
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    UNIQUE (company_id, email)
);

CREATE TABLE applications (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    requisition_id  UUID         NOT NULL REFERENCES job_requisitions(id) ON DELETE CASCADE,
    candidate_id    UUID         NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
    stage           VARCHAR(40)  NOT NULL DEFAULT 'applied',    -- applied|screening|interview|offer|hired|rejected|withdrawn
    score           SMALLINT,
    rejection_reason VARCHAR(100),
    applied_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    UNIQUE (requisition_id, candidate_id)
);

CREATE TABLE interview_panels (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    application_id  UUID         NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
    round           SMALLINT     NOT NULL DEFAULT 1,
    title           VARCHAR(150),
    scheduled_at    TIMESTAMPTZ,
    duration_minutes SMALLINT    NOT NULL DEFAULT 60,
    meeting_link    TEXT,
    status          VARCHAR(20)  NOT NULL DEFAULT 'scheduled',  -- scheduled|completed|cancelled
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE interview_panelists (
    panel_id        UUID NOT NULL REFERENCES interview_panels(id) ON DELETE CASCADE,
    interviewer_id  UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    PRIMARY KEY (panel_id, interviewer_id)
);

CREATE TABLE interview_feedback (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    panel_id        UUID         NOT NULL REFERENCES interview_panels(id) ON DELETE CASCADE,
    interviewer_id  UUID         NOT NULL REFERENCES users(id),
    overall_rating  SMALLINT     CHECK (overall_rating BETWEEN 1 AND 5),
    recommendation  VARCHAR(30)  NOT NULL,                      -- strong_hire|hire|hold|no_hire
    feedback_data   JSONB        NOT NULL DEFAULT '{}',         -- rubric scores
    notes           TEXT,
    submitted_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    UNIQUE (panel_id, interviewer_id)
);

CREATE TABLE offers (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    application_id  UUID         NOT NULL REFERENCES applications(id) ON DELETE CASCADE UNIQUE,
    template_id     UUID REFERENCES employee_documents(id),
    ctc_annual      NUMERIC(15,2) NOT NULL,
    join_by_date    DATE,
    status          VARCHAR(20)  NOT NULL DEFAULT 'draft',      -- draft|sent|accepted|declined|expired
    sent_at         TIMESTAMPTZ,
    responded_at    TIMESTAMPTZ,
    file_url        TEXT,
    esign_request_id UUID REFERENCES esign_requests(id),
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE onboarding_templates (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id  UUID         NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    name        VARCHAR(150) NOT NULL,
    description TEXT,
    is_active   BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE onboarding_tasks (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    template_id     UUID         NOT NULL REFERENCES onboarding_templates(id) ON DELETE CASCADE,
    title           VARCHAR(200) NOT NULL,
    description     TEXT,
    category        VARCHAR(50),                                -- it_setup|legal|hr|buddy
    due_day_offset  SMALLINT     NOT NULL DEFAULT 1,            -- days from hire_date
    assignee_role   VARCHAR(30),                                -- employee|manager|hr|it
    is_required     BOOLEAN      NOT NULL DEFAULT TRUE,
    sequence        SMALLINT     NOT NULL DEFAULT 1,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE employee_onboarding (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    employee_id     UUID         NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    template_id     UUID         NOT NULL REFERENCES onboarding_templates(id),
    started_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    completed_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE onboarding_task_instances (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    onboarding_id   UUID         NOT NULL REFERENCES employee_onboarding(id) ON DELETE CASCADE,
    task_id         UUID         NOT NULL REFERENCES onboarding_tasks(id),
    assignee_id     UUID REFERENCES users(id),
    due_date        DATE,
    completed_at    TIMESTAMPTZ,
    notes           TEXT,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);


-- =============================================================================
-- 09. PERFORMANCE MANAGEMENT  [V2]
-- =============================================================================

CREATE TABLE review_cycles (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id      UUID         NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    name            VARCHAR(150) NOT NULL,
    period_start    DATE         NOT NULL,
    period_end      DATE         NOT NULL,
    type            VARCHAR(30)  NOT NULL DEFAULT 'annual',     -- annual|biannual|quarterly|pip
    status          VARCHAR(20)  NOT NULL DEFAULT 'draft',      -- draft|active|reviewing|calibrating|closed
    self_review_deadline    DATE,
    manager_review_deadline DATE,
    calibration_date        DATE,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE review_templates (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id  UUID         NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    name        VARCHAR(150) NOT NULL,
    sections    JSONB        NOT NULL DEFAULT '[]',              -- [{title, questions:[{text,type,weight}]}]
    rating_scale JSONB       NOT NULL DEFAULT '{}',             -- {min,max,labels:{1:'Needs improvement',...}}
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE goals (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id      UUID         NOT NULL REFERENCES companies(id),
    owner_id        UUID         NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    parent_goal_id  UUID REFERENCES goals(id),
    review_cycle_id UUID REFERENCES review_cycles(id),
    title           VARCHAR(255) NOT NULL,
    description     TEXT,
    type            VARCHAR(20)  NOT NULL DEFAULT 'individual',  -- company|department|individual
    metric          TEXT,
    target_value    NUMERIC(15,4),
    current_value   NUMERIC(15,4) NOT NULL DEFAULT 0,
    weight          SMALLINT     NOT NULL DEFAULT 100,           -- 0-100
    status          VARCHAR(20)  NOT NULL DEFAULT 'active',     -- active|completed|cancelled
    due_date        DATE,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE goal_check_ins (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    goal_id         UUID         NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
    progress_value  NUMERIC(15,4),
    status          VARCHAR(20),
    notes           TEXT,
    created_by_id   UUID         NOT NULL REFERENCES users(id),
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE performance_reviews (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    cycle_id        UUID         NOT NULL REFERENCES review_cycles(id) ON DELETE CASCADE,
    template_id     UUID         NOT NULL REFERENCES review_templates(id),
    employee_id     UUID         NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    reviewer_id     UUID         NOT NULL REFERENCES employees(id),
    reviewer_type   VARCHAR(20)  NOT NULL,                      -- self|manager|peer|subordinate
    status          VARCHAR(20)  NOT NULL DEFAULT 'pending',    -- pending|in_progress|submitted|acknowledged
    responses       JSONB        NOT NULL DEFAULT '{}',
    overall_rating  NUMERIC(3,2),
    final_rating    NUMERIC(3,2),                               -- post-calibration
    calibrated_by_id UUID REFERENCES users(id),
    calibrated_at   TIMESTAMPTZ,
    submitted_at    TIMESTAMPTZ,
    acknowledged_at TIMESTAMPTZ,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    UNIQUE (cycle_id, employee_id, reviewer_id, reviewer_type)
);

CREATE TABLE feedback_items (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id      UUID         NOT NULL REFERENCES companies(id),
    giver_id        UUID         NOT NULL REFERENCES employees(id),
    receiver_id     UUID         NOT NULL REFERENCES employees(id),
    review_id       UUID REFERENCES performance_reviews(id),
    type            VARCHAR(20)  NOT NULL DEFAULT 'praise',     -- praise|constructive|360
    visibility      VARCHAR(20)  NOT NULL DEFAULT 'private',
    content         TEXT         NOT NULL,
    tags            TEXT[]       NOT NULL DEFAULT '{}',
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE one_on_ones (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    manager_id      UUID         NOT NULL REFERENCES employees(id),
    employee_id     UUID         NOT NULL REFERENCES employees(id),
    scheduled_at    TIMESTAMPTZ  NOT NULL,
    notes           TEXT,
    action_items    JSONB        NOT NULL DEFAULT '[]',
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE pips (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    employee_id     UUID         NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    initiated_by_id UUID         NOT NULL REFERENCES users(id),
    reason          TEXT         NOT NULL,
    objectives      JSONB        NOT NULL DEFAULT '[]',
    start_date      DATE         NOT NULL,
    end_date        DATE         NOT NULL,
    status          VARCHAR(20)  NOT NULL DEFAULT 'active',     -- active|extended|closed_success|closed_exit
    outcome_notes   TEXT,
    closed_at       DATE,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE pip_check_ins (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    pip_id          UUID         NOT NULL REFERENCES pips(id) ON DELETE CASCADE,
    check_in_date   DATE         NOT NULL,
    notes           TEXT,
    status          VARCHAR(20)  NOT NULL DEFAULT 'on_track',   -- on_track|at_risk|off_track
    reviewed_by_id  UUID REFERENCES users(id),
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);


-- =============================================================================
-- 10. LEARNING & DEVELOPMENT  [V2]
-- =============================================================================

CREATE TABLE skills (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id  UUID         NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    name        VARCHAR(150) NOT NULL,
    category    VARCHAR(80),
    description TEXT,
    is_active   BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    UNIQUE (company_id, name)
);

CREATE TABLE employee_skills (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    employee_id     UUID         NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    skill_id        UUID         NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
    proficiency     SMALLINT     NOT NULL DEFAULT 1 CHECK (proficiency BETWEEN 1 AND 5),
    self_assessed   BOOLEAN      NOT NULL DEFAULT TRUE,
    validated_by_id UUID REFERENCES users(id),
    validated_at    TIMESTAMPTZ,
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    UNIQUE (employee_id, skill_id)
);

CREATE TABLE courses (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id      UUID         NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    title           VARCHAR(255) NOT NULL,
    description     TEXT,
    category        VARCHAR(80),
    provider        VARCHAR(100),                               -- internal|coursera|linkedin
    external_url    TEXT,
    duration_minutes INT,
    passing_score   SMALLINT,                                   -- % required to pass
    is_mandatory    BOOLEAN      NOT NULL DEFAULT FALSE,
    content_type    VARCHAR(30)  NOT NULL DEFAULT 'mixed',      -- video|scorm|pdf|quiz|mixed
    thumbnail_url   TEXT,
    is_active       BOOLEAN      NOT NULL DEFAULT TRUE,
    version         VARCHAR(20)  NOT NULL DEFAULT '1.0',
    created_by_id   UUID REFERENCES users(id),
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE course_skills (
    course_id   UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    skill_id    UUID NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
    PRIMARY KEY (course_id, skill_id)
);

CREATE TABLE learning_paths (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id  UUID         NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    name        VARCHAR(200) NOT NULL,
    description TEXT,
    target_role VARCHAR(100),
    is_active   BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE learning_path_courses (
    path_id     UUID     NOT NULL REFERENCES learning_paths(id) ON DELETE CASCADE,
    course_id   UUID     NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    sequence    SMALLINT NOT NULL DEFAULT 1,
    is_required BOOLEAN  NOT NULL DEFAULT TRUE,
    PRIMARY KEY (path_id, course_id)
);

CREATE TABLE training_assignments (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id      UUID         NOT NULL REFERENCES companies(id),
    course_id       UUID REFERENCES courses(id),
    path_id         UUID REFERENCES learning_paths(id),
    employee_id     UUID         NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    assigned_by_id  UUID REFERENCES users(id),
    due_date        DATE,
    is_mandatory    BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT course_or_path CHECK (course_id IS NOT NULL OR path_id IS NOT NULL)
);

CREATE TABLE course_enrollments (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    employee_id     UUID         NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    course_id       UUID         NOT NULL REFERENCES courses(id),
    progress_pct    SMALLINT     NOT NULL DEFAULT 0 CHECK (progress_pct BETWEEN 0 AND 100),
    score           NUMERIC(5,2),
    status          VARCHAR(20)  NOT NULL DEFAULT 'enrolled',   -- enrolled|in_progress|completed|failed
    enrolled_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    completed_at    TIMESTAMPTZ,
    certificate_url TEXT,
    UNIQUE (employee_id, course_id)
);

CREATE TABLE certifications (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id      UUID         NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    name            VARCHAR(200) NOT NULL,
    issuing_body    VARCHAR(150),
    validity_months SMALLINT,
    is_active       BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE employee_certifications (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    employee_id         UUID         NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    certification_id    UUID         NOT NULL REFERENCES certifications(id),
    issue_date          DATE         NOT NULL,
    expiry_date         DATE,
    certificate_number  VARCHAR(100),
    certificate_url     TEXT,
    is_verified         BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);


-- =============================================================================
-- 11. BENEFITS & COMPENSATION  [V2]
-- =============================================================================

CREATE TABLE benefit_plans (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id      UUID         NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    name            VARCHAR(150) NOT NULL,
    type            VARCHAR(50)  NOT NULL,                      -- health|dental|vision|life|wellness
    description     TEXT,
    provider        VARCHAR(150),
    coverage_details JSONB       NOT NULL DEFAULT '{}',
    employee_contribution NUMERIC(10,2),
    employer_contribution NUMERIC(10,2),
    is_active       BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE benefit_enrollments (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    plan_id         UUID         NOT NULL REFERENCES benefit_plans(id),
    employee_id     UUID         NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    enrollment_date DATE         NOT NULL,
    end_date        DATE,
    status          VARCHAR(20)  NOT NULL DEFAULT 'active',
    dependents      JSONB        NOT NULL DEFAULT '[]',         -- [{name,relationship,dob}]
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    UNIQUE (plan_id, employee_id)
);

CREATE TABLE bonus_cycles (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id      UUID         NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    name            VARCHAR(150) NOT NULL,
    period_start    DATE         NOT NULL,
    period_end      DATE         NOT NULL,
    budget_amount   NUMERIC(15,2),
    status          VARCHAR(20)  NOT NULL DEFAULT 'planning',   -- planning|open|approved|disbursed
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE bonus_allocations (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    cycle_id        UUID         NOT NULL REFERENCES bonus_cycles(id) ON DELETE CASCADE,
    employee_id     UUID         NOT NULL REFERENCES employees(id),
    target_pct      NUMERIC(5,2) NOT NULL DEFAULT 0,
    performance_rating NUMERIC(3,2),
    recommended_amount NUMERIC(15,2),
    approved_amount NUMERIC(15,2),
    approved_by_id  UUID REFERENCES users(id),
    approved_at     TIMESTAMPTZ,
    payroll_cycle_id UUID REFERENCES payroll_cycles(id),
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    UNIQUE (cycle_id, employee_id)
);

-- V2: Equity / ESOP
CREATE TABLE equity_grants (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id      UUID         NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    employee_id     UUID         NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    grant_type      VARCHAR(30)  NOT NULL DEFAULT 'options',    -- options|rsu|phantom
    shares          NUMERIC(15,4) NOT NULL,
    strike_price    NUMERIC(10,4),
    grant_date      DATE         NOT NULL,
    cliff_months    SMALLINT     NOT NULL DEFAULT 12,
    vesting_months  SMALLINT     NOT NULL DEFAULT 48,
    vested_shares   NUMERIC(15,4) NOT NULL DEFAULT 0,
    status          VARCHAR(20)  NOT NULL DEFAULT 'active',
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);


-- =============================================================================
-- 12. SURVEYS & ENGAGEMENT  [V2]
-- =============================================================================

CREATE TABLE surveys (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id      UUID         NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    title           VARCHAR(200) NOT NULL,
    type            VARCHAR(30)  NOT NULL DEFAULT 'pulse',       -- pulse|onboarding|exit|custom
    questions       JSONB        NOT NULL DEFAULT '[]',
    is_anonymous    BOOLEAN      NOT NULL DEFAULT TRUE,
    status          VARCHAR(20)  NOT NULL DEFAULT 'draft',
    starts_at       TIMESTAMPTZ,
    ends_at         TIMESTAMPTZ,
    created_by_id   UUID REFERENCES users(id),
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE survey_assignments (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    survey_id   UUID NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    sent_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reminded_at TIMESTAMPTZ,
    UNIQUE (survey_id, employee_id)
);

CREATE TABLE survey_responses (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    survey_id   UUID         NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
    employee_id UUID REFERENCES employees(id),                  -- NULL if truly anonymous
    responses   JSONB        NOT NULL DEFAULT '{}',
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- =============================================================================
-- 13. OFFBOARDING  [V2]
-- =============================================================================

CREATE TABLE exit_requests (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    employee_id         UUID         NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    resignation_date    DATE,
    last_working_date   DATE,
    exit_type           VARCHAR(30)  NOT NULL DEFAULT 'voluntary', -- voluntary|involuntary|retirement
    reason_category     VARCHAR(80),
    reason_detail       TEXT,
    notice_waived       BOOLEAN      NOT NULL DEFAULT FALSE,
    status              VARCHAR(20)  NOT NULL DEFAULT 'pending',
    approved_by_id      UUID REFERENCES users(id),
    approved_at         TIMESTAMPTZ,
    created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE exit_interviews (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    exit_request_id UUID         NOT NULL REFERENCES exit_requests(id) ON DELETE CASCADE,
    interviewer_id  UUID         NOT NULL REFERENCES users(id),
    scheduled_at    TIMESTAMPTZ,
    completed_at    TIMESTAMPTZ,
    responses       JSONB        NOT NULL DEFAULT '{}',
    notes           TEXT,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE exit_checklists (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    exit_request_id UUID         NOT NULL REFERENCES exit_requests(id) ON DELETE CASCADE,
    task            VARCHAR(200) NOT NULL,
    category        VARCHAR(50),                                -- it|finance|hr|access
    assigned_to_id  UUID REFERENCES users(id),
    due_date        DATE,
    completed_at    TIMESTAMPTZ,
    notes           TEXT,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);


-- =============================================================================
-- 14. INTEGRATIONS & WEBHOOKS  [V2]
-- =============================================================================

CREATE TABLE api_keys (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id      UUID         NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    name            VARCHAR(100) NOT NULL,
    key_hash        TEXT         NOT NULL UNIQUE,
    prefix          VARCHAR(8)   NOT NULL,                      -- first 8 chars for display
    scopes          TEXT[]       NOT NULL DEFAULT '{}',
    last_used_at    TIMESTAMPTZ,
    expires_at      TIMESTAMPTZ,
    created_by_id   UUID REFERENCES users(id),
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    revoked_at      TIMESTAMPTZ
);

CREATE TABLE webhooks (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id      UUID         NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    url             TEXT         NOT NULL,
    secret          TEXT         NOT NULL,                      -- for HMAC signature
    events          TEXT[]       NOT NULL DEFAULT '{}',         -- ['employee.created','payroll.run']
    is_active       BOOLEAN      NOT NULL DEFAULT TRUE,
    failure_count   SMALLINT     NOT NULL DEFAULT 0,
    last_delivery_at TIMESTAMPTZ,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE webhook_deliveries (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    webhook_id      UUID         NOT NULL REFERENCES webhooks(id) ON DELETE CASCADE,
    event           VARCHAR(80)  NOT NULL,
    payload         JSONB        NOT NULL,
    response_status SMALLINT,
    response_body   TEXT,
    duration_ms     INT,
    delivered_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    is_success      BOOLEAN      NOT NULL DEFAULT FALSE
);

CREATE TABLE background_jobs (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id      UUID REFERENCES companies(id),
    queue           VARCHAR(50)  NOT NULL DEFAULT 'default',
    job_type        VARCHAR(100) NOT NULL,
    payload         JSONB        NOT NULL DEFAULT '{}',
    status          VARCHAR(20)  NOT NULL DEFAULT 'pending',    -- pending|running|done|failed|retrying
    attempts        SMALLINT     NOT NULL DEFAULT 0,
    max_attempts    SMALLINT     NOT NULL DEFAULT 3,
    error_message   TEXT,
    scheduled_for   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    started_at      TIMESTAMPTZ,
    completed_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);


-- =============================================================================
-- INDEXES
-- =============================================================================

-- Users & Auth
CREATE INDEX idx_users_company     ON users(company_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_users_email       ON users(email);
CREATE INDEX idx_refresh_tokens_user ON refresh_tokens(user_id) WHERE revoked_at IS NULL;

-- Employees
CREATE INDEX idx_employees_company ON employees(company_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_employees_dept    ON employees(department_id);
CREATE INDEX idx_employees_manager ON employees(reporting_manager_id);
CREATE INDEX idx_employees_status  ON employees(company_id, status);
CREATE INDEX idx_employees_name    ON employees USING gin(
    to_tsvector('simple', first_name || ' ' || last_name)
);

-- Leave
CREATE INDEX idx_leave_req_employee ON leave_requests(employee_id, status);
CREATE INDEX idx_leave_req_dates    ON leave_requests(start_date, end_date);
CREATE INDEX idx_leave_balance_emp  ON leave_balances(employee_id, year);
CREATE INDEX idx_attendance_emp     ON attendance_logs(employee_id, log_date);

-- Payroll
CREATE INDEX idx_payroll_cycle      ON payroll_entries(cycle_id);
CREATE INDEX idx_payroll_employee   ON payroll_entries(employee_id);
CREATE INDEX idx_expense_employee   ON expense_claims(employee_id, status);

-- Recruitment
CREATE INDEX idx_applications_req   ON applications(requisition_id, stage);
CREATE INDEX idx_applications_cand  ON applications(candidate_id);

-- Performance
CREATE INDEX idx_goals_owner        ON goals(owner_id, status);
CREATE INDEX idx_reviews_cycle      ON performance_reviews(cycle_id, employee_id);
CREATE INDEX idx_reviews_status     ON performance_reviews(status);

-- Learning
CREATE INDEX idx_enrollments_emp    ON course_enrollments(employee_id, status);

-- Audit
CREATE INDEX idx_audit_company      ON audit_logs(company_id, created_at DESC);
CREATE INDEX idx_audit_resource     ON audit_logs(resource, resource_id);

-- Notifications
CREATE INDEX idx_notif_user_unread  ON notifications(user_id, created_at DESC)
    WHERE read_at IS NULL;

-- Jobs
CREATE INDEX idx_jobs_queue         ON background_jobs(queue, status, scheduled_for)
    WHERE status IN ('pending','retrying');

-- Webhooks
CREATE INDEX idx_webhook_deliveries ON webhook_deliveries(webhook_id, delivered_at DESC);


-- =============================================================================
-- TRIGGERS: auto-update updated_at
-- =============================================================================

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

DO $$
DECLARE
    t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'companies','employees','users','departments','locations',
        'leave_requests','leave_balances','attendance_logs',
        'payroll_cycles','payroll_entries','employee_salaries',
        'salary_structures','expense_claims',
        'job_requisitions','applications','offers',
        'review_cycles','performance_reviews','goals',
        'one_on_ones','pips',
        'courses','training_assignments',
        'benefit_plans','benefit_enrollments','bonus_cycles',
        'exit_requests'
    ]
    LOOP
        EXECUTE format(
            'CREATE TRIGGER trg_%s_updated_at
             BEFORE UPDATE ON %s
             FOR EACH ROW EXECUTE FUNCTION set_updated_at()',
            replace(t, '.', '_'), t
        );
    END LOOP;
END;
$$;


-- =============================================================================
-- SEED: system roles for a new company
-- =============================================================================

-- Call this function after inserting a new company row
CREATE OR REPLACE FUNCTION seed_company_defaults(p_company_id UUID)
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE
    r_admin UUID;
    r_hr    UUID;
    r_mgr   UUID;
    r_emp   UUID;
BEGIN
    -- Roles
    INSERT INTO roles (company_id, name, is_system) VALUES
        (p_company_id, 'Admin',    TRUE) RETURNING id INTO r_admin;
    INSERT INTO roles (company_id, name, is_system) VALUES
        (p_company_id, 'HR Manager', TRUE) RETURNING id INTO r_hr;
    INSERT INTO roles (company_id, name, is_system) VALUES
        (p_company_id, 'Manager',  TRUE) RETURNING id INTO r_mgr;
    INSERT INTO roles (company_id, name, is_system) VALUES
        (p_company_id, 'Employee', TRUE) RETURNING id INTO r_emp;

    -- Default salary components
    INSERT INTO salary_components (company_id, name, code, type, calculation, is_taxable) VALUES
        (p_company_id, 'Basic Salary',    'BASIC',   'earning',   'fixed',      TRUE),
        (p_company_id, 'HRA',             'HRA',     'earning',   'percentage', FALSE),
        (p_company_id, 'Transport Allow', 'TRANSPORT','earning',  'fixed',      FALSE),
        (p_company_id, 'Income Tax',      'TDS',     'deduction', 'formula',    FALSE),
        (p_company_id, 'Provident Fund',  'PF',      'deduction', 'percentage', FALSE);

    -- Default leave types
    INSERT INTO leave_types (company_id, name, code, accrual_type, accrual_days, allow_half_day) VALUES
        (p_company_id, 'Annual Leave',    'AL',  'annual',  18, TRUE),
        (p_company_id, 'Sick Leave',      'SL',  'annual',  10, TRUE),
        (p_company_id, 'Casual Leave',    'CL',  'annual',   6, TRUE),
        (p_company_id, 'Unpaid Leave',    'UL',  'none',     0, FALSE),
        (p_company_id, 'Maternity Leave', 'MAT', 'none',     0, FALSE),
        (p_company_id, 'Paternity Leave', 'PAT', 'none',     0, FALSE);
END;
$$;


-- =============================================================================
-- VIEWS: commonly joined data
-- =============================================================================

CREATE VIEW v_employee_full AS
SELECT
    e.id,
    e.company_id,
    e.employee_number,
    e.first_name || ' ' || e.last_name AS full_name,
    e.email,
    e.status,
    e.employment_type,
    e.hire_date,
    e.last_working_date,
    d.name  AS department_name,
    jt.name AS job_title,
    l.name  AS location_name,
    pg.name AS pay_grade,
    (m.first_name || ' ' || m.last_name) AS manager_name,
    e.custom_fields,
    e.created_at,
    e.deleted_at
FROM employees e
LEFT JOIN departments d  ON d.id  = e.department_id
LEFT JOIN job_titles jt  ON jt.id = e.job_title_id
LEFT JOIN locations l    ON l.id  = e.location_id
LEFT JOIN pay_grades pg  ON pg.id = e.pay_grade_id
LEFT JOIN employees m    ON m.id  = e.reporting_manager_id
WHERE e.deleted_at IS NULL;

CREATE VIEW v_leave_summary AS
SELECT
    lb.employee_id,
    lt.name         AS leave_type,
    lt.code,
    lb.year,
    lb.opening_days,
    lb.accrued_days,
    lb.used_days,
    lb.adjusted_days,
    lb.closing_days
FROM leave_balances lb
JOIN leave_types lt ON lt.id = lb.leave_type_id;

CREATE VIEW v_payroll_summary AS
SELECT
    pc.id           AS cycle_id,
    pc.company_id,
    pc.period_start,
    pc.period_end,
    pc.pay_date,
    pc.status       AS cycle_status,
    COUNT(pe.id)    AS employee_count,
    SUM(pe.gross_pay)        AS total_gross,
    SUM(pe.total_deductions) AS total_deductions,
    SUM(pe.net_pay)          AS total_net
FROM payroll_cycles pc
LEFT JOIN payroll_entries pe ON pe.cycle_id = pc.id
GROUP BY pc.id;


-- =============================================================================
-- END OF SCHEMA
-- Total tables : 76
-- V1 MVP tables: 37 (00–07)
-- V2 tables    : 39 (08–14)
-- =============================================================================
