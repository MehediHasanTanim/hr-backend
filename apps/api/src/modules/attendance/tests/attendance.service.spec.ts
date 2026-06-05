import { beforeAll, afterAll, afterEach, describe, it, expect, vi } from 'vitest';
import { BadRequestError, NotFoundError } from '@hr/shared';
import { AttendanceService } from '../services/attendance.service';

vi.mock('@hr/prisma', () => ({ PrismaService: class PrismaService {} }));

// ---------------------------------------------------------------------------
// Factory helpers
// ---------------------------------------------------------------------------
function makeRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: 'att-1',
    employeeId: 'emp-1',
    companyId: 'co-1',
    date: new Date('2024-06-10'),
    checkInAt: new Date('2024-06-10T09:00:00Z'),
    checkOutAt: null,
    source: 'WEB',
    ipAddress: null,
    coordinates: null,
    status: 'PRESENT',
    workedMinutes: null,
    isCorrected: false,
    correctionReason: null,
    correctedById: null,
    correctedAt: null,
    ...overrides,
  } as any;
}

function makeClockInDto(overrides: Record<string, unknown> = {}) {
  return {
    source: 'WEB',
    coordinates: undefined,
    ...overrides,
  } as any;
}

function makeCorrectDto(overrides: Record<string, unknown> = {}) {
  return {
    clockInAt: '2024-06-10T09:00:00Z',
    clockOutAt: '2024-06-10T18:00:00Z',
    reason: 'System error corrected the clock-in time',
    ...overrides,
  } as any;
}

// ---------------------------------------------------------------------------
// Mock factory
// ---------------------------------------------------------------------------
function createMocks() {
  const mockPrisma = {
    unscopedClient: {
      attendanceLog: {
        findUnique: vi.fn(),
        upsert: vi.fn(),
        update: vi.fn(),
        findFirst: vi.fn(),
        findMany: vi.fn(),
        count: vi.fn(),
      },
      employee: {
        findMany: vi.fn(),
      },
      holiday: {
        findMany: vi.fn(),
      },
      $transaction: vi.fn(async (arg: any) => {
        // Array-style transaction (used in getExceptions)
        if (Array.isArray(arg)) {
          return Promise.all(arg);
        }
        // Callback-style transaction (used in clockIn/clockOut)
        return arg({});
      }),
    },
  };

  const mockAudit = { record: vi.fn() };

  return { mockPrisma, mockAudit };
}

