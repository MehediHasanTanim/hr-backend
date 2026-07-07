import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@hr/prisma';
import { SkillTaxonomyService } from '../skill-taxonomy.service';
import { makeSkill } from '../../../../../../../test/factories/sprint9.factory';

/* eslint-disable @typescript-eslint/no-explicit-any */

describe('SkillTaxonomyService', () => {
  let service: SkillTaxonomyService;
  let mockPrisma: any;

  beforeEach(async () => {
    mockPrisma = {
      unscopedClient: {
        skillTaxonomy: {
          findUnique: vi.fn().mockResolvedValue(makeSkill()),
          findMany: vi.fn().mockResolvedValue([makeSkill()]),
          create: vi.fn().mockImplementation((args: any) => ({ id: 'skill-001', ...args.data })),
          update: vi.fn().mockImplementation((args: any) => ({ id: args.where.id, ...args.data })),
        },
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [SkillTaxonomyService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    service = module.get(SkillTaxonomyService);
  });

  afterEach(() => vi.clearAllMocks());

  // ─── Create ─────────────────────────────────────────────────────────

  describe('createSkill', () => {
    it('creates a skill', async () => {
      const result = await service.createSkill({ companyId: 'comp-1', name: 'TypeScript', category: 'Technical' });
      expect(result.name).toBe('TypeScript');
      expect(result.category).toBe('Technical');
    });
  });

  // ─── Update ─────────────────────────────────────────────────────────

  describe('updateSkill', () => {
    it('updates skill fields', async () => {
      mockPrisma.unscopedClient.skillTaxonomy.findUnique.mockResolvedValue(makeSkill());
      const result = await service.updateSkill('skill-001', { name: 'Advanced Python' });
      expect(result.name).toBe('Advanced Python');
    });

    it('throws NotFoundException when skill missing', async () => {
      mockPrisma.unscopedClient.skillTaxonomy.findUnique.mockResolvedValue(null);
      await expect(service.updateSkill('bad-id', { name: 'X' })).rejects.toThrow(NotFoundException);
    });
  });

  // ─── Deprecate ──────────────────────────────────────────────────────

  describe('deprecateSkill', () => {
    it('sets status to DEPRECATED', async () => {
      mockPrisma.unscopedClient.skillTaxonomy.findUnique.mockResolvedValue(makeSkill({ status: 'ACTIVE' }));
      await service.deprecateSkill('skill-001');
      expect(mockPrisma.unscopedClient.skillTaxonomy.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: 'DEPRECATED' } }),
      );
    });

    it('rejects if already DEPRECATED', async () => {
      mockPrisma.unscopedClient.skillTaxonomy.findUnique.mockResolvedValue(makeSkill({ status: 'DEPRECATED' }));
      await expect(service.deprecateSkill('skill-001')).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException when skill missing', async () => {
      mockPrisma.unscopedClient.skillTaxonomy.findUnique.mockResolvedValue(null);
      await expect(service.deprecateSkill('bad-id')).rejects.toThrow(NotFoundException);
    });
  });

  // ─── List ───────────────────────────────────────────────────────────

  describe('listSkills', () => {
    it('returns active skills by default', async () => {
      const result = await service.listSkills({ companyId: 'comp-1' });
      expect(result).toHaveLength(1);
    });
  });

  // ─── Get by ID ──────────────────────────────────────────────────────

  describe('getSkillById', () => {
    it('returns skill', async () => {
      const result = await service.getSkillById('skill-001');
      expect(result).toBeDefined();
    });

    it('throws NotFoundException when missing', async () => {
      mockPrisma.unscopedClient.skillTaxonomy.findUnique.mockResolvedValue(null);
      await expect(service.getSkillById('bad-id')).rejects.toThrow(NotFoundException);
    });
  });
});
