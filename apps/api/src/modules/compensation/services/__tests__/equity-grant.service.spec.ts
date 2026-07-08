import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '@hr/prisma';
import { EquityGrantService } from '../equity-grant.service';
import { makeEquityGrant, makeVestingEvent } from '../../../../../../../test/factories/sprint10.factory';

/* eslint-disable @typescript-eslint/no-explicit-any */

describe('EquityGrantService', () => {
  let service: EquityGrantService;
  let mockPrisma: any;

  beforeEach(async () => {
    mockPrisma = {
      unscopedClient: {
        equityGrant: {
          findUnique: vi.fn().mockResolvedValue(makeEquityGrant()),
          findMany: vi.fn().mockResolvedValue([makeEquityGrant()]),
          create: vi.fn().mockImplementation((args: any) => ({ id: 'eg-001', ...args.data })),
          update: vi.fn().mockImplementation((args: any) => ({ ...args.data })),
        },
        vestingEvent: {
          create: vi.fn().mockResolvedValue({}),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
          findMany: vi.fn().mockResolvedValue([makeVestingEvent()]),
        },
        $transaction: vi.fn().mockImplementation(async (arg: any) => {
          if (Array.isArray(arg)) return Promise.all(arg);
          return arg(mockPrisma.unscopedClient);
        }),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [EquityGrantService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    service = module.get(EquityGrantService);
  });

  afterEach(() => vi.clearAllMocks());

  describe('createGrant', () => {
    it('creates grant with computed vesting schedule', async () => {
      const result = await service.createGrant({
        employeeId: 'emp-1', instrumentType: 'ISO', totalUnits: 1000,
        strikePrice: 10.5, grantDate: '2025-01-01', vestingStartDate: '2025-01-01',
        cliffMonths: 12, vestingDurationMonths: 48, vestingFrequency: 'MONTHLY',
      });
      expect(result.instrumentType).toBe('ISO');
      expect(result.totalUnits).toBe(1000);
      // Vesting events should be created (monthly schedule = 48 events)
      expect(mockPrisma.unscopedClient.vestingEvent.create).toHaveBeenCalled();
    });

    it('generates quarterly vesting schedule', async () => {
      await service.createGrant({
        employeeId: 'emp-1', instrumentType: 'RSU', totalUnits: 500,
        grantDate: '2025-01-01', vestingStartDate: '2025-01-01',
        cliffMonths: 12, vestingDurationMonths: 48, vestingFrequency: 'QUARTERLY',
      });
      expect(mockPrisma.unscopedClient.vestingEvent.create).toHaveBeenCalled();
    });

    it('total vesting units sum equals totalUnits', async () => {
      await service.createGrant({
        employeeId: 'emp-1', instrumentType: 'NSO', totalUnits: 1000,
        grantDate: '2025-01-01', vestingStartDate: '2025-01-01',
        cliffMonths: 12, vestingDurationMonths: 48, vestingFrequency: 'MONTHLY',
      });
      const createCalls = mockPrisma.unscopedClient.vestingEvent.create.mock.calls;
      const sum = createCalls.reduce((acc: number, c: any) => acc + c[0].data.unitsVested, 0);
      expect(sum).toBe(1000);
    });
  });

  describe('cancelGrant', () => {
    it('cancels grant and skips pending events', async () => {
      mockPrisma.unscopedClient.equityGrant.findUnique.mockResolvedValue(makeEquityGrant({ status: 'ACTIVE' }));
      await service.cancelGrant('eg-001');
      expect(mockPrisma.unscopedClient.vestingEvent.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: 'SKIPPED_CLIFF_NOT_MET' } }),
      );
      expect(mockPrisma.unscopedClient.equityGrant.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: 'CANCELLED' } }),
      );
    });

    it('throws NotFoundException for missing grant', async () => {
      mockPrisma.unscopedClient.equityGrant.findUnique.mockResolvedValue(null);
      await expect(service.cancelGrant('bad-id')).rejects.toThrow(NotFoundException);
    });
  });

  describe('getEmployeeGrants', () => {
    it('returns grants with vesting events', async () => {
      const result = await service.getEmployeeGrants('emp-1');
      expect(result).toHaveLength(1);
    });
  });

  describe('getById', () => {
    it('returns grant with vesting events', async () => {
      mockPrisma.unscopedClient.equityGrant.findUnique.mockResolvedValue(makeEquityGrant());
      const result = await service.getById('eg-001');
      expect(result).toBeDefined();
    });

    it('throws NotFoundException for missing grant', async () => {
      mockPrisma.unscopedClient.equityGrant.findUnique.mockResolvedValue(null);
      await expect(service.getById('bad-id')).rejects.toThrow(NotFoundException);
    });
  });
});
