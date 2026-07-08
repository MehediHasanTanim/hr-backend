import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '@hr/prisma';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { VestingCronProcessor } from '../../processors/vesting-cron.processor';
import { makeEquityGrant, makeVestingEvent } from '../../../../../../../test/factories/sprint10.factory';

/* eslint-disable @typescript-eslint/no-explicit-any */

describe('VestingCronProcessor', () => {
  let processor: VestingCronProcessor;
  let mockPrisma: any;
  let mockEvents: { emit: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    mockEvents = { emit: vi.fn() };
    mockPrisma = {
      unscopedClient: {
        vestingEvent: {
          findMany: vi.fn().mockResolvedValue([]),
          update: vi.fn().mockResolvedValue({}),
        },
        equityGrant: {
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
        VestingCronProcessor,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: EventEmitter2, useValue: mockEvents },
      ],
    }).compile();

    processor = module.get(VestingCronProcessor);
  });

  afterEach(() => vi.clearAllMocks());

  describe('processDueVestingEvents', () => {
    it('processes pending events past due date', async () => {
      const grant = makeEquityGrant({ totalUnits: 1000, vestedUnits: 20 });
      const dueEvent = makeVestingEvent({ vestDate: new Date('2025-01-01'), unitsVested: 20, status: 'PENDING', grant });
      mockPrisma.unscopedClient.vestingEvent.findMany.mockResolvedValue([{ ...dueEvent, grant }]);

      await processor.processDueVestingEvents();

      expect(mockPrisma.unscopedClient.vestingEvent.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'PROCESSED' }) }),
      );
      expect(mockEvents.emit).toHaveBeenCalledWith('vesting.event_processed', expect.any(Object));
    });

    it('sets grant to FULLY_VESTED when all units vested', async () => {
      const grant = makeEquityGrant({ totalUnits: 100, vestedUnits: 80 });
      const dueEvent = makeVestingEvent({ vestDate: new Date('2025-01-01'), unitsVested: 20, status: 'PENDING', grant });
      mockPrisma.unscopedClient.vestingEvent.findMany.mockResolvedValue([{ ...dueEvent, grant }]);

      await processor.processDueVestingEvents();

      expect(mockPrisma.unscopedClient.equityGrant.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ vestedUnits: 100, status: 'FULLY_VESTED' }) }),
      );
    });

    it('skips when no pending events exist', async () => {
      mockPrisma.unscopedClient.vestingEvent.findMany.mockResolvedValue([]);
      await processor.processDueVestingEvents();
      expect(mockPrisma.unscopedClient.vestingEvent.update).not.toHaveBeenCalled();
      expect(mockEvents.emit).not.toHaveBeenCalled();
    });

    it('does not process future-dated events (filtered by query)', async () => {
      // The query filters for vestDate <= today, so future events won't be returned
      mockPrisma.unscopedClient.vestingEvent.findMany.mockResolvedValue([]);
      await processor.processDueVestingEvents();
      expect(mockPrisma.unscopedClient.vestingEvent.update).not.toHaveBeenCalled();
    });
  });
});
