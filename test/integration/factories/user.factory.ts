import type { INestApplication } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

export async function createTestUser(
  prisma: PrismaClient,
  overrides: {
    email?: string;
    firstName?: string;
    lastName?: string;
    role?: string;
  } = {},
): Promise<{ user: Record<string, unknown>; password: string }> {
  const email = overrides.email ?? `test-${Date.now()}@hr-test.internal`;
  const password = 'Test@1234';
  const passwordHash = await bcrypt.hash(password, 10);

  const user = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
    `INSERT INTO users (email, password_hash, first_name, last_name, is_active)
     VALUES ($1, $2, $3, $4, true)
     RETURNING id, email, first_name AS "firstName", last_name AS "lastName"`,
    email,
    passwordHash,
    overrides.firstName ?? 'Test',
    overrides.lastName ?? 'User',
  );

  return { user: user[0], password };
}

export async function createTestEmployee(
  prisma: any,
  companyId: string,
  userId: string,
  overrides: {
    departmentId?: string;
    managerId?: string;
    jobTitleId?: string;
    status?: string;
  } = {},
): Promise<Record<string, unknown>> {
  const result = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
    `INSERT INTO employees (company_id, user_id, employee_number, employment_type, status, joined_at, work_email, department_id, manager_id, job_title_id)
     VALUES ($1, $2, $3, 'FULL_TIME', $4, NOW(), $5, $6, $7, $8)
     RETURNING id`,
    companyId,
    userId,
    `EMP-${Date.now()}`,
    overrides.status ?? 'ACTIVE',
    `emp-${Date.now()}@test.com`,
    overrides.departmentId ?? null,
    overrides.managerId ?? null,
    overrides.jobTitleId ?? null,
  );
  return result[0];
}
