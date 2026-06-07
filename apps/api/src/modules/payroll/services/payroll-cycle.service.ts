import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '@hr/prisma';
import { BadRequestError, ConflictError, NotFoundError } from '@hr/shared';
import { AuditService } from '../../audit/audit.service';
import { PAYROLL_RUN_QUEUE, PAYSLIP_GEN_QUEUE } from '../constants/queues';
import type { CreatePayrollCycleDto } from '../dto/create-payroll-cycle.dto';
import type { ReverseCycleDto } from '../dto/reverse-cycle.dto';
import type { RequestContext } from '../../../common/context/request-context';

@Injectable()
export class PayrollCycleService {
  private readonly logger = new Logger(PayrollCycleService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
    @InjectQueue(PAYROLL_RUN_QUEUE) private readonly payrollRunQueue: Queue,
    @InjectQueue(PAYSLIP_GEN_QUEUE) private readonly payslipGenQueue: Queue,
  ) {}

  async createCycle(dto: CreatePayrollCycleDto, actor: RequestContext) {
    const { month, year } = dto;

    // Validate month/year range
    const currentYear = new Date().getUTCFullYear();
    if (Math.abs(year - currentYear) > 1) {
      throw new BadRequestError('Year must be within ±1 of the current year');
    }

    // Enforce uniqueness
    const existing = await this.prisma.unscopedClient.payrollCycle.findUnique({
      where: {
        companyId_month_year: {
          companyId: actor.companyId,
          month,
          year,
        },
      },
    });
    if (existing) {
      throw new ConflictError('A payroll cycle already exists for this month/year');
    }

    const cycle = await this.prisma.unscopedClient.payrollCycle.create({
      data: {
        companyId: actor.companyId,
        month,
        year,
        status: 'DRAFT',
        createdById: actor.userId,
      },
    });

    await this.audit.record({
      actor,
      companyId: actor.companyId,
      entityType: 'payroll_cycle',
      entityId: cycle.id,
      action: 'PAYROLL_CYCLE_CREATED',
      newValue: { month, year, companyId: actor.companyId } as any,
    });

    return cycle;
  }

  async runCycle(cycleId: string, actor: RequestContext) {
    const cycle = await this.prisma.unscopedClient.payrollCycle.findFirst({
      where: { id: cycleId, companyId: actor.companyId },
    });
    if (!cycle) throw new NotFoundError('Payroll cycle not found');
    if (cycle.status !== 'DRAFT') throw new BadRequestError('Only draft cycles can be run');

    // Status fence to prevent double-runs
    await this.prisma.unscopedClient.payrollCycle.update({
      where: { id: cycleId },
      data: { status: 'PROCESSING', runAt: new Date() },
    });

    // Enqueue job
    await this.payrollRunQueue.add('payroll_run', {
      cycleId,
      companyId: actor.companyId,
      month: cycle.month,
      year: cycle.year,
      triggeredByUserId: actor.userId,
    });

    await this.audit.record({
      actor,
      companyId: actor.companyId,
      entityType: 'payroll_cycle',
      entityId: cycleId,
      action: 'PAYROLL_CYCLE_RUN_TRIGGERED',
      newValue: { month: cycle.month, year: cycle.year, triggeredByUserId: actor.userId } as any,
    });

    return { id: cycleId, status: 'PROCESSING' };
  }

  async approveCycle(cycleId: string, actor: RequestContext) {
    const cycle = await this.prisma.unscopedClient.payrollCycle.findFirst({
      where: { id: cycleId, companyId: actor.companyId },
    });
    if (!cycle) throw new NotFoundError('Payroll cycle not found');
    if (cycle.status !== 'COMPUTED') throw new BadRequestError('Only computed cycles can be approved');

    // Assert all entries are computed (no held entries blocking)
    const heldCount = await this.prisma.unscopedClient.payrollEntry.count({
      where: { cycleId, status: 'HELD' },
    });
    if (heldCount > 0) {
      throw new BadRequestError(
        `${heldCount} employee(s) have held entries. Review before approving.`,
      );
    }

    return this.prisma.unscopedClient.$transaction(async (tx) => {
      await tx.payrollCycle.update({
        where: { id: cycleId },
        data: {
          status: 'APPROVED',
          approvedAt: new Date(),
          approvedById: actor.userId,
        },
      });

      await tx.payrollEntry.updateMany({
        where: { cycleId, status: 'COMPUTED' },
        data: { status: 'APPROVED' },
      });

      await this.audit.record({
        actor,
        companyId: actor.companyId,
        entityType: 'payroll_cycle',
        entityId: cycleId,
        action: 'PAYROLL_CYCLE_APPROVED',
        newValue: {
          month: cycle.month,
          year: cycle.year,
          totalNet: Number(cycle.totalNet),
          employeeCount: cycle.employeeCount,
          approvedById: actor.userId,
        } as any,
      });

      return { id: cycleId, status: 'APPROVED' };
    });
  }

