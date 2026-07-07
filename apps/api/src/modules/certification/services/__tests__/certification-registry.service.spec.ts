import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '@hr/prisma';
import { CertificationRegistryService } from '../certification-registry.service';
import { makeCertification } from '../../../../../../../test/factories/sprint9.factory';

/* eslint-disable @typescript-eslint/no-explicit-any */

describe('CertificationRegistryService', () => {
  let service: CertificationRegistryService;
  let mockPrisma: any;

  beforeEach(async () => {
    mockPrisma = {
      unscopedClient: {
        certification: {
          findUnique: vi.fn().mockResolvedValue(makeCertification()),
          findMany: vi.fn().mockResolvedValue([makeCertification()]),
          create: vi.fn().mockImplementation((args: any) => ({ id: 'cert-001', ...args.data })),
          update: vi.fn().mockImplementation((args: any) => ({ id: args.where.id, ...args.data })),
        },
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [CertificationRegistryService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    service = module.get(CertificationRegistryService);
  });

  afterEach(() => vi.clearAllMocks());

  // ─── Create ─────────────────────────────────────────────────────────

  describe('create', () => {
    it('creates certification with skills', async () => {
      const result = await service.create({
        companyId: 'comp-1', name: 'AWS Pro', issuingBody: 'Amazon',
        validityMonths: 36, isMandatoryForCompliance: true, skillIds: ['skill-001'],
      });
      expect(result.name).toBe('AWS Pro');
      expect(result.isMandatoryForCompliance).toBe(true);
    });

    it('creates certification without skills', async () => {
      const result = await service.create({
        companyId: 'comp-1', name: 'Basic', issuingBody: 'N/A',
        validityMonths: null, isMandatoryForCompliance: false,
      });
      expect(result.name).toBe('Basic');
    });
  });

  // ─── Update ─────────────────────────────────────────────────────────

  describe('update', () => {
    it('updates certification fields', async () => {
      mockPrisma.unscopedClient.certification.findUnique.mockResolvedValue(makeCertification());
      const result = await service.update('cert-001', { name: 'Updated' });
      expect(result.name).toBe('Updated');
    });

    it('throws NotFoundException when missing', async () => {
      mockPrisma.unscopedClient.certification.findUnique.mockResolvedValue(null);
      await expect(service.update('bad-id', { name: 'X' })).rejects.toThrow(NotFoundException);
    });
  });

  // ─── List ───────────────────────────────────────────────────────────

  describe('list', () => {
    it('returns certifications with related skills', async () => {
      const result = await service.list('comp-1');
      expect(result).toHaveLength(1);
    });
  });

  // ─── Get by ID ──────────────────────────────────────────────────────

  describe('getById', () => {
    it('returns certification', async () => {
      const result = await service.getById('cert-001');
      expect(result).toBeDefined();
    });

    it('throws NotFoundException when missing', async () => {
      mockPrisma.unscopedClient.certification.findUnique.mockResolvedValue(null);
      await expect(service.getById('bad-id')).rejects.toThrow(NotFoundException);
    });
  });
});
