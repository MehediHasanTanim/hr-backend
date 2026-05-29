import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@hr/prisma', () => ({ PrismaService: class PrismaService {} }));

import { EmployeeRepository } from './employee.repository';

const companyId = '11111111-1111-4111-8111-111111111111';
const employeeId = '33333333-3333-4333-8333-333333333333';

function createPrismaMock() {
  const employee = {
    findMany: vi.fn().mockResolvedValue([]),
    count: vi.fn().mockResolvedValue(0),
    update: vi.fn().mockResolvedValue({ id: employeeId, deletedAt: new Date() }),
    delete: vi.fn(),
  };

  return {
    unscopedClient: {
      employee,
      $transaction: vi.fn(async (operations: Array<Promise<unknown>>) => Promise.all(operations)),
    },
  };
}

const defaultFilters = {
  page: 1,
  pageSize: 25,
  sortBy: 'employeeNumber' as const,
  sortOrder: 'asc' as const,
};

describe('EmployeeRepository', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it('always scopes findMany by companyId and safely merges filters', async () => {
    const prisma = createPrismaMock();
    const repository = new EmployeeRepository(prisma as never);

    await repository.findMany(companyId, {
      ...defaultFilters,
      department: '44444444-4444-4444-8444-444444444444',
      status: 'ACTIVE',
      location: '55555555-5555-4555-8555-555555555555',
      search: 'alex',
    });

    expect(prisma.unscopedClient.employee.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        companyId,
        deletedAt: null,
        departmentId: '44444444-4444-4444-8444-444444444444',
        status: 'ACTIVE',
        locationId: '55555555-5555-4555-8555-555555555555',
        OR: expect.any(Array),
      }),
    }));
    expect(prisma.unscopedClient.employee.count).toHaveBeenCalledWith({
      where: expect.objectContaining({ companyId, deletedAt: null }),
    });
  });

  it('excludes soft-deleted records and does not allow callers to override deletedAt', async () => {
    const prisma = createPrismaMock();
    const repository = new EmployeeRepository(prisma as never);

    await repository.findMany(companyId, {
      ...defaultFilters,
      deletedAt: { not: null },
    } as never);

    const findManyArgs = prisma.unscopedClient.employee.findMany.mock.calls[0][0];
    expect(findManyArgs.where.deletedAt).toBeNull();
    expect(findManyArgs.where.companyId).toBe(companyId);
  });

  it('softDelete updates deletedAt and never hard-deletes records', async () => {
    vi.useFakeTimers();
    const now = new Date('2026-05-28T12:00:00.000Z');
    vi.setSystemTime(now);
    const prisma = createPrismaMock();
    const repository = new EmployeeRepository(prisma as never);

    await repository.softDelete(companyId, employeeId);

    expect(prisma.unscopedClient.employee.update).toHaveBeenCalledWith({
      where: { id: employeeId, companyId },
      data: { deletedAt: now },
    });
    expect(prisma.unscopedClient.employee.delete).not.toHaveBeenCalled();
  });
});
