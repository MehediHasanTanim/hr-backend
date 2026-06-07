import {
  getDaysInMonth,
  getDay,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isSunday,
  isSaturday,
} from 'date-fns';

export interface HolidayInfo {
  date: Date;
  name: string;
}

/**
 * Compute total working days in a month (excluding Sundays and Saturdays).
 * If a list of holidays is provided, those dates are also excluded.
 */
export function getWorkingDaysInMonth(
  year: number,
  month: number,
  holidays: HolidayInfo[] = [],
): number {
  const start = startOfMonth(new Date(year, month - 1));
  const end = endOfMonth(start);
  const allDays = eachDayOfInterval({ start, end });
  const holidayDates = new Set(
    holidays.map((h) => h.date.toISOString().split('T')[0]),
  );

  let count = 0;
  for (const day of allDays) {
    if (isSunday(day) || isSaturday(day)) continue;
    const dateStr = day.toISOString().split('T')[0];
    if (holidayDates.has(dateStr)) continue;
    count++;
  }
  return count;
}

/**
 * Get the first day of a month as a Date.
 */
export function firstDayOfMonth(year: number, month: number): Date {
  return new Date(Date.UTC(year, month - 1, 1));
}

/**
 * Get the last day of a month as a Date.
 */
export function lastDayOfMonth(year: number, month: number): Date {
  return new Date(Date.UTC(year, month - 1, getDaysInMonth(new Date(year, month - 1))));
}
