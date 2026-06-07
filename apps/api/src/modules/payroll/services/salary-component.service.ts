import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@hr/prisma';
import { BadRequestError, NotFoundError } from '@hr/shared';
import type { CreateSalaryComponentDto, UpdateSalaryComponentDto } from '../dto/create-salary-component.dto';
import { validateFormula } from '../utils/formula-validator';

@Injectable()
export class SalaryComponentService {
  private readonly logger = new Logger(SalaryComponentService.name);

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async create(dto: CreateSalaryComponentDto, companyId: string) {
    // Validate code uniqueness (case-insensitive)
    const existing = await this.prisma.unscopedClient.salaryComponent.findFirst({
      where: {
        companyId,
        code: { equals: dto.code, mode: 'insensitive' },
      },
    });
    if (existing) {
      throw new BadRequestError(`Salary component code "${dto.code}" already exists in this company`);
    }

    // Validate formula rules
    if (dto.calculationType === 'fixed') {
      if (dto.formula) {
        throw new BadRequestError('Fixed components must not have a formula');
      }
    } else if (dto.calculationType === 'formula') {
      if (!dto.formula) {
        throw new BadRequestError('Formula components require a formula expression');
      }
      // Get existing component codes for validation
      const allComponents = await this.prisma.unscopedClient.salaryComponent.findMany({
        where: { companyId, isActive: true },
        select: { code: true },
      });
      const knownCodes = allComponents.map((c) => c.code);
      validateFormula(dto.formula, knownCodes);
    } else if (dto.calculationType === 'percentage_of_base') {
      if (dto.formula) {
        throw new BadRequestError('Percentage-of-base components must not have a formula');
      }
    }

    return this.prisma.unscopedClient.salaryComponent.create({
      data: {
        companyId,
        name: dto.name,
        code: dto.code.toUpperCase(),
        type: dto.type as any,
        calcMethod: dto.calculationType === 'fixed'
          ? 'FIXED'
          : dto.calculationType === 'formula'
            ? 'FORMULA'
            : 'PERCENT_OF_BASIC' as any,
        defaultValue: dto.defaultValue ?? 0,
        formula: dto.formula,
        isTaxable: dto.isTaxable ?? true,
      },
    });
  }

  async update(id: string, dto: UpdateSalaryComponentDto, companyId: string) {
    const component = await this.findOneOrFail(id, companyId);

    // Re-validate formula if changed
    if (dto.formula !== undefined || dto.calculationType) {
      const calcType = dto.calculationType ?? (
        component.calcMethod === 'FIXED' ? 'fixed'
          : component.calcMethod === 'FORMULA' ? 'formula'
            : 'percentage_of_base'
      );
      if (calcType === 'formula') {
        const formula = dto.formula ?? component.formula;
        if (!formula) throw new BadRequestError('Formula is required');
        const allComponents = await this.prisma.unscopedClient.salaryComponent.findMany({
          where: { companyId, isActive: true },
          select: { code: true },
        });
        const knownCodes = allComponents.map((c) => c.code);
        validateFormula(formula, knownCodes);
      }
    }

    return this.prisma.unscopedClient.salaryComponent.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.code !== undefined ? { code: dto.code.toUpperCase() } : {}),
        ...(dto.type !== undefined ? { type: dto.type as any } : {}),
        ...(dto.calculationType !== undefined
          ? {
              calcMethod: dto.calculationType === 'fixed'
                ? 'FIXED'
                : dto.calculationType === 'formula'
                  ? 'FORMULA'
                  : 'PERCENT_OF_BASIC' as any,
            }
          : {}),
        ...(dto.formula !== undefined ? { formula: dto.formula } : {}),
        ...(dto.defaultValue !== undefined ? { defaultValue: dto.defaultValue } : {}),
        ...(dto.isTaxable !== undefined ? { isTaxable: dto.isTaxable } : {}),
      },
    });
  }

  async softDelete(id: string, companyId: string) {
    await this.findOneOrFail(id, companyId);

    // Block if used in any active SalaryStructure
    const inUse = await this.prisma.unscopedClient.salaryStructureComponent.findFirst({
      where: {
        componentId: id,
        structure: { isActive: true, companyId },
      },
    });
    if (inUse) {
      throw new BadRequestError('Cannot delete: component is used in an active salary structure');
    }

    return this.prisma.unscopedClient.salaryComponent.update({
      where: { id },
      data: { isActive: false },
    });
  }

  async findAll(companyId: string) {
    return this.prisma.unscopedClient.salaryComponent.findMany({
      where: { companyId, isActive: true },
      orderBy: [{ type: 'asc' }, { name: 'asc' }],
    });
  }

  async findOneOrFail(id: string, companyId: string) {
    const component = await this.prisma.unscopedClient.salaryComponent.findFirst({
      where: { id, companyId },
    });
    if (!component) throw new NotFoundError('Salary component not found');
    return component;
  }
}
