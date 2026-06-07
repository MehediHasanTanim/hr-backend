import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@hr/prisma';
import { NotFoundError, ForbiddenError } from '@hr/shared';
import type { RequestContext } from '../../../common/context/request-context';

@Injectable()
export class PayslipService {
  private readonly logger = new Logger(PayslipService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {}

  async listPayslips(
    actor: RequestContext,
    filters: { employeeId?: string; page?: number; pageSize?: number },
  ) {
    const { employeeId, page = 1, pageSize = 20 } = filters;
    const isHrAdmin = actor.roles.includes('HR_ADMIN') || actor.roles.includes('SUPER_ADMIN');

    const where: any = {
      companyId: actor.companyId,
      status: 'PUBLISHED',
    };

    if (isHrAdmin && employeeId) {
      where.employeeId = employeeId;
    } else if (!isHrAdmin) {
      // EMPLOYEE role: own payslips only
      const emp = await this.prisma.unscopedClient.employee.findFirst({
        where: { userId: actor.userId, companyId: actor.companyId },
        select: { id: true },
      });
      if (emp) where.employeeId = emp.id;
    }

    const [items, total] = await this.prisma.unscopedClient.$transaction([
      this.prisma.unscopedClient.payslip.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          cycle: { select: { month: true, year: true } },
          entry: { select: { netPayable: true } },
        },
      }),
      this.prisma.unscopedClient.payslip.count({ where }),
    ]);

    // Generate signed URLs lazily — only if list <= 20
    const resultItems = items.map((p) => ({
      id: p.id,
      cycleId: p.cycleId,
      month: p.cycle?.month,
      year: p.cycle?.year,
      netPayable: p.entry?.netPayable ? Number(p.entry.netPayable) : 0,
      generatedAt: p.generatedAt,
      downloadUrl: null as string | null, // SDK call placeholder
    }));

    return { items: resultItems, total, page, pageSize };
  }

  async getPayslip(id: string, actor: RequestContext) {
    const payslip = await this.prisma.unscopedClient.payslip.findFirst({
      where: { id, companyId: actor.companyId },
      include: {
        entry: {
          include: {
            components: true,
            cycle: { select: { month: true, year: true } },
          },
        },
        employee: { select: { id: true, userId: true } },
      },
    });
    if (!payslip) throw new NotFoundError('Payslip not found');

    // Ownership check for non-admin
    const isAdmin = actor.roles.includes('HR_ADMIN') || actor.roles.includes('SUPER_ADMIN');
    if (!isAdmin && payslip.employee.userId !== actor.userId) {
      throw new ForbiddenError('Access denied');
    }

    return {
      ...payslip,
      downloadUrl: null as string | null,
    };
  }
}
