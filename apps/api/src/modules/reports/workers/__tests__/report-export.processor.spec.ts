import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { QUEUE_NAMES } from '../../../../common/queues.constants';
import { ReportExportProcessor } from '../report-export.processor';
import { ReportQueryService } from '../../services/report-query.service';
import { S3Service } from '../../../../common/s3/s3.service';
import { NotificationsService } from '../../../../notifications/notifications.service';
import { AuditService } from '../../../../audit/audit.service';
import { PrismaService } from '@hr/prisma';
import { ExportFormat } from '../../enums/export-format.enum';
import { ReportKey } from '../../enums/report-key.enum';
import type { ReportExportJobPayload } from '../report-export.processor';
import type { Job } from 'bullmq';

/* eslint-disable @typescript-eslint/no-explicit-any */

describe('ReportExportProcessor', () => {
  let processor: ReportExportProcessor;
  let mockReportQuery: { run: ReturnType<typeof vi.fn> };
  let mockS3: { putObject: ReturnType<typeof vi.fn> };
  let mockNotifications: { create: ReturnType<typeof vi.fn> };
  let mockAudit: { logAsync: ReturnType<typeof vi.fn>; stripPii: ReturnType<typeof vi.fn> };
  let mockPrisma: any;

  const SAVED_REPORT_ID = 'saved-report-uuid';
  const RECIPIENT_ID = 'recipient-uuid';

  const mockSavedReportData = {
    id: SAVED_REPORT_ID,
    name: 'Monthly Headcount',
    reportKey: ReportKey.HEADCOUNT,
    parameters: { reportKey: ReportKey.HEADCOUNT, startDate: '2025-01-01', endDate: '2025-06-30' },
    createdById: 'creator-uuid',
  };

  const mockReportResult = {
    reportKey: ReportKey.HEADCOUNT,
    generatedAt: new Date(),
    rows: [
      { departmentName: 'Engineering', headcount: 12 },
      { departmentName: 'HR', headcount: 4 },
    ],
    totalRows: 2,
  };

  function buildJob(overrides: Partial<ReportExportJobPayload> = {}): Job<ReportExportJobPayload> {
    return {
      id: 'job-123',
      data: {
        savedReportId: SAVED_REPORT_ID,
        format: ExportFormat.XLSX,
        recipientId: RECIPIENT_ID,
        triggeredAt: new Date().toISOString(),
        ...overrides,
      },
    } as Job<ReportExportJobPayload>;
  }

  beforeEach(async () => {
    mockReportQuery = { run: vi.fn().mockResolvedValue(mockReportResult) };

    mockS3 = { putObject: vi.fn().mockResolvedValue(undefined) };

    mockNotifications = { create: vi.fn().mockResolvedValue(undefined) };

    mockAudit = {
      logAsync: vi.fn().mockResolvedValue(undefined),
      stripPii: vi.fn((obj: Record<string, unknown>) => {
        const deny = new Set(['base64Signature', 'passwordHash', 'otpCode', 'rawToken', 'signedUrl']);
        return Object.fromEntries(
          Object.entries(obj).filter(([k]) => !deny.has(k)),
        );
      }),
    };

    mockPrisma = {
      unscopedClient: {
        savedReport: {
          findUnique: vi.fn().mockResolvedValue(mockSavedReportData),
        },
        employee: {
          findFirst: vi.fn().mockResolvedValue({ companyId: 'company-1' }),
        },
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      imports: [
        BullModule.registerQueue({ name: QUEUE_NAMES.REPORT_EXPORT }),
      ],
      providers: [
        ReportExportProcessor,
        { provide: ReportQueryService, useValue: mockReportQuery },
        { provide: S3Service, useValue: mockS3 },
        { provide: NotificationsService, useValue: mockNotifications },
        { provide: AuditService, useValue: mockAudit },
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    processor = module.get(ReportExportProcessor);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ─── Happy Path ────────────────────────────────────────────────────────

  describe('handle() — happy path', () => {
    it('loads the saved report by ID', async () => {
      await processor.handle(buildJob());

      expect(mockPrisma.unscopedClient.savedReport.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: SAVED_REPORT_ID } }),
      );
    });

    it('calls reportQueryService.run with saved report parameters', async () => {
      await processor.handle(buildJob());

      expect(mockReportQuery.run).toHaveBeenCalledWith(
        expect.objectContaining({
          reportKey: ReportKey.HEADCOUNT,
          startDate: '2025-01-01',
          endDate: '2025-06-30',
        }),
      );
    });

    it('calls s3Service.putObject with a Buffer', async () => {
      await processor.handle(buildJob());

      const call = mockS3.putObject.mock.calls[0][0];
      expect(Buffer.isBuffer(call.Body)).toBe(true);
    });

    it('S3 key starts with reports/{savedReportId}/', async () => {
      await processor.handle(buildJob());

      const call = mockS3.putObject.mock.calls[0][0];
      expect(call.Key).toMatch(new RegExp(`^reports/${SAVED_REPORT_ID}/`));
    });

    it('S3 key ends with .xlsx for XLSX format', async () => {
      await processor.handle(buildJob({ format: ExportFormat.XLSX }));

      const call = mockS3.putObject.mock.calls[0][0];
      expect(call.Key).toMatch(/\.xlsx$/);
    });

    it('S3 key ends with .pdf for PDF format', async () => {
      await processor.handle(buildJob({ format: ExportFormat.PDF }));

      const call = mockS3.putObject.mock.calls[0][0];
      expect(call.Key).toMatch(/\.pdf$/);
    });

    it('calls notificationService.create when recipientId is provided', async () => {
      await processor.handle(buildJob({ recipientId: RECIPIENT_ID }));

      expect(mockNotifications.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: RECIPIENT_ID,
          title: 'Your report is ready',
        }),
      );
    });

    it('calls auditLogService.logAsync with REPORT_EXPORT_COMPLETED', async () => {
      await processor.handle(buildJob());

      await new Promise<void>((r) => setImmediate(r));
      expect(mockAudit.logAsync).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'REPORT_EXPORT_COMPLETED' }),
      );
    });

    it('audit log metadata is stripped of PII fields', async () => {
      await processor.handle(buildJob());

      await new Promise<void>((r) => setImmediate(r));
      const call = mockAudit.logAsync.mock.calls[0][0];
      expect(call.newValue).not.toHaveProperty('signedUrl');
      expect(call.newValue).not.toHaveProperty('base64Signature');
    });

    it('does NOT pass signed URL to notificationService', async () => {
      await processor.handle(buildJob());

      const notifyCall = mockNotifications.create.mock.calls[0][0];
      expect(JSON.stringify(notifyCall)).not.toContain('signedUrl');
      expect(JSON.stringify(notifyCall)).not.toContain('X-Amz');
    });
  });

  // ─── No recipientId ────────────────────────────────────────────────────

  describe('handle() — no recipientId', () => {
    it('does NOT call notificationService.create when recipientId is undefined', async () => {
      await processor.handle(buildJob({ recipientId: undefined }));

      expect(mockNotifications.create).not.toHaveBeenCalled();
    });

    it('completes successfully without notification', async () => {
      await expect(
        processor.handle(buildJob({ recipientId: undefined })),
      ).resolves.toBeUndefined();
    });
  });

  // ─── Notification failure resilience ──────────────────────────────────

  describe('handle() — notification failure', () => {
    it('does NOT throw when notificationService.create rejects', async () => {
      mockNotifications.create.mockRejectedValue(new Error('Notification down'));

      await expect(processor.handle(buildJob())).resolves.toBeUndefined();
    });

    it('S3 upload still completes when notification fails', async () => {
      mockNotifications.create.mockRejectedValue(new Error('Notification down'));

      await processor.handle(buildJob());
      expect(mockS3.putObject).toHaveBeenCalled();
    });

    it('audit log is still written when notification fails', async () => {
      mockNotifications.create.mockRejectedValue(new Error('Notification down'));

      await processor.handle(buildJob());
      await new Promise<void>((r) => setImmediate(r));

      expect(mockAudit.logAsync).toHaveBeenCalled();
    });
  });

  // ─── Retry-eligible errors ─────────────────────────────────────────────

  describe('handle() — errors that re-throw', () => {
    it('re-throws when saved report is not found', async () => {
      mockPrisma.unscopedClient.savedReport.findUnique.mockResolvedValue(null);

      await expect(processor.handle(buildJob())).rejects.toThrow('not found');
    });

    it('re-throws when reportQueryService.run throws', async () => {
      mockReportQuery.run.mockRejectedValue(new Error('DB query failed'));

      await expect(processor.handle(buildJob())).rejects.toThrow('DB query failed');
    });

    it('re-throws when s3Service.putObject throws', async () => {
      mockS3.putObject.mockRejectedValue(new Error('S3 unavailable'));

      await expect(processor.handle(buildJob())).rejects.toThrow('S3 unavailable');
    });
  });

  // ─── Format output ─────────────────────────────────────────────────────

  describe('format output', () => {
    it('XLSX produces a non-empty buffer', async () => {
      await processor.handle(buildJob({ format: ExportFormat.XLSX }));

      const call = mockS3.putObject.mock.calls[0][0];
      expect(call.Body.length).toBeGreaterThan(0);
    });

    it('PDF produces a non-empty buffer', async () => {
      await processor.handle(buildJob({ format: ExportFormat.PDF }));

      const call = mockS3.putObject.mock.calls[0][0];
      expect(call.Body.length).toBeGreaterThan(0);
    });
  });
});
