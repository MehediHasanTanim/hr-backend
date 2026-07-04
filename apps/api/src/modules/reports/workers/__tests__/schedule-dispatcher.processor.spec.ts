import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { BullModule } from '@nestjs/bullmq';
import { QUEUE_NAMES } from '../../../../common/queues.constants';
import { ReportScheduleService } from '../../services/report-schedule.service';
import { ScheduleDispatcherProcessor } from '../schedule-dispatcher.processor';

/* eslint-disable @typescript-eslint/no-explicit-any */

describe('ScheduleDispatcherProcessor', () => {
  let processor: ScheduleDispatcherProcessor;
  let mockReportScheduleService: {
    findDueSchedules: ReturnType<typeof vi.fn>;
    enqueueBySchedule: ReturnType<typeof vi.fn>;
  };

  const mockSchedule = (id: string) => ({
    id,
    savedReportId: 'saved-report-uuid',
    cronExpression: '0 9 * * MON',
    format: 'xlsx',
    isActive: true,
    nextRunAt: new Date(Date.now() - 1000),
    createdAt: new Date(),
  });

  beforeEach(async () => {
    mockReportScheduleService = {
      findDueSchedules: vi.fn().mockResolvedValue([]),
      enqueueBySchedule: vi.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      imports: [
        BullModule.registerQueue({ name: QUEUE_NAMES.SCHEDULE_DISPATCHER }),
      ],
      providers: [
        ScheduleDispatcherProcessor,
        { provide: ReportScheduleService, useValue: mockReportScheduleService },
      ],
    }).compile();

    processor = module.get(ScheduleDispatcherProcessor);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('tick()', () => {
    it('calls findDueSchedules once per tick', async () => {
      await processor.tick();
      expect(mockReportScheduleService.findDueSchedules).toHaveBeenCalledTimes(1);
    });

    it('calls enqueueBySchedule for each due schedule', async () => {
      const due = [mockSchedule('s-1'), mockSchedule('s-2')];
      mockReportScheduleService.findDueSchedules.mockResolvedValue(due as any);

      await processor.tick();

      expect(mockReportScheduleService.enqueueBySchedule).toHaveBeenCalledTimes(2);
      expect(mockReportScheduleService.enqueueBySchedule).toHaveBeenCalledWith('s-1');
      expect(mockReportScheduleService.enqueueBySchedule).toHaveBeenCalledWith('s-2');
    });

    it('does NOT call enqueueBySchedule when no schedules are due', async () => {
      mockReportScheduleService.findDueSchedules.mockResolvedValue([]);

      await processor.tick();

      expect(mockReportScheduleService.enqueueBySchedule).not.toHaveBeenCalled();
    });

    it('uses Promise.allSettled — one failing enqueue does not prevent others', async () => {
      const due = [mockSchedule('s-fail'), mockSchedule('s-ok')];
      mockReportScheduleService.findDueSchedules.mockResolvedValue(due as any);
      mockReportScheduleService.enqueueBySchedule
        .mockRejectedValueOnce(new Error('Queue error'))
        .mockResolvedValue(undefined);

      await expect(processor.tick()).resolves.toBeUndefined();

      // Both schedules were attempted
      expect(mockReportScheduleService.enqueueBySchedule).toHaveBeenCalledTimes(2);
    });

    it('resolves even when ALL enqueues fail', async () => {
      const due = [mockSchedule('s-1'), mockSchedule('s-2')];
      mockReportScheduleService.findDueSchedules.mockResolvedValue(due as any);
      mockReportScheduleService.enqueueBySchedule.mockRejectedValue(new Error('Queue down'));

      await expect(processor.tick()).resolves.toBeUndefined();
    });
  });
});
