import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '@hr/prisma';
import { HolidayService } from '../services/holiday.service';
import { HolidayCalendarService } from '../services/holiday-calendar.service';

/* eslint-disable @typescript-eslint/no-explicit-any */

describe('HolidayService', () => {
  let service: HolidayService;
  let mockPrisma: any;

  beforeEach(async () => {
    mockPrisma = {
      unscopedClient: {
        holidayCalendar: {
          findFirst: vi.fn().mockResolvedValue({ id: 'cal-1', name: '2025 Calendar', companyId: 'comp-1' }),
        },
        holiday: {
          findFirst: vi.fn().mockResolvedValue(null),
          findMany: vi.fn().mockResolvedValue([]),
          create: vi.fn().mockImplementation((args: any) => ({ id: 'h-1', ...args.data })),
          update: vi.fn().mockImplementation((args: any) => ({ id: args.where.id, ...args.data })),
          delete: vi.fn().mockResolvedValue({}),
        },
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HolidayService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: HolidayCalendarService, useValue: { getCalendarById: vi.fn() } },
      ],
    }).compile();

    service = module.get(HolidayService);
  });

  afterEach(() => vi.clearAllMocks());

  it('adds a holiday', async () => {
    const result = await service.addHoliday('cal-1', 'comp-1', { name: 'New Year', date: new Date('2025-01-01'), type: 'PUBLIC' } as any);
    expect(result.name).toBe('New Year');
  });

  it('lists holidays for a calendar', async () => {
    const result = await service.listHolidays('cal-1', 'comp-1');
    expect(result).toEqual([]);
  });

  it('updates a holiday', async () => {
    mockPrisma.unscopedClient.holiday.findFirst.mockResolvedValueOnce({ id: 'h-1', calendar: { companyId: 'comp-1' } });
    const result = await service.updateHoliday('h-1', 'comp-1', { name: 'Updated' } as any);
    expect(result.name).toBe('Updated');
  });

  it('deletes a holiday', async () => {
    mockPrisma.unscopedClient.holiday.findFirst.mockResolvedValue({ id: 'h-1', calendar: { companyId: 'comp-1' } });
    const result = await service.deleteHoliday('h-1', 'comp-1');
    expect(result.deleted).toBe(true);
  });
});
