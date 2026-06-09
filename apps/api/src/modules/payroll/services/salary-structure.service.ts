import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@hr/prisma';
import { BadRequestError, NotFoundError } from '@hr/shared';
import type { CreateSalaryStructureDto, UpdateSalaryStructureDto } from '../dto/create-salary-structure.dto';
import { validateFormula } from '../utils/formula-validator';

@Injectable()
export class SalaryStructureService {
  private readonly logger = new Logger(SalaryStructureService.name);

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async create(dto: CreateSalaryStructureDto, companyId: string) {
    // Validate all componentIds belong to the same company and are active
    const componentIds = dto.components.map((c) => c.componentId);
    const components = await this.prisma.unscopedClient.salaryComponent.findMany({
      where: { id: { in: componentIds }, companyId, isActive: true },
    });

    if (components.length !== componentIds.length) {
      throw new BadRequestError('One or more components are invalid, inactive, or belong to another company');
    }

    // Validate no duplicate component IDs
    const uniqueIds = new Set(componentIds);
    if (uniqueIds.size !== componentIds.length) {
      throw new BadRequestError('Duplicate component IDs in the list');
    }

    // Build lookup
    const compMap = new Map(components.map((c) => [c.id, c]));

    // Validate formulas if any
    for (const sc of dto.components) {
      const comp = compMap.get(sc.componentId)!;
      if (comp.calcMethod === 'FORMULA' && comp.formula) {
        const allCodes = components.map((c) => c.code);
        validateFormula(comp.formula, allCodes);
      }
    }

    // Sort by sortOrder
    const sorted = [...dto.components].sort((a, b) => a.sortOrder - b.sortOrder);

    return this.prisma.unscopedClient.$transaction(async (tx) => {
      const structure = await tx.salaryStructure.create({
        data: {
          companyId,
          name: dto.name,
          description: dto.description ?? undefined,
        },
      });

      for (const sc of sorted) {
        await tx.salaryStructureComponent.create({
          data: {
            structureId: structure.id,
            componentId: sc.componentId,
            sortOrder: sc.sortOrder,
            defaultValue: sc.defaultValue,
          },
        });
      }

      return tx.salaryStructure.findUnique({
        where: { id: structure.id },
        include: {
          components: {
            include: { component: true },
            orderBy: { sortOrder: 'asc' },
          },
        },
      });
    });
  }

  async update(id: string, dto: UpdateSalaryStructureDto, companyId: string) {
    await this.findOneOrFail(id, companyId);

    // Block if any active PayrollCycle uses this structure
    const activeCycle = await this.prisma.unscopedClient.payrollCycle.findFirst({
      where: {
        companyId,
        status: { not: 'REVERSED' },
        entries: { some: { structureId: id } },
      },
    });
    if (activeCycle) {
      throw new BadRequestError('Cannot modify structure: an active payroll cycle references it');
    }

    return this.prisma.unscopedClient.$transaction(async (tx) => {
      if (dto.name !== undefined || dto.description !== undefined) {
        await tx.salaryStructure.update({
          where: { id },
          data: {
            ...(dto.name !== undefined ? { name: dto.name } : {}),
            ...(dto.description !== undefined ? { description: dto.description } : {}),
          },
        });
      }

      // Replace components if provided
      if (dto.components) {
        await tx.salaryStructureComponent.deleteMany({
          where: { structureId: id },
        });

        for (const sc of dto.components) {
          await tx.salaryStructureComponent.create({
            data: {
              structureId: id,
              componentId: sc.componentId,
              sortOrder: sc.sortOrder,
              defaultValue: sc.defaultValue,
            },
          });
        }
      }

      return tx.salaryStructure.findUnique({
        where: { id },
        include: {
          components: {
            include: { component: true },
            orderBy: { sortOrder: 'asc' },
          },
        },
      });
    });
  }

  async softDelete(id: string, companyId: string) {
    await this.findOneOrFail(id, companyId);

    // Block if any employee currently has this structure assigned
    const assigned = await this.prisma.unscopedClient.employeeSalary.findFirst({
      where: { structureId: id, effectiveTo: null },
    });
    if (assigned) {
      throw new BadRequestError('Cannot delete: employees are currently assigned to this structure');
    }

    return this.prisma.unscopedClient.salaryStructure.update({
      where: { id },
      data: { isActive: false },
    });
  }

  async findAll(companyId: string) {
    return this.prisma.unscopedClient.salaryStructure.findMany({
      where: { companyId, isActive: true },
      include: {
        components: {
          include: { component: true },
          orderBy: { sortOrder: 'asc' },
        },
      },
      orderBy: { name: 'asc' },
    });
  }

  async findOneOrFail(id: string, companyId: string) {
    const structure = await this.prisma.unscopedClient.salaryStructure.findFirst({
      where: { id, companyId },
      include: {
        components: {
          include: { component: true },
          orderBy: { sortOrder: 'asc' },
        },
      },
    });
    if (!structure) throw new NotFoundError('Salary structure not found');
    return structure;
  }

  async clone(id: string, newName: string, companyId: string) {
    const source = await this.findOneOrFail(id, companyId);

    // Validate unique name
    const existing = await this.prisma.unscopedClient.salaryStructure.findFirst({
      where: { companyId, name: newName, isActive: true },
    });
    if (existing) {
      throw new BadRequestError(`A salary structure named "${newName}" already exists`);
    }

    return this.prisma.unscopedClient.$transaction(async (tx) => {
      const clone = await tx.salaryStructure.create({
        data: {
          companyId,
          name: newName,
          description: source.description ? `Clone of "${source.name}": ${source.description}` : `Clone of "${source.name}"`,
        },
      });

      for (const sc of source.components) {
        await tx.salaryStructureComponent.create({
          data: {
            structureId: clone.id,
            componentId: sc.componentId,
            sortOrder: sc.sortOrder,
            defaultValue: Number(sc.defaultValue),
          },
        });
      }

      return tx.salaryStructure.findUnique({
        where: { id: clone.id },
        include: {
          components: {
            include: { component: true },
            orderBy: { sortOrder: 'asc' },
          },
        },
      });
    });
  }
}