  async disburseCycle(cycleId: string, actor: RequestContext) {
    const cycle = await this.prisma.unscopedClient.payrollCycle.findFirst({
      where: { id: cycleId, companyId: actor.companyId },
    });
    if (!cycle) throw new NotFoundError('Payroll cycle not found');
    if (cycle.status !== 'APPROVED') throw new BadRequestError('Only approved cycles can be disbursed');

    let entries: any[];
    await this.prisma.unscopedClient.$transaction(async (tx) => {
      await tx.payrollCycle.update({
        where: { id: cycleId },
        data: {
          status: 'DISBURSED',
          disbursedAt: new Date(),
          disbursedById: actor.userId,
        },
      });

      await tx.payrollEntry.updateMany({
        where: { cycleId, status: 'APPROVED' },
        data: { status: 'DISBURSED' },
      });

      await this.audit.record({
        actor,
        companyId: actor.companyId,
        entityType: 'payroll_cycle',
        entityId: cycleId,
        action: 'PAYROLL_CYCLE_DISBURSED',
        newValue: {
          month: cycle.month,
          year: cycle.year,
          totalNet: Number(cycle.totalNet),
          employeeCount: cycle.employeeCount,
          disbursedById: actor.userId,
        } as any,
      });
    });

    // Post-commit: enqueue payslip gen jobs
    entries = await this.prisma.unscopedClient.payrollEntry.findMany({
      where: { cycleId, status: 'DISBURSED' },
      select: { id: true, employeeId: true },
    });

    for (const entry of entries) {
      await this.payslipGenQueue.add('payslip_gen', {
        entryId: entry.id,
        cycleId,
        employeeId: entry.employeeId,
      });
    }

    return { id: cycleId, status: 'DISBURSED' };
  }

  async reverseCycle(cycleId: string, actor: RequestContext, dto: ReverseCycleDto) {
    const cycle = await this.prisma.unscopedClient.payrollCycle.findFirst({
      where: { id: cycleId, companyId: actor.companyId },
    });
    if (!cycle) throw new NotFoundError('Payroll cycle not found');
    if (!['APPROVED', 'DISBURSED'].includes(cycle.status)) {
      throw new BadRequestError('Only approved or disbursed cycles can be reversed');
    }

    return this.prisma.unscopedClient.$transaction(async (tx) => {
      await tx.payrollCycle.update({
        where: { id: cycleId },
        data: {
          status: 'REVERSED',
          reversedAt: new Date(),
          reversedById: actor.userId,
          reversalReason: dto.reversalReason,
        },
      });

      await tx.payrollEntry.updateMany({
        where: { cycleId },
        data: { status: 'REVERSED' },
      });

      await this.audit.record({
        actor,
        companyId: actor.companyId,
        entityType: 'payroll_cycle',
        entityId: cycleId,
        action: 'PAYROLL_CYCLE_REVERSED',
        newValue: {
          month: cycle.month,
          year: cycle.year,
          reversedById: actor.userId,
          reversalReason: dto.reversalReason,
        } as any,
      });

      return { id: cycleId, status: 'REVERSED' };
    });
  }

  async getCycle(cycleId: string, companyId: string) {
    const cycle = await this.prisma.unscopedClient.payrollCycle.findFirst({
      where: { id: cycleId, companyId },
      include: {
        entries: {
          include: { components: true, employee: { select: { id: true, workEmail: true } } },
        },
      },
    });
    if (!cycle) throw new NotFoundError('Payroll cycle not found');

    const entrySummary = {
      total: cycle.entries.length,
      computed: cycle.entries.filter((e) => e.status === 'COMPUTED').length,
      held: cycle.entries.filter((e) => e.status === 'HELD').length,
      approved: cycle.entries.filter((e) => e.status === 'APPROVED').length,
      disbursed: cycle.entries.filter((e) => e.status === 'DISBURSED').length,
    };

    return { ...cycle, entrySummary };
  }

  async listCycles(companyId: string, filters: { year?: number; status?: string; page?: number; pageSize?: number }) {
    const { year, status, page = 1, pageSize = 20 } = filters;

    const where: any = { companyId };
    if (year) where.year = year;
    if (status) where.status = status;

    const [items, total] = await this.prisma.unscopedClient.$transaction([
      this.prisma.unscopedClient.payrollCycle.findMany({
        where,
        orderBy: [{ year: 'desc' }, { month: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.unscopedClient.payrollCycle.count({ where }),
    ]);

    return { items, total, page, pageSize };
  }
}
