import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@hr/prisma';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AuditService } from '../../../../modules/audit/audit.service';
import { EmployeeCertificationService } from '../employee-certification.service';
import { makeCertification, makeEmployeeCertification } from '../../../../../../../test/factories/sprint9.factory';

/* eslint-disable @typescript-eslint/no-explicit-any */

describe('EmployeeCertificationService', () => {
  let service: EmployeeCertificationService;
  let mockPrisma: any;
  let mockEvents: { emit: ReturnType<typeof vi.fn> };
  let mockAudit: { logAsync: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    mockEvents = { emit: vi.fn() };
    mockAudit = { logAsync: vi.fn().mockResolvedValue(undefined) };

    mockPrisma = {
      unscopedClient: {
        certification: { findUnique: vi.fn().mockResolvedValue(makeCertification({ validityMonths: 36 })) },
        employeeCertification: {
          findUnique: vi.fn().mockResolvedValue(makeEmployeeCertification()),
          findMany: vi.fn().mockResolvedValue([makeEmployeeCertification()]),
          create: vi.fn().mockImplementation((args: any) => ({ id: 'ec-001', ...args.data })),
          update: vi.fn().mockImplementation((args: any) => ({ ...args.data })),
        },
        $transaction: vi.fn().mockImplementation(async (arg: any) => {
          if (Array.isArray(arg)) return Promise.all(arg);
          return arg(mockPrisma.unscopedClient);
        }),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmployeeCertificationService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: EventEmitter2, useValue: mockEvents },
        { provide: AuditService, useValue: mockAudit },
      ],
    }).compile();

    service = module.get(EmployeeCertificationService);
  });

  afterEach(() => vi.clearAllMocks());

  // ─── Record ─────────────────────────────────────────────────────────

  describe('recordCertification', () => {
    it('records certification with computed expiry', async () => {
      const result = await service.recordCertification('emp-001', {
        certificationId: 'cert-001', issuedDate: '2025-01-01', companyId: 'comp-1',
      });
      expect(result.employeeId).toBe('emp-001');
      expect(result.expiryDate).toBeDefined(); // 36 months from Jan 2025
    });

    it('records certification with null expiry when validityMonths is null', async () => {
      mockPrisma.unscopedClient.certification.findUnique.mockResolvedValue(makeCertification({ validityMonths: null }));
      const result = await service.recordCertification('emp-001', {
        certificationId: 'cert-001', issuedDate: '2025-01-01', companyId: 'comp-1',
      });
      expect(result.expiryDate).toBeNull();
    });

    it('throws NotFoundException for missing certification', async () => {
      mockPrisma.unscopedClient.certification.findUnique.mockResolvedValue(null);
      await expect(service.recordCertification('emp-001', {
        certificationId: 'bad-id', issuedDate: '2025-01-01', companyId: 'comp-1',
      })).rejects.toThrow(NotFoundException);
    });
  });

  // ─── Verify ─────────────────────────────────────────────────────────

  describe('verifyCertification', () => {
    it('verifies and emits event + audit log', async () => {
      mockPrisma.unscopedClient.employeeCertification.findUnique.mockResolvedValue(
        makeEmployeeCertification({ verificationStatus: 'UNVERIFIED' }),
      );
      const result = await service.verifyCertification('ec-001', 'admin-1');
      expect(result.verificationStatus).toBe('VERIFIED');
      expect(mockEvents.emit).toHaveBeenCalledWith('certification.verified', expect.any(Object));
    });

    it('rejects already-verified certification', async () => {
      mockPrisma.unscopedClient.employeeCertification.findUnique.mockResolvedValue(
        makeEmployeeCertification({ verificationStatus: 'VERIFIED' }),
      );
      await expect(service.verifyCertification('ec-001', 'admin-1')).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException for missing record', async () => {
      mockPrisma.unscopedClient.employeeCertification.findUnique.mockResolvedValue(null);
      await expect(service.verifyCertification('bad-id', 'admin-1')).rejects.toThrow(NotFoundException);
    });

    it('audit log fires CERTIFICATION_VERIFIED', async () => {
      mockPrisma.unscopedClient.employeeCertification.findUnique.mockResolvedValue(
        makeEmployeeCertification({ verificationStatus: 'UNVERIFIED' }),
      );
      await service.verifyCertification('ec-001', 'admin-1');
      await new Promise<void>((r) => setImmediate(r));
      expect(mockAudit.logAsync).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'CERTIFICATION_VERIFIED' }),
      );
    });
  });

  // ─── Revoke ─────────────────────────────────────────────────────────

  describe('revokeCertification', () => {
    it('sets status to REVOKED', async () => {
      mockPrisma.unscopedClient.employeeCertification.findUnique.mockResolvedValue(makeEmployeeCertification());
      await service.revokeCertification('ec-001', 'admin-1', 'Expired');
      expect(mockPrisma.unscopedClient.employeeCertification.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { verificationStatus: 'REVOKED' } }),
      );
    });

    it('throws NotFoundException for missing record', async () => {
      mockPrisma.unscopedClient.employeeCertification.findUnique.mockResolvedValue(null);
      await expect(service.revokeCertification('bad-id', 'admin-1', 'Test')).rejects.toThrow(NotFoundException);
    });
  });

  // ─── Find ───────────────────────────────────────────────────────────

  describe('findByEmployee', () => {
    it('returns employee certifications', async () => {
      const result = await service.findByEmployee('emp-001');
      expect(result).toHaveLength(1);
    });
  });

  describe('findById', () => {
    it('returns certification with details', async () => {
      mockPrisma.unscopedClient.employeeCertification.findUnique.mockResolvedValue(makeEmployeeCertification());
      const result = await service.findById('ec-001');
      expect(result).toBeDefined();
    });

    it('throws NotFoundException when missing', async () => {
      mockPrisma.unscopedClient.employeeCertification.findUnique.mockResolvedValue(null);
      await expect(service.findById('bad-id')).rejects.toThrow(NotFoundException);
    });
  });
});
