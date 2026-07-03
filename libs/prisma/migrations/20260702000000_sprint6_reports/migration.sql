-- Sprint 6: Reports Module
-- Create saved_reports and report_schedules tables

-- Create ReportKey enum
DO $$ BEGIN
  CREATE TYPE "ReportKey" AS ENUM (
    'HEADCOUNT',
    'ATTRITION',
    'PAYROLL_SUMMARY',
    'LEAVE_UTILIZATION',
    'ATTENDANCE_SUMMARY',
    'NEW_HIRES',
    'EXITS'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Create ExportFormat enum
DO $$ BEGIN
  CREATE TYPE "ExportFormat" AS ENUM (
    'XLSX',
    'PDF'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Create saved_reports table
CREATE TABLE IF NOT EXISTS "saved_reports" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "name" VARCHAR(255) NOT NULL,
  "reportKey" "ReportKey" NOT NULL,
  "parameters" JSONB NOT NULL,
  "createdById" UUID NOT NULL,
  "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
  CONSTRAINT "saved_reports_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "idx_saved_reports_created_by" ON "saved_reports"("createdById");

-- Create report_schedules table
CREATE TABLE IF NOT EXISTS "report_schedules" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "savedReportId" UUID NOT NULL,
  "cronExpression" VARCHAR(100) NOT NULL,
  "format" "ExportFormat" NOT NULL,
  "recipientId" UUID,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "lastRunAt" TIMESTAMP,
  "nextRunAt" TIMESTAMP,
  "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
  CONSTRAINT "report_schedules_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "report_schedules_savedReportId_fkey"
    FOREIGN KEY ("savedReportId") REFERENCES "saved_reports"("id")
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "idx_report_schedules_saved_report" ON "report_schedules"("savedReportId");
CREATE INDEX IF NOT EXISTS "idx_report_schedules_is_active" ON "report_schedules"("isActive");
CREATE INDEX IF NOT EXISTS "idx_report_schedules_next_run" ON "report_schedules"("nextRunAt") WHERE "isActive" = true;
