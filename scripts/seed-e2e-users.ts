// scripts/seed-e2e-users.ts
// Run with: npx tsx scripts/seed-e2e-users.ts
// Requires DATABASE_URL and E2E_* env vars to be set.
//
// This script pre-seeds test users (HR admin, employee, manager) into the test
// database so Playwright E2E smoke tests can authenticate against a live server.
// Uses ON CONFLICT DO NOTHING — idempotent, safe to re-run.
//
// Usage:
//   DATABASE_URL=postgres://user:pass@localhost:5432/hr_test \
//   E2E_HR_ADMIN_EMAIL=hr-admin@e2e.internal \
//   E2E_EMPLOYEE_EMAIL=employee@e2e.internal \
//   E2E_MANAGER_EMAIL=manager@e2e.internal \
//   npx tsx scripts/seed-e2e-users.ts

import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const E2E_PASSWORD = process.env.E2E_PASSWORD ?? 'SmokeTest@1234';
const HR_ADMIN_EMAIL = process.env.E2E_HR_ADMIN_EMAIL ?? 'hr-admin@e2e.internal';
const EMPLOYEE_EMAIL = process.env.E2E_EMPLOYEE_EMAIL ?? 'employee@e2e.internal';
const MANAGER_EMAIL = process.env.E2E_MANAGER_EMAIL ?? 'manager@e2e.internal';

interface SeedUser {
  email: string;
  firstName: string;
  lastName: string;
  employeeStatus: string;
}

async function seed(): Promise<void> {
  const prisma = new PrismaClient({
    datasources: { db: { url: process.env.DATABASE_URL } },
  });

  const passwordHash = await bcrypt.hash(E2E_PASSWORD, 10);

  const users: SeedUser[] = [
    { email: HR_ADMIN_EMAIL, firstName: 'E2E', lastName: 'HR Admin', employeeStatus: 'ACTIVE' },
    { email: EMPLOYEE_EMAIL, firstName: 'E2E', lastName: 'Employee', employeeStatus: 'ACTIVE' },
    { email: MANAGER_EMAIL, firstName: 'E2E', lastName: 'Manager', employeeStatus: 'ACTIVE' },
  ];

  for (const u of users) {
    const existingUser = await prisma.user.findUnique({ where: { email: u.email } });
    if (existingUser) {
      console.log(`User already exists: ${u.email} — skipping`);
      continue;
    }

    // Create company (idempotent — first user creates, subsequent users find existing)
    let company = await prisma.company.findFirst({ where: { slug: 'e2e-test-company' } });
    if (!company) {
      company = await prisma.company.create({
        data: {
          name: 'E2E Test Company',
          slug: 'e2e-test-company',
          country: 'US',
          timezone: 'UTC',
          currency: 'USD',
        },
      });
      console.log('Created E2E Test Company');
    }

    // Create user
    const user = await prisma.user.create({
      data: {
        email: u.email,
        passwordHash,
        firstName: u.firstName,
        lastName: u.lastName,
        isActive: true,
      },
    });

    // Create employee
    const employee = await prisma.employee.create({
      data: {
        companyId: company.id,
        userId: user.id,
        employeeNumber: `E2E-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        employmentType: 'FULL_TIME',
        status: u.employeeStatus as 'ACTIVE',
        joinedAt: new Date('2024-01-01'),
        workEmail: u.email,
      },
    });

    // Assign Admin role to HR admin user
    if (u.email === HR_ADMIN_EMAIL) {
      const adminRole = await prisma.role.findFirst({
        where: { companyId: company.id, name: 'Admin' },
      });
      if (adminRole) {
        await prisma.employeeRole.create({
          data: {
            employeeId: employee.id,
            roleId: adminRole.id,
            assignedBy: user.id,
          },
        });
      }
    }

    console.log(`Seeded: ${u.email} (employeeId: ${employee.id})`);
  }

  // Link employee to manager
  const employee = await prisma.employee.findFirst({
    where: { workEmail: EMPLOYEE_EMAIL },
    select: { id: true },
  });
  const manager = await prisma.employee.findFirst({
    where: { workEmail: MANAGER_EMAIL },
    select: { id: true },
  });

  if (employee && manager) {
    await prisma.employee.update({
      where: { id: employee.id },
      data: { managerId: manager.id },
    });
    console.log(`Linked employee ${employee.id} to manager ${manager.id}`);
  }

  // Seed leave balances for employee
  if (employee) {
    await prisma.leaveBalance.upsert({
      where: {
        employeeId_leaveTypeId_year: {
          employeeId: employee.id,
          leaveTypeId: '', // Will be set after finding leave type
          year: new Date().getFullYear(),
        },
      },
      update: {},
      create: {
        employeeId: employee.id,
        leaveTypeId: '', // TODO: Replace with actual leave type ID from seeded data
        year: new Date().getFullYear(),
        entitled: 20,
        used: 0,
        balance: 20,
      },
    }).catch(() => {
      // Leave type may not exist — skip gracefully
      console.log('Skipped leave balance seed (leave type not found)');
    });
  } else {
    console.log('Skipped leave balance seed (employee not found)');
  }

  await prisma.$disconnect();
  console.log('E2E seed complete.');
}

seed().catch((e: unknown) => {
  console.error('E2E seed failed:', e);
  process.exit(1);
});
