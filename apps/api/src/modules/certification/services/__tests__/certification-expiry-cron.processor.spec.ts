import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '@hr/prisma';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AuditService } from '../../../../modules/audit/audit.service';
import { CertificationExpiryCronProcessor } from '../../processors/certification-expiry-cron.processor';
import { makeEmployeeCertification } from '../../../../../../../test/factories/sprint9.factory';

/* eslint-disable @typescript-eslint/no-explicit-any */

describe('CertificationExpiryCronProcessor', () => {
  let processor: CertificationExpiryCronProcessor;
  let mockPrisma: any;
  let mockEvents: { emit: ReturnType<typeof vi.fn> };
  let mockAudit: { logAsync: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    mockEvents = { emit: vi.fn() };
    mockAudit = { logAsync: vi.fn().mockResolvedValue(undefined) };

    mockPrisma = {
      unscopedClient: {
        employeeCertification: {
          findMany: vi.fn().mockResolvedValue([]),
          update: vi.fn().mockResolvedValue({}),
        },
        $transaction: vi.fn().mockImplementation(async (arg: any) => {
          if (Array.isArray(arg)) return Promise.all(arg);
          return arg(mockPrisma.unscopedClient);
        }),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CertificationExpiryCronProcessor,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: EventEmitter2, useValue: mockEvents },
        { provide: AuditService, useValue: mockAudit },
      ],
    }).compile();

    processor = module.get(CertificationExpiryCronProcessor);
  });

  afterEach(() => vi.clearAllMocks());

  describe('processDailyExpiryCheck', () => {
    it('transitions past-due certs to EXPIRED', async () => {
      const yesterday = new Date(Date.now() - 86400000);
      mockPrisma.unscopedClient.employeeCertification.findMany.mockResolvedValue([
        makeEmployeeCertification({ id: 'ec-1', expiryDate: yesterday, verificationStatus: 'UNVERIFIED' }),
      ]);

      await processor.processDailyExpiryCheck();

      expect(mockPrisma.unscopedClient.employeeCertification.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'ec-1' }, data: { verificationStatus: 'EXPIRED' } }),
      );
      expect(mockEvents.emit).toHaveBeenCalledWith('certification.expired', expect.any(Object));
    });

    it('does not transition already-EXPIRED certs', async () => {
      mockPrisma.unscopedClient.employeeCertification.findMany.mockResolvedValue([
        makeEmployeeCertification({ id: 'ec-1', expiryDate: new Date(), verificationStatus: 'EXPIRED' }),
      ]);
      // The where clause filters out EXPIRED, so findMany returns empty
      mockPrisma.unscopedClient.employeeCertification.findMany.mockResolvedValue([]);

      await processor.processDailyExpiryCheck();

      expect(mockPrisma.unscopedClient.employeeCertification.update).not.toHaveBeenCalled();
    });

    it('emits warning for certs expiring in 30 days', async () => {
      const in30Days = new Date(Date.now() + 30 * 86400000);
      mockPrisma.unscopedClient.employeeCertification.findMany.mockResolvedValue([
        makeEmployeeCertification({ id: 'ec-1', expiryDate: in30Days, verificationStatus: 'UNVERIFIED' }),
      ]);

      await processor.processDailyExpiryCheck();

      expect(mockEvents.emit).toHaveBeenCalledWith('certification.expiry-warning', expect.objectContaining({ daysUntilExpiry: 30 }));
    });

    it('emits warning for certs expiring in 14 days', async () => {
      const in14Days = new Date(Date.now() + 14 * 86400000);
      mockPrisma.unscopedClient.employeeCertification.findMany.mockResolvedValue([
        makeEmployeeCertification({ id: 'ec-1', expiryDate: in14Days, verificationStatus: 'UNVERIFIED' }),
      ]);

      await processor.processDailyExpiryCheck();

      expect(mockEvents.emit).toHaveBeenCalledWith('certification.expiry-warning', expect.objectContaining({ daysUntilExpiry: 14 }));
    });

    it('emits warning for certs expiring in 7 days', async () => {
      const in7Days = new Date(Date.now() + 7 * 86400000);
      mockPrisma.unscopedClient.employeeCertification.findMany.mockResolvedValue([
        makeEmployeeCertification({ id: 'ec-1', expiryDate: in7Days, verificationStatus: 'UNVERIFIED' }),
      ]);

      await processor.processDailyExpiryCheck();

      expect(mockEvents.emit).toHaveBeenCalledWith('certification.expiry-warning', expect.objectContaining({ daysUntilExpiry: 7 }));
    });

    it('no warning for non-standard days (e.g. 20 days)', async () => {
      const in20Days = new Date(Date.now() + 20 * 86400000);
      const warnSpy = vi.fn();
      mockEvents.emit = warnSpy;
      mockPrisma.unscopedClient.employeeCertification.findMany.mockResolvedValue([
        makeEmployeeCertification({ id: 'ec-1', expiryDate: in20Days, verificationStatus: 'UNVERIFIED' }),
      ]);

      await processor.processDailyExpiryCheck();

      // Only expired event for past-due, no warning for 20 days
      const warningCalls = warnSpy.mock.calls.filter((c: any[]) => c[0] === 'certification.expiry-warning');
      expect(warningCalls).toHaveLength(0);
    });

    it('audit log fires for expired certifications', async () => {
      const yesterday = new Date(Date.now() - 86400000);
      mockPrisma.unscopedClient.employeeCertification.findMany.mockResolvedValue([
        makeEmployeeCertification({ id: 'ec-1', expiryDate: yesterday, verificationStatus: 'VERIFIED' }),
      ]);

      await processor.processDailyExpiryCheck();
      await new Promise<void>((r) => setImmediate(r));

      expect(mockAudit.logAsync).toHaveBeenCalledWith(expect.objectContaining({ action: 'CERTIFICATION_EXPIRED' }));
    });
  });
});
