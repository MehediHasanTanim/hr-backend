import argon2 from 'argon2';
import { seedCompanyDefaults } from '@hr/prisma';
import { testPrisma } from './db.helper';

export interface SeedCompanyResult {
  companyId: string;
  adminUserId: string;
  adminEmployeeId: string;
  adminEmail: string;
  hrUserId: string;
  hrEmployeeId: string;
  hrEmail: string;
  empUserId: string;
  empEmployeeId: string;
  empEmail: string;
}

export async function seedCompany(slug = 'test-company'): Promise<SeedCompanyResult> {
  const passwordHash = await argon2.hash('ValidPass@123', {
    type: argon2.argon2id,
    memoryCost: 8192,
    timeCost: 2,
    parallelism: 1,
  });

  const company = await testPrisma.company.create({
    data: {
      name: `Acme ${slug}`,
      slug,
      country: 'US',
      currency: 'USD',
      timezone: 'UTC',
    },
  });

  await seedCompanyDefaults(testPrisma, company.id);
  await testPrisma.permission.createMany({
    data: ['employee', 'payroll', 'leave', 'attendance', 'admin', 'report'].flatMap((resource) =>
      ['read', 'write', 'delete', 'approve', 'export'].map((action) => ({
        resource,
        action,
        scope: 'COMPANY' as const,
      }))),
    skipDuplicates: true,
  });

  const adminRole = await testPrisma.role.findUniqueOrThrow({
    where: { companyId_name: { companyId: company.id, name: 'Admin' } },
  });
  const hrRole = await testPrisma.role.findUniqueOrThrow({
    where: { companyId_name: { companyId: company.id, name: 'HR Manager' } },
  });
  const empRole = await testPrisma.role.findUniqueOrThrow({
    where: { companyId_name: { companyId: company.id, name: 'Employee' } },
  });

  const permissions = await testPrisma.permission.findMany();
  await testPrisma.rolePermission.createMany({
    data: permissions.map((permission) => ({ roleId: adminRole.id, permissionId: permission.id })),
    skipDuplicates: true,
  });
  await testPrisma.rolePermission.createMany({
    data: permissions
      .filter((permission) =>
        ['employee', 'leave', 'attendance'].includes(permission.resource)
        && ['read', 'write', 'approve'].includes(permission.action))
      .map((permission) => ({ roleId: hrRole.id, permissionId: permission.id })),
    skipDuplicates: true,
  });
  await testPrisma.rolePermission.createMany({
    data: permissions
      .filter((permission) => permission.resource === 'employee' && permission.action === 'read')
      .map((permission) => ({ roleId: empRole.id, permissionId: permission.id })),
    skipDuplicates: true,
  });

  async function createUserAndEmployee(kind: 'admin' | 'hr' | 'emp', roleId: string, employeeNumber: string) {
    const email = `${kind}@${slug}.test`;
    const user = await testPrisma.user.create({
      data: {
        email,
        passwordHash,
        firstName: kind,
        lastName: 'User',
        isActive: true,
      },
    });
    const employee = await testPrisma.employee.create({
      data: {
        companyId: company.id,
        userId: user.id,
        employeeNumber,
        workEmail: email,
        status: 'ACTIVE',
        employmentType: 'FULL_TIME',
        joinedAt: new Date('2024-01-01'),
      },
    });
    await testPrisma.employeeRole.create({ data: { employeeId: employee.id, roleId } });
    return { email, userId: user.id, employeeId: employee.id };
  }

  const admin = await createUserAndEmployee('admin', adminRole.id, 'EMP001');
  const hr = await createUserAndEmployee('hr', hrRole.id, 'EMP002');
  const emp = await createUserAndEmployee('emp', empRole.id, 'EMP003');

  return {
    companyId: company.id,
    adminUserId: admin.userId,
    adminEmployeeId: admin.employeeId,
    adminEmail: admin.email,
    hrUserId: hr.userId,
    hrEmployeeId: hr.employeeId,
    hrEmail: hr.email,
    empUserId: emp.userId,
    empEmployeeId: emp.employeeId,
    empEmail: emp.email,
  };
}
