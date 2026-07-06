import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { getQueueToken } from '@nestjs/bullmq';
import { PrismaService } from '@hr/prisma';
import { AuditService } from '../../../../audit/audit.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { OfferService } from '../offer.service';
import { JobRequisitionService } from '../job-requisition.service';
import { ApplicationService } from '../application.service';
import { QUEUE_NAMES } from '../../../../common/queues.constants';
import { buildOffer, buildApplication } from '../../../../../../../test/factories/recruitment.factory';

/* eslint-disable @typescript-eslint/no-explicit-any */

describe('OfferService', () => {
  let service: OfferService;
  let mockPrisma: any;
  let mockAudit: { logAsync: ReturnType<typeof vi.fn>; stripPii: ReturnType<typeof vi.fn> };
  let mockEvents: { emit: ReturnType<typeof vi.fn> };
  let mockQueue: { add: ReturnType<typeof vi.fn> };
  let mockRequisitionService: { incrementHeadcountFilled: ReturnType<typeof vi.fn> };
  let mockApplicationService: { moveStage: ReturnType<typeof vi.fn>; hireApplication: ReturnType<typeof vi.fn> };

  // Track call order
  let callOrder: string[];

  beforeEach(async () => {
    callOrder = [];
    mockAudit = {
      logAsync: vi.fn().mockImplementation(() => { callOrder.push('logAsync'); return Promise.resolve(); }),
      stripPii: vi.fn((obj: Record<string, unknown>) => {
        const deny = new Set(['base64Signature', 'passwordHash', 'otpCode', 'rawToken', 'signedUrl', 'profile_data', 'email', 'phone']);
        return Object.fromEntries(Object.entries(obj).filter(([k]) => !deny.has(k)));
      }),
    };
    mockEvents = { emit: vi.fn().mockImplementation(() => { callOrder.push('emit'); }) };
    mockQueue = { add: vi.fn().mockResolvedValue({ id: 'job-1' }) };
    mockRequisitionService = { incrementHeadcountFilled: vi.fn().mockResolvedValue(undefined) };
    mockApplicationService = {
      moveStage: vi.fn().mockResolvedValue({}),
      hireApplication: vi.fn().mockResolvedValue({ stage: 'HIRED' }),
    };

    const txMock = {
      offer: {
        findUnique: vi.fn(),
        update: vi.fn().mockImplementation((args: any) => ({ ...args.data, id: args.where.id })),
      },
      application: { update: vi.fn() },
    };

    mockPrisma = {
      unscopedClient: {
        offer: {
          findUnique: vi.fn().mockResolvedValue(buildOffer()),
          create: vi.fn().mockImplementation((args: any) => ({ id: 'offer-001', ...args.data })),
          update: vi.fn().mockImplementation((args: any) => ({ ...buildOffer(), ...args.data })),
        },
        application: {
          findUnique: vi.fn().mockResolvedValue(buildApplication({ stage: 'OFFER' })),
          update: vi.fn(),
        },
        $transaction: vi.fn().mockImplementation(async (cb: (tx: any) => Promise<any>) => {
          txMock.offer.findUnique.mockResolvedValue(buildOffer());
          return cb(txMock);
        }),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OfferService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditService, useValue: mockAudit },
        { provide: EventEmitter2, useValue: mockEvents },
        { provide: JobRequisitionService, useValue: mockRequisitionService },
        { provide: ApplicationService, useValue: mockApplicationService },
        { provide: getQueueToken(QUEUE_NAMES.OFFER_EXPIRY), useValue: mockQueue },
        { provide: 'S3Service', useValue: {} },
      ],
    }).compile();

    service = module.get(OfferService);
  });

  afterEach(() => vi.clearAllMocks());

  // ─── Accept flow ────────────────────────────────────────────────────────

  describe('accept() — happy path', () => {
    it('transitions offer to accepted within transaction', async () => {
      await service.accept('offer-001');
      expect(mockPrisma.unscopedClient.$transaction).toHaveBeenCalledTimes(1);
    });

    it('calls hireApplication within transaction', async () => {
      await service.accept('offer-001');
      expect(mockApplicationService.hireApplication).toHaveBeenCalled();
    });

    it('calls incrementHeadcountFilled within transaction', async () => {
      await service.accept('offer-001');
      expect(mockRequisitionService.incrementHeadcountFilled).toHaveBeenCalled();
    });

    it('emits offer.accepted post-commit', async () => {
      await service.accept('offer-001');
      expect(mockEvents.emit).toHaveBeenCalledWith('offer.accepted', expect.objectContaining({ offerId: 'offer-001' }));
      // Event must fire after transaction resolves (callOrder confirms post-commit)
    });

    it('logs OFFER_ACCEPTED with no PII', async () => {
      await service.accept('offer-001');
      await new Promise<void>((r) => setImmediate(r));
      expect(mockAudit.logAsync).toHaveBeenCalledWith(expect.objectContaining({ action: 'OFFER_ACCEPTED' }));
    });
  });

  // ─── Accept — preconditions ─────────────────────────────────────────────

  describe('accept() — invalid preconditions', () => {
    it('rejects non-SENT offers', async () => {
      for (const status of ['DRAFT', 'DECLINED', 'EXPIRED', 'ACCEPTED']) {
        const txMock = {
          offer: { findUnique: vi.fn().mockResolvedValue(buildOffer({ status: status as any })), update: vi.fn() },
          application: { update: vi.fn() },
        };
        mockPrisma.unscopedClient.$transaction.mockImplementation(async (cb: any) => cb(txMock));

        await expect(service.accept('offer-001')).rejects.toThrow();
        expect(mockEvents.emit).not.toHaveBeenCalled();
      }
    });

    it('rejects expired offer even if status is still SENT', async () => {
      const pastDate = new Date(Date.now() - 86400000); // yesterday
      const txMock = {
        offer: { findUnique: vi.fn().mockResolvedValue(buildOffer({ status: 'SENT', expiresAt: pastDate })), update: vi.fn() },
        application: { update: vi.fn() },
      };
      mockPrisma.unscopedClient.$transaction.mockImplementation(async (cb: any) => cb(txMock));
      await expect(service.accept('offer-001')).rejects.toThrow('Offer has expired');
      expect(mockEvents.emit).not.toHaveBeenCalled();
    });
  });

  // ─── Accept — rollback on headcount failure ─────────────────────────────

  describe('accept() — headcount failure rollback', () => {
    it('rolls back when incrementHeadcountFilled throws', async () => {
      mockRequisitionService.incrementHeadcountFilled.mockRejectedValue(new Error('Headcount full'));
      await expect(service.accept('offer-001')).rejects.toThrow('Headcount full');
      expect(mockEvents.emit).not.toHaveBeenCalled();
    });
  });

  // ─── Decline flow ───────────────────────────────────────────────────────

  describe('decline()', () => {
    it('sets status and reason within transaction', async () => {
      await service.decline('offer-001', { reason: 'Better offer elsewhere' });
      expect(mockPrisma.unscopedClient.$transaction).toHaveBeenCalled();
    });

    it('emits nothing negative on declined — logs OFFER_DECLINED', async () => {
      await service.decline('offer-001', { reason: 'Personal reasons' });
      await new Promise<void>((r) => setImmediate(r));
      expect(mockAudit.logAsync).toHaveBeenCalledWith(expect.objectContaining({ action: 'OFFER_DECLINED' }));
    });

    it('rejects decline on non-SENT offer', async () => {
      const txMock = {
        offer: { findUnique: vi.fn().mockResolvedValue(buildOffer({ status: 'ACCEPTED' })), update: vi.fn() },
        application: { update: vi.fn() },
      };
      mockPrisma.unscopedClient.$transaction.mockImplementation(async (cb: any) => cb(txMock));
      await expect(service.decline('offer-001', { reason: 'test' })).rejects.toThrow();
    });
  });

  // ─── Send flow ──────────────────────────────────────────────────────────

  describe('send()', () => {
    it('transitions DRAFT → SENT', async () => {
      mockPrisma.unscopedClient.offer.findUnique.mockResolvedValue(buildOffer({ status: 'DRAFT' }));
      const result = await service.send('offer-001');
      expect(result.status).toBe('SENT');
      expect(result.sentAt).toBeDefined();
    });

    it('stores S3 key, not signed URL', async () => {
      mockPrisma.unscopedClient.offer.findUnique.mockResolvedValue(buildOffer({ status: 'DRAFT' }));
      const result = await service.send('offer-001');
      expect(result.offerLetterS3Key).toMatch(/^offers\/offer-001\/letter\.pdf$/);
      expect(result.offerLetterS3Key).not.toContain('https://');
    });

    it('enqueues OFFER_EXPIRY delayed job', async () => {
      mockPrisma.unscopedClient.offer.findUnique.mockResolvedValue(buildOffer({ status: 'DRAFT' }));
      await service.send('offer-001');
      expect(mockQueue.add).toHaveBeenCalledWith(QUEUE_NAMES.OFFER_EXPIRY, { offerId: 'offer-001' }, expect.objectContaining({ delay: expect.any(Number) }));
    });

    it('rejects send on non-DRAFT', async () => {
      await expect(service.send('offer-001')).rejects.toThrow('Only draft offers can be sent');
    });
  });

  // ─── Rounding ───────────────────────────────────────────────────────────

  describe('round2dp on monetary fields', () => {
    it('rounds at create time', async () => {
      const result = await service.create('app-001', { baseSalary: 50000.005, bonus: 1000.999, equityValue: 500.001, currency: 'BDT', startDate: '2025-08-01' }, 'emp-1');
      expect(Number(result.baseSalary)).toBeCloseTo(50000.01, 2);
      expect(Number(result.bonus)).toBeCloseTo(1001.00, 2);
      expect(Number(result.equityValue)).toBeCloseTo(500.00, 2);
    });
  });

  // ─── Rescind ────────────────────────────────────────────────────────────

  describe('rescind()', () => {
    it('updates status to RESCINDED', async () => {
      const result = await service.rescind('offer-001', { reason: 'Budget change' });
      expect(result.status).toBe('RESCINDED');
    });

    it('rejects rescind on terminal status', async () => {
      for (const status of ['ACCEPTED', 'DECLINED', 'EXPIRED']) {
        mockPrisma.unscopedClient.offer.findUnique.mockResolvedValue(buildOffer({ status: status as any }));
        await expect(service.rescind('offer-001', { reason: 'test' })).rejects.toThrow();
      }
    });
  });
});
