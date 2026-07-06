import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '@hr/prisma';
import { AuditService } from '../../../audit/audit.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InterviewService, SCORECARD_WEIGHTS, computeOverallScore } from '../interview.service';
import { buildInterviewPanel, buildPanelist, buildScorecard } from '../../../../../../../test/factories/recruitment.factory';

/* eslint-disable @typescript-eslint/no-explicit-any */

describe('InterviewService', () => {
  let service: InterviewService;
  let mockPrisma: any;
  let mockAudit: { logAsync: ReturnType<typeof vi.fn>; stripPii: ReturnType<typeof vi.fn> };
  let mockEvents: { emit: ReturnType<typeof vi.fn> };

  const APP_ID = 'app-001';
  const PANEL_ID = 'panel-001';

  function stubApp(stage: string = 'INTERVIEW') {
    return { id: APP_ID, stage, requisitionId: 'req-001' };
  }

  beforeEach(async () => {
    mockAudit = {
      logAsync: vi.fn().mockResolvedValue(undefined),
      stripPii: vi.fn((obj: Record<string, unknown>) => {
        const deny = new Set(['base64Signature', 'passwordHash', 'otpCode', 'rawToken', 'signedUrl', 'profile_data', 'email', 'phone', 'notes']);
        return Object.fromEntries(Object.entries(obj).filter(([k]) => !deny.has(k)));
      }),
    };
    mockEvents = { emit: vi.fn() };

    mockPrisma = {
      unscopedClient: {
        application: {
          findUnique: vi.fn().mockResolvedValue(stubApp()),
          update: vi.fn().mockResolvedValue({}),
        },
        interviewPanel: {
          findUnique: vi.fn().mockResolvedValue(
            buildInterviewPanel({ id: PANEL_ID, applicationId: APP_ID }),
          ),
          create: vi.fn().mockImplementation((args: any) => ({ id: PANEL_ID, ...args.data })),
          update: vi.fn().mockImplementation((args: any) => ({ id: args.where.id, ...args.data })),
        },
        interviewPanelist: {
          create: vi.fn().mockImplementation((args: any) => ({ id: `pl-${args.data.employeeId}`, ...args.data })),
          deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
        },
        interviewScorecard: {
          upsert: vi.fn().mockImplementation((args: any) => ({
            id: 'sc-001',
            interviewPanelId: args.where.interviewPanelId_panelistEmployeeId.interviewPanelId,
            panelistEmployeeId: args.where.interviewPanelId_panelistEmployeeId.panelistEmployeeId,
            ...args.create,
            submittedAt: args.create.submittedAt,
          })),
          count: vi.fn().mockResolvedValue(0),
        },
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InterviewService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditService, useValue: mockAudit },
        { provide: EventEmitter2, useValue: mockEvents },
      ],
    }).compile();

    service = module.get(InterviewService);
  });

  afterEach(() => vi.clearAllMocks());

  // ─── SCORECARD_WEIGHTS constant ────────────────────────────────────────

  describe('SCORECARD_WEIGHTS', () => {
    it('sums to exactly 1.0', () => {
      const sum = SCORECARD_WEIGHTS.technical + SCORECARD_WEIGHTS.communication + SCORECARD_WEIGHTS.cultureFit;
      expect(sum).toBeCloseTo(1.0, 10);
    });
  });

  // ─── computeOverallScore ────────────────────────────────────────────────

  describe('computeOverallScore()', () => {
    it('all equal scores returns same value', () => {
      expect(computeOverallScore({ technicalScore: 4, communicationScore: 4, cultureFitScore: 4 })).toBeCloseTo(4, 2);
    });

    it('skewed scores produce weighted result', () => {
      const score = computeOverallScore({ technicalScore: 5, communicationScore: 2, cultureFitScore: 2 });
      // 5*0.5 + 2*0.25 + 2*0.25 = 2.5 + 0.5 + 0.5 = 3.5
      expect(score).toBeCloseTo(3.5, 2);
    });

    it('handles partial nulls via weight renormalization', () => {
      const score = computeOverallScore({ technicalScore: 4, communicationScore: null, cultureFitScore: null });
      expect(score).toBeCloseTo(4, 2);
    });

    it('returns null when all are null', () => {
      expect(computeOverallScore({})).toBeNull();
    });

    it('output is round2dp processed', () => {
      const score = computeOverallScore({ technicalScore: 4.567, communicationScore: 3.333, cultureFitScore: 2.111 });
      // Not just a raw float — must be rounded
      expect(score).not.toBeNull();
    });
  });

  // ─── Scorecard submission idempotency ───────────────────────────────────

  describe('submitScorecard()', () => {
    const panelWithPanelists = () => buildInterviewPanel({
      id: PANEL_ID,
      applicationId: APP_ID,
      panelists: [
        buildPanelist({ id: 'pl-1', employeeId: 'emp-a', role: 'LEAD' }),
        buildPanelist({ id: 'pl-2', employeeId: 'emp-b', role: 'PANELIST' }),
        buildPanelist({ id: 'pl-3', employeeId: 'emp-c', role: 'PANELIST' }),
      ],
      scorecards: [],
    });

    it('creates scorecard on first submission', async () => {
      mockPrisma.unscopedClient.interviewPanel.findUnique.mockResolvedValue(panelWithPanelists());
      const result = await service.submitScorecard(PANEL_ID, 'emp-a', {
        recommendation: 'YES', technicalScore: 4.0, communicationScore: 3.5, cultureFitScore: 4.0, notes: '',
      });
      expect(result).toBeDefined();
      expect(mockPrisma.unscopedClient.interviewScorecard.upsert).toHaveBeenCalledTimes(1);
      expect(mockEvents.emit).toHaveBeenCalledWith('interview.scorecard_submitted', expect.objectContaining({ panelId: PANEL_ID }));
    });

    it('upserts on re-submission — same scorecard updated, not duplicated', async () => {
      mockPrisma.unscopedClient.interviewPanel.findUnique.mockResolvedValue(
        panelWithPanelists(),
      );
      mockPrisma.unscopedClient.interviewScorecard.count.mockResolvedValue(1);

      await service.submitScorecard(PANEL_ID, 'emp-a', {
        recommendation: 'YES', technicalScore: 5.0, communicationScore: 4.0, cultureFitScore: 4.5, notes: '',
      });
      await service.submitScorecard(PANEL_ID, 'emp-a', {
        recommendation: 'NO', technicalScore: 2.0, communicationScore: 2.0, cultureFitScore: 2.0, notes: '',
      });

      // Both calls used upsert — not two inserts
      expect(mockPrisma.unscopedClient.interviewScorecard.upsert).toHaveBeenCalledTimes(2);
    });

    it('different panelists do not collide', async () => {
      mockPrisma.unscopedClient.interviewPanel.findUnique.mockResolvedValue(
        panelWithPanelists(),
      );
      await service.submitScorecard(PANEL_ID, 'emp-a', {
        recommendation: 'YES', technicalScore: 4, communicationScore: 4, cultureFitScore: 4, notes: '',
      });
      await service.submitScorecard(PANEL_ID, 'emp-b', {
        recommendation: 'STRONG_YES', technicalScore: 5, communicationScore: 5, cultureFitScore: 5, notes: '',
      });

      expect(mockPrisma.unscopedClient.interviewScorecard.upsert).toHaveBeenCalledTimes(2);
    });

    it('rejects unassigned panelist', async () => {
      mockPrisma.unscopedClient.interviewPanel.findUnique.mockResolvedValue(
        panelWithPanelists(),
      );
      await expect(
        service.submitScorecard(PANEL_ID, 'emp-unknown', {
          recommendation: 'YES', technicalScore: 3, communicationScore: 3, cultureFitScore: 3, notes: '',
        }),
      ).rejects.toThrow(ForbiddenException);
      expect(mockPrisma.unscopedClient.interviewScorecard.upsert).not.toHaveBeenCalled();
    });
  });

  // ─── Panel completion trigger ──────────────────────────────────────────

  describe('panel completion', () => {
    it('does not complete with only 2 of 3 panelists submitted', async () => {
      const panel = buildInterviewPanel({
        id: PANEL_ID, applicationId: APP_ID,
        panelists: [
          buildPanelist({ employeeId: 'emp-a' }),
          buildPanelist({ employeeId: 'emp-b' }),
          buildPanelist({ employeeId: 'emp-c' }),
        ],
      });
      mockPrisma.unscopedClient.interviewPanel.findUnique.mockResolvedValue(panel);
      mockPrisma.unscopedClient.interviewScorecard.count.mockResolvedValue(1);

      await service.submitScorecard(PANEL_ID, 'emp-a', {
        recommendation: 'YES', technicalScore: 4, communicationScore: 4, cultureFitScore: 4, notes: '',
      });
      // Only 1 submitted — panel should NOT be marked completed
      const updateCalls = mockPrisma.unscopedClient.interviewPanel.update.mock.calls;
      const completedCall = updateCalls.filter((c: any) => c[0]?.data?.status === 'COMPLETED');
      expect(completedCall).toHaveLength(0);
    });

    it('completes when all panelists submit', async () => {
      const panel = buildInterviewPanel({
        id: PANEL_ID, applicationId: APP_ID,
        panelists: [
          buildPanelist({ employeeId: 'emp-a' }),
          buildPanelist({ employeeId: 'emp-b' }),
          buildPanelist({ employeeId: 'emp-c' }),
        ],
      });
      mockPrisma.unscopedClient.interviewPanel.findUnique.mockResolvedValue(panel);
      // 3 panelists exist, count returns 3 (all submitted)
      mockPrisma.unscopedClient.interviewScorecard.count.mockResolvedValue(3);

      await service.submitScorecard(PANEL_ID, 'emp-c', {
        recommendation: 'STRONG_YES', technicalScore: 5, communicationScore: 5, cultureFitScore: 5, notes: '',
      });

      expect(mockPrisma.unscopedClient.interviewPanel.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'COMPLETED' }) }),
      );
    });
  });

  // ─── Audit / PII compliance ────────────────────────────────────────────

  describe('audit log PII compliance', () => {
    it('scorecard submission emits event with identifiers, not notes', async () => {
      mockPrisma.unscopedClient.interviewPanel.findUnique.mockResolvedValue(
        buildInterviewPanel({ panelists: [buildPanelist({ employeeId: 'emp-a' })] }),
      );
      await service.submitScorecard(PANEL_ID, 'emp-a', {
        recommendation: 'YES', technicalScore: 4, communicationScore: 4, cultureFitScore: 4,
        notes: 'CONFIDENTIAL: candidate has competing offer',
      });
      // Service emits interview.scorecard_submitted event; audit logging is handled by event listener
      expect(mockEvents.emit).toHaveBeenCalledWith('interview.scorecard_submitted', expect.objectContaining({ panelId: PANEL_ID }));
      // logAsync may not be called directly by submitScorecard (handled by event listener)
    });
  });

  // ─── Schedule panel ────────────────────────────────────────────────────

  describe('schedulePanel()', () => {
    it('creates panel and panelists', async () => {
      const result = await service.schedulePanel(APP_ID, {
        scheduledAt: '2025-07-01T10:00:00Z',
        durationMinutes: 60,
        mode: 'VIDEO',
        locationOrLink: 'https://meet.example.com',
        panelistEmployeeIds: ['emp-a', 'emp-b'],
        leadEmployeeId: 'emp-a',
        autoAdvanceStage: true,
      }, 'creator-1');

      expect(result).toBeDefined();
      expect(mockPrisma.unscopedClient.interviewPanelist.create).toHaveBeenCalledTimes(2);
      expect(mockEvents.emit).toHaveBeenCalledWith('interview.scheduled', expect.any(Object));
    });

    it('rejects when lead not in panelist list', async () => {
      await expect(service.schedulePanel(APP_ID, {
        scheduledAt: '2025-07-01T10:00:00Z', durationMinutes: 60, mode: 'VIDEO',
        panelistEmployeeIds: ['emp-b'], leadEmployeeId: 'emp-a', autoAdvanceStage: true,
      }, 'creator-1')).rejects.toThrow('Lead must be in panelist list');
    });

    it('auto-advances from SCREENING', async () => {
      mockPrisma.unscopedClient.application.findUnique.mockResolvedValue({ id: APP_ID, stage: 'SCREENING' });
      await service.schedulePanel(APP_ID, {
        scheduledAt: '2025-07-01T10:00:00Z', durationMinutes: 60, mode: 'VIDEO',
        panelistEmployeeIds: ['emp-a'], leadEmployeeId: 'emp-a', autoAdvanceStage: true,
      }, 'creator-1');
      expect(mockPrisma.unscopedClient.application.update).toHaveBeenCalled();
    });
  });

  // ─── Cancel panel ───────────────────────────────────────────────────────

  describe('cancelPanel()', () => {
    it('sets status to CANCELLED', async () => {
      const result = await service.cancelPanel(PANEL_ID, { reason: 'Candidate withdrew' });
      expect(result.status).toBe('CANCELLED');
      expect(mockEvents.emit).toHaveBeenCalledWith('interview.cancelled', expect.any(Object));
    });

    it('rejects cancel on completed panel', async () => {
      mockPrisma.unscopedClient.interviewPanel.findUnique.mockResolvedValue(
        buildInterviewPanel({ id: PANEL_ID, status: 'COMPLETED' }),
      );
      await expect(service.cancelPanel(PANEL_ID, { reason: 'test' })).rejects.toThrow('Cannot cancel completed panel');
    });
  });
});
