import { afterEach, describe, expect, it, vi } from 'vitest';
import { BadRequestError, NotFoundError } from '@hr/shared';
import { SalaryComponentService } from '../services/salary-component.service';

vi.mock('@hr/prisma', () => ({ PrismaService: class PrismaService {} }));

function createMocks() {
  const mockPrisma = {
    unscopedClient: {
      salaryComponent: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      salaryStructureComponent: {
        findFirst: vi.fn(),
      },
    },
  };

  const service = new SalaryComponentService(mockPrisma as any);
  return { service, mockPrisma };
}

const COMPANY_ID = 'co-1';

describe('SalaryComponentService', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('create()', () => {
    it('creates a fixed salary component successfully', async () => {
      const { service, mockPrisma } = createMocks();
      mockPrisma.unscopedClient.salaryComponent.findFirst.mockResolvedValue(null);
      mockPrisma.unscopedClient.salaryComponent.findMany.mockResolvedValue([]);
      mockPrisma.unscopedClient.salaryComponent.create.mockResolvedValue({
        id: 'comp-1',
        companyId: COMPANY_ID,
        name: 'Basic Salary',
        code: 'BASIC',
        type: 'EARNING',
        calcMethod: 'FIXED',
        defaultValue: 50000,
        formula: null,
        isTaxable: true,
      });

      const result = await service.create(
        { name: 'Basic Salary', code: 'BASIC', type: 'EARNING', calculationType: 'fixed', defaultValue: 50000, isTaxable: true },
        COMPANY_ID,
      );

      expect(mockPrisma.unscopedClient.salaryComponent.create).toHaveBeenCalled();
      expect(result.code).toBe('BASIC');
    });

    it('rejects duplicate component code', async () => {
      const { service, mockPrisma } = createMocks();
      mockPrisma.unscopedClient.salaryComponent.findFirst.mockResolvedValue({ id: 'existing', code: 'BASIC' });

      await expect(
        service.create(
          { name: 'Basic', code: 'BASIC', type: 'EARNING', calculationType: 'fixed', defaultValue: 10000 },
          COMPANY_ID,
        ),
      ).rejects.toThrow(BadRequestError);
    });

    it('rejects fixed component with a formula', async () => {
      const { service, mockPrisma } = createMocks();
      mockPrisma.unscopedClient.salaryComponent.findFirst.mockResolvedValue(null);

      await expect(
        service.create(
          { name: 'Bad', code: 'BAD', type: 'EARNING', calculationType: 'fixed', formula: 'BASIC * 0.5' },
          COMPANY_ID,
        ),
      ).rejects.toThrow(BadRequestError);
    });

    it('rejects formula component without a formula', async () => {
      const { service, mockPrisma } = createMocks();
      mockPrisma.unscopedClient.salaryComponent.findFirst.mockResolvedValue(null);

      await expect(
        service.create(
          { name: 'HRA', code: 'HRA', type: 'EARNING', calculationType: 'formula' },
          COMPANY_ID,
        ),
      ).rejects.toThrow(BadRequestError);
    });

    it('creates a formula component with valid formula', async () => {
      const { service, mockPrisma } = createMocks();
      mockPrisma.unscopedClient.salaryComponent.findFirst.mockResolvedValue(null);
      mockPrisma.unscopedClient.salaryComponent.findMany.mockResolvedValue([
        { code: 'BASIC' },
      ]);
      mockPrisma.unscopedClient.salaryComponent.create.mockResolvedValue({
        id: 'comp-2',
        name: 'HRA',
        code: 'HRA',
        calcMethod: 'FORMULA',
        formula: 'BASIC * 0.4',
      });

      const result = await service.create(
        { name: 'HRA', code: 'HRA', type: 'EARNING', calculationType: 'formula', formula: 'BASIC * 0.4' },
        COMPANY_ID,
      );

      expect(result.code).toBe('HRA');
    });

    it('rejects percentage_of_base with a formula', async () => {
      const { service, mockPrisma } = createMocks();
      mockPrisma.unscopedClient.salaryComponent.findFirst.mockResolvedValue(null);

      await expect(
        service.create(
          { name: 'Bad', code: 'BAD', type: 'EARNING', calculationType: 'percentage_of_base', formula: 'BASIC * 0.1' },
          COMPANY_ID,
        ),
      ).rejects.toThrow(BadRequestError);
    });
  });

  describe('findAll()', () => {
    it('returns active components ordered by type and name', async () => {
      const { service, mockPrisma } = createMocks();
      mockPrisma.unscopedClient.salaryComponent.findMany.mockResolvedValue([
        { id: '1', name: 'Basic', code: 'BASIC', type: 'EARNING', isActive: true },
        { id: '2', name: 'PF', code: 'PF', type: 'DEDUCTION', isActive: true },
      ]);

      const result = await service.findAll(COMPANY_ID);

      expect(result).toHaveLength(2);
      expect(mockPrisma.unscopedClient.salaryComponent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { companyId: COMPANY_ID, isActive: true },
        }),
      );
    });
  });

  describe('update()', () => {
    it('updates component name', async () => {
      const { service, mockPrisma } = createMocks();
      mockPrisma.unscopedClient.salaryComponent.findFirst.mockResolvedValue({
        id: 'comp-1',
        companyId: COMPANY_ID,
        calcMethod: 'FIXED',
      });
      mockPrisma.unscopedClient.salaryComponent.update.mockResolvedValue({
        id: 'comp-1',
        name: 'Basic Pay Updated',
      });

      const result = await service.update('comp-1', { name: 'Basic Pay Updated' }, COMPANY_ID);

      expect(mockPrisma.unscopedClient.salaryComponent.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'comp-1' },
          data: expect.objectContaining({ name: 'Basic Pay Updated' }),
        }),
      );
    });

    it('throws NotFoundError when component not found', async () => {
      const { service, mockPrisma } = createMocks();
      mockPrisma.unscopedClient.salaryComponent.findFirst.mockResolvedValue(null);

      await expect(
        service.update('comp-999', { name: 'Test' }, COMPANY_ID),
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('softDelete()', () => {
    it('soft-deletes by setting isActive to false', async () => {
      const { service, mockPrisma } = createMocks();
      mockPrisma.unscopedClient.salaryComponent.findFirst.mockResolvedValue({
        id: 'comp-1',
        companyId: COMPANY_ID,
      });
      mockPrisma.unscopedClient.salaryStructureComponent.findFirst.mockResolvedValue(null);
      mockPrisma.unscopedClient.salaryComponent.update.mockResolvedValue({
        id: 'comp-1',
        isActive: false,
      });

      const result = await service.softDelete('comp-1', COMPANY_ID);

      expect(mockPrisma.unscopedClient.salaryComponent.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'comp-1' },
          data: { isActive: false },
        }),
      );
    });

    it('blocks delete when component is in use in active structure', async () => {
      const { service, mockPrisma } = createMocks();
      mockPrisma.unscopedClient.salaryComponent.findFirst.mockResolvedValue({
        id: 'comp-1',
        companyId: COMPANY_ID,
      });
      mockPrisma.unscopedClient.salaryStructureComponent.findFirst.mockResolvedValue({
        id: 'link-1',
        structure: { isActive: true },
      });

      await expect(
        service.softDelete('comp-1', COMPANY_ID),
      ).rejects.toThrow(BadRequestError);
    });
  });
});
