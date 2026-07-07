-- Sprint 9: Learning & Development — LMS, Skills, Certifications

-- New enums
DO $$ BEGIN
  CREATE TYPE "CourseFormat" AS ENUM ('SELF_PACED', 'INSTRUCTOR_LED', 'EXTERNAL_LINK');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "CourseStatusEnum" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "EnrollmentStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'EXPIRED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "PathStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "AssignmentTargetType" AS ENUM ('COURSE', 'LEARNING_PATH');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "AssignmentScopeType" AS ENUM ('DEPARTMENT', 'ROLE', 'EMPLOYEE', 'ORG_WIDE');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "SkillStatusEnum" AS ENUM ('ACTIVE', 'DEPRECATED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "ValidationStatus" AS ENUM ('PENDING', 'VALIDATED', 'DISPUTED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "CertVerificationStatus" AS ENUM ('UNVERIFIED', 'VERIFIED', 'EXPIRED', 'REVOKED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- New table: courses
CREATE TABLE "courses" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "companyId" UUID NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "thumbnailKey" VARCHAR(500),
    "format" "CourseFormat" NOT NULL,
    "externalUrl" VARCHAR(2048),
    "durationMinutes" INTEGER NOT NULL,
    "status" "CourseStatusEnum" NOT NULL DEFAULT 'DRAFT',
    "isMandatory" BOOLEAN NOT NULL DEFAULT false,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "courses_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "courses_companyId_idx" ON "courses"("companyId");
CREATE INDEX "courses_status_idx" ON "courses"("status");

-- New table: skill_taxonomies
CREATE TABLE "skill_taxonomies" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "companyId" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "category" VARCHAR(100),
    "parentSkillId" UUID,
    "status" "SkillStatusEnum" NOT NULL DEFAULT 'ACTIVE',

    CONSTRAINT "skill_taxonomies_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "skill_taxonomies_companyId_idx" ON "skill_taxonomies"("companyId");
CREATE INDEX "skill_taxonomies_status_idx" ON "skill_taxonomies"("status");

-- New table: course_skill_tags (many-to-many Course <-> SkillTaxonomy)
CREATE TABLE "course_skill_tags" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "courseId" UUID NOT NULL,
    "skillId" UUID NOT NULL,

    CONSTRAINT "course_skill_tags_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "course_skill_tags_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE CASCADE,
    CONSTRAINT "course_skill_tags_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "skill_taxonomies"("id") ON DELETE CASCADE,
    CONSTRAINT "course_skill_tags_courseId_skillId_key" UNIQUE ("courseId", "skillId")
);

-- New table: learning_paths
CREATE TABLE "learning_paths" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "companyId" UUID NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "status" "PathStatus" NOT NULL DEFAULT 'DRAFT',
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "learning_paths_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "learning_paths_companyId_idx" ON "learning_paths"("companyId");

-- New table: learning_path_courses
CREATE TABLE "learning_path_courses" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "learningPathId" UUID NOT NULL,
    "courseId" UUID NOT NULL,
    "sequenceOrder" INTEGER NOT NULL,
    "isSequentialLockEnabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "learning_path_courses_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "learning_path_courses_learningPathId_fkey" FOREIGN KEY ("learningPathId") REFERENCES "learning_paths"("id") ON DELETE CASCADE,
    CONSTRAINT "learning_path_courses_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE CASCADE,
    CONSTRAINT "learning_path_courses_learningPathId_sequenceOrder_key" UNIQUE ("learningPathId", "sequenceOrder")
);

-- New table: training_assignments
CREATE TABLE "training_assignments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "companyId" UUID NOT NULL,
    "targetType" "AssignmentTargetType" NOT NULL,
    "targetId" UUID NOT NULL,
    "scopeType" "AssignmentScopeType" NOT NULL,
    "scopeFilter" JSONB NOT NULL,
    "deadlineAt" TIMESTAMP(3) NOT NULL,
    "isMandatory" BOOLEAN NOT NULL DEFAULT false,
    "reminderScheduleDaysBeforeDeadline" JSONB NOT NULL DEFAULT '[]',
    "assignedById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "training_assignments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "training_assignments_companyId_idx" ON "training_assignments"("companyId");
