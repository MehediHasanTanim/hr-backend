import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '@hr/prisma';

@Injectable()
export class FeedbackService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async giveFeedback(dto: { givenBy: string; receivedBy: string; message: string; visibility?: string; category?: string; relatedGoalId?: string }) {
    return this.prisma.unscopedClient.feedback.create({ data: dto });
  }

  async listReceived(employeeId: string, page = 1, limit = 20) {
    return this.prisma.unscopedClient.feedback.findMany({
      where: { receivedBy: employeeId },
      orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: limit,
    });
  }

  async listGiven(employeeId: string, page = 1, limit = 20) {
    return this.prisma.unscopedClient.feedback.findMany({
      where: { givenBy: employeeId },
      orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: limit,
    });
  }
}
