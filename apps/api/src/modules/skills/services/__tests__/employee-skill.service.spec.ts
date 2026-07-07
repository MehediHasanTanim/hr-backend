import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@hr/prisma';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AuditService } from '../../../../modules/audit/audit.service';
import { EmployeeSkillService } from '../employee-skill.service';
import { makeSkill, makeEmployeeSkill } from '../../../../../../../test/factories/sprint9.factory';

/* eslint-disable @typescript-eslint/no-explicit-any */

describe('EmployeeSkillService', () => {
  let service: EmployeeSkillService;
  let mockPrisma: any;
  let mockEvents: { emit: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    mockEvents = { emit: vi.fn() };
    mockPrisma = {
      unscopedClient: {
        skillTaxonomy: { findUnique: vi.fn().mockResolvedValue(makeSkill()) },
        employeeSkill: {
          findUnique: vi.fn().mockResolvedValue(null),
          findMany: vi.fn().mockResolvedValue([]),
          upsert: vi.fn().mockImplementation((args: any) => ({ id: 'es-001', ...args.create })),
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
        EmployeeSkillService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: EventEmitter2, useValue: mockEvents },
        { provide: AuditService, useValue: { logAsync: vi.fn() } },
      ],
    }).compile();

    service = module.get(EmployeeSkillService);
  });

  afterEach(() => vi.clearAllMocks());

  // ─── Self Assessment ────────────────────────────────────────────────

  describe('selfAssess', () => {
    it('upserts new self-assessment', async () => {
      const result = await service.selfAssess('emp-001', 'skill-001', 4);
      expect(result.selfAssessedLevel).toBe(4);
    });

    it('resets validation when self-assessment changes after validation', async () => {
      mockPrisma.unscopedClient.employeeSkill.findUnique.mockResolvedValue(
        makeEmployeeSkill({ selfAssessedLevel: 3, validationStatus: 'VALIDATED', managerValidatedLevel: 3 }),
      );
      await service.selfAssess('emp-001', 'skill-001', 5);
      expect(mockPrisma.unscopedClient.employeeSkill.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ validationStatus: 'PENDING', selfAssessedLevel: 5 }) }),
      );
    });

    it('rejects inactive skill', async () => {
      mockPrisma.unscopedClient.skillTaxonomy.findUnique.mockResolvedValue(makeSkill({ status: 'DEPRECATED' }));
      await expect(service.selfAssess('emp-001', 'skill-001', 3)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── Manager Validation ─────────────────────────────────────────────

  describe('managerValidate', () => {
    it('validates when within threshold', async () => {
      mockPrisma.unscopedClient.employeeSkill.findUnique.mockResolvedValue(
        makeEmployeeSkill({ selfAssessedLevel: 3, validationStatus: 'PENDING' }),
      );
      const result = await service.managerValidate('es-001', 3, 'mgr-1');
      expect(result.validationStatus).toBe('VALIDATED');
    });

    it('disputes when difference exceeds threshold', async () => {
      mockPrisma.unscopedClient.employeeSkill.findUnique.mockResolvedValue(
        makeEmployeeSkill({ selfAssessedLevel: 5, validationStatus: 'PENDING' }),
      );
      const result = await service.managerValidate('es-001', 1, 'mgr-1', 2);
      expect(result.validationStatus).toBe('DISPUTED');
      expect(mockEvents.emit).toHaveBeenCalledWith('skill.disputed', expect.any(Object));
    });

    it('throws NotFoundException for missing record', async () => {
      mockPrisma.unscopedClient.employeeSkill.findUnique.mockResolvedValue(null);
      await expect(service.managerValidate('bad-id', 3, 'mgr-1')).rejects.toThrow(NotFoundException);
    });
  });

  // ─── Gap Analysis ───────────────────────────────────────────────────

  describe('getGapAnalysis', () => {
    it('computes positive deltas for under-skilled employees', async () => {
      mockPrisma.unscopedClient.employeeSkill.findMany.mockResolvedValue([
        makeEmployeeSkill({ employeeId: 'emp-1', skillId: 'skill-001', selfAssessedLevel: 2 }),
      ]);
      const result = await service.getGapAnalysis(undefined, { 'skill-001': 4 });
      expect(result.gapsByEmployee['emp-1']['skill-001']).toBe(2);
    });

    it('computes negative deltas for over-skilled employees', async () => {
      mockPrisma.unscopedClient.employeeSkill.findMany.mockResolvedValue([
        makeEmployeeSkill({ employeeId: 'emp-1', skillId: 'skill-001', selfAssessedLevel: 5 }),
      ]);
      const result = await service.getGapAnalysis(undefined, { 'skill-001': 3 });
      expect(result.gapsByEmployee['emp-1']['skill-001']).toBe(-2);
    });
  });
});
