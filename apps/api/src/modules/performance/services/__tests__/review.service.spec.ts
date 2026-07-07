import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@hr/prisma';
import { AuditService } from '../../../audit/audit.service';
import { ReviewService } from '../review.service';
import { makeReviewInstance, makeReviewResponse } from '../../../../../../../test/factories/sprint8.factory';

/* eslint-disable @typescript-eslint/no-explicit-any */

describe('ReviewService', () => {
  let service: ReviewService;
  let mockPrisma: any;
  let mockAudit: { logAsync: ReturnType<typeof vi.fn>; stripPii: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    mockAudit = {
      logAsync: vi.fn().mockResolvedValue(undefined),
      stripPii: vi.fn((obj: Record<string, unknown>) => {
        const deny = new Set(['base64Signature', 'passwordHash', 'otpCode', 'rawToken', 'signedUrl']);
        return Object.fromEntries(Object.entries(obj).filter(([k]) => !deny.has(k)));
      }),
    };

    mockPrisma = {
      unscopedClient: {
        reviewInstance: {
          findUnique: vi.fn().mockResolvedValue(makeReviewInstance()),
          update: vi.fn().mockImplementation((args: any) => ({ ...args.data })),
        },
        reviewResponse: {
          upsert: vi.fn().mockResolvedValue({}),
          update: vi.fn().mockResolvedValue({}),
        },
        calibrationOverride: {
          create: vi.fn().mockResolvedValue({}),
        },
        $transaction: vi.fn().mockImplementation(async (cb: any) => cb(mockPrisma.unscopedClient)),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReviewService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditService, useValue: mockAudit },
      ],
    }).compile();

    service = module.get(ReviewService);
  });

  afterEach(() => vi.clearAllMocks());

  // ─── saveResponse ───────────────────────────────────────────────────

  describe('saveResponse', () => {
    it('upserts response and sets IN_PROGRESS on first save', async () => {
      mockPrisma.unscopedClient.reviewInstance.findUnique.mockResolvedValue(makeReviewInstance({ selfReviewStatus: 'NOT_STARTED' }));
      await service.saveResponse('rev-001', 'SELF', 'goals', { rating: 4 });
      expect(mockPrisma.unscopedClient.reviewResponse.upsert).toHaveBeenCalled();
      expect(mockPrisma.unscopedClient.reviewInstance.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ selfReviewStatus: 'IN_PROGRESS' }) }));
    });

    it('throws NotFoundException for missing review', async () => {
      mockPrisma.unscopedClient.reviewInstance.findUnique.mockResolvedValue(null);
      await expect(service.saveResponse('bad-id', 'SELF', 'goals', {})).rejects.toThrow(NotFoundException);
    });
  });

  // ─── submitReview ───────────────────────────────────────────────────

  describe('submitReview', () => {
    it('sets status to SUBMITTED and timestamps responses', async () => {
      mockPrisma.unscopedClient.reviewInstance.findUnique.mockResolvedValue(
        makeReviewInstance({ selfReviewStatus: 'IN_PROGRESS', responses: [makeReviewResponse({ respondentRole: 'SELF' })] }),
      );
      await service.submitReview('rev-001', 'SELF');
      expect(mockPrisma.unscopedClient.reviewInstance.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ selfReviewStatus: 'SUBMITTED' }) }));
    });

    it('rejects submit when already submitted', async () => {
      mockPrisma.unscopedClient.reviewInstance.findUnique.mockResolvedValue(
        makeReviewInstance({ selfReviewStatus: 'SUBMITTED', responses: [makeReviewResponse({ respondentRole: 'SELF' })] }),
      );
      await expect(service.submitReview('rev-001', 'SELF')).rejects.toThrow(BadRequestException);
    });

    it('rejects submit with no responses', async () => {
      mockPrisma.unscopedClient.reviewInstance.findUnique.mockResolvedValue(makeReviewInstance({ responses: [] }));
      await expect(service.submitReview('rev-001', 'SELF')).rejects.toThrow(BadRequestException);
    });
  });

  // ─── Calibration override ───────────────────────────────────────────

  describe('applyCalibrationOverride', () => {
    it('creates override and updates rating in transaction', async () => {
      mockPrisma.unscopedClient.reviewInstance.findUnique.mockResolvedValue(
        makeReviewInstance({ selfReviewStatus: 'SUBMITTED', managerReviewStatus: 'SUBMITTED' }),
      );
      await service.applyCalibrationOverride('rev-001', { overriddenRating: 'Exceeds', justification: 'Great work' }, 'hr-1');
      expect(mockPrisma.unscopedClient.calibrationOverride.create).toHaveBeenCalled();
      expect(mockPrisma.unscopedClient.reviewInstance.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ overallRating: 'Exceeds' }) }));
    });

    it('rejects when reviews not both submitted', async () => {
      mockPrisma.unscopedClient.reviewInstance.findUnique.mockResolvedValue(
        makeReviewInstance({ selfReviewStatus: 'IN_PROGRESS', managerReviewStatus: 'SUBMITTED' }),
      );
      await expect(service.applyCalibrationOverride('rev-001', { overriddenRating: 'Exceeds', justification: 'Test' }, 'hr-1')).rejects.toThrow(BadRequestException);
    });

    it('audit log fires with no PII in metadata', async () => {
      mockPrisma.unscopedClient.reviewInstance.findUnique.mockResolvedValue(
        makeReviewInstance({ selfReviewStatus: 'SUBMITTED', managerReviewStatus: 'SUBMITTED' }),
      );
      await service.applyCalibrationOverride('rev-001', { overriddenRating: 'Exceeds', justification: 'Great' }, 'hr-1');
      await new Promise<void>((r) => setImmediate(r));
      expect(mockAudit.logAsync).toHaveBeenCalledWith(expect.objectContaining({ action: 'CALIBRATION_OVERRIDE_APPLIED' }));
      const call = mockAudit.logAsync.mock.calls[0][0];
      expect(JSON.stringify(call.newValue)).not.toContain('signedUrl');
    });
  });

  // ─── Acknowledge ────────────────────────────────────────────────────

  describe('acknowledgeReview', () => {
    it('succeeds when rating is finalized', async () => {
      mockPrisma.unscopedClient.reviewInstance.findUnique.mockResolvedValue(
        makeReviewInstance({ selfReviewStatus: 'SUBMITTED', managerReviewStatus: 'SUBMITTED', overallRating: 'Meets' }),
      );
      const result = await service.acknowledgeReview('rev-001');
      expect(result.acknowledgedByEmployee).toBe(true);
      expect(result.acknowledgedAt).toBeDefined();
    });

    it('rejects when rating not finalized', async () => {
      mockPrisma.unscopedClient.reviewInstance.findUnique.mockResolvedValue(makeReviewInstance({ overallRating: null }));
      await expect(service.acknowledgeReview('rev-001')).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException for missing review', async () => {
      mockPrisma.unscopedClient.reviewInstance.findUnique.mockResolvedValue(null);
      await expect(service.acknowledgeReview('bad-id')).rejects.toThrow(NotFoundException);
    });
  });
});