CREATE INDEX "training_assignments_targetType_targetId_idx" ON "training_assignments"("targetType", "targetId");

-- New table: course_enrollments (after training_assignments for FK)
CREATE TABLE "course_enrollments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "courseId" UUID NOT NULL,
    "employeeId" UUID NOT NULL,
    "status" "EnrollmentStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "progressPercent" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "certificateKey" VARCHAR(500),
    "assignmentId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "course_enrollments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "course_enrollments_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE CASCADE,
    CONSTRAINT "course_enrollments_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "training_assignments"("id") ON DELETE SET NULL,
    CONSTRAINT "course_enrollments_courseId_employeeId_key" UNIQUE ("courseId", "employeeId")
);

CREATE INDEX "course_enrollments_employeeId_idx" ON "course_enrollments"("employeeId");
CREATE INDEX "course_enrollments_status_idx" ON "course_enrollments"("status");

-- New table: employee_skills
CREATE TABLE "employee_skills" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "employeeId" UUID NOT NULL,
    "skillId" UUID NOT NULL,
    "selfAssessedLevel" INTEGER NOT NULL,
    "managerValidatedLevel" INTEGER,
    "validationStatus" "ValidationStatus" NOT NULL DEFAULT 'PENDING',
    "validatedById" UUID,
    "validatedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employee_skills_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "employee_skills_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "skill_taxonomies"("id") ON DELETE CASCADE,
    CONSTRAINT "employee_skills_employeeId_skillId_key" UNIQUE ("employeeId", "skillId")
);

CREATE INDEX "employee_skills_employeeId_idx" ON "employee_skills"("employeeId");

-- New table: certifications
CREATE TABLE "certifications" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "companyId" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "issuingBody" VARCHAR(200),
    "validityMonths" INTEGER,
    "isMandatoryForCompliance" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "certifications_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "certifications_companyId_idx" ON "certifications"("companyId");

-- New table: certification_skill_tags (many-to-many Certification <-> SkillTaxonomy)
CREATE TABLE "certification_skill_tags" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "certificationId" UUID NOT NULL,
    "skillId" UUID NOT NULL,

    CONSTRAINT "certification_skill_tags_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "certification_skill_tags_certificationId_fkey" FOREIGN KEY ("certificationId") REFERENCES "certifications"("id") ON DELETE CASCADE,
    CONSTRAINT "certification_skill_tags_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "skill_taxonomies"("id") ON DELETE CASCADE,
    CONSTRAINT "certification_skill_tags_certificationId_skillId_key" UNIQUE ("certificationId", "skillId")
);

-- New table: employee_certifications
CREATE TABLE "employee_certifications" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "employeeId" UUID NOT NULL,
    "certificationId" UUID NOT NULL,
    "credentialNumber" VARCHAR(200),
    "issuedDate" DATE NOT NULL,
    "expiryDate" DATE,
    "evidenceDocumentKey" VARCHAR(500),
    "verificationStatus" "CertVerificationStatus" NOT NULL DEFAULT 'UNVERIFIED',
    "verifiedById" UUID,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employee_certifications_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "employee_certifications_certificationId_fkey" FOREIGN KEY ("certificationId") REFERENCES "certifications"("id") ON DELETE CASCADE
);

CREATE INDEX "employee_certifications_employeeId_idx" ON "employee_certifications"("employeeId");
CREATE INDEX "employee_certifications_certificationId_idx" ON "employee_certifications"("certificationId");
CREATE INDEX "employee_certifications_expiryDate_idx" ON "employee_certifications"("expiryDate");