function createService() {
  const { mockPrisma, mockAudit } = createMocks();
  const service = new AttendanceService(mockPrisma as any, mockAudit as any);
  return { service, mockPrisma, mockAudit };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('AttendanceService', () => {
  beforeAll(() => {
    vi.useFakeTimers();
  });

  afterAll(() => {
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ---------------------------------------------------------------
  // clockIn()
  // ---------------------------------------------------------------
  describe('clockIn()', () => {
    it('creates a new attendance record with clockInAt = now()', async () => {
      vi.setSystemTime(new Date('2024-06-10T09:05:00Z'));

      const { service, mockPrisma } = createService();
      mockPrisma.unscopedClient.attendanceLog.findUnique.mockResolvedValue(null);
      mockPrisma.unscopedClient.attendanceLog.upsert.mockResolvedValue(
        makeRecord({ checkInAt: new Date('2024-06-10T09:05:00Z') }),
      );

      await service.clockIn('emp-1', 'co-1', makeClockInDto());

      expect(mockPrisma.unscopedClient.attendanceLog.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            checkInAt: new Date('2024-06-10T09:05:00Z'),
            date: new Date('2024-06-10'),
            employeeId: 'emp-1',
          }),
        }),
      );
    });

    it('stores ipAddress from request context', async () => {
      vi.setSystemTime(new Date('2024-06-10T09:05:00Z'));

      const { service, mockPrisma } = createService();
      mockPrisma.unscopedClient.attendanceLog.findUnique.mockResolvedValue(null);
      mockPrisma.unscopedClient.attendanceLog.upsert.mockResolvedValue(makeRecord());

      await service.clockIn('emp-1', 'co-1', makeClockInDto(), '192.168.1.1');

      expect(mockPrisma.unscopedClient.attendanceLog.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ ipAddress: '192.168.1.1' }),
        }),
      );
    });

    it('stores coordinates when provided', async () => {
      vi.setSystemTime(new Date('2024-06-10T09:05:00Z'));

      const { service, mockPrisma } = createService();
      mockPrisma.unscopedClient.attendanceLog.findUnique.mockResolvedValue(null);
      mockPrisma.unscopedClient.attendanceLog.upsert.mockResolvedValue(makeRecord());

      const dto = makeClockInDto({ coordinates: { lat: 23.8103, lng: 90.4125 } });
      await service.clockIn('emp-1', 'co-1', dto);

      expect(mockPrisma.unscopedClient.attendanceLog.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            coordinates: { lat: 23.8103, lng: 90.4125 },
          }),
        }),
      );
    });

    it('sets status to late when clockIn is after shift start', async () => {
      vi.setSystemTime(new Date('2024-06-10T09:16:00Z'));

      const { service, mockPrisma } = createService();
      mockPrisma.unscopedClient.attendanceLog.findUnique.mockResolvedValue(null);
      mockPrisma.unscopedClient.attendanceLog.upsert.mockResolvedValue(makeRecord());

      await service.clockIn('emp-1', 'co-1', makeClockInDto());

      expect(mockPrisma.unscopedClient.attendanceLog.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ status: 'LATE' }),
        }),
      );
    });

    it('sets status to present when clockIn is on time', async () => {
      vi.setSystemTime(new Date('2024-06-10T08:55:00Z'));

      const { service, mockPrisma } = createService();
      mockPrisma.unscopedClient.attendanceLog.findUnique.mockResolvedValue(null);
      mockPrisma.unscopedClient.attendanceLog.upsert.mockResolvedValue(makeRecord());

      await service.clockIn('emp-1', 'co-1', makeClockInDto());

      expect(mockPrisma.unscopedClient.attendanceLog.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ status: 'PRESENT' }),
        }),
      );
    });

    it('uses default source when dto.source is not provided', async () => {
      vi.setSystemTime(new Date('2024-06-10T08:55:00Z'));

      const { service, mockPrisma } = createService();
      mockPrisma.unscopedClient.attendanceLog.findUnique.mockResolvedValue(null);
      mockPrisma.unscopedClient.attendanceLog.upsert.mockResolvedValue(makeRecord());

      await service.clockIn('emp-1', 'co-1', makeClockInDto({ source: undefined }));

      expect(mockPrisma.unscopedClient.attendanceLog.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ source: 'WEB' }),
        }),
      );
    });

    it('returns existing record without throwing on double clock-in same day', async () => {
      vi.setSystemTime(new Date('2024-06-10T09:05:00Z'));

      const { service, mockPrisma } = createService();
      const existingRecord = makeRecord({ checkInAt: new Date('2024-06-10T09:00:00Z') });
      mockPrisma.unscopedClient.attendanceLog.findUnique.mockResolvedValue(existingRecord);

      const result = await service.clockIn('emp-1', 'co-1', makeClockInDto());

      expect(mockPrisma.unscopedClient.attendanceLog.upsert).not.toHaveBeenCalled();
      expect(result).toEqual(existingRecord);
    });

    it('does NOT allow clock-in if the record already has both clockIn and clockOut', async () => {
      vi.setSystemTime(new Date('2024-06-10T09:05:00Z'));

      const { service, mockPrisma } = createService();
      const completedRecord = makeRecord({
        checkInAt: new Date('2024-06-10T09:00:00Z'),
        checkOutAt: new Date('2024-06-10T18:00:00Z'),
      });
      mockPrisma.unscopedClient.attendanceLog.findUnique.mockResolvedValue(completedRecord);

      const result = await service.clockIn('emp-1', 'co-1', makeClockInDto());

      // The code returns existing record if checkInAt is set, regardless of checkOutAt
      // Current impl: if (existing?.checkInAt) return existing;
      expect(mockPrisma.unscopedClient.attendanceLog.upsert).not.toHaveBeenCalled();
      expect(result).toEqual(completedRecord);
    });
  });

  // ---------------------------------------------------------------
  // clockOut()
  // ---------------------------------------------------------------
  describe('clockOut()', () => {
    it('sets clockOutAt = now() on existing record', async () => {
      vi.setSystemTime(new Date('2024-06-10T18:00:00Z'));

      const { service, mockPrisma } = createService();
      mockPrisma.unscopedClient.attendanceLog.findUnique.mockResolvedValue(
        makeRecord({ checkInAt: new Date('2024-06-10T09:00:00Z') }),
      );
      mockPrisma.unscopedClient.attendanceLog.update.mockResolvedValue(makeRecord());

      await service.clockOut('emp-1', 'co-1');

      expect(mockPrisma.unscopedClient.attendanceLog.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            checkOutAt: new Date('2024-06-10T18:00:00Z'),
          }),
        }),
      );
    });

    it('calculates totalMinutes correctly', async () => {
      vi.setSystemTime(new Date('2024-06-10T18:00:00Z'));

      const { service, mockPrisma } = createService();
      mockPrisma.unscopedClient.attendanceLog.findUnique.mockResolvedValue(
        makeRecord({ checkInAt: new Date('2024-06-10T09:00:00Z') }),
      );
      mockPrisma.unscopedClient.attendanceLog.update.mockResolvedValue(makeRecord());

      await service.clockOut('emp-1', 'co-1');

      expect(mockPrisma.unscopedClient.attendanceLog.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ workedMinutes: 540 }),
        }),
      );
    });

    it('sets status to half_day when totalMinutes < 240', async () => {
      vi.setSystemTime(new Date('2024-06-10T12:00:00Z'));

      const { service, mockPrisma } = createService();
      mockPrisma.unscopedClient.attendanceLog.findUnique.mockResolvedValue(
        makeRecord({ checkInAt: new Date('2024-06-10T09:00:00Z') }),
      );
      mockPrisma.unscopedClient.attendanceLog.update.mockResolvedValue(makeRecord());

      await service.clockOut('emp-1', 'co-1');

      expect(mockPrisma.unscopedClient.attendanceLog.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'HALF_DAY' }),
        }),
      );
    });

    it('preserves late status when totalMinutes >= 240', async () => {
      vi.setSystemTime(new Date('2024-06-10T17:30:00Z'));

      const { service, mockPrisma } = createService();
      mockPrisma.unscopedClient.attendanceLog.findUnique.mockResolvedValue(
        makeRecord({
          checkInAt: new Date('2024-06-10T09:30:00Z'),
          status: 'LATE',
        }),
      );
      mockPrisma.unscopedClient.attendanceLog.update.mockResolvedValue(makeRecord());

      await service.clockOut('emp-1', 'co-1');

      // totalMinutes = 480, >= 240, so status stays 'LATE'
      expect(mockPrisma.unscopedClient.attendanceLog.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'LATE' }),
        }),
      );
    });

    it('throws NotFoundException when no clock-in record exists for today', async () => {
      vi.setSystemTime(new Date('2024-06-10T18:00:00Z'));

      const { service, mockPrisma } = createService();
      mockPrisma.unscopedClient.attendanceLog.findUnique.mockResolvedValue(null);

      await expect(
        service.clockOut('emp-1', 'co-1'),
      ).rejects.toThrow(NotFoundError);
    });

    it('throws ConflictException on double clock-out (clockOutAt already set)', async () => {
      vi.setSystemTime(new Date('2024-06-10T18:00:00Z'));

      const { service, mockPrisma } = createService();
      mockPrisma.unscopedClient.attendanceLog.findUnique.mockResolvedValue(
        makeRecord({ checkOutAt: new Date('2024-06-10T17:00:00Z') }),
      );

      await expect(
        service.clockOut('emp-1', 'co-1'),
      ).rejects.toThrow(BadRequestError);
    });
  });

  // ---------------------------------------------------------------
  // correct() — regression guard
  // ---------------------------------------------------------------
  describe('correct() — regression guard', () => {
    it('sets isCorrected = true and records correctedById', async () => {
      vi.setSystemTime(new Date('2024-06-10T10:00:00Z'));

      const { service, mockPrisma } = createService();
      const existingRecord = makeRecord();
      mockPrisma.unscopedClient.attendanceLog.findFirst.mockResolvedValue(existingRecord);
      mockPrisma.unscopedClient.attendanceLog.update.mockResolvedValue({
        ...existingRecord,
        isCorrected: true,
        correctionReason: 'System error corrected the clock-in time',
        correctedById: 'hr-emp-1',
        correctedAt: new Date(),
        source: 'MANUAL',
        checkInAt: new Date('2024-06-10T09:00:00Z'),
        checkOutAt: new Date('2024-06-10T18:00:00Z'),
        workedMinutes: 540,
        status: 'PRESENT',
      });

      const dto = makeCorrectDto({
        clockInAt: '2024-06-10T09:00:00Z',
        clockOutAt: '2024-06-10T18:00:00Z',
      });
      await service.correctRecord('att-1', 'co-1', 'hr-emp-1', dto);

      expect(mockPrisma.unscopedClient.attendanceLog.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            isCorrected: true,
            correctionReason: 'System error corrected the clock-in time',
            correctedById: 'hr-emp-1',
            source: 'MANUAL',
          }),
        }),
      );
    });

    it('writes ATTENDANCE_CORRECTED audit log with before/after metadata', async () => {
      vi.setSystemTime(new Date('2024-06-10T10:00:00Z'));

      const { service, mockPrisma, mockAudit } = createService();
      const existingRecord = makeRecord();
      mockPrisma.unscopedClient.attendanceLog.findFirst.mockResolvedValue(existingRecord);
      mockPrisma.unscopedClient.attendanceLog.update.mockResolvedValue({
        ...existingRecord,
        isCorrected: true,
        correctionReason: 'System error corrected the clock-in time',
        correctedById: 'hr-emp-1',
        correctedAt: new Date(),
        source: 'MANUAL',
        checkInAt: new Date('2024-06-10T09:00:00Z'),
        checkOutAt: new Date('2024-06-10T18:00:00Z'),
        workedMinutes: 540,
        status: 'PRESENT',
      });

      const dto = makeCorrectDto();
      await service.correctRecord('att-1', 'co-1', 'hr-emp-1', dto);

      expect(mockAudit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'ATTENDANCE_CORRECTED',
          oldValue: expect.objectContaining({ clockInAt: expect.anything() }),
          newValue: expect.objectContaining({ clockInAt: expect.anything() }),
        }),
      );
    });
  });

  // ---------------------------------------------------------------
  // getExceptions()
  // ---------------------------------------------------------------
  describe('getExceptions()', () => {
    it('returns late exceptions with employee name from user', async () => {
      vi.setSystemTime(new Date('2024-06-10T10:00:00Z'));

      const { service, mockPrisma } = createService();
      const mockRecords = [
        {
          employee: {
            id: 'emp-1',
            workEmail: 'emp1@test.com',
            user: { firstName: 'John', lastName: 'Doe' },
          },
          date: new Date('2024-06-10'),
          checkInAt: new Date('2024-06-10T09:15:00Z'),
        },
      ];
      mockPrisma.unscopedClient.attendanceLog.findMany.mockResolvedValue(mockRecords);
      mockPrisma.unscopedClient.attendanceLog.count.mockResolvedValue(1);

      const result = await service.getExceptions('co-1', {
        type: 'late',
        startDate: new Date('2024-06-01'),
        endDate: new Date('2024-06-30'),
        page: 1,
        pageSize: 20,
      } as any);

      expect(result.items).toHaveLength(1);
      expect(result.items[0]).toMatchObject({
        employeeId: 'emp-1',
        employeeName: 'John Doe',
        type: 'late',
      });
      expect(result.total).toBe(1);
    });

    it('returns late exceptions with workEmail when user is null', async () => {
      vi.setSystemTime(new Date('2024-06-10T10:00:00Z'));

      const { service, mockPrisma } = createService();
      const mockRecords = [
        {
          employee: {
            id: 'emp-1',
            workEmail: 'emp1@test.com',
            user: null,
          },
          date: new Date('2024-06-10'),
          checkInAt: null,
        },
      ];
      mockPrisma.unscopedClient.attendanceLog.findMany.mockResolvedValue(mockRecords);
      mockPrisma.unscopedClient.attendanceLog.count.mockResolvedValue(1);

      const result = await service.getExceptions('co-1', {
        type: 'late',
        startDate: new Date('2024-06-01'),
        endDate: new Date('2024-06-30'),
        page: 1,
        pageSize: 20,
      } as any);

      expect(result.items[0].employeeName).toBe('emp1@test.com');
    });

    it('returns missing_punch exceptions', async () => {
      vi.setSystemTime(new Date('2024-06-15T10:00:00Z')); // today is June 15

      const { service, mockPrisma } = createService();
      const mockRecords = [
        {
          employee: {
            id: 'emp-1',
            workEmail: 'emp1@test.com',
            user: null,
          },
          date: new Date('2024-06-10'),
          checkInAt: new Date('2024-06-10T09:00:00Z'),
        },
      ];
      mockPrisma.unscopedClient.attendanceLog.findMany.mockResolvedValue(mockRecords);
      mockPrisma.unscopedClient.attendanceLog.count.mockResolvedValue(1);

      const result = await service.getExceptions('co-1', {
        type: 'missing_punch',
        startDate: new Date('2024-06-01'),
        endDate: new Date('2024-06-14'),
        page: 1,
        pageSize: 20,
      } as any);

      expect(result.items).toHaveLength(1);
      expect(result.items[0]).toMatchObject({
        type: 'missing_punch',
      });
    });

    it('returns empty items for unknown type', async () => {
      vi.setSystemTime(new Date('2024-06-10T10:00:00Z'));

      const { service } = createService();
      const result = await service.getExceptions('co-1', {
        type: 'unknown' as any,
        startDate: new Date('2024-06-01'),
        endDate: new Date('2024-06-30'),
        page: 1,
        pageSize: 20,
      } as any);

      expect(result.items).toHaveLength(0);
      expect(result.total).toBe(0);
    });

    it('returns absent exceptions', async () => {
      vi.setSystemTime(new Date('2024-06-15T10:00:00Z'));

      const { service, mockPrisma } = createService();
      // One active employee
      mockPrisma.unscopedClient.employee.findMany.mockResolvedValue([
        { id: 'emp-1', workEmail: 'emp1@test.com', user: { firstName: 'John', lastName: 'Doe' } },
      ]);
      // No holidays
      mockPrisma.unscopedClient.holiday.findMany.mockResolvedValue([]);
      // No attendance records → employee is absent for all working days
      mockPrisma.unscopedClient.attendanceLog.findMany.mockResolvedValue([]);

      const result = await service.getExceptions('co-1', {
        type: 'absent',
        startDate: new Date('2024-06-10'), // Monday
        endDate: new Date('2024-06-11'), // Tuesday (2 working days)
        page: 1,
        pageSize: 20,
      } as any);

      expect(result.items).toHaveLength(2); // 2 working days, absent both
      expect(result.items[0]).toMatchObject({ type: 'absent' });
      expect(result.total).toBe(2);
    });

    it('handles correction with only clockInAt change (no clockOutAt)', async () => {
      vi.setSystemTime(new Date('2024-06-10T10:00:00Z'));

      const { service, mockPrisma } = createService();
      const existingRecord = makeRecord({
        checkInAt: new Date('2024-06-10T09:00:00Z'),
        checkOutAt: new Date('2024-06-10T18:00:00Z'),
      });
      mockPrisma.unscopedClient.attendanceLog.findFirst.mockResolvedValue(existingRecord);
      mockPrisma.unscopedClient.attendanceLog.update.mockResolvedValue(existingRecord);

      const dto = makeCorrectDto({
        clockInAt: '2024-06-10T08:30:00Z',
        clockOutAt: undefined,
      });
      await service.correctRecord('att-1', 'co-1', 'hr-emp-1', dto);

      expect(mockPrisma.unscopedClient.attendanceLog.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ isCorrected: true }),
        }),
      );
    });

    it('handles correction with status override', async () => {
      vi.setSystemTime(new Date('2024-06-10T10:00:00Z'));

      const { service, mockPrisma } = createService();
      const existingRecord = makeRecord();
      mockPrisma.unscopedClient.attendanceLog.findFirst.mockResolvedValue(existingRecord);
      mockPrisma.unscopedClient.attendanceLog.update.mockResolvedValue(existingRecord);

      const dto = makeCorrectDto({
        clockInAt: '2024-06-10T09:00:00Z',
        clockOutAt: '2024-06-10T18:00:00Z',
        status: 'PRESENT',
      });
      await service.correctRecord('att-1', 'co-1', 'hr-emp-1', dto);

      expect(mockPrisma.unscopedClient.attendanceLog.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'PRESENT' }),
        }),
      );
    });
  });
});
