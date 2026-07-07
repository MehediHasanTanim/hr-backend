import { Inject, Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '@hr/prisma';
import { EventEmitter2 } from '@nestjs/event-emitter';

@Injectable()
export class GoalService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService, @Inject(EventEmitter2) private readonly events: EventEmitter2) {}

  async createGoal(dto: { employeeId: string; title: string; parentGoalId?: string; cycleId?: string; description?: string; goalType?: string; targetValue?: number; unit?: string; dueDate?: string }) {
    if (dto.parentGoalId) {
      const parent = await this.prisma.unscopedClient.performanceGoal.findUnique({ where: { id: dto.parentGoalId } });
      if (!parent) throw new NotFoundException('Parent goal not found');
      // Cyclic check: walk up max 5 levels
      let current = parent;
      for (let i = 0; i < 5; i++) {
        if (current.parentGoalId === dto.parentGoalId) throw new BadRequestException('Cyclic goal reference');
        if (!current.parentGoalId) break;
        current = await this.prisma.unscopedClient.performanceGoal.findUnique({ where: { id: current.parentGoalId } }) as any;
        if (!current) break;
      }
    }
    return this.prisma.unscopedClient.performanceGoal.create({ data: { ...dto, dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined } });
  }

  async updateGoal(id: string, dto: { title?: string; status?: string; currentValue?: number; description?: string }) {
    const g = await this.prisma.unscopedClient.performanceGoal.findUnique({ where: { id } });
    if (!g) throw new NotFoundException('Goal not found');
    return this.prisma.unscopedClient.performanceGoal.update({ where: { id }, data: dto });
  }

  async postCheckIn(goalId: string, dto: { postedBy: string; progressNote: string; valueAtCheckIn?: number }, statusAtCheckIn?: string) {
    const [checkIn] = await this.prisma.unscopedClient.$transaction([
      this.prisma.unscopedClient.goalCheckIn.create({ data: { goalId, ...dto, statusAtCheckIn: (statusAtCheckIn ?? 'ON_TRACK') as any } }),
      this.prisma.unscopedClient.performanceGoal.update({ where: { id: goalId }, data: { currentValue: dto.valueAtCheckIn } }),
    ]);
    this.events.emit('goal.checked_in', { goalId, employeeId: checkIn.postedBy });
    return checkIn;
  }

  async getOkrTree(employeeId: string, cycleId?: string) {
    return this.prisma.unscopedClient.performanceGoal.findMany({
      where: { employeeId, ...(cycleId ? { cycleId } : {}) },
      include: { childGoals: true, checkIns: { orderBy: { createdAt: 'desc' }, take: 5 } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findByEmployee(employeeId: string) { return this.getOkrTree(employeeId); }
  async findById(id: string) { const g = await this.prisma.unscopedClient.performanceGoal.findUnique({ where: { id }, include: { childGoals: true, checkIns: true } }); if (!g) throw new NotFoundException('Goal not found'); return g; }
}
