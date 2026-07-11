import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WebhookEmitterListener } from '../webhook-emitter.listener';

/* eslint-disable @typescript-eslint/no-explicit-any */

describe('WebhookEmitterListener', () => {
  let listener: WebhookEmitterListener;
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      unscopedClient: {
        webhook: {
          findMany: vi.fn().mockResolvedValue([
            { id: 'wh-1', companyId: 'comp-1', events: ['employee.created'], status: 'ACTIVE' },
            { id: 'wh-2', companyId: 'comp-1', events: ['employee.created', 'leave.approved'], status: 'ACTIVE' },
          ]),
        },
        webhookDelivery: { create: vi.fn().mockResolvedValue({}) },
        $transaction: vi.fn().mockImplementation(async (arg: any) => {
          if (Array.isArray(arg)) return Promise.all(arg);
          return arg(mockPrisma.unscopedClient);
        }),
      },
    };
    listener = new WebhookEmitterListener(mockPrisma as any, { emit: vi.fn() } as any);
  });

  afterEach(() => vi.clearAllMocks());

  describe('employee.created event fan-out', () => {
    it('creates delivery rows for all matching ACTIVE endpoints', async () => {
      await listener.onEmployeeCreated({ employeeId: 'emp-1', companyId: 'comp-1' });
      expect(mockPrisma.unscopedClient.webhookDelivery.create).toHaveBeenCalledTimes(2);
    });

    it('delivery includes eventId for idempotency', async () => {
      await listener.onEmployeeCreated({ employeeId: 'emp-1', companyId: 'comp-1' });
      const call = mockPrisma.unscopedClient.webhookDelivery.create.mock.calls[0][0];
      expect(call.data.eventId).toBe('emp-1');
      expect(call.data.eventType).toBe('employee.created');
      expect(call.data.status).toBe('PENDING');
    });
  });

  describe('employee.terminated event fan-out', () => {
    it('only fans out to matching subscribers', async () => {
      mockPrisma.unscopedClient.webhook.findMany.mockResolvedValue([
        { id: 'wh-3', companyId: 'comp-1', events: ['employee.terminated'], status: 'ACTIVE' },
      ]);
      await listener.onEmployeeTerminated({ employeeId: 'emp-1', exitRequestId: 'ex-1', companyId: 'comp-1' });
      expect(mockPrisma.unscopedClient.webhookDelivery.create).toHaveBeenCalledTimes(1);
    });
  });

  describe('other event types', () => {
    it('payroll.disbursed uses cycleId as eventId', async () => {
      await listener.onPayrollDisbursed({ cycleId: 'pc-1', companyId: 'comp-1' });
      const call = mockPrisma.unscopedClient.webhookDelivery.create.mock.calls[0][0];
      expect(call.data.eventId).toBe('pc-1');
    });

    it('leave.approved uses leaveRequestId as eventId', async () => {
      await listener.onLeaveApproved({ leaveRequestId: 'lr-1', companyId: 'comp-1' });
      const call = mockPrisma.unscopedClient.webhookDelivery.create.mock.calls[0][0];
      expect(call.data.eventId).toBe('lr-1');
    });

    it('review.completed uses reviewId as eventId', async () => {
      await listener.onReviewCompleted({ reviewId: 'rev-1', companyId: 'comp-1' });
      const call = mockPrisma.unscopedClient.webhookDelivery.create.mock.calls[0][0];
      expect(call.data.eventId).toBe('rev-1');
    });
  });

  describe('cross-tenant isolation', () => {
    it('queries webhooks only for the event companyId', async () => {
      mockPrisma.unscopedClient.webhook.findMany.mockResolvedValue([]);
      await listener.onEmployeeCreated({ employeeId: 'emp-1', companyId: 'comp-1' });
      expect(mockPrisma.unscopedClient.webhook.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ companyId: 'comp-1', status: 'ACTIVE' }) }),
      );
    });
  });
});
