import { Inject, Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '@hr/prisma';
import { EventEmitter2 } from '@nestjs/event-emitter';

@Injectable()
export class CompensationCycleService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(EventEmitter2) private readonly events: EventEmitter2,
  ) {}

  async create(dto: { companyId: string; name: string; totalBudget: number }) {
    return this.prisma.unscopedClient.compensationCycle.create({
      data: { companyId: dto.companyId, name: dto.name, totalBudget: dto.totalBudget },
    });
  }

  async open(id: string) {
    const cycle = await this.prisma.unscopedClient.compensationCycle.findUnique({ where: { id } });
    if (!cycle) throw new NotFoundException('Cycle not found');
    if (cycle.status !== 'PLANNING') throw new BadRequestException('Only PLANNING cycles can be opened');
    return this.prisma.unscopedClient.compensationCycle.update({
      where: { id }, data: { status: 'OPEN', openedAt: new Date() },
    });
  }

  async lockForApproval(id: string) {
    const cycle = await this.prisma.unscopedClient.compensationCycle.findUnique({ where: { id } });
    if (!cycle) throw new NotFoundException('Cycle not found');
    if (cycle.status !== 'OPEN') throw new BadRequestException('Only OPEN cycles can be locked');

    // Budget guard: SUM(proposedAmount) must be <= totalBudget
    const agg = await this.prisma.unscopedClient.compensationAllocation.aggregate({
      where: { cycleId: id, status: 'PROPOSED' },
      _sum: { proposedAmount: true },
    });
    const totalProposed = Number(agg._sum.proposedAmount ?? 0);
    if (totalProposed > Number(cycle.totalBudget)) {
      throw new BadRequestException(`Total proposed (${totalProposed}) exceeds budget (${cycle.totalBudget})`);
    }

    return this.prisma.unscopedClient.compensationCycle.update({
      where: { id }, data: { status: 'APPROVAL', allocatedTotal: totalProposed },
    });
  }

  async approveAllocation(allocationId: string, approvedAmount: number, approverId: string, note?: string) {
    const alloc = await this.prisma.unscopedClient.compensationAllocation.findUnique({ where: { id: allocationId } });
    if (!alloc) throw new NotFoundException('Allocation not found');
    if (alloc.status !== 'PROPOSED') throw new BadRequestException('Only PROPOSED allocations can be approved');
    return this.prisma.unscopedClient.compensationAllocation.update({
      where: { id: allocationId },
      data: { status: 'APPROVED', approvedAmount, approverNote: note },
    });
  }

  async rejectAllocation(allocationId: string, approverId: string, note?: string) {
    const alloc = await this.prisma.unscopedClient.compensationAllocation.findUnique({ where: { id: allocationId } });
    if (!alloc) throw new NotFoundException('Allocation not found');
    return this.prisma.unscopedClient.compensationAllocation.update({
      where: { id: allocationId },
      data: { status: 'REJECTED', approverNote: note },
    });
  }

  async disburse(id: string, approverId: string) {
    const cycle = await this.prisma.unscopedClient.compensationCycle.findUnique({
      where: { id }, include: { allocations: true },
    });
    if (!cycle) throw new NotFoundException('Cycle not found');
    if (cycle.status !== 'APPROVAL') throw new BadRequestException('Only APPROVAL cycles can be disbursed');

    const hasPending = cycle.allocations.some(a => a.status === 'PROPOSED');
    if (hasPending) throw new BadRequestException('All allocations must be APPROVED or REJECTED');

    await this.prisma.unscopedClient.$transaction(async (tx) => {
      await tx.compensationCycle.update({
        where: { id },
        data: { status: 'DISBURSED', disbursedAt: new Date(), approvedBy: approverId },
      });
      for (const alloc of cycle.allocations) {
        if (alloc.status === 'APPROVED') {
          await tx.compensationAllocation.update({
            where: { id: alloc.id },
            data: { status: 'DISBURSED' },
          });
          this.events.emit('bonus.disbursed', { allocationId: alloc.id, employeeId: alloc.employeeId, amount: alloc.approvedAmount });
        }
      }
    });

    return this.prisma.unscopedClient.compensationCycle.findUnique({ where: { id } });
  }

  async cancel(id: string, reason: string) {
    const cycle = await this.prisma.unscopedClient.compensationCycle.findUnique({ where: { id } });
    if (!cycle) throw new NotFoundException('Cycle not found');
    if (['DISBURSED', 'CANCELLED'].includes(cycle.status)) throw new BadRequestException('Cannot cancel DISBURSED or already CANCELLED cycles');
    return this.prisma.unscopedClient.compensationCycle.update({ where: { id }, data: { status: 'CANCELLED' } });
  }

  async getById(id: string) {
    const cycle = await this.prisma.unscopedClient.compensationCycle.findUnique({
      where: { id }, include: { allocations: true },
    });
    if (!cycle) throw new NotFoundException('Cycle not found');
    return cycle;
  }
}
