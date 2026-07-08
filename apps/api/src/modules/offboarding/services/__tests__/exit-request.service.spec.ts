import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@hr/prisma';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AuditService } from '../../../../modules/audit/audit.service';
import { ExitRequestService } from '../exit-request.service';

/* eslint-disable @typescript-eslint/no-explicit-any */

describe('ExitRequestService', () => {
  let service: ExitRequestService;
  let mockPrisma: any;
  let mockEvents: { emit: ReturnType<typeof vi.fn> };
  let mockAudit: { logAsync: ReturnType<typeof vi.fn> };

  const mockExit = {
    id: 'ex-001', companyId: 'comp-1', employeeId: 'emp-1',
    reasonType: 'RESIGNATION', status: 'PENDING_MANAGER_APPROVAL',
    requestedLastWorkingDay: new Date('2026-09-01'), checklistTasks: [],
    interview: null,
  };

  beforeEach(async () => {
    mockEvents = { emit: vi.fn() };
    mockAudit = { logAsync: vi.fn().mockResolvedValue(undefined) };
    mockPrisma = {
      unscopedClient: {
        exitRequest: {
          findUnique: vi.fn().mockResolvedValue(mockExit),
          findMany: vi.fn().mockResolvedValue([mockExit]),
          create: vi.fn().mockImplementation((args: any) => ({ id: 'ex-001', ...args.data })),
          update: vi.fn().mockImplementation((args: any) => ({ ...mockExit, ...args.data })),
        },
        offboardingChecklistTask: {
          create: vi.fn().mockResolvedValue({}),
        },
        $transaction: vi.fn().mockImplementation(async (arg: any) => {
          if (Array.isArray(arg)) return Promise.all(arg);
          return arg(mockPrisma.unscopedClient);
        }),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExitRequestService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: EventEmitter2, useValue: mockEvents },
        { provide: AuditService, useValue: mockAudit },
      ],
    }).compile();

    service = module.get(ExitRequestService);
  });

  afterEach(() => vi.clearAllMocks());

  // ─── Submit ─────────────────────────────────────────────────────────

  describe('submit', () => {
    it('creates exit request with PENDING_MANAGER_APPROVAL for RESIGNATION', async () => {
      const result = await service.submit({
        companyId: 'comp-1', employeeId: 'emp-1', reasonType: 'RESIGNATION',
        requestedLastWorkingDay: new Date('2026-09-01'), submittedById: 'emp-1',
      });
      expect(result.status).toBe('PENDING_MANAGER_APPROVAL');
    });

    it('rejects past last working day', async () => {
      await expect(service.submit({
        companyId: 'comp-1', employeeId: 'emp-1', reasonType: 'RESIGNATION',
        requestedLastWorkingDay: new Date('2020-01-01'), submittedById: 'emp-1',
      })).rejects.toThrow(BadRequestException);
    });
  });

  // ─── State Machine ──────────────────────────────────────────────────

  describe('state machine', () => {
    it('PENDING_MANAGER_APPROVAL → APPROVED', async () => {
      await service.approve('ex-001', 'mgr-1');
      expect(mockEvents.emit).toHaveBeenCalledWith('employee.exit_approved', expect.any(Object));
    });

    it('PENDING_MANAGER_APPROVAL → REJECTED', async () => {
      await service.reject('ex-001', 'mgr-1', 'Not a fit');
      expect(mockPrisma.unscopedClient.exitRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'REJECTED' }) }),
      );
    });

    it('PENDING_MANAGER_APPROVAL → CANCELLED', async () => {
      await service.cancel('ex-001');
      expect(mockPrisma.unscopedClient.exitRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: 'CANCELLED' } }),
      );
    });

    it('rejects COMPLETED → APPROVED (terminal state)', async () => {
      mockPrisma.unscopedClient.exitRequest.findUnique.mockResolvedValue({ ...mockExit, status: 'COMPLETED' });
      await expect(service.approve('ex-001', 'mgr-1')).rejects.toThrow(BadRequestException);
    });

    it('rejects REJECTED → APPROVED (terminal state)', async () => {
      mockPrisma.unscopedClient.exitRequest.findUnique.mockResolvedValue({ ...mockExit, status: 'REJECTED' });
      await expect(service.approve('ex-001', 'mgr-1')).rejects.toThrow(BadRequestException);
    });

    it('rejects SUBMITTED → COMPLETED (skip states)', async () => {
      mockPrisma.unscopedClient.exitRequest.findUnique.mockResolvedValue({ ...mockExit, status: 'SUBMITTED' });
      await expect(service.finalizeExit('ex-001')).rejects.toThrow();
    });

    it('throws NotFoundException for missing exit request', async () => {
      mockPrisma.unscopedClient.exitRequest.findUnique.mockResolvedValue(null);
      await expect(service.approve('bad-id', 'mgr-1')).rejects.toThrow(NotFoundException);
    });
  });

  // ─── Approve Cascades ──────────────────────────────────────────────

  describe('approve cascades', () => {
    it('materializes checklist tasks on approval', async () => {
      mockPrisma.unscopedClient.exitRequest.findUnique.mockResolvedValue({
        ...mockExit, reasonType: 'RESIGNATION',
      });
      await service.approve('ex-001', 'mgr-1');
      // RESIGNATION template has 8 tasks
      expect(mockPrisma.unscopedClient.offboardingChecklistTask.create).toHaveBeenCalledTimes(8);
    });

    it('emits employee.exit_approved post-commit', async () => {
      await service.approve('ex-001', 'mgr-1');
      expect(mockEvents.emit).toHaveBeenCalledWith('employee.exit_approved', expect.objectContaining({ exitRequestId: 'ex-001' }));
    });

    it('audit log fires EXIT_REQUEST_APPROVED', async () => {
      await service.approve('ex-001', 'mgr-1');
      await new Promise<void>((r) => setImmediate(r));
      expect(mockAudit.logAsync).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'EXIT_REQUEST_APPROVED' }),
      );
    });
  });

  // ─── Finalize (Idempotency) ────────────────────────────────────────

  describe('finalizeExit', () => {
    it('completes exit and emits employee.terminated', async () => {
      mockPrisma.unscopedClient.exitRequest.findUnique.mockResolvedValue({
        ...mockExit, status: 'CHECKLIST_IN_PROGRESS',
        checklistTasks: [{ status: 'COMPLETED' }, { status: 'SKIPPED' }],
        interview: { isCompleted: true },
      });
      await service.finalizeExit('ex-001');
      expect(mockEvents.emit).toHaveBeenCalledWith('employee.terminated', expect.any(Object));
    });

    it('skips if already COMPLETED (idempotency)', async () => {
      mockPrisma.unscopedClient.exitRequest.findUnique.mockResolvedValue({ ...mockExit, status: 'COMPLETED' });
      const result = await service.finalizeExit('ex-001');
      expect(result.status).toBe('COMPLETED');
      // Should not emit duplicate event
      expect(mockEvents.emit).not.toHaveBeenCalled();
    });

    it('rejects if checklist incomplete', async () => {
      mockPrisma.unscopedClient.exitRequest.findUnique.mockResolvedValue({
        ...mockExit, status: 'CHECKLIST_IN_PROGRESS',
        checklistTasks: [{ status: 'PENDING' }],
        interview: { isCompleted: true },
      });
      await expect(service.finalizeExit('ex-001')).rejects.toThrow(BadRequestException);
    });

    it('rejects if interview incomplete', async () => {
      mockPrisma.unscopedClient.exitRequest.findUnique.mockResolvedValue({
        ...mockExit, status: 'CHECKLIST_IN_PROGRESS',
        checklistTasks: [{ status: 'COMPLETED' }],
        interview: { isCompleted: false },
      });
      await expect(service.finalizeExit('ex-001')).rejects.toThrow(BadRequestException);
    });
  });

  // ─── List / Get ────────────────────────────────────────────────────

  describe('getById', () => {
    it('throws NotFoundException for missing', async () => {
      mockPrisma.unscopedClient.exitRequest.findUnique.mockResolvedValue(null);
      await expect(service.getById('bad-id')).rejects.toThrow(NotFoundException);
    });
  });

  describe('list', () => {
    it('returns exit requests', async () => {
      const result = await service.list('comp-1');
      expect(result).toHaveLength(1);
    });
  });
});
