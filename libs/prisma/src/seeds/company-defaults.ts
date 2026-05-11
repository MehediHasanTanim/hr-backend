import type { Prisma } from '@prisma/client';

type TxClient = Prisma.TransactionClient;

const rolesData = [
  { name: 'Admin', description: 'Full system access', isSystem: true },
  { name: 'HR Manager', description: 'Manage all HR functions', isSystem: true },
  { name: 'Manager', description: 'Manage direct reports', isSystem: true },
  { name: 'Employee', description: 'Self-service access only', isSystem: true },
] as const;

const leaveTypes = [
  { name: 'Annual Leave', code: 'AL', isPaid: true, allowHalfDay: true, carryForward: true, maxCarryForward: 5 },
  { name: 'Sick Leave', code: 'SL', isPaid: true, allowHalfDay: true, carryForward: false },
  { name: 'Maternity Leave', code: 'ML', isPaid: true, allowHalfDay: false, carryForward: false },
  { name: 'Paternity Leave', code: 'PL', isPaid: true, allowHalfDay: false, carryForward: false },
  { name: 'Unpaid Leave', code: 'UL', isPaid: false, allowHalfDay: true, carryForward: false },
] as const;

const salaryComponents = [
  { name: 'Basic Salary', code: 'BASIC', type: 'EARNING', calcMethod: 'FIXED', isTaxable: true },
  { name: 'House Rent Allowance', code: 'HRA', type: 'EARNING', calcMethod: 'PERCENT_OF_BASIC', defaultValue: 0.4, isTaxable: false },
  { name: 'Transport Allowance', code: 'TA', type: 'EARNING', calcMethod: 'FIXED', defaultValue: 200, isTaxable: false },
  { name: 'Income Tax', code: 'TDS', type: 'DEDUCTION', calcMethod: 'FORMULA', isTaxable: false },
  { name: 'Employee PF', code: 'EPF', type: 'DEDUCTION', calcMethod: 'PERCENT_OF_BASIC', defaultValue: 0.12, isTaxable: false },
  { name: 'Employer PF', code: 'EPFR', type: 'EMPLOYER_CONTRIBUTION', calcMethod: 'PERCENT_OF_BASIC', defaultValue: 0.12, isTaxable: false },
] as const;

export async function seedCompanyDefaults(client: TxClient, companyId: string): Promise<void> {
  await Promise.all(rolesData.map((roleData) =>
    client.role.upsert({
      where: { companyId_name: { companyId, name: roleData.name } },
      update: {},
      create: { companyId, ...roleData },
    })));

  await Promise.all(leaveTypes.map((leaveType) =>
    client.leaveType.upsert({
      where: { companyId_code: { companyId, code: leaveType.code } },
      update: {},
      create: { companyId, ...leaveType },
    })));

  await Promise.all(salaryComponents.map((component) =>
    client.salaryComponent.upsert({
      where: { companyId_code: { companyId, code: component.code } },
      update: {},
      create: { companyId, ...component },
    })));
}
