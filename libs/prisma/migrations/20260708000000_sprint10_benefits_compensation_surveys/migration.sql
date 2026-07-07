-- Sprint 10: Benefits, Compensation, Surveys, Payroll Extensions

-- New enums
DO $$ BEGIN CREATE TYPE "BenefitPlanType" AS ENUM ('HEALTH','DENTAL','VISION','LIFE','RETIREMENT','WELLNESS','OTHER'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "BenefitPlanStatus" AS ENUM ('DRAFT','ACTIVE','ARCHIVED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "EnrollmentWindowStatus" AS ENUM ('SCHEDULED','OPEN','CLOSED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "BenefitEnrollmentStatus" AS ENUM ('PENDING','ACTIVE','WAIVED','TERMINATED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "DependentRelationship" AS ENUM ('SPOUSE','CHILD','DOMESTIC_PARTNER','OTHER'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "DependentVerificationStatus" AS ENUM ('PENDING','VERIFIED','REJECTED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "CompensationCycleStatus" AS ENUM ('PLANNING','OPEN','APPROVAL','DISBURSED','CANCELLED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "AllocationStatus" AS ENUM ('PROPOSED','APPROVED','REJECTED','DISBURSED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "EquityInstrumentType" AS ENUM ('ISO','NSO','RSU'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "VestingFrequency" AS ENUM ('MONTHLY','QUARTERLY'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "EquityGrantStatus" AS ENUM ('ACTIVE','FULLY_VESTED','CANCELLED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "VestingEventStatus" AS ENUM ('PENDING','PROCESSED','SKIPPED_CLIFF_NOT_MET'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "SurveyStatus" AS ENUM ('DRAFT','LAUNCHED','CLOSED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "SurveyQuestionType" AS ENUM ('LIKERT_5','SINGLE_CHOICE','MULTI_CHOICE','FREE_TEXT'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "SurveyAssignmentStatus" AS ENUM ('PENDING','COMPLETED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "TaxDeclarationStatus" AS ENUM ('SUBMITTED','UNDER_REVIEW','APPROVED','REJECTED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "ReimbursementStatus" AS ENUM ('PENDING','APPROVED','REJECTED','PAID'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "SalaryAdvanceStatus" AS ENUM ('PENDING_APPROVAL','APPROVED','RECOVERING','COMPLETED','REJECTED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Tables
CREATE TABLE "benefit_plans" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "companyId" UUID NOT NULL,
  "name" VARCHAR(200) NOT NULL, "type" "BenefitPlanType" NOT NULL,
  "status" "BenefitPlanStatus" NOT NULL DEFAULT 'DRAFT',
  "employerContribution" DECIMAL(12,2) NOT NULL, "employeeContribution" DECIMAL(12,2) NOT NULL,
  "eligibilityRules" JSONB, "coverageTiers" JSONB,
  "providerName" VARCHAR(200) NOT NULL, "providerDocumentS3Key" VARCHAR(500),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "benefit_plans_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "benefit_plans_companyId_idx" ON "benefit_plans"("companyId");
CREATE INDEX "benefit_plans_status_idx" ON "benefit_plans"("status");

CREATE TABLE "benefit_enrollment_windows" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "companyId" UUID NOT NULL,
  "name" VARCHAR(200) NOT NULL, "opensAt" TIMESTAMPTZ NOT NULL, "closesAt" TIMESTAMPTZ NOT NULL,
  "status" "EnrollmentWindowStatus" NOT NULL DEFAULT 'SCHEDULED',
  "eligiblePlanIds" UUID[] NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "benefit_enrollment_windows_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "benefit_enrollment_windows_companyId_idx" ON "benefit_enrollment_windows"("companyId");
CREATE INDEX "benefit_enrollment_windows_status_idx" ON "benefit_enrollment_windows"("status");

CREATE TABLE "benefit_enrollments" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "employeeId" UUID NOT NULL, "benefitPlanId" UUID NOT NULL,
  "enrollmentWindowId" UUID NOT NULL, "status" "BenefitEnrollmentStatus" NOT NULL DEFAULT 'PENDING',
  "coverageTier" VARCHAR(50) NOT NULL, "calculatedEmployeeCost" DECIMAL(12,2) NOT NULL,
  "effectiveDate" TIMESTAMPTZ, "terminatedAt" TIMESTAMPTZ, "waiverReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "benefit_enrollments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "benefit_enrollments_planId_fkey" FOREIGN KEY ("benefitPlanId") REFERENCES "benefit_plans"("id")
);
CREATE INDEX "benefit_enrollments_employeeId_idx" ON "benefit_enrollments"("employeeId");
CREATE INDEX "benefit_enrollments_planId_idx" ON "benefit_enrollments"("benefitPlanId");
CREATE INDEX "benefit_enrollments_status_idx" ON "benefit_enrollments"("status");

CREATE TABLE "benefit_dependents" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "enrollmentId" UUID NOT NULL,
  "fullName" VARCHAR(200) NOT NULL, "relationship" "DependentRelationship" NOT NULL,
  "dateOfBirth" DATE NOT NULL, "verificationDocumentS3Key" VARCHAR(500),
  "verificationStatus" "DependentVerificationStatus" NOT NULL DEFAULT 'PENDING',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "benefit_dependents_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "benefit_dependents_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "benefit_enrollments"("id") ON DELETE CASCADE
);
CREATE INDEX "benefit_dependents_enrollmentId_idx" ON "benefit_dependents"("enrollmentId");

CREATE TABLE "compensation_cycles" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "companyId" UUID NOT NULL,
  "name" VARCHAR(200) NOT NULL, "status" "CompensationCycleStatus" NOT NULL DEFAULT 'PLANNING',
  "totalBudget" DECIMAL(14,2) NOT NULL, "allocatedTotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "openedAt" TIMESTAMPTZ, "approvedAt" TIMESTAMPTZ, "disbursedAt" TIMESTAMPTZ, "approvedBy" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "compensation_cycles_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "compensation_cycles_companyId_idx" ON "compensation_cycles"("companyId");
CREATE INDEX "compensation_cycles_status_idx" ON "compensation_cycles"("status");

CREATE TABLE "compensation_allocations" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "cycleId" UUID NOT NULL, "employeeId" UUID NOT NULL,
  "proposedBy" UUID NOT NULL, "proposedAmount" DECIMAL(12,2) NOT NULL,
  "approvedAmount" DECIMAL(12,2), "status" "AllocationStatus" NOT NULL DEFAULT 'PROPOSED',
  "managerNote" TEXT, "approverNote" TEXT, "payrollDisbursementId" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "compensation_allocations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "compensation_allocations_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "compensation_cycles"("id")
);
CREATE INDEX "compensation_allocations_cycleId_idx" ON "compensation_allocations"("cycleId");
CREATE INDEX "compensation_allocations_employeeId_idx" ON "compensation_allocations"("employeeId");
CREATE INDEX "compensation_allocations_status_idx" ON "compensation_allocations"("status");

CREATE TABLE "equity_grants" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "employeeId" UUID NOT NULL,
  "instrumentType" "EquityInstrumentType" NOT NULL, "totalUnits" INTEGER NOT NULL,
  "vestedUnits" INTEGER NOT NULL DEFAULT 0, "strikePrice" DECIMAL(12,4),
  "grantDate" DATE NOT NULL, "vestingStartDate" DATE NOT NULL,
  "cliffMonths" INTEGER NOT NULL, "vestingDurationMonths" INTEGER NOT NULL,
  "vestingFrequency" "VestingFrequency" NOT NULL DEFAULT 'MONTHLY',
  "status" "EquityGrantStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "equity_grants_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "equity_grants_employeeId_idx" ON "equity_grants"("employeeId");
CREATE INDEX "equity_grants_status_idx" ON "equity_grants"("status");

CREATE TABLE "vesting_events" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "equityGrantId" UUID NOT NULL,
  "vestDate" DATE NOT NULL, "unitsVested" INTEGER NOT NULL,
  "status" "VestingEventStatus" NOT NULL DEFAULT 'PENDING', "processedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "vesting_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "vesting_events_grantId_fkey" FOREIGN KEY ("equityGrantId") REFERENCES "equity_grants"("id") ON DELETE CASCADE,
  CONSTRAINT "vesting_events_grantId_vestDate_key" UNIQUE ("equityGrantId", "vestDate")
);
CREATE INDEX "vesting_events_vestDate_status_idx" ON "vesting_events"("vestDate", "status");

CREATE TABLE "surveys" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "companyId" UUID NOT NULL,
  "title" VARCHAR(255) NOT NULL, "description" TEXT,
  "status" "SurveyStatus" NOT NULL DEFAULT 'DRAFT', "isAnonymous" BOOLEAN NOT NULL DEFAULT true,
  "launchedAt" TIMESTAMPTZ, "closesAt" TIMESTAMPTZ, "createdBy" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "surveys_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "surveys_companyId_idx" ON "surveys"("companyId");
CREATE INDEX "surveys_status_idx" ON "surveys"("status");

CREATE TABLE "survey_questions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "surveyId" UUID NOT NULL,
  "orderIndex" INTEGER NOT NULL, "prompt" TEXT NOT NULL,
  "type" "SurveyQuestionType" NOT NULL, "options" JSONB, "required" BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT "survey_questions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "survey_questions_surveyId_fkey" FOREIGN KEY ("surveyId") REFERENCES "surveys"("id") ON DELETE CASCADE
);
CREATE INDEX "survey_questions_surveyId_idx" ON "survey_questions"("surveyId");

CREATE TABLE "survey_assignments" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "surveyId" UUID NOT NULL, "employeeId" UUID NOT NULL,
  "status" "SurveyAssignmentStatus" NOT NULL DEFAULT 'PENDING',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "survey_assignments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "survey_assignments_surveyId_fkey" FOREIGN KEY ("surveyId") REFERENCES "surveys"("id") ON DELETE CASCADE,
  CONSTRAINT "survey_assignments_surveyId_employeeId_key" UNIQUE ("surveyId", "employeeId")
);
CREATE INDEX "survey_assignments_surveyId_idx" ON "survey_assignments"("surveyId");
CREATE INDEX "survey_assignments_employeeId_status_idx" ON "survey_assignments"("employeeId", "status");

CREATE TABLE "survey_responses" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "surveyId" UUID NOT NULL, "questionId" UUID NOT NULL,
  "answer" JSONB NOT NULL, "anonymousToken" VARCHAR(36) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "survey_responses_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "survey_responses_surveyId_idx" ON "survey_responses"("surveyId");
CREATE INDEX "survey_responses_questionId_idx" ON "survey_responses"("questionId");

CREATE TABLE "tax_declarations" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "employeeId" UUID NOT NULL, "companyId" UUID NOT NULL,
  "fiscalYear" VARCHAR(9) NOT NULL, "declaredInvestments" JSONB NOT NULL,
  "supportingDocumentS3Key" VARCHAR(500),
  "status" "TaxDeclarationStatus" NOT NULL DEFAULT 'SUBMITTED', "reviewedBy" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "tax_declarations_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "tax_declarations_employeeId_fiscalYear_idx" ON "tax_declarations"("employeeId", "fiscalYear");
CREATE INDEX "tax_declarations_companyId_idx" ON "tax_declarations"("companyId");

CREATE TABLE "expense_reimbursements" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "employeeId" UUID NOT NULL, "companyId" UUID NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL, "category" VARCHAR(100) NOT NULL, "receiptS3Key" VARCHAR(500),
  "status" "ReimbursementStatus" NOT NULL DEFAULT 'PENDING', "payrollRunId" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "expense_reimbursements_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "expense_reimbursements_employeeId_idx" ON "expense_reimbursements"("employeeId");
CREATE INDEX "expense_reimbursements_companyId_idx" ON "expense_reimbursements"("companyId");
CREATE INDEX "expense_reimbursements_status_idx" ON "expense_reimbursements"("status");
CREATE INDEX "expense_reimbursements_payrollRunId_idx" ON "expense_reimbursements"("payrollRunId");

CREATE TABLE "salary_advances" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "employeeId" UUID NOT NULL, "companyId" UUID NOT NULL,
  "principalAmount" DECIMAL(12,2) NOT NULL, "outstandingBalance" DECIMAL(12,2) NOT NULL,
  "recoveryInstallments" INTEGER NOT NULL, "installmentAmount" DECIMAL(12,2) NOT NULL,
  "status" "SalaryAdvanceStatus" NOT NULL DEFAULT 'PENDING_APPROVAL', "approvedBy" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "salary_advances_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "salary_advances_employeeId_idx" ON "salary_advances"("employeeId");
CREATE INDEX "salary_advances_companyId_idx" ON "salary_advances"("companyId");
CREATE INDEX "salary_advances_status_idx" ON "salary_advances"("status");

CREATE TABLE "salary_advance_recovery_logs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "salaryAdvanceId" UUID NOT NULL, "payrollRunId" UUID NOT NULL,
  "amountRecovered" DECIMAL(12,2) NOT NULL, "remainingBalanceAfter" DECIMAL(12,2) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "salary_advance_recovery_logs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "salary_advance_recovery_logs_advanceId_fkey" FOREIGN KEY ("salaryAdvanceId") REFERENCES "salary_advances"("id")
);
CREATE INDEX "salary_advance_recovery_logs_advanceId_idx" ON "salary_advance_recovery_logs"("salaryAdvanceId");
CREATE INDEX "salary_advance_recovery_logs_payrollRunId_idx" ON "salary_advance_recovery_logs"("payrollRunId");
