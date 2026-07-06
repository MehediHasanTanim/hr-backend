import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { PrismaService } from '@hr/prisma';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AuditService } from '../../../audit/audit.service';
import { ApplicationService } from '../application.service';
import { buildApplication } from '../../../../../../../test/factories/recruitment.factory';

/* eslint-disable @typescript-eslint/no-explicit-any */

const ALL_STAGES = ['APPLIED', 'SCREENING', 'INTERVIEW', 'OFFER', 'HIRED', 'REJECTED', 'WITHDRAWN'] as const;

const VALID_TRANSITIONS: Record<string, string[]> = {
  APPLIED: ['SCREENING', 'REJECTED', 'WITHDRAWN'],
  SCREENING: ['INTERVIEW', 'REJECTED', 'WITHDRAWN'],
  INTERVIEW: ['OFFER', 'REJECTED', 'WITHDRAWN'],
  OFFER: ['REJECTED', 'WITHDRAWN'], // HIRED is only via OfferService.accept, not moveStage
  HIRED: [],
  REJECTED: [],
  WITHDRAWN: [],
};

describe('ApplicationService', () => {
  let service: ApplicationService;
  let mockPrisma: any;
  let mockAudit: { logAsync: ReturnType<typeof vi.fn>; stripPii: ReturnType<typeof vi.fn> };
  let mockEvents: { emit: ReturnType<typeof vi.fn> };

  function stubApp(stage: string = 'APPLIED') {
    return buildApplication({ id: 'app-001', stage: stage as any });
  }

  beforeEach(async () => {
    mockAudit = {
      logAsync: vi.fn().mockResolvedValue(undefined),
      stripPii: vi.fn((obj: Record<string, unknown>) => {
        const deny = new Set(['base64Signature', 'passwordHash', 'otpCode', 'rawToken', 'signedUrl', 'profile_data', 'email', 'phone']);
        return Object.fromEntries(Object.entries(obj).filter(([k]) => !deny.has(k)));
      }),
    };

    mockEvents = { emit: vi.fn() };

    mockPrisma = {
      unscopedClient: {
        application: {
          findUnique: vi.fn().mockResolvedValue(stubApp()),
          update: vi.fn().mockImplementation((args: any) => ({ ...stubApp(), ...args.data })),
        },
        interviewScorecard: { findMany: vi.fn().mockResolvedValue([]) },
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ApplicationService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditService, useValue: mockAudit },
        { provide: EventEmitter2, useValue: mockEvents },
      ],
    }).compile();

    service = module.get(ApplicationService);
  });

  afterEach(() => vi.clearAllMocks());

  // ─── 1.2 Valid transitions ─────────────────────────────────────────────

  describe('moveStage — valid transitions', () => {
    for (const [from, targets] of Object.entries(VALID_TRANSITIONS)) {
      for (const to of targets) {
        it(`${from} → ${to}`, async () => {
          mockPrisma.unscopedClient.application.findUnique.mockResolvedValue(stubApp(from));
          const result = await service.moveStage('app-001', to as any, 'actor-1');
          expect(result.stage).toBe(to);
          expect(result.lastStageChangeAt).toBeDefined();
          expect(mockEvents.emit).toHaveBeenCalledWith('application.stage_changed', expect.objectContaining({ priorStage: from, newStage: to }));

          await new Promise<void>((r) => setImmediate(r));
          expect(mockAudit.logAsync).toHaveBeenCalledWith(expect.objectContaining({ action: 'APPLICATION_STAGE_MOVED' }));
        });
      }
    }
  });

  // ─── 1.3 Invalid transitions ───────────────────────────────────────────

  describe('moveStage — invalid transitions', () => {
    const invalidCases: [string, string][] = [
      ['APPLIED', 'HIRED'], ['APPLIED', 'OFFER'],
      ['SCREENING', 'HIRED'],
      ['REJECTED', 'SCREENING'], ['REJECTED', 'INTERVIEW'],
      ['WITHDRAWN', 'SCREENING'],
      ['HIRED', 'SCREENING'], ['HIRED', 'INTERVIEW'], ['HIRED', 'OFFER'], ['HIRED', 'APPLIED'],
    ];

    it.each(invalidCases)('%s → %s throws', async (from, to) => {
      mockPrisma.unscopedClient.application.findUnique.mockResolvedValue(stubApp(from));
      await expect(service.moveStage('app-001', to as any, 'actor-1')).rejects.toThrow(BadRequestException);
      expect(mockEvents.emit).not.toHaveBeenCalled();
      expect(mockAudit.logAsync).not.toHaveBeenCalled();
    });
  });

  // ─── 1.4 Rejected terminal ─────────────────────────────────────────────

  describe('rejected terminal', () => {
    it('rejects moveStage from rejected', async () => {
      mockPrisma.unscopedClient.application.findUnique.mockResolvedValue(stubApp('REJECTED'));
      await expect(service.moveStage('app-001', 'INTERVIEW', 'actor-1')).rejects.toThrow(BadRequestException);
    });

    it('re-rejection throws', async () => {
      mockPrisma.unscopedClient.application.findUnique.mockResolvedValue(stubApp('REJECTED'));
      await expect(service.reject('app-001', 'reason', 'actor-1')).rejects.toThrow(BadRequestException);
    });
  });

  // ─── 1.5 Hired terminal ────────────────────────────────────────────────

  describe('hired terminal', () => {
    it('moveStage to HIRED is rejected directly', async () => {
      mockPrisma.unscopedClient.application.findUnique.mockResolvedValue(stubApp('OFFER'));
      await expect(service.moveStage('app-001', 'HIRED', 'actor-1')).rejects.toThrow('Cannot directly set HIRED stage');
    });

    it('from HIRED, all transitions rejected', async () => {
      for (const target of ALL_STAGES) {
        mockPrisma.unscopedClient.application.findUnique.mockResolvedValue(stubApp('HIRED'));
        await expect(service.moveStage('app-001', target, 'actor-1')).rejects.toThrow(BadRequestException);
      }
    });
  });

  // ─── 1.7 Score isolation ───────────────────────────────────────────────

  describe('score isolation', () => {
    it('moveStage does not call updateScore', async () => {
      const spy = vi.spyOn(service, 'updateScore');
      await service.moveStage('app-001', 'SCREENING', 'actor-1');
      expect(spy).not.toHaveBeenCalled();
    });
  });

  // ─── reject ─────────────────────────────────────────────────────────────

  describe('reject', () => {
    it('sets rejected stage and reason', async () => {
      const result = await service.reject('app-001', 'Not a fit', 'actor-1');
      expect(result.stage).toBe('REJECTED');
      expect(result.rejectionReason).toBe('Not a fit');

      expect(mockEvents.emit).toHaveBeenCalledWith('application.rejected', expect.objectContaining({ reason: 'Not a fit' }));
      await new Promise<void>((r) => setImmediate(r));
      expect(mockAudit.logAsync).toHaveBeenCalledWith(expect.objectContaining({ action: 'APPLICATION_REJECTED' }));
    });
  });

  // ─── hireApplication (internal) ─────────────────────────────────────────

  describe('hireApplication — internal', () => {
    it('sets HIRED stage', async () => {
      const result = await service.hireApplication('app-001');
      expect(result.stage).toBe('HIRED');
    });

    it('works with transaction client', async () => {
      const txMock = {
        application: { update: vi.fn().mockResolvedValue({ ...stubApp('OFFER'), stage: 'HIRED' }) },
      };
      const result = await service.hireApplication('app-001', txMock as any);
      expect(txMock.application.update).toHaveBeenCalled();
      expect(result.stage).toBe('HIRED');
    });
  });

  // ─── Property-based: all 49 combos ──────────────────────────────────────

  describe('state machine completeness', () => {
    for (const from of ALL_STAGES) {
      for (const to of ALL_STAGES) {
        const expectedValid = (VALID_TRANSITIONS[from] ?? []).includes(to);
        it(`${from} → ${to} is ${expectedValid ? 'valid' : 'invalid'}`, async () => {
          mockPrisma.unscopedClient.application.findUnique.mockResolvedValue(stubApp(from));
          if (expectedValid) {
            await expect(service.moveStage('app-001', to, 'actor-1')).resolves.toBeDefined();
          } else {
            await expect(service.moveStage('app-001', to, 'actor-1')).rejects.toThrow();
          }
        });
      }
    }
  });
});
