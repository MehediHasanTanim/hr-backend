import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '@hr/prisma';
import { BenefitPlanService } from '../benefit-plan.service';
import { makeBenefitPlan } from '../../../../../../../test/factories/sprint10.factory';

/* eslint-disable @typescript-eslint/no-explicit-any */

describe('BenefitPlanService', () => {
  let service: BenefitPlanService;
  let mockPrisma: any;

  beforeEach(async () => {
    mockPrisma = {
      unscopedClient: {
        benefitPlan: {
          findUnique: vi.fn().mockResolvedValue(makeBenefitPlan()),
          findMany: vi.fn().mockResolvedValue([makeBenefitPlan()]),
          create: vi.fn().mockImplementation((args: any) => ({ id: 'bp-001', ...args.data })),
          update: vi.fn().mockImplementation((args: any) => ({ id: args.where.id, ...args.data })),
        },
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [BenefitPlanService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    service = module.get(BenefitPlanService);
  });

  afterEach(() => vi.clearAllMocks());

  describe('create', () => {
    it('creates benefit plan with monetary rounding', async () => {
      const result = await service.create({
        companyId: 'comp-1', name: 'Dental', type: 'DENTAL',
        employerContribution: 300.555, employeeContribution: 100.444,
        providerName: 'Delta',
      });
      expect(result.name).toBe('Dental');
      expect(result.employerContribution).toBe('300.56');
      expect(result.employeeContribution).toBe('100.44');
    });
  });

  describe('update', () => {
    it('updates plan fields', async () => {
      mockPrisma.unscopedClient.benefitPlan.findUnique.mockResolvedValue(makeBenefitPlan());
      const result = await service.update('bp-001', { name: 'Updated Dental' });
      expect(result.name).toBe('Updated Dental');
    });

    it('throws NotFoundException for missing plan', async () => {
      mockPrisma.unscopedClient.benefitPlan.findUnique.mockResolvedValue(null);
      await expect(service.update('bad-id', { name: 'X' })).rejects.toThrow(NotFoundException);
    });
  });

  describe('archive', () => {
    it('sets status to ARCHIVED', async () => {
      mockPrisma.unscopedClient.benefitPlan.findUnique.mockResolvedValue(makeBenefitPlan({ status: 'ACTIVE' }));
      await service.archive('bp-001');
      expect(mockPrisma.unscopedClient.benefitPlan.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: 'ARCHIVED' } }),
      );
    });

    it('throws NotFoundException for missing plan', async () => {
      mockPrisma.unscopedClient.benefitPlan.findUnique.mockResolvedValue(null);
      await expect(service.archive('bad-id')).rejects.toThrow(NotFoundException);
    });
  });

  describe('listActive', () => {
    it('returns active plans for company', async () => {
      const result = await service.listActive('comp-1');
      expect(result).toHaveLength(1);
    });
  });

  describe('getById', () => {
    it('returns plan with enrollments', async () => {
      const result = await service.getById('bp-001');
      expect(result).toBeDefined();
    });

    it('throws NotFoundException for missing plan', async () => {
      mockPrisma.unscopedClient.benefitPlan.findUnique.mockResolvedValue(null);
      await expect(service.getById('bad-id')).rejects.toThrow(NotFoundException);
    });
  });
});
