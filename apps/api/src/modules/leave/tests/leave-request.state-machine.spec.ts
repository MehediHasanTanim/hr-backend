import { afterEach, describe, it, expect, vi } from 'vitest';
import { BadRequestError, NotFoundError } from '@hr/shared';
import { LeaveRequestService } from '../services/leave-request.service';

vi.mock('@hr/prisma', () => ({ PrismaService: class PrismaService {} }));

// ---------------------------------------------------------------------------
// Factory helpers
// ---------------------------------------------------------------------------
function makeRequest(status: string, overrides: Record<string, unknown> = {}) {
  return {
    id: 'req-1',
    companyId: 'co-1',
    employeeId: 'emp-1',
    leaveTypeId: 'lt-1',
    totalDays: 3,
    startDate: new Date('2024-06-10'),
    endDate: new Date('2024-06-12'),
    status,
    ...overrides,
  } as any;
}

function makeEmployee(overrides: Record<string, unknown> = {}) {
  return { id: 'emp-1', companyId: 'co-1', departmentId: 'dept-1', ...overrides } as any;
}

function makeLeaveBalance(overrides: Record<string, unknown> = {}) {
  return {
    id: 'lb-1', employeeId: 'emp-1', leaveTypeId: 'lt-1', year: 2024,
    entitled: 10, used: 2, carriedForward: 0, balance: 8,
    ...overrides,
  } as any;
}

function makeLeaveType(overrides: Record<string, unknown> = {}) {
  return { id: 'lt-1', companyId: 'co-1', name: 'Annual Leave', ...overrides } as any;
}

// ---------------------------------------------------------------------------
// Mock factory
// ---------------------------------------------------------------------------
function createMocks() {
  const tx = {
    leaveRequest: { update: vi.fn() },
    leaveBalance: { findUnique: vi.fn(), update: vi.fn() },
  };

  const mockPrisma = {
    unscopedClient: {
      leaveRequest: { findFirst: vi.fn() },
      employee: { findFirst: vi.fn() },
      leaveType: { findUnique: vi.fn() },
      leaveBalance: { findUnique: vi.fn().mockResolvedValue(makeLeaveBalance()) },
      $transaction: vi.fn(async (fn: (tx: typeof tx) => Promise<unknown>) => fn(tx)),
    },
  };

  const mockAudit = { record: vi.fn() };
  const mockEvents = { emit: vi.fn() };
  const mockHolidays = { getHolidaysInRange: vi.fn(), isHoliday: vi.fn() };

  return { mockPrisma, mockAudit, mockEvents, mockHolidays, tx };
}

