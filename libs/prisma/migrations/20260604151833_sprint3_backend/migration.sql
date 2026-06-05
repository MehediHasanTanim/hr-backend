-- Sprint 3: Holiday calendars, leave balances, accrual engine, attendance enhancements

-- New enums
DO $$ BEGIN
  CREATE TYPE "AccrualType" AS ENUM ('MONTHLY', 'ANNUAL', 'NONE');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "AttendanceSource" AS ENUM ('WEB', 'MOBILE', 'BIOMETRIC', 'MANUAL');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- New table: holiday_calendars
CREATE TABLE "holiday_calendars" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "companyId" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "year" INTEGER NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "holiday_calendars_pkey" PRIMARY KEY ("id")
);

-- Add calendarId to holidays (nullable initially for existing data)
ALTER TABLE "holidays" ADD COLUMN IF NOT EXISTS "calendarId" UUID;

-- New table: leave_balances
CREATE TABLE "leave_balances" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "employeeId" UUID NOT NULL,
    "leaveTypeId" UUID NOT NULL,
    "year" INTEGER NOT NULL,
    "entitled" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "used" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "carriedForward" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "balance" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leave_balances_pkey" PRIMARY KEY ("id")
);

-- New table: accrual_run_logs
CREATE TABLE "accrual_run_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "companyId" UUID NOT NULL,
    "month" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "employeesCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "accrual_run_logs_pkey" PRIMARY KEY ("id")
);

-- Add new columns to attendance_logs
ALTER TABLE "attendance_logs" ADD COLUMN IF NOT EXISTS "source" "AttendanceSource" DEFAULT 'WEB';
ALTER TABLE "attendance_logs" ADD COLUMN IF NOT EXISTS "ipAddress" VARCHAR(50);
ALTER TABLE "attendance_logs" ADD COLUMN IF NOT EXISTS "coordinates" JSONB;
ALTER TABLE "attendance_logs" ADD COLUMN IF NOT EXISTS "isCorrected" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "attendance_logs" ADD COLUMN IF NOT EXISTS "correctionReason" TEXT;
ALTER TABLE "attendance_logs" ADD COLUMN IF NOT EXISTS "correctedById" UUID;
ALTER TABLE "attendance_logs" ADD COLUMN IF NOT EXISTS "correctedAt" TIMESTAMP(3);

-- Add accrual columns to leave_types
ALTER TABLE "leave_types" ADD COLUMN IF NOT EXISTS "accrualType" "AccrualType" NOT NULL DEFAULT 'NONE';
ALTER TABLE "leave_types" ADD COLUMN IF NOT EXISTS "accrualAmount" DECIMAL(5,2) NOT NULL DEFAULT 0;
ALTER TABLE "leave_types" ADD COLUMN IF NOT EXISTS "maxCarryForward" DECIMAL(5,2) NOT NULL DEFAULT 0;
ALTER TABLE "leave_types" ADD COLUMN IF NOT EXISTS "maxBalance" DECIMAL(5,2) NOT NULL DEFAULT 0;

-- Drop old columns from leave_types (they exist in the model from sprint2)
ALTER TABLE "leave_types" DROP COLUMN IF EXISTS "allowHalfDay";
ALTER TABLE "leave_types" DROP COLUMN IF EXISTS "requiresApproval";
ALTER TABLE "leave_types" DROP COLUMN IF EXISTS "carryForward";
ALTER TABLE "leave_types" DROP COLUMN IF EXISTS "accrualPolicy";

-- Indexes for new tables
CREATE UNIQUE INDEX IF NOT EXISTS "holiday_calendars_companyId_year_name_key" ON "holiday_calendars"("companyId", "year", "name");
CREATE INDEX IF NOT EXISTS "holiday_calendars_companyId_year_idx" ON "holiday_calendars"("companyId", "year");
CREATE INDEX IF NOT EXISTS "holidays_calendarId_date_idx" ON "holidays"("calendarId", "date");
CREATE UNIQUE INDEX IF NOT EXISTS "leave_balances_employeeId_leaveTypeId_year_key" ON "leave_balances"("employeeId", "leaveTypeId", "year");
CREATE INDEX IF NOT EXISTS "leave_balances_employeeId_idx" ON "leave_balances"("employeeId");
CREATE INDEX IF NOT EXISTS "leave_balances_leaveTypeId_idx" ON "leave_balances"("leaveTypeId");
CREATE UNIQUE INDEX IF NOT EXISTS "accrual_run_logs_companyId_month_year_key" ON "accrual_run_logs"("companyId", "month", "year");
CREATE INDEX IF NOT EXISTS "accrual_run_logs_companyId_idx" ON "accrual_run_logs"("companyId");

-- Foreign keys
ALTER TABLE "holiday_calendars" ADD CONSTRAINT "holiday_calendars_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE;
ALTER TABLE "holidays" ADD CONSTRAINT "holidays_calendarId_fkey" FOREIGN KEY ("calendarId") REFERENCES "holiday_calendars"("id") ON DELETE CASCADE;
ALTER TABLE "leave_balances" ADD CONSTRAINT "leave_balances_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "employees"("id") ON DELETE CASCADE;
ALTER TABLE "leave_balances" ADD CONSTRAINT "leave_balances_leaveTypeId_fkey" FOREIGN KEY ("leaveTypeId") REFERENCES "leave_types"("id") ON DELETE CASCADE;
ALTER TABLE "accrual_run_logs" ADD CONSTRAINT "accrual_run_logs_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE;
ALTER TABLE "attendance_logs" ADD CONSTRAINT "attendance_logs_correctedById_fkey" FOREIGN KEY ("correctedById") REFERENCES "employees"("id");
