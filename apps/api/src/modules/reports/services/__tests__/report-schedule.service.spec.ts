import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { getQueueToken } from '@nestjs/bullmq';
import { PrismaService } from '@hr/prisma';
import { AuditService } from '../../../audit/audit.service';
import { ReportScheduleService } from '../report-schedule.service';
import { QUEUE_NAMES } from '../../../../common/queues.constants';
import { ExportFormat } from '../../enums/export-format.enum';

/* eslint-disable @typescript-eslint/no-explicit-any */

describe('ReportScheduleService', () => {
  let service: ReportScheduleService;
  let mockPrisma: any;
  let mockAuditLog: { logAsync: ReturnType<typeof vi.fn>; stripPii: ReturnType<typeof vi.fn> };
  let mockQueue: { add: ReturnType<typeof vi.fn> };

  const ACTOR_ID = 'actor-uuid-001';
  const SAVED_REPORT_ID = 'saved-report-uuid';
  const SCHEDULE_ID = 'schedule-uuid';
  const VALID_CRON = '0 9 * * MON';
  const INVALID_CRON = 'not-a-cron';

  const mockSchedule = (overrides: Record<string, unknown> = {}) => ({
    id: SCHEDULE_ID,
    savedReportId: SAVED_REPORT_ID,
    cronExpression: VALID_CRON,
    format: ExportFormat.XLSX,
    recipientId: ACTOR_ID,
    isActive: true,
    lastRunAt: null,
    nextRunAt: new Date(Date.now() - 60_000),
    createdAt: new Date(),
    savedReport: { id: SAVED_REPORT_ID, createdById: ACTOR_ID },
    ...overrides,
  });

  beforeEach(async () => {
    mockAuditLog = {
      logAsync: vi.fn().mockResolvedValue(undefined),
      stripPii: vi.fn((obj: Record<string, unknown>) => obj),
    };

    mockQueue = { add: vi.fn().mockResolvedValue({ id: 'job-xyz' }) };

    mockPrisma = {
      unscopedClient: {
        reportSchedule: {
          create: vi.fn().mockImplementation((args: any) => ({
            ...mockSchedule(),
            ...args.data,
            id: SCHEDULE_ID,
          })),
          findMany: vi.fn().mockResolvedValue([]),
          findUnique: vi.fn().mockResolvedValue(mockSchedule()),
          update: vi.fn().mockImplementation((args: any) => ({
            ...mockSchedule(),
            ...args.data,
          })),
        },
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportScheduleService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditService, useValue: mockAuditLog },
        { provide: getQueueToken(QUEUE_NAMES.REPORT_EXPORT), useValue: mockQueue },
      ],
    }).compile();

    service = module.get(ReportScheduleService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ─── create() ──────────────────────────────────────────────────────────

  describe('create()', () => {
    it('creates schedule with valid cron expression', async () => {
      const result = await service.create(
        { savedReportId: SAVED_REPORT_ID, cronExpression: VALID_CRON, format: ExportFormat.XLSX },
        ACTOR_ID,
      );

      expect(result.id).toBe(SCHEDULE_ID);
      expect(mockPrisma.unscopedClient.reportSchedule.create).toHaveBeenCalled();
    });

    it('throws BadRequestException for invalid cron expression', async () => {
      await expect(
        service.create(
          { savedReportId: SAVED_REPORT_ID, cronExpression: INVALID_CRON, format: ExportFormat.XLSX },
          ACTOR_ID,
        ),
      ).rejects.toThrow(BadRequestException);

      expect(mockPrisma.unscopedClient.reportSchedule.create).not.toHaveBeenCalled();
    });

    it('stores the cronExpression and format in create data', async () => {
      await service.create(
        { savedReportId: SAVED_REPORT_ID, cronExpression: VALID_CRON, format: ExportFormat.PDF },
        ACTOR_ID,
      );

      const createCall = mockPrisma.unscopedClient.reportSchedule.create.mock.calls[0][0];
      expect(createCall.data.cronExpression).toBe(VALID_CRON);
      expect(createCall.data.format).toBe(ExportFormat.PDF);
    });
  });

  // ─── toggleActive() ────────────────────────────────────────────────────

  describe('toggleActive()', () => {
    it('flips isActive from true to false', async () => {
      mockPrisma.unscopedClient.reportSchedule.findUnique.mockResolvedValue(mockSchedule({ isActive: true }));

      const result = await service.toggleActive(SCHEDULE_ID, ACTOR_ID);
      expect(result.isActive).toBe(false);
    });

    it('flips isActive from false to true', async () => {
      mockPrisma.unscopedClient.reportSchedule.findUnique.mockResolvedValue(mockSchedule({ isActive: false }));

      const result = await service.toggleActive(SCHEDULE_ID, ACTOR_ID);
      expect(result.isActive).toBe(true);
    });

    it('throws when schedule does not exist', async () => {
      mockPrisma.unscopedClient.reportSchedule.findUnique.mockResolvedValue(null);

      await expect(
        service.toggleActive('non-existent', ACTOR_ID),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ─── enqueueBySchedule() ───────────────────────────────────────────────

  describe('enqueueBySchedule()', () => {
    it('adds a job to QUEUE_NAMES.REPORT_EXPORT with correct payload', async () => {
      await service.enqueueBySchedule(SCHEDULE_ID);

      expect(mockQueue.add).toHaveBeenCalled();
      const call = mockQueue.add.mock.calls[0];
      expect(call[0]).toBe(QUEUE_NAMES.REPORT_EXPORT);
      expect(call[1]).toMatchObject({
        savedReportId: SAVED_REPORT_ID,
        format: ExportFormat.XLSX,
      });
    });

    it('updates lastRunAt to approximately now', async () => {
      const before = new Date();
      await service.enqueueBySchedule(SCHEDULE_ID);

      const updateCall = mockPrisma.unscopedClient.reportSchedule.update.mock.calls[0][0];
      expect(updateCall.data.lastRunAt).toBeDefined();
      expect(new Date(updateCall.data.lastRunAt).getTime()).toBeGreaterThanOrEqual(before.getTime() - 5000);
    });

    it('computes nextRunAt after enqueue', async () => {
      await service.enqueueBySchedule(SCHEDULE_ID);

      const updateCall = mockPrisma.unscopedClient.reportSchedule.update.mock.calls[0][0];
      expect(updateCall.data.nextRunAt).toBeDefined();
      expect(new Date(updateCall.data.nextRunAt).getTime()).toBeGreaterThan(Date.now());
    });

    it('calls auditLogService.logAsync with REPORT_SCHEDULE_TRIGGERED', async () => {
      await service.enqueueBySchedule(SCHEDULE_ID);

      await new Promise<void>((r) => setImmediate(r));
      expect(mockAuditLog.logAsync).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'REPORT_SCHEDULE_TRIGGERED' }),
      );
    });

    it('does not enqueue for inactive schedule', async () => {
      mockPrisma.unscopedClient.reportSchedule.findUnique.mockResolvedValue(
        mockSchedule({ isActive: false }),
      );

      await service.enqueueBySchedule(SCHEDULE_ID);

      expect(mockQueue.add).not.toHaveBeenCalled();
    });
  });

  // ─── findDueSchedules() ────────────────────────────────────────────────

  describe('findDueSchedules()', () => {
    it('queries with isActive: true and nextRunAt <= now', async () => {
      await service.findDueSchedules();

      expect(mockPrisma.unscopedClient.reportSchedule.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            isActive: true,
            nextRunAt: expect.objectContaining({ lte: expect.any(Date) }),
          }),
        }),
      );
    });

    it('loads the savedReport relation', async () => {
      await service.findDueSchedules();

      expect(mockPrisma.unscopedClient.reportSchedule.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ include: { savedReport: true } }),
      );
    });

    it('returns due schedules', async () => {
      const dueSchedule = mockSchedule();
      mockPrisma.unscopedClient.reportSchedule.findMany.mockResolvedValue([dueSchedule]);

      const result = await service.findDueSchedules();
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(SCHEDULE_ID);
    });

    it('returns empty array when no schedules are due', async () => {
      mockPrisma.unscopedClient.reportSchedule.findMany.mockResolvedValue([]);
      const result = await service.findDueSchedules();
      expect(result).toEqual([]);
    });
  });
});
