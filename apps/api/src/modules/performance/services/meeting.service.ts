import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@hr/prisma';

@Injectable()
export class MeetingService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async createMeeting(dto: { managerId: string; employeeId: string; meetingDate: string; notes?: string; actionItems?: { description: string; ownerId: string; dueDate?: string }[] }) {
    const meeting = await this.prisma.unscopedClient.oneOnOneMeeting.create({
      data: { managerId: dto.managerId, employeeId: dto.employeeId, meetingDate: new Date(dto.meetingDate), notes: dto.notes },
    });
    if (dto.actionItems?.length) {
      for (const ai of dto.actionItems) {
        await this.prisma.unscopedClient.meetingActionItem.create({
          data: { meetingId: meeting.id, description: ai.description, ownerId: ai.ownerId, dueDate: ai.dueDate ? new Date(ai.dueDate) : null },
        });
      }
    }
    return meeting;
  }

  async addActionItem(meetingId: string, dto: { description: string; ownerId: string; dueDate?: string }) {
    return this.prisma.unscopedClient.meetingActionItem.create({ data: { meetingId, ...dto, dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined } });
  }

  async completeActionItem(actionItemId: string) {
    return this.prisma.unscopedClient.meetingActionItem.update({ where: { id: actionItemId }, data: { status: 'completed', completedAt: new Date() } });
  }

  async findById(id: string) { const m = await this.prisma.unscopedClient.oneOnOneMeeting.findUnique({ where: { id }, include: { actionItems: true } }); if (!m) throw new NotFoundException('Meeting not found'); return m; }
}
