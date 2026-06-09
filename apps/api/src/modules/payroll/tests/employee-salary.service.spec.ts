import { afterEach, describe, expect, it, vi } from 'vitest';
import { BadRequestError, NotFoundError } from '@hr/shared';
import { EmployeeSalaryService } from '../services/employee-salary.service';

vi.mock('@hr/prisma', () => ({ PrismaService: class PrismaService {} }));

function createMocks() {
  const tx = {
    employeeSalary: { updateMany: vi.fn(), create: vi.fn(), update: vi.fn() },
  };

  const mockPrisma = {
    unscopedClient: {
      employee: { findFirst: vi.fn() },
      salaryStructure: { findFirst: vi.fn() },
      employeeSalary: { findFirst: vi.fn(), findMany: vi.fn(), update: vi.fn() },
      $transaction: vi.fn(async (fn: (t: any) => Promise<unknown>) => fn(tx)),
    },
  };

  const mockAudit = { record: vi.fn() };

  const service = new EmployeeSalaryService(mockPrisma as any, mockAudit as any);
  return { service, mockPrisma, mockAudit, tx };
}

function makeActor(overrides: Record<string, unknown> = {}) {
  return {
    userId: 'hr-1',
    companyId: 'co-1',
    email: 'hr@test.com',
    roles: ['HR_ADMIN'],
    permissions: ['payroll:read', 'payroll:write'],
    sessionId: 'sess-1',
    traceId: 'trace-1',
    ...overrides,
  };
}