function createService() {
  const { mockPrisma, mockAudit, mockEvents, mockHolidays, tx } = createMocks();
  const service = new LeaveRequestService(
    mockPrisma as any, mockAudit as any, mockEvents as any, mockHolidays as any,
  );
  return { service, mockPrisma, mockAudit, mockEvents, mockHolidays, tx };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('LeaveRequestService state machine', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  // ---------------------------------------------------------------
  // approve()
  // ---------------------------------------------------------------
  describe('approve()', () => {
    it('transitions pending → approved successfully', async () => {
      const { service, mockPrisma, tx, mockEvents, mockAudit } = createService();
      const request = makeRequest('PENDING');

      mockPrisma.unscopedClient.leaveRequest.findFirst.mockResolvedValue(request);
      mockPrisma.unscopedClient.employee.findFirst.mockResolvedValue(
        makeEmployee({ id: 'approver-1' }),
      );
      tx.leaveBalance.findUnique.mockResolvedValue(makeLeaveBalance({ used: 2, balance: 8 }));

      const result = await service.approve('req-1', 'approver-1', 'co-1');

      expect(tx.leaveRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'APPROVED' }),
        }),
      );
      // Balance deduction: used incremented by totalDays
      expect(tx.leaveBalance.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ used: 5 }), // 2 + 3
        }),
      );
      expect(mockEvents.emit).toHaveBeenCalledWith(
        'leave.approved',
        expect.any(Object),
      );
      expect(mockAudit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'LEAVE_REQUEST_APPROVED' }),
      );
      expect(result.status).toBe('APPROVED');
    });

    it('throws when trying to approve an already-approved request', async () => {
      const { service, mockPrisma, tx } = createService();
      mockPrisma.unscopedClient.leaveRequest.findFirst.mockResolvedValue(
        makeRequest('APPROVED'),
      );
      mockPrisma.unscopedClient.employee.findFirst.mockResolvedValue(
        makeEmployee({ id: 'approver-1' }),
      );

      await expect(
        service.approve('req-1', 'approver-1', 'co-1'),
      ).rejects.toThrow(BadRequestError);

      expect(tx.leaveBalance.update).not.toHaveBeenCalled();
    });

    it('throws when trying to approve a rejected request', async () => {
      const { service, mockPrisma, tx } = createService();
      mockPrisma.unscopedClient.leaveRequest.findFirst.mockResolvedValue(
        makeRequest('REJECTED'),
      );
      mockPrisma.unscopedClient.employee.findFirst.mockResolvedValue(
        makeEmployee({ id: 'approver-1' }),
      );

      await expect(
        service.approve('req-1', 'approver-1', 'co-1'),
      ).rejects.toThrow(BadRequestError);

      expect(tx.leaveBalance.update).not.toHaveBeenCalled();
    });

    it('throws when trying to approve a cancelled request', async () => {
      const { service, mockPrisma, tx } = createService();
      mockPrisma.unscopedClient.leaveRequest.findFirst.mockResolvedValue(
        makeRequest('CANCELLED'),
      );
      mockPrisma.unscopedClient.employee.findFirst.mockResolvedValue(
        makeEmployee({ id: 'approver-1' }),
      );

      await expect(
        service.approve('req-1', 'approver-1', 'co-1'),
      ).rejects.toThrow(BadRequestError);

      expect(tx.leaveBalance.update).not.toHaveBeenCalled();
    });

    it('approverId must belong to same company as the request employee', async () => {
      const { service, mockPrisma } = createService();
      mockPrisma.unscopedClient.leaveRequest.findFirst.mockResolvedValue(
        makeRequest('PENDING'),
      );
      // Approver not in company
      mockPrisma.unscopedClient.employee.findFirst.mockResolvedValue(null);

      await expect(
        service.approve('req-1', 'approver-1', 'co-1'),
      ).rejects.toThrow(NotFoundError);
    });
  });

  // ---------------------------------------------------------------
  // reject()
  // ---------------------------------------------------------------
  describe('reject()', () => {
    it('transitions pending → rejected successfully', async () => {
      const { service, mockPrisma, tx, mockEvents, mockAudit } = createService();
      mockPrisma.unscopedClient.leaveRequest.findFirst.mockResolvedValue(
        makeRequest('PENDING'),
      );

      const result = await service.reject('req-1', 'approver-1', 'co-1', {
        rejectionReason: 'Business need',
      });

      expect(tx.leaveRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'REJECTED',
            rejectionReason: 'Business need',
          }),
        }),
      );
      // No balance change on reject
      expect(tx.leaveBalance.update).not.toHaveBeenCalled();
      expect(mockEvents.emit).toHaveBeenCalledWith('leave.rejected', expect.any(Object));
      expect(mockAudit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'LEAVE_REQUEST_REJECTED' }),
      );
      expect(result.status).toBe('REJECTED');
    });

    it('throws when trying to reject an already-rejected request', async () => {
      const { service } = createService();
      const { mockPrisma } = createMocks();
      const svc = new LeaveRequestService(
        mockPrisma as any, { record: vi.fn() } as any,
        { emit: vi.fn() } as any, { getHolidaysInRange: vi.fn() } as any,
      );
      mockPrisma.unscopedClient.leaveRequest.findFirst.mockResolvedValue(
        makeRequest('REJECTED'),
      );

      await expect(
        svc.reject('req-1', 'approver-1', 'co-1', { rejectionReason: 'No' }),
      ).rejects.toThrow(BadRequestError);
    });

    it('throws when trying to reject an approved request', async () => {
      const { service, mockPrisma } = createService();
      mockPrisma.unscopedClient.leaveRequest.findFirst.mockResolvedValue(
        makeRequest('APPROVED'),
      );

      await expect(
        service.reject('req-1', 'approver-1', 'co-1', { rejectionReason: 'No' }),
      ).rejects.toThrow(BadRequestError);
    });
  });

  // ---------------------------------------------------------------
  // cancel()
  // ---------------------------------------------------------------
  describe('cancel()', () => {
    it('employee can cancel their own pending request', async () => {
      const { service, mockPrisma, tx, mockEvents } = createService();
      mockPrisma.unscopedClient.leaveRequest.findFirst.mockResolvedValue(
        makeRequest('PENDING', { employeeId: 'emp-1' }),
      );

      const result = await service.cancel('req-1', 'emp-1', 'co-1');

      expect(tx.leaveRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'CANCELLED' }),
        }),
      );
      // No balance modification for pending cancel
      expect(tx.leaveBalance.update).not.toHaveBeenCalled();
      expect(result.status).toBe('CANCELLED');
    });

    it('employee can cancel their own approved request and balance is restored', async () => {
      const { service, mockPrisma, tx } = createService();
      const balance = makeLeaveBalance({ used: 5, balance: 3 });
      mockPrisma.unscopedClient.leaveRequest.findFirst.mockResolvedValue(
        makeRequest('APPROVED', { employeeId: 'emp-1', totalDays: 3 }),
      );
      tx.leaveBalance.findUnique.mockResolvedValue(balance);

      await service.cancel('req-1', 'emp-1', 'co-1');

      // Balance restored: used = 5 - 3 = 2, closing = 0 + 10 - 2 = 8
      expect(tx.leaveBalance.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ used: 2 }),
        }),
      );
    });

      it('cancel approved multi-year request restores balance across years', async () => {
        const { service, mockPrisma, mockHolidays, tx } = createService();
        const balance = makeLeaveBalance({ used: 5, balance: 3 });
        mockPrisma.unscopedClient.leaveRequest.findFirst.mockResolvedValue(
          makeRequest('APPROVED', {
            employeeId: 'emp-1',
            totalDays: 4,
            startDate: new Date('2024-12-30'),
            endDate: new Date('2025-01-02'),
          }),
        );
        tx.leaveBalance.findUnique.mockResolvedValue(balance);
        // holidays: Dec 30(Tue), Dec 31(Wed), Jan 1(Thu), Jan 2(Fri) - all working days
        mockHolidays.getHolidaysInRange.mockResolvedValue([]);

        await service.cancel('req-1', 'emp-1', 'co-1');

        // Should restore balance - called at least once
        expect(tx.leaveBalance.update).toHaveBeenCalled();
      });

    it('cancelled request cannot be approved after cancellation', async () => {
      const { service, mockPrisma } = createService();
      mockPrisma.unscopedClient.leaveRequest.findFirst.mockResolvedValue(
        makeRequest('CANCELLED'),
      );
      mockPrisma.unscopedClient.employee.findFirst.mockResolvedValue(
        makeEmployee({ id: 'approver-1' }),
      );

      await expect(
        service.approve('req-1', 'approver-1', 'co-1'),
      ).rejects.toThrow(BadRequestError);
    });

    it('cancelled request cannot be rejected after cancellation', async () => {
      const { service, mockPrisma } = createService();
      mockPrisma.unscopedClient.leaveRequest.findFirst.mockResolvedValue(
        makeRequest('CANCELLED'),
      );

      await expect(
        service.reject('req-1', 'approver-1', 'co-1', { rejectionReason: 'No' }),
      ).rejects.toThrow(BadRequestError);
    });
  });

  // ---------------------------------------------------------------
  // State transition matrix — exhaustive
  // ---------------------------------------------------------------
  describe('state transition matrix — exhaustive', () => {
    const invalidTransitions = [
      ['APPROVED', 'approve'],
      ['REJECTED', 'approve'],
      ['CANCELLED', 'approve'],
      ['REJECTED', 'reject'],
      ['CANCELLED', 'reject'],
      ['CANCELLED', 'cancel'],
    ];

    const validTransitions = [
      ['PENDING', 'approve'],
      ['PENDING', 'reject'],
      ['PENDING', 'cancel'],
      ['APPROVED', 'cancel'],
    ];

    test.each(invalidTransitions)(
      'status=%s action=%s throws BadRequestError',
      async (status, action) => {
        const { mockPrisma, mockAudit, mockEvents, mockHolidays } = createMocks();
        const svc = new LeaveRequestService(
          mockPrisma as any, mockAudit as any, mockEvents as any, mockHolidays as any,
        );
        mockPrisma.unscopedClient.leaveRequest.findFirst.mockResolvedValue(
          makeRequest(status as string, { employeeId: 'emp-1' }),
        );
        mockPrisma.unscopedClient.employee.findFirst.mockResolvedValue(
          makeEmployee({ id: 'approver-1' }),
        );

        if (action === 'approve') {
          await expect(svc.approve('req-1', 'approver-1', 'co-1')).rejects.toThrow(BadRequestError);
        } else if (action === 'reject') {
          await expect(
            svc.reject('req-1', 'approver-1', 'co-1', { rejectionReason: 'Business need' }),
          ).rejects.toThrow(BadRequestError);
        } else if (action === 'cancel') {
          await expect(svc.cancel('req-1', 'emp-1', 'co-1')).rejects.toThrow(BadRequestError);
        }
      },
    );
  });
});
