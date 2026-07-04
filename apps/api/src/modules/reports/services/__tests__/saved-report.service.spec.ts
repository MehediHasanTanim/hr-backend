import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { getQueueToken } from '@nestjs/bullmq';
import { PrismaService } from '@hr/prisma';
import { AuditService } from '../../../audit/audit.service';
import { SavedReportService } from '../saved-report.service';
import { QUEUE_NAMES } from '../../../../common/queues.constants';
import { ExportFormat } from '../../enums/export-format.enum';
import type { SaveReportDto } from '../../dto/save-report.dto';
import type { TriggerExportDto } from '../../dto/trigger-export.dto';
import { ReportKey } from '../../enums/report-key.enum';

/* eslint-disable @typescript-eslint/no-explicit-any */

describe('SavedReportService', () => {
  let service: SavedReportService;
  let mockPrisma: any;
  let mockAuditLog: { logAsync: ReturnType<typeof vi.fn>; stripPii: ReturnType<typeof vi.fn> };
  let mockQueue: { add: ReturnType<typeof vi.fn> };

  const ACTOR_ID = 'actor-uuid-001';
  const SAVED_REPORT_ID = 'report-uuid-001';

  const mockSavedReport = {
    id: SAVED_REPORT_ID,
    name: 'Monthly Headcount',
    reportKey: ReportKey.HEADCOUNT,
    parameters: { reportKey: ReportKey.HEADCOUNT, startDate: '2025-01-01', endDate: '2025-06-30' },
    createdById: ACTOR_ID,
    createdAt: new Date('2025-07-01'),
    updatedAt: new Date('2025-07-01'),
  };

  const saveDto: SaveReportDto = {
    name: 'Monthly Headcount',
    reportKey: ReportKey.HEADCOUNT,
    parameters: {
      reportKey: ReportKey.HEADCOUNT,
      startDate: '2025-01-01',
      endDate: '2025-06-30',
    },
  };

  beforeEach(async () => {
    mockAuditLog = {
      logAsync: vi.fn().mockResolvedValue(undefined),
      stripPii: vi.fn((obj: Record<string, unknown>) => {
        const deny = new Set(['base64Signature', 'passwordHash', 'otpCode', 'rawToken', 'signedUrl']);
        return Object.fromEntries(
          Object.entries(obj).filter(([k]) => !deny.has(k)),
        );
      }),
    };

    mockQueue = { add: vi.fn().mockResolvedValue({ id: 'job-id-123' }) };

    mockPrisma = {
      unscopedClient: {
        savedReport: {
          create: vi.fn().mockResolvedValue(mockSavedReport),
          findMany: vi.fn().mockResolvedValue([mockSavedReport]),
          findUnique: vi.fn().mockResolvedValue(mockSavedReport),
          delete: vi.fn().mockResolvedValue({}),
        },
        reportSchedule: {
          deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
        },
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SavedReportService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditService, useValue: mockAuditLog },
        { provide: getQueueToken(QUEUE_NAMES.REPORT_EXPORT), useValue: mockQueue },
      ],
    }).compile();

    service = module.get(SavedReportService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ─── save() ────────────────────────────────────────────────────────────

  describe('save()', () => {
    it('creates and persists the saved report entity', async () => {
      await service.save(saveDto, ACTOR_ID);

      // Prisma create is called with a data object
      expect(mockPrisma.unscopedClient.savedReport.create).toHaveBeenCalled();
      const createCall = mockPrisma.unscopedClient.savedReport.create.mock.calls[0][0];
      expect(createCall.data.name).toBe(saveDto.name);
      expect(createCall.data.createdById).toBe(ACTOR_ID);
    });

    it('calls auditLogService.logAsync with REPORT_DEFINITION_SAVED', async () => {
      await service.save(saveDto, ACTOR_ID);

      await new Promise<void>((r) => setImmediate(r));
      expect(mockAuditLog.logAsync).toHaveBeenCalledTimes(1);
      expect(mockAuditLog.logAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: 'saved_report',
          action: 'REPORT_DEFINITION_SAVED',
        }),
      );
    });

    it('audit log metadata is stripped of PII', async () => {
      await service.save(saveDto, ACTOR_ID);

      await new Promise<void>((r) => setImmediate(r));
      const call = mockAuditLog.logAsync.mock.calls[0][0];
      expect(mockAuditLog.stripPii).toHaveBeenCalled();
    });

    it('returns the persisted entity', async () => {
      const result = await service.save(saveDto, ACTOR_ID);
      expect(result.id).toBe(SAVED_REPORT_ID);
    });
  });

  // ─── list() ────────────────────────────────────────────────────────────

  describe('list()', () => {
    it('returns saved reports belonging to the actor', async () => {
      const result = await service.list(ACTOR_ID);

      expect(mockPrisma.unscopedClient.savedReport.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { createdById: ACTOR_ID } }),
      );
      expect(result).toHaveLength(1);
    });

    it('returns empty array when actor has no saved reports', async () => {
      mockPrisma.unscopedClient.savedReport.findMany.mockResolvedValue([]);
      const result = await service.list(ACTOR_ID);
      expect(result).toEqual([]);
    });
  });

  // ─── findOneOrFail() ───────────────────────────────────────────────────

  describe('findOneOrFail()', () => {
    it('returns the saved report when it belongs to actor', async () => {
      const result = await service.findOneOrFail(SAVED_REPORT_ID, ACTOR_ID);
      expect(result.id).toBe(SAVED_REPORT_ID);
    });

    it('throws NotFoundException when report does not exist', async () => {
      mockPrisma.unscopedClient.savedReport.findUnique.mockResolvedValue(null);

      await expect(
        service.findOneOrFail('non-existent', ACTOR_ID),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when report belongs to different actor', async () => {
      mockPrisma.unscopedClient.savedReport.findUnique.mockResolvedValue({
        ...mockSavedReport,
        createdById: 'other-actor',
      });

      await expect(
        service.findOneOrFail(SAVED_REPORT_ID, 'different-actor'),
      ).rejects.toThrow('You can only access your own saved reports');
    });
  });

  // ─── delete() ──────────────────────────────────────────────────────────

  describe('delete()', () => {
    it('deletes the report when actor is the owner', async () => {
      await service.delete(SAVED_REPORT_ID, ACTOR_ID);

      expect(mockPrisma.unscopedClient.savedReport.delete).toHaveBeenCalled();
      const deleteCall = mockPrisma.unscopedClient.savedReport.delete.mock.calls[0][0];
      expect(deleteCall.where.id).toBe(SAVED_REPORT_ID);
    });

    it('deletes associated schedules before the report', async () => {
      await service.delete(SAVED_REPORT_ID, ACTOR_ID);

      expect(mockPrisma.unscopedClient.reportSchedule.deleteMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { savedReportId: SAVED_REPORT_ID } }),
      );
    });
  });

  // ─── triggerExport() ───────────────────────────────────────────────────

  describe('triggerExport()', () => {
    const exportDto: TriggerExportDto = { format: ExportFormat.XLSX };

    it('enqueues a job on QUEUE_NAMES.REPORT_EXPORT with correct payload', async () => {
      await service.triggerExport(SAVED_REPORT_ID, ACTOR_ID, exportDto);

      const call = mockQueue.add.mock.calls[0];
      expect(call[0]).toBe(QUEUE_NAMES.REPORT_EXPORT);
      expect(call[1]).toMatchObject({
        savedReportId: SAVED_REPORT_ID,
        format: ExportFormat.XLSX,
      });
    });

    it('defaults recipientId to actorId when not provided', async () => {
      await service.triggerExport(SAVED_REPORT_ID, ACTOR_ID, { format: ExportFormat.PDF });

      const call = mockQueue.add.mock.calls[0];
      expect(call[1].recipientId).toBe(ACTOR_ID);
    });

    it('uses provided recipientId when explicitly given', async () => {
      await service.triggerExport(SAVED_REPORT_ID, ACTOR_ID, {
        ...exportDto,
        recipientId: 'custom-recipient',
      });

      const call = mockQueue.add.mock.calls[0];
      expect(call[1].recipientId).toBe('custom-recipient');
    });

    it('returns jobId from BullMQ job', async () => {
      const result = await service.triggerExport(SAVED_REPORT_ID, ACTOR_ID, exportDto);

      expect(result.jobId).toBe('job-id-123');
      expect(result.message).toBeDefined();
    });

    it('enqueues with attempts: 3 and exponential backoff', async () => {
      await service.triggerExport(SAVED_REPORT_ID, ACTOR_ID, exportDto);

      const call = mockQueue.add.mock.calls[0];
      expect(call[2]).toMatchObject({
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
      });
    });

    it('calls auditLogService.logAsync with REPORT_EXPORT_TRIGGERED', async () => {
      await service.triggerExport(SAVED_REPORT_ID, ACTOR_ID, exportDto);

      await new Promise<void>((r) => setImmediate(r));
      expect(mockAuditLog.logAsync).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'REPORT_EXPORT_TRIGGERED' }),
      );
    });
  });
});
