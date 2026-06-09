import { afterEach, describe, expect, it, vi } from 'vitest';
import { NotFoundError, ForbiddenError } from '@hr/shared';
import { PayslipService } from '../services/payslip.service';

vi.mock('@hr/prisma', () => ({ PrismaService: class PrismaService {} }));
vi.mock('../services/storage.service', () => ({
  StorageService: class StorageService {
    getSignedUrl = vi.fn();
  },
}));

function createMocks() {
  const mockPrisma = {
    unscopedClient: {
      employee: { findFirst: vi.fn() },
      payslip: { findFirst: vi.fn(), findMany: vi.fn(), count: vi.fn() },
      $transaction: vi.fn(),
    },
  };

  const mockStorage = {
    getSignedUrl: vi.fn(),
  };

  const service = new PayslipService(mockPrisma as any, mockStorage as any);
  return { service, mockPrisma, mockStorage };
}

function makeActor(overrides: Record<string, unknown> = {}) {
  return {
    userId: 'emp-user-1',
    companyId: 'co-1',
    email: 'emp@test.com',
    roles: ['EMPLOYEE'],
    permissions: [],
    sessionId: 'sess-1',
    traceId: 'trace-1',
    ...overrides,
  };
}

describe('PayslipService', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('listPayslips()', () => {
    it('lists published payslips for an employee', async () => {
      const { service, mockPrisma, mockStorage } = createMocks();
      const actor = makeActor();

      mockPrisma.unscopedClient.employee.findFirst.mockResolvedValue({
        id: 'emp-1',
        userId: 'emp-user-1',
      });
      mockPrisma.unscopedClient.$transaction.mockResolvedValue([
        [
          {
            id: 'ps-1',
            employeeId: 'emp-1',
            cycleId: 'cycle-1',
            status: 'PUBLISHED',
            s3Key: 'payslips/key1.pdf',
            generatedAt: new Date(),
            cycle: { month: 6, year: 2026 },
            entry: { netPayable: 61200 },
          },
        ],
        1,
      ]);
      mockStorage.getSignedUrl.mockResolvedValue('https://signed.url/payslip.pdf');

      const result = await service.listPayslips(actor, {});

      expect(result.items).toHaveLength(1);
      expect(result.items[0].downloadUrl).toBe('https://signed.url/payslip.pdf');
      expect(result.total).toBe(1);
    });

    it('filters by employeeId for HR admin', async () => {
      const { service, mockPrisma } = createMocks();
      const actor = makeActor({ roles: ['HR_ADMIN'] });

      mockPrisma.unscopedClient.$transaction.mockResolvedValue([[], 0]);

      await service.listPayslips(actor, { employeeId: 'emp-2' });

      // Should pass the filter through
      expect(mockPrisma.unscopedClient.$transaction).toHaveBeenCalled();
    });

    it('returns empty list when no payslips exist', async () => {
      const { service, mockPrisma } = createMocks();
      const actor = makeActor();

      mockPrisma.unscopedClient.employee.findFirst.mockResolvedValue({
        id: 'emp-1',
        userId: 'emp-user-1',
      });
      mockPrisma.unscopedClient.$transaction.mockResolvedValue([[], 0]);

      const result = await service.listPayslips(actor, {});

      expect(result.items).toHaveLength(0);
      expect(result.total).toBe(0);
    });
  });

  describe('getPayslip()', () => {
    it('returns payslip with signed URL for the owner employee', async () => {
      const { service, mockPrisma, mockStorage } = createMocks();
      const actor = makeActor();

      mockPrisma.unscopedClient.payslip.findFirst.mockResolvedValue({
        id: 'ps-1',
        companyId: 'co-1',
        employeeId: 'emp-1',
        cycleId: 'cycle-1',
        entryId: 'entry-1',
        grossAmount: 70000,
        netAmount: 61200,
        taxAmount: 8800,
        status: 'PUBLISHED',
        s3Key: 'payslips/key1.pdf',
        s3Bucket: 'bucket',
        generatedAt: new Date(),
        employee: { id: 'emp-1', userId: 'emp-user-1' },
        entry: {
          components: [
            { id: 'c1', type: 'EARNING', componentName: 'Basic', amount: 50000 },
            { id: 'c2', type: 'DEDUCTION', componentName: 'PF', amount: 1800 },
          ],
          cycle: { month: 6, year: 2026 },
        },
      });
      mockStorage.getSignedUrl.mockResolvedValue('https://signed.url/payslip.pdf');

      const result = await service.getPayslip('ps-1', actor);

      expect(result.signedUrl).toBe('https://signed.url/payslip.pdf');
      expect(result.salaryBreakdown).toBeDefined();
      expect(result.salaryBreakdown.earnings).toHaveLength(1);
      expect(result.salaryBreakdown.deductions).toHaveLength(1);
    });

    it('throws ForbiddenError for non-owner, non-admin access', async () => {
      const { service, mockPrisma } = createMocks();
      const actor = makeActor({ userId: 'other-user' });

      mockPrisma.unscopedClient.payslip.findFirst.mockResolvedValue({
        id: 'ps-1',
        companyId: 'co-1',
        employeeId: 'emp-1',
        employee: { id: 'emp-1', userId: 'emp-user-1' },
        status: 'PUBLISHED',
      });

      await expect(
        service.getPayslip('ps-1', actor),
      ).rejects.toThrow(ForbiddenError);
    });

    it('throws NotFoundError when payslip not found', async () => {
      const { service, mockPrisma } = createMocks();
      const actor = makeActor();
      mockPrisma.unscopedClient.payslip.findFirst.mockResolvedValue(null);

      await expect(
        service.getPayslip('ps-999', actor),
      ).rejects.toThrow(NotFoundError);
    });

    it('allows HR admin access to any payslip', async () => {
      const { service, mockPrisma, mockStorage } = createMocks();
      const actor = makeActor({ userId: 'hr-1', roles: ['HR_ADMIN'] });

      mockPrisma.unscopedClient.payslip.findFirst.mockResolvedValue({
        id: 'ps-1',
        companyId: 'co-1',
        employeeId: 'emp-2',
        grossAmount: 70000,
        netAmount: 61200,
        taxAmount: 8800,
        status: 'PUBLISHED',
        s3Key: null,
        s3Bucket: null,
        employee: { id: 'emp-2', userId: 'emp-user-2' },
        entry: {
          components: [],
          cycle: { month: 6, year: 2026 },
        },
      });
      mockStorage.getSignedUrl.mockRejectedValue(new Error('No key'));

      const result = await service.getPayslip('ps-1', actor);

      expect(result.signedUrl).toBeNull();
    });
  });
});
