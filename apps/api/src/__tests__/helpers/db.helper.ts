import { PrismaClient } from '@prisma/client';

const columnAliases: Record<string, string> = {
  company_id: 'companyId',
  user_id: 'userId',
  resource_id: 'resourceId',
  created_at: 'createdAt',
  deleted_at: 'deletedAt',
  last_login_at: 'lastLoginAt',
  first_name: 'firstName',
};

const tableAliases: Record<string, string> = {
  companies: 'companies',
  users: 'users',
  employees: 'employees',
  employee_roles: 'employee_roles',
  roles: 'roles',
  permissions: 'permissions',
  role_permissions: 'role_permissions',
  audit_logs: 'audit_logs',
  leave_types: 'leave_types',
  salary_components: 'salary_components',
  pay_periods: 'pay_periods',
  payslips: 'payslips',
};

const uuidColumns = new Set([
  'id',
  'companyId',
  'userId',
  'employeeId',
  'roleId',
  'permissionId',
  'departmentId',
]);

export const testPrisma = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });

function quoteTable(table: string): string {
  const resolved = tableAliases[table] ?? table;
  return `"${resolved.replaceAll('"', '""')}"`;
}

function quoteColumn(column: string): string {
  const resolved = columnAliases[column] ?? column;
  return `"${resolved.replaceAll('"', '""')}"`;
}

function whereClause(where: Record<string, unknown>): { sql: string; values: unknown[] } {
  const entries = Object.entries(where);
  if (entries.length === 0) return { sql: '', values: [] };
  return {
    sql: `WHERE ${entries.map(([key], index) => {
      const column = columnAliases[key] ?? key;
      const cast = uuidColumns.has(column) ? '::uuid' : '';
      return `${quoteColumn(key)} = $${index + 1}${cast}`;
    }).join(' AND ')}`,
    values: entries.map(([, value]) => value),
  };
}

export async function truncateTables(...tables: string[]): Promise<void> {
  if (tables.length === 0) return;
  await testPrisma.$executeRawUnsafe(`TRUNCATE TABLE ${tables.map(quoteTable).join(', ')} RESTART IDENTITY CASCADE`);
}

export async function query<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
  return testPrisma.$queryRawUnsafe<T[]>(sql, ...params);
}

export async function rowExists(table: string, where: Record<string, unknown>): Promise<boolean> {
  const { sql, values } = whereClause(where);
  const rows = await testPrisma.$queryRawUnsafe<unknown[]>(
    `SELECT 1 FROM ${quoteTable(table)} ${sql} LIMIT 1`,
    ...values,
  );
  return rows.length > 0;
}

export async function getRow<T = Record<string, unknown>>(table: string, where: Record<string, unknown>): Promise<T | null> {
  const { sql, values } = whereClause(where);
  const rows = await testPrisma.$queryRawUnsafe<T[]>(
    `SELECT * FROM ${quoteTable(table)} ${sql} LIMIT 1`,
    ...values,
  );
  return rows[0] ?? null;
}

export async function countRows(table: string, where: Record<string, unknown> = {}): Promise<number> {
  const { sql, values } = whereClause(where);
  const rows = await testPrisma.$queryRawUnsafe<[{ count: bigint }]>(
    `SELECT COUNT(*) as count FROM ${quoteTable(table)} ${sql}`,
    ...values,
  );
  return Number(rows[0]?.count ?? 0);
}

export async function disconnectDb(): Promise<void> {
  await testPrisma.$disconnect();
}
