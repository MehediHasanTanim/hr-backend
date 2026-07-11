import { Injectable, OnModuleInit } from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '@hr/prisma';
import { QUEUE_NAMES } from '../../../common/queues.constants';

const WEBHOOK_EVENT_TYPES = ['employee.created', 'employee.terminated', 'payroll.disbursed', 'leave.approved', 'review.completed'];

@Injectable()
export class WebhookEmitterListener implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
  ) {}

  onModuleInit() {
    // This listener is activated via @OnEvent decorators below
  }

  @OnEvent('employee.created')
  async onEmployeeCreated(payload: { employeeId: string; companyId: string }) {
    await this.fanOut('employee.created', payload.employeeId, payload.companyId, payload);
  }

  @OnEvent('employee.terminated')
  async onEmployeeTerminated(payload: { employeeId: string; exitRequestId: string; companyId: string }) {
    await this.fanOut('employee.terminated', payload.employeeId, payload.companyId, payload);
  }

  @OnEvent('payroll.disbursed')
  async onPayrollDisbursed(payload: { cycleId: string; companyId: string }) {
    await this.fanOut('payroll.disbursed', payload.cycleId, payload.companyId, payload);
  }

  @OnEvent('leave.approved')
  async onLeaveApproved(payload: { leaveRequestId: string; companyId: string }) {
    await this.fanOut('leave.approved', payload.leaveRequestId, payload.companyId, payload);
  }

  @OnEvent('review.completed')
  async onReviewCompleted(payload: { reviewId: string; companyId: string }) {
    await this.fanOut('review.completed', payload.reviewId, payload.companyId, payload);
  }

  private async fanOut(eventType: string, eventId: string, companyId: string, payload: Record<string, unknown>) {
    const endpoints = await this.prisma.unscopedClient.webhook.findMany({
      where: { companyId, status: 'ACTIVE', events: { has: eventType } },
    });

    for (const endpoint of endpoints) {
      await this.prisma.unscopedClient.$transaction(async (tx) => {
        const delivery = await tx.webhookDelivery.create({
          data: {
            webhookId: endpoint.id, event: eventType, eventType,
            eventId, payload: payload as any,
            status: 'PENDING', attemptCount: 0,
          },
        });
        // Enqueue BullMQ job — stubbed
      });
    }
  }
}
