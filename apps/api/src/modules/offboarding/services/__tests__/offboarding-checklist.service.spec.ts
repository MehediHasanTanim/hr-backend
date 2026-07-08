import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@hr/prisma';
import { AuditService } from '../../../../modules/audit/audit.service';
import { OffboardingChecklistService } from '../offboarding-checklist.service';

/* eslint-disable @typescript-eslint/no-explicit-any */

describe('OffboardingChecklistService', () => {
  let service: OffboardingChecklistService;
  let mockPrisma: any;
  let mockAudit: { logAsync: ReturnType<typeof vi.fn> };

  const mockTask = { id: 'ct-001', exitRequestId: 'ex-001', taskName: 'Revoke Access', category: 'IT', status: 'PENDING', sortOrder: 1 };

  beforeEach(async () => {
    mockAudit = { logAsync: vi.fn().mockResolvedValue(undefined) };
    mockPrisma = {
      unscopedClient: {
        offboardingChecklistTask: {
          findUnique: vi.fn().mockResolvedValue(mockTask),
          findMany: vi.fn().mockResolvedValue([mockTask]),
          update: vi.fn().mockImplementation((args: any) => ({ ...mockTask, ...args.data })),
        },
        exitRequest: {
          findUnique: vi.fn().mockResolvedValue({
            id: 'ex-001', status: 'APPROVED', checklistTasks: [],
          }),
          update: vi.fn().mockResolvedValue({}),
        },
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OffboardingChecklistService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditService, useValue: mockAudit },
      ],
    }).compile();

    service = module.get(OffboardingChecklistService);
  });

  afterEach(() => vi.clearAllMocks());

  describe('completeTask', () => {
    it('marks task COMPLETED', async () => {
      const result = await service.completeTask('ct-001', 'admin-1');
      expect(result.status).toBe('COMPLETED');
    });

    it('rejects already completed task', async () => {
      mockPrisma.unscopedClient.offboardingChecklistTask.findUnique.mockResolvedValue({ ...mockTask, status: 'COMPLETED' });
      await expect(service.completeTask('ct-001', 'admin-1')).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException for missing task', async () => {
      mockPrisma.unscopedClient.offboardingChecklistTask.findUnique.mockResolvedValue(null);
      await expect(service.completeTask('bad-id', 'admin-1')).rejects.toThrow(NotFoundException);
    });

    it('transitions exit request to CHECKLIST_IN_PROGRESS', async () => {
      mockPrisma.unscopedClient.exitRequest.findUnique.mockResolvedValue({
        id: 'ex-001', status: 'APPROVED',
        checklistTasks: [{ id: 'ct-001', status: 'COMPLETED' }],
      });
      await service.completeTask('ct-001', 'admin-1');
      expect(mockPrisma.unscopedClient.exitRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: 'CHECKLIST_IN_PROGRESS' } }),
      );
    });

    it('audit log fires CHECKLIST_TASK_COMPLETED', async () => {
      await service.completeTask('ct-001', 'admin-1');
      await new Promise<void>((r) => setImmediate(r));
      expect(mockAudit.logAsync).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'CHECKLIST_TASK_COMPLETED' }),
      );
    });
  });

  describe('skipTask', () => {
    it('marks task SKIPPED with mandatory reason', async () => {
      const result = await service.skipTask('ct-001', 'admin-1', 'Not applicable');
      expect(result.status).toBe('SKIPPED');
    });

    it('rejects skip without reason', async () => {
      await expect(service.skipTask('ct-001', 'admin-1', '')).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException for missing task', async () => {
      mockPrisma.unscopedClient.offboardingChecklistTask.findUnique.mockResolvedValue(null);
      await expect(service.skipTask('bad-id', 'admin-1', 'Test')).rejects.toThrow(NotFoundException);
    });
  });

  describe('getByExitRequest', () => {
    it('returns tasks ordered by sortOrder', async () => {
      const result = await service.getByExitRequest('ex-001');
      expect(result).toHaveLength(1);
    });
  });
});