describe('EmployeeSalaryService', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('assign()', () => {
    it('assigns a salary to an employee', async () => {
      const { service, mockPrisma, mockAudit, tx } = createMocks();
      const actor = makeActor();

      mockPrisma.unscopedClient.employee.findFirst.mockResolvedValue({
        id: 'emp-1',
        companyId: 'co-1',
      });
      mockPrisma.unscopedClient.salaryStructure.findFirst.mockResolvedValue({
        id: 'struct-1',
        isActive: true,
      });
      tx.employeeSalary.create.mockResolvedValue({
        id: 'sal-1',
        employeeId: 'emp-1',
        structureId: 'struct-1',
        ctc: 600000,
        effectiveFrom: new Date('2026-06-01'),
        status: 'DRAFT',
      });

      const result = await service.assign(
        { employeeId: 'emp-1', structureId: 'struct-1', ctc: 600000, effectiveFrom: new Date('2026-06-01') },
        actor,
      );

      expect(result.status).toBe('DRAFT');
      expect(mockAudit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'SALARY_ASSIGNED' }),
      );
    });

    it('closes previous active salary record', async () => {
      const { service, mockPrisma, tx } = createMocks();
      const actor = makeActor();

      mockPrisma.unscopedClient.employee.findFirst.mockResolvedValue({
        id: 'emp-1',
        companyId: 'co-1',
      });
      mockPrisma.unscopedClient.salaryStructure.findFirst.mockResolvedValue({
        id: 'struct-2',
        isActive: true,
      });
      tx.employeeSalary.create.mockResolvedValue({
        id: 'sal-2',
        status: 'DRAFT',
      });

      await service.assign(
        { employeeId: 'emp-1', structureId: 'struct-2', ctc: 720000, effectiveFrom: new Date('2026-07-01') },
        actor,
      );

      expect(tx.employeeSalary.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ employeeId: 'emp-1', effectiveTo: null }),
          data: expect.objectContaining({ effectiveTo: expect.any(Date) }),
        }),
      );
    });

    it('throws NotFoundError when employee not found', async () => {
      const { service, mockPrisma } = createMocks();
      const actor = makeActor();
      mockPrisma.unscopedClient.employee.findFirst.mockResolvedValue(null);

      await expect(
        service.assign(
          { employeeId: 'emp-999', structureId: 'struct-1', ctc: 600000, effectiveFrom: new Date('2026-06-01') },
          actor,
        ),
      ).rejects.toThrow(NotFoundError);
    });

    it('throws NotFoundError when structure not found or inactive', async () => {
      const { service, mockPrisma } = createMocks();
      const actor = makeActor();
      mockPrisma.unscopedClient.employee.findFirst.mockResolvedValue({
        id: 'emp-1',
        companyId: 'co-1',
      });
      mockPrisma.unscopedClient.salaryStructure.findFirst.mockResolvedValue(null);

      await expect(
        service.assign(
          { employeeId: 'emp-1', structureId: 'struct-999', ctc: 600000, effectiveFrom: new Date('2026-06-01') },
          actor,
        ),
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('revise()', () => {
    it('creates a new revision and audits it', async () => {
      const { service, mockPrisma, mockAudit, tx } = createMocks();
      const actor = makeActor();

      mockPrisma.unscopedClient.employee.findFirst.mockResolvedValue({
        id: 'emp-1',
        companyId: 'co-1',
      });
      mockPrisma.unscopedClient.salaryStructure.findFirst.mockResolvedValue({
        id: 'struct-1',
        isActive: true,
      });
      tx.employeeSalary.create.mockResolvedValue({
        id: 'sal-rev-1',
        status: 'DRAFT',
      });

      const result = await service.revise(
        'emp-1',
        { employeeId: 'emp-1', structureId: 'struct-1', ctc: 720000, effectiveFrom: new Date('2026-07-01') },
        actor,
      );

      expect(result.status).toBe('DRAFT');
      expect(mockAudit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'SALARY_REVISION_CREATED' }),
      );
    });
  });

  describe('approve()', () => {
    it('approves a draft salary record', async () => {
      const { service, mockPrisma, mockAudit } = createMocks();
      const actor = makeActor();

      mockPrisma.unscopedClient.employeeSalary.findFirst.mockResolvedValue({
        id: 'sal-1',
        employeeId: 'emp-1',
        status: 'DRAFT',
        ctc: 600000,
        effectiveFrom: new Date('2026-06-01'),
        structureId: 'struct-1',
      });
      mockPrisma.unscopedClient.employeeSalary.update.mockResolvedValue({
        id: 'sal-1',
        status: 'APPROVED',
        approvedById: 'hr-1',
      });

      const result = await service.approve('sal-1', actor);

      expect(result.status).toBe('APPROVED');
      expect(mockAudit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'SALARY_REVISION_APPROVED' }),
      );
    });

    it('rejects approving non-draft salary', async () => {
      const { service, mockPrisma } = createMocks();
      const actor = makeActor();

      mockPrisma.unscopedClient.employeeSalary.findFirst.mockResolvedValue({
        id: 'sal-1',
        status: 'APPROVED',
      });

      await expect(
        service.approve('sal-1', actor),
      ).rejects.toThrow(BadRequestError);
    });

    it('throws NotFoundError when salary not found', async () => {
      const { service, mockPrisma } = createMocks();
      const actor = makeActor();
      mockPrisma.unscopedClient.employeeSalary.findFirst.mockResolvedValue(null);

      await expect(
        service.approve('sal-999', actor),
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('getCurrentSalary()', () => {
    it('returns approved current salary with structure', async () => {
      const { service, mockPrisma } = createMocks();

      mockPrisma.unscopedClient.employeeSalary.findFirst.mockResolvedValue({
        id: 'sal-1',
        ctc: 600000,
        structureId: 'struct-1',
        status: 'APPROVED',
        effectiveFrom: new Date('2026-01-01'),
        effectiveTo: null,
        structure: {
          components: [{ sortOrder: 1, component: { code: 'BASIC' } }],
        },
      });

      const result = await service.getCurrentSalary('emp-1', new Date('2026-06-01'), 'co-1');

      expect(result.status).toBe('APPROVED');
      expect(result.structure).toBeDefined();
    });

    it('throws NotFoundError when no active salary found', async () => {
      const { service, mockPrisma } = createMocks();
      mockPrisma.unscopedClient.employeeSalary.findFirst.mockResolvedValue(null);

      await expect(
        service.getCurrentSalary('emp-999', new Date(), 'co-1'),
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('getSalaryHistory()', () => {
    it('returns salary history in descending order', async () => {
      const { service, mockPrisma } = createMocks();

      mockPrisma.unscopedClient.employee.findFirst.mockResolvedValue({
        id: 'emp-1',
        companyId: 'co-1',
      });
      mockPrisma.unscopedClient.employeeSalary.findMany.mockResolvedValue([
        { id: 'sal-2', ctc: 720000, effectiveFrom: new Date('2026-07-01') },
        { id: 'sal-1', ctc: 600000, effectiveFrom: new Date('2026-01-01') },
      ]);

      const result = await service.getSalaryHistory('emp-1', 'co-1');

      expect(result).toHaveLength(2);
      expect(mockPrisma.unscopedClient.employeeSalary.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { effectiveFrom: 'desc' },
        }),
      );
    });

    it('throws NotFoundError for unknown employee', async () => {
      const { service, mockPrisma } = createMocks();
      mockPrisma.unscopedClient.employee.findFirst.mockResolvedValue(null);

      await expect(
        service.getSalaryHistory('emp-999', 'co-1'),
      ).rejects.toThrow(NotFoundError);
    });
  });
});
