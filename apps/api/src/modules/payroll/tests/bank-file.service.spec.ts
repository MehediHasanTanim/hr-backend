import { afterEach, describe, expect, it, vi } from 'vitest';
import { BadRequestError, NotFoundError } from '@hr/shared';
import { BankFileService } from '../services/bank-file.service';

vi.mock('@hr/prisma', () => ({ PrismaService: class PrismaService {} }));

function createMocks() {
  const mockPrisma = {
    unscopedClient: {
      payrollCycle: { findFirst: vi.fn() },
      payrollEntry: { findMany: vi.fn() },
    },
  };

  const mockAudit = { record: vi.fn() };

  const service = new BankFileService(mockPrisma as any, mockAudit as any);
  return { service, mockPrisma, mockAudit };
}

function makeActor(overrides: Record<string, unknown> = {}) {
  return {
    userId: 'hr-1',
    companyId: 'co-1',
    email: 'hr@test.com',
    roles: ['HR_ADMIN'],
    permissions: ['payroll:read'],
    sessionId: 'sess-1',
    traceId: 'trace-1',
    ...overrides,
  };
}

describe('BankFileService', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('exportBankFile()', () => {
    it('generates NEFT bank file for approved cycles', async () => {
      const { service, mockPrisma, mockAudit } = createMocks();
      const actor = makeActor();

      mockPrisma.unscopedClient.payrollCycle.findFirst.mockResolvedValue({
        id: 'cycle-1',
        companyId: 'co-1',
        month: 6,
        year: 2026,
        status: 'APPROVED',
      });
      mockPrisma.unscopedClient.payrollEntry.findMany.mockResolvedValue([
        {
          id: 'entry-1',
          employeeId: 'emp-1',
          netPayable: 61200,
          employee: {
            bankDetails: [
              {
                accountHolderName: 'John Doe',
                accountNumber: '1234567890',
                ifscCode: 'HDFC0001234',
                bankName: 'HDFC Bank',
              },
            ],
          },
        },
        {
          id: 'entry-2',
          employeeId: 'emp-2',
          netPayable: 45000,
          employee: {
            bankDetails: [
              {
                accountHolderName: 'Jane Smith',
                accountNumber: '9876543210',
                ifscCode: 'ICIC0005678',
                bankName: 'ICICI Bank',
              },
            ],
          },
        },
      ]);

      const result = await service.exportBankFile('cycle-1', 'neft', actor);

      expect(result.contentType).toBe('text/csv');
      expect(result.filename).toContain('neft');
      expect(result.content).toContain('John Doe');
      expect(result.content).toContain('Jane Smith');
      expect(mockAudit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'BANK_FILE_EXPORTED' }),
      );
    });

    it('generates ACH formatted file', async () => {
      const { service, mockPrisma } = createMocks();
      const actor = makeActor();

      mockPrisma.unscopedClient.payrollCycle.findFirst.mockResolvedValue({
        id: 'cycle-1',
        companyId: 'co-1',
        month: 6,
        year: 2026,
        status: 'APPROVED',
      });
      mockPrisma.unscopedClient.payrollEntry.findMany.mockResolvedValue([
        {
          id: 'entry-1',
          employeeId: 'emp-1',
          netPayable: 61200,
          employee: {
            bankDetails: [
              {
                accountHolderName: 'John Doe',
                accountNumber: '1234567890',
                ifscCode: 'HDFC0001234',
                bankName: 'HDFC Bank',
              },
            ],
          },
        },
      ]);

      const result = await service.exportBankFile('cycle-1', 'ach', actor);

      expect(result.content).toContain('DEST_ACCT_NO|DEST_IFSC|BENE_NAME');
      expect(result.content).toContain('1234567890|HDFC0001234');
    });

    it('throws NotFoundError when cycle not found', async () => {
      const { service, mockPrisma } = createMocks();
      const actor = makeActor();
      mockPrisma.unscopedClient.payrollCycle.findFirst.mockResolvedValue(null);

      await expect(
        service.exportBankFile('cycle-999', 'neft', actor),
      ).rejects.toThrow(NotFoundError);
    });

    it('throws BadRequestError when cycle is not approved or disbursed', async () => {
      const { service, mockPrisma } = createMocks();
      const actor = makeActor();
      mockPrisma.unscopedClient.payrollCycle.findFirst.mockResolvedValue({
        id: 'cycle-1',
        status: 'DRAFT',
      });

      await expect(
        service.exportBankFile('cycle-1', 'neft', actor),
      ).rejects.toThrow(BadRequestError);
    });

    it('throws BadRequestError when no payable entries exist', async () => {
      const { service, mockPrisma } = createMocks();
      const actor = makeActor();
      mockPrisma.unscopedClient.payrollCycle.findFirst.mockResolvedValue({
        id: 'cycle-1',
        status: 'APPROVED',
      });
      mockPrisma.unscopedClient.payrollEntry.findMany.mockResolvedValue([]);

      await expect(
        service.exportBankFile('cycle-1', 'neft', actor),
      ).rejects.toThrow(BadRequestError);
    });

    it('skips employees without bank details', async () => {
      const { service, mockPrisma, mockAudit } = createMocks();
      const actor = makeActor();

      mockPrisma.unscopedClient.payrollCycle.findFirst.mockResolvedValue({
        id: 'cycle-1',
        companyId: 'co-1',
        month: 6,
        year: 2026,
        status: 'APPROVED',
      });
      mockPrisma.unscopedClient.payrollEntry.findMany.mockResolvedValue([
        {
          id: 'entry-1',
          employeeId: 'emp-1',
          netPayable: 61200,
          employee: { bankDetails: [] },
        },
      ]);

      const result = await service.exportBankFile('cycle-1', 'neft', actor);

      // Should have no rows since the only employee has no bank details
      expect(result.content).toBe('');
    });

    it('escapes CSV values containing commas or quotes', async () => {
      const { service, mockPrisma } = createMocks();
      const actor = makeActor();

      mockPrisma.unscopedClient.payrollCycle.findFirst.mockResolvedValue({
        id: 'cycle-1',
        companyId: 'co-1',
        month: 6,
        year: 2026,
        status: 'APPROVED',
      });
      mockPrisma.unscopedClient.payrollEntry.findMany.mockResolvedValue([
        {
          id: 'entry-1',
          employeeId: 'emp-1',
          netPayable: 50000,
          employee: {
            bankDetails: [
              {
                accountHolderName: 'Doe, John "Jr"',
                accountNumber: '1234567890',
                ifscCode: 'HDFC0001234',
                bankName: 'HDFC Bank',
              },
            ],
          },
        },
      ]);

      const result = await service.exportBankFile('cycle-1', 'neft', actor);

      // Name with comma and quotes should be properly escaped
      expect(result.content).toContain('"Doe, John ""Jr"""');
    });
  });
});
