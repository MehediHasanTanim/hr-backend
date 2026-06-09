import { afterEach, describe, expect, it, vi } from 'vitest';
import { BadRequestError, NotFoundError } from '@hr/shared';
import { SalaryStructureService } from '../services/salary-structure.service';

vi.mock('@hr/prisma', () => ({ PrismaService: class PrismaService {} }));

function createMocks() {
  const tx = {
    salaryStructure: { create: vi.fn(), update: vi.fn(), findUnique: vi.fn() },
    salaryStructureComponent: { create: vi.fn(), deleteMany: vi.fn() },
  };

  const mockPrisma = {
    unscopedClient: {
      salaryComponent: { findMany: vi.fn() },
      salaryStructure: { findFirst: vi.fn(), findMany: vi.fn(), update: vi.fn(), create: vi.fn() },
      salaryStructureComponent: { findFirst: vi.fn() },
      payrollCycle: { findFirst: vi.fn() },
      employeeSalary: { findFirst: vi.fn() },
      $transaction: vi.fn(async (fn: (t: any) => Promise<unknown>) => fn(tx)),
    },
  };

  const service = new SalaryStructureService(mockPrisma as any);
  return { service, mockPrisma, tx };
}

const COMPANY_ID = 'co-1';

describe('SalaryStructureService', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('create()', () => {
    it('creates a structure with valid components', async () => {
      const { service, mockPrisma, tx } = createMocks();
      mockPrisma.unscopedClient.salaryComponent.findMany.mockResolvedValue([
        { id: 'comp-1', code: 'BASIC', calcMethod: 'FIXED' },
        { id: 'comp-2', code: 'HRA', calcMethod: 'FORMULA', formula: 'BASIC * 0.4' },
      ]);
      tx.salaryStructure.create.mockResolvedValue({ id: 'struct-1' });
      tx.salaryStructure.findUnique.mockResolvedValue({
        id: 'struct-1',
        name: 'Grade A',
        components: [
          { sortOrder: 1, component: { id: 'comp-1', code: 'BASIC', name: 'Basic' } },
          { sortOrder: 2, component: { id: 'comp-2', code: 'HRA', name: 'HRA' } },
        ],
      });

      const result = await service.create(
        {
          name: 'Grade A',
          components: [
            { componentId: 'comp-1', sortOrder: 1, defaultValue: 50000 },
            { componentId: 'comp-2', sortOrder: 2, defaultValue: 0 },
          ],
        },
        COMPANY_ID,
      );

      expect(tx.salaryStructure.create).toHaveBeenCalled();
      expect(tx.salaryStructureComponent.create).toHaveBeenCalledTimes(2);
    });

    it('throws when component is invalid or inactive', async () => {
      const { service, mockPrisma } = createMocks();
      mockPrisma.unscopedClient.salaryComponent.findMany.mockResolvedValue([
        { id: 'comp-1', code: 'BASIC', calcMethod: 'FIXED' },
      ]);

      await expect(
        service.create(
          {
            name: 'Grade A',
            components: [
              { componentId: 'comp-1', sortOrder: 1, defaultValue: 50000 },
              { componentId: 'comp-999', sortOrder: 2, defaultValue: 0 },
            ],
          },
          COMPANY_ID,
        ),
      ).rejects.toThrow(BadRequestError);
    });

    it('throws on duplicate component IDs', async () => {
      const { service, mockPrisma } = createMocks();
      mockPrisma.unscopedClient.salaryComponent.findMany.mockResolvedValue([
        { id: 'comp-1', code: 'BASIC', calcMethod: 'FIXED' },
      ]);

      await expect(
        service.create(
          {
            name: 'Grade A',
            components: [
              { componentId: 'comp-1', sortOrder: 1, defaultValue: 50000 },
              { componentId: 'comp-1', sortOrder: 2, defaultValue: 20000 },
            ],
          },
          COMPANY_ID,
        ),
      ).rejects.toThrow(BadRequestError);
    });

    it('throws when structure has no components', async () => {
      const { service } = createMocks();

      // Zod validation would catch this at the controller level
      // But service should also handle it via prisma
      await expect(
        service.create(
          { name: 'Empty', components: [] },
          COMPANY_ID,
        ),
      ).rejects.toThrow();
    });
  });

  describe('findAll()', () => {
    it('returns only active structures', async () => {
      const { service, mockPrisma } = createMocks();
      mockPrisma.unscopedClient.salaryStructure.findMany.mockResolvedValue([
        { id: 's1', name: 'Grade A', isActive: true, components: [] },
        { id: 's2', name: 'Grade B', isActive: true, components: [] },
      ]);

      const result = await service.findAll(COMPANY_ID);

      expect(result).toHaveLength(2);
      expect(mockPrisma.unscopedClient.salaryStructure.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { companyId: COMPANY_ID, isActive: true },
        }),
      );
    });
  });

  describe('update()', () => {
    it('updates structure name and replaces components', async () => {
      const { service, mockPrisma, tx } = createMocks();
      mockPrisma.unscopedClient.salaryStructure.findFirst.mockResolvedValue({
        id: 'struct-1',
        companyId: COMPANY_ID,
      });
      mockPrisma.unscopedClient.payrollCycle.findFirst.mockResolvedValue(null);
      tx.salaryStructure.findUnique.mockResolvedValue({
        id: 'struct-1',
        name: 'Updated Grade A',
        components: [],
      });

      const result = await service.update(
        'struct-1',
        { name: 'Updated Grade A', components: [{ componentId: 'comp-1', sortOrder: 1, defaultValue: 60000 }] },
        COMPANY_ID,
      );

      expect(tx.salaryStructureComponent.deleteMany).toHaveBeenCalled();
      expect(tx.salaryStructureComponent.create).toHaveBeenCalledTimes(1);
    });

    it('throws NotFoundError when structure not found', async () => {
      const { service, mockPrisma } = createMocks();
      mockPrisma.unscopedClient.salaryStructure.findFirst.mockResolvedValue(null);

      await expect(
        service.update('struct-999', { name: 'Test' }, COMPANY_ID),
      ).rejects.toThrow(NotFoundError);
    });

    it('blocks update when active payroll cycle references it', async () => {
      const { service, mockPrisma } = createMocks();
      mockPrisma.unscopedClient.salaryStructure.findFirst.mockResolvedValue({
        id: 'struct-1',
        companyId: COMPANY_ID,
      });
      mockPrisma.unscopedClient.payrollCycle.findFirst.mockResolvedValue({
        id: 'cycle-1',
        status: 'DRAFT',
      });

      await expect(
        service.update('struct-1', { name: 'Updated' }, COMPANY_ID),
      ).rejects.toThrow(BadRequestError);
    });
  });

  describe('clone()', () => {
    it('creates an exact copy of a structure with a new name', async () => {
      const { service, mockPrisma, tx } = createMocks();
      // First findFirst call: source structure exists
      // Second findFirst call: no existing structure with the new name
      mockPrisma.unscopedClient.salaryStructure.findFirst
        .mockResolvedValueOnce({
          id: 'struct-1',
          companyId: COMPANY_ID,
          name: 'Grade A',
          description: 'Standard grade',
          components: [
            { componentId: 'comp-1', sortOrder: 1, defaultValue: 50000 },
            { componentId: 'comp-2', sortOrder: 2, defaultValue: 0 },
          ],
        })
        .mockResolvedValueOnce(null);
      tx.salaryStructure.create.mockResolvedValue({ id: 'struct-clone' });
      tx.salaryStructure.findUnique.mockResolvedValue({
        id: 'struct-clone',
        name: 'Grade A Clone',
        components: [
          { sortOrder: 1, component: { id: 'comp-1', code: 'BASIC' } },
          { sortOrder: 2, component: { id: 'comp-2', code: 'HRA' } },
        ],
      });

      const result = await service.clone('struct-1', 'Grade A Clone', COMPANY_ID);

      expect(result.name).toBe('Grade A Clone');
      expect(tx.salaryStructure.create).toHaveBeenCalled();
      expect(tx.salaryStructureComponent.create).toHaveBeenCalledTimes(2);
    });

    it('blocks clone when name already exists', async () => {
      const { service, mockPrisma } = createMocks();
      mockPrisma.unscopedClient.salaryStructure.findFirst.mockResolvedValueOnce({
        id: 'struct-1',
        companyId: COMPANY_ID,
        name: 'Grade A',
        components: [],
      }).mockResolvedValueOnce({ id: 'existing', name: 'Grade A Clone' });

      await expect(
        service.clone('struct-1', 'Grade A Clone', COMPANY_ID),
      ).rejects.toThrow(BadRequestError);
    });
  });

  describe('softDelete()', () => {
    it('soft-deletes structure when no employees assigned', async () => {
      const { service, mockPrisma } = createMocks();
      mockPrisma.unscopedClient.salaryStructure.findFirst.mockResolvedValue({
        id: 'struct-1',
        companyId: COMPANY_ID,
      });
      mockPrisma.unscopedClient.employeeSalary.findFirst.mockResolvedValue(null);
      mockPrisma.unscopedClient.salaryStructure.update.mockResolvedValue({
        id: 'struct-1',
        isActive: false,
      });

      const result = await service.softDelete('struct-1', COMPANY_ID);

      expect(mockPrisma.unscopedClient.salaryStructure.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'struct-1' },
          data: { isActive: false },
        }),
      );
    });

    it('blocks delete when employees are assigned', async () => {
      const { service, mockPrisma } = createMocks();
      mockPrisma.unscopedClient.salaryStructure.findFirst.mockResolvedValue({
        id: 'struct-1',
        companyId: COMPANY_ID,
      });
      mockPrisma.unscopedClient.employeeSalary.findFirst.mockResolvedValue({
        id: 'sal-1',
        effectiveTo: null,
      });

      await expect(
        service.softDelete('struct-1', COMPANY_ID),
      ).rejects.toThrow(BadRequestError);
    });
  });
});
