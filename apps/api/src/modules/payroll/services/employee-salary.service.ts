import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@hr/prisma';
import { BadRequestError, NotFoundError } from '@hr/shared';
import { AuditService } from '../../audit/audit.service';
import type { AssignEmployeeSalaryDto } from '../dto/assign-employee-salary.dto';
import type { RequestContext } from '../../../common/context/request-context';

@Injectable()
export class EmployeeSalaryService {
  private readonly logger = new Logger(EmployeeSalaryService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async assign(dto: AssignEmployeeSalaryDto, actor: RequestContext) {
    const { employeeId, structureId, ctc, effectiveFrom, notes } = dto;

    // Verify employee belongs to same company
    const employee = await this.prisma.unscopedClient.employee.findFirst({
      where: { id: employeeId, companyId: actor.companyId },
    });
    if (!employee) throw new NotFoundError('Employee not found in your company');

    // Verify structure is active and belongs to same company
    const structure = await this.prisma.unscopedClient.salaryStructure.findFirst({
      where: { id: structureId, companyId: actor.companyId, isActive: true },
    });
    if (!structure) throw new NotFoundError('Salary structure not found or inactive');

    return this.prisma.unscopedClient.$transaction(async (tx) => {
      // Close previous active record
      await tx.employeeSalary.updateMany({
        where: {
          employeeId,
          effectiveTo: null,
          status: { in: ['DRAFT', 'APPROVED'] },
        },
        data: {
          effectiveTo: new Date(new Date(effectiveFrom).getTime() - 86400000),
        },
      });

      const salary = await tx.employeeSalary.create({
        data: {
          employeeId,
          structureId,
          companyId: actor.companyId,
          ctc,
          effectiveFrom,
          effectiveTo: null,
          status: 'DRAFT',
          notes,
          revisedById: actor.userId,
        },
      });

      // Audit
      await this.audit.record({
        actor,
        companyId: actor.companyId,
        entityType: 'employee_salary',
        entityId: salary.id,
        action: 'SALARY_ASSIGNED',
        newValue: { employeeId, ctc, structureId, effectiveFrom: effectiveFrom.toISOString() } as any,
      });

      return salary;
    });
  }

  async revise(employeeId: string, dto: AssignEmployeeSalaryDto, actor: RequestContext) {
    const result = await this.assign({ ...dto, employeeId }, actor);

    await this.audit.record({
      actor,
      companyId: actor.companyId,
      entityType: 'employee_salary',
      entityId: result.id,
      action: 'SALARY_REVISION_CREATED',
      newValue: { employeeId, ctc: dto.ctc, effectiveFrom: dto.effectiveFrom.toISOString() } as any,
    });

    return result;
  }

  async approve(salaryId: string, actor: RequestContext) {
    const salary = await this.prisma.unscopedClient.employeeSalary.findFirst({
      where: { id: salaryId, companyId: actor.companyId },
    });
    if (!salary) throw new NotFoundError('Salary record not found');
    if (salary.status !== 'DRAFT') throw new BadRequestError('Only draft salary records can be approved');

    const updated = await this.prisma.unscopedClient.employeeSalary.update({
      where: { id: salaryId },
      data: {
        status: 'APPROVED',
        approvedById: actor.userId,
        approvedAt: new Date(),
      },
    });

    await this.audit.record({
      actor,
      companyId: actor.companyId,
      entityType: 'employee_salary',
      entityId: salaryId,
      action: 'SALARY_REVISION_APPROVED',
      newValue: {
        employeeId: salary.employeeId,
        ctc: Number(salary.ctc),
        effectiveFrom: salary.effectiveFrom.toISOString(),
        structureId: salary.structureId,
      } as any,
    });

    return updated;
  }

  async getCurrentSalary(employeeId: string, asOfDate?: Date, companyId?: string) {
    const date = asOfDate ?? new Date();
    const where: any = {
      employeeId,
      effectiveFrom: { lte: date },
      status: 'APPROVED',
    };
    // Only filter by company if provided (for employee-facing queries)
    if (companyId) where.companyId = companyId;

    // effectiveTo IS NULL OR effectiveTo >= asOfDate
    const salary = await this.prisma.unscopedClient.employeeSalary.findFirst({
      where: {
        ...where,
        OR: [
          { effectiveTo: null },
          { effectiveTo: { gte: date } },
        ],
      },
      include: {
        structure: {
          include: {
            components: {
              include: { component: true },
              orderBy: { sortOrder: 'asc' },
            },
          },
        },
      },
    });

    if (!salary) throw new NotFoundError('No approved salary found for the given date');
    return salary;
  }

  async getSalaryHistory(employeeId: string, companyId: string) {
    const employee = await this.prisma.unscopedClient.employee.findFirst({
      where: { id: employeeId, companyId },
    });
    if (!employee) throw new NotFoundError('Employee not found in your company');

    return this.prisma.unscopedClient.employeeSalary.findMany({
      where: { employeeId, companyId },
      orderBy: { effectiveFrom: 'desc' },
      include: { structure: true },
    });
  }
}
