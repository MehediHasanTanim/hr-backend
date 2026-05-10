import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function seedPermissions(): Promise<void> {
  const resources = ['employee', 'payroll', 'leave', 'attendance', 'ivr', 'report', 'admin'];
  const actions = ['read', 'write', 'delete', 'approve', 'export'];

  const permissions = resources.flatMap((resource) =>
    actions.map((action) => ({
      resource,
      action,
      scope: 'COMPANY' as const,
    })),
  );

  await prisma.permission.createMany({ data: permissions, skipDuplicates: true });
  console.log(`Seeded ${permissions.length} permissions`);
}

async function seedCompanyDefaults(): Promise<void> {
  const company = await prisma.company.upsert({
    where: { slug: 'demo-corp' },
    update: {},
    create: {
      name: 'Demo Corporation',
      slug: 'demo-corp',
      country: 'US',
      currency: 'USD',
      timezone: 'America/New_York',
      fiscalYearStart: 1,
    },
  });

  const rolesData = [
    { name: 'Admin', description: 'Full system access', isSystem: true },
    { name: 'HR Manager', description: 'Manage all HR functions', isSystem: true },
    { name: 'Manager', description: 'Manage direct reports', isSystem: true },
    { name: 'Employee', description: 'Self-service access only', isSystem: true },
  ];

  await Promise.all(rolesData.map((roleData) =>
    prisma.role.upsert({
      where: { companyId_name: { companyId: company.id, name: roleData.name } },
      update: {},
      create: { companyId: company.id, ...roleData },
    })));

  const leaveTypes = [
    { name: 'Annual Leave', code: 'AL', isPaid: true, allowHalfDay: true, carryForward: true, maxCarryForward: 5 },
    { name: 'Sick Leave', code: 'SL', isPaid: true, allowHalfDay: true, carryForward: false },
    { name: 'Maternity Leave', code: 'ML', isPaid: true, allowHalfDay: false, carryForward: false },
    { name: 'Paternity Leave', code: 'PL', isPaid: true, allowHalfDay: false, carryForward: false },
    { name: 'Unpaid Leave', code: 'UL', isPaid: false, allowHalfDay: true, carryForward: false },
  ];

  await Promise.all(leaveTypes.map((lt) =>
    prisma.leaveType.upsert({
      where: { companyId_code: { companyId: company.id, code: lt.code } },
      update: {},
      create: { companyId: company.id, ...lt },
    })));

  const components = [
    { name: 'Basic Salary', code: 'BASIC', type: 'EARNING' as const, calcMethod: 'FIXED' as const, isTaxable: true },
    { name: 'House Rent Allowance', code: 'HRA', type: 'EARNING' as const, calcMethod: 'PERCENT_OF_BASIC' as const, defaultValue: 0.4, isTaxable: false },
    { name: 'Transport Allowance', code: 'TA', type: 'EARNING' as const, calcMethod: 'FIXED' as const, defaultValue: 200, isTaxable: false },
    { name: 'Income Tax', code: 'TDS', type: 'DEDUCTION' as const, calcMethod: 'FORMULA' as const, isTaxable: false },
    { name: 'Employee PF', code: 'EPF', type: 'DEDUCTION' as const, calcMethod: 'PERCENT_OF_BASIC' as const, defaultValue: 0.12, isTaxable: false },
    { name: 'Employer PF', code: 'EPFR', type: 'EMPLOYER_CONTRIBUTION' as const, calcMethod: 'PERCENT_OF_BASIC' as const, defaultValue: 0.12, isTaxable: false },
  ];

  await Promise.all(components.map((comp) =>
    prisma.salaryComponent.upsert({
      where: { companyId_code: { companyId: company.id, code: comp.code } },
      update: {},
      create: { companyId: company.id, ...comp },
    })));

  console.log(`Seeded company: ${company.slug}`);
}

async function main(): Promise<void> {
  await seedPermissions();
  await seedCompanyDefaults();
  console.log('Seed complete ✓');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
