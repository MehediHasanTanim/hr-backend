import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '@hr/prisma';
import { PAYROLL_RUN_QUEUE } from '../constants/queues';
import { PayrollEngine, SkipEmployeeError } from '../services/payroll-engine';
import { EmployeeSalaryService } from '../services/employee-salary.service';
import { firstDayOfMonth, lastDayOfMonth } from '../utils/working-days';
import { round2dp } from '../utils/round2dp';

interface PayrollRunJobData {
  cycleId: string;
  companyId: string;
  month: number;
  year: number;
  triggeredByUserId: string;
}

@Processor(PAYROLL_RUN_QUEUE)
export class PayrollRunProcessor extends WorkerHost {
  private readonly logger = new Logger(PayrollRunProcessor.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PayrollEngine) private readonly engine: PayrollEngine,
    @Inject(EmployeeSalaryService) private readonly salaryService: EmployeeSalaryService,
  ) {
    super();
  }

  async process(job: Job<PayrollRunJobData>): Promise<void> {
    const { cycleId, companyId, month, year, triggeredByUserId } = job.data;
    this.logger.log({ cycleId, companyId, month, year }, 'Starting payroll run');

    // 1. Idempotency guard
    const cycle = await this.prisma.unscopedClient.payrollCycle.findUnique({
      where: { id: cycleId },
    });
    if (!cycle || cycle.status !== 'PROCESSING') {
      this.logger.warn({ cycleId, status: cycle?.status }, 'Cycle is not in PROCESSING state, skipping');
      return;
    }

    // 2. Fetch all active employees with approved salary
    const employees = await this.prisma.unscopedClient.employee.findMany({
      where: {
        companyId,
        status: 'ACTIVE',
        deletedAt: null,
      },
      select: {
        id: true,
        joinedAt: true,
      },
    });

    job.updateProgress(5);

    // 3. Get holidays for the month
    const startDate = firstDayOfMonth(year, month);
    const endDate = lastDayOfMonth(year, month);
    const holidayCal = await this.prisma.unscopedClient.holidayCalendar.findFirst({
      where: { companyId, isDefault: true, year },
    });
    let holidays: Array<{ date: Date; name: string }> = [];
    if (holidayCal) {
      const hols = await this.prisma.unscopedClient.holiday.findMany({
        where: {
          calendarId: holidayCal.id,
          date: { gte: startDate, lte: endDate },
        },
        select: { date: true, name: true },
      });
      holidays = hols;
    }

    // 4. Fetch attendance records for all employees this month
    const attendanceRecords = await this.prisma.unscopedClient.attendanceLog.findMany({
      where: {
        employeeId: { in: employees.map((e) => e.id) },
        date: { gte: startDate, lte: endDate },
      },
      select: { employeeId: true, date: true, status: true },
    });

    // 5. Fetch unpaid leave types
    const unpaidLeaveTypes = await this.prisma.unscopedClient.leaveType.findMany({
      where: { companyId, isPaid: false, isActive: true },
      select: { id: true },
    });
    const unpaidLeaveTypeIds = unpaidLeaveTypes.map((l) => l.id);

    // Fetch approved unpaid leave requests for the month
    const unpaidLeaves = unpaidLeaveTypeIds.length > 0
      ? await this.prisma.unscopedClient.leaveRequest.findMany({
          where: {
            employeeId: { in: employees.map((e) => e.id) },
            leaveTypeId: { in: unpaidLeaveTypeIds },
            status: 'APPROVED',
            startDate: { lte: endDate },
            endDate: { gte: startDate },
          },
          select: { employeeId: true, startDate: true, endDate: true },
        })
      : [];

    // 6. Compute per-employee attendance summary
    const attendanceMap = new Map<string, { presentDays: number; unpaidLeaveDays: number }>();
    for (const emp of employees) {
      attendanceMap.set(emp.id, { presentDays: 0, unpaidLeaveDays: 0 });
    }

    for (const rec of attendanceRecords) {
      const summary = attendanceMap.get(rec.employeeId);
      if (!summary) continue;
      if (['PRESENT', 'LATE', 'ON_LEAVE'].includes(rec.status)) {
        summary.presentDays += 1;
      } else if (rec.status === 'HALF_DAY') {
        summary.presentDays += 0.5;
      }
    }

    // Calculate unpaid LOP days from leave requests
    for (const lev of unpaidLeaves) {
      const summary = attendanceMap.get(lev.employeeId);
      if (!summary) continue;
      // Count working days in the overlap between leave and this month
      const overlapStart = lev.startDate > startDate ? lev.startDate : startDate;
      const overlapEnd = lev.endDate < endDate ? lev.endDate : endDate;
      // Simple day count (could refine to exclude weekends)
      const diffDays = Math.max(0, Math.ceil((overlapEnd.getTime() - overlapStart.getTime()) / 86400000) + 1);
      summary.unpaidLeaveDays += diffDays;
    }

    // 7. Process each employee
    const totalEmployees = employees.length;
    const entries: Array<{
      cycleId: string;
      employeeId: string;
      structureId: string;
      monthlyCtc: number;
      workingDays: number;
      presentDays: number;
      lopDays: number;
      grossEarnings: number;
      totalDeductions: number;
      netPayable: number;
      status: string;
      notes?: string;
    }> = [];
    const componentsData: Array<{
      entryIndex: number;
      componentId: string;
      componentCode: string;
      componentName: string;
      type: string;
      amount: number;
    }> = [];

    const errors: Array<{ employeeId: string; error: string }> = [];

    for (let i = 0; i < totalEmployees; i++) {
      const emp = employees[i]!;
      const attendance = attendanceMap.get(emp.id) ?? { presentDays: 0, unpaidLeaveDays: 0 };

      try {
        // Get current salary
        let salaryData: any;
        try {
          salaryData = await this.salaryService.getCurrentSalary(emp.id, startDate);
        } catch (err) {
          throw new SkipEmployeeError('No approved salary for this period');
        }

        const result = await this.engine.computeForEmployee(
          emp.id,
          cycleId,
          month,
          year,
          {
            ctc: Number(salaryData.ctc),
            structureId: salaryData.structureId,
            structure: salaryData.structure,
          },
          attendance,
          emp.joinedAt,
          holidays,
        );

        entries.push(result.entry as any);
        for (const comp of result.components) {
          componentsData.push({
            entryIndex: entries.length - 1,
            ...comp,
            type: comp.type,
          });
        }
      } catch (err) {
        if (err instanceof SkipEmployeeError) {
          entries.push({
            cycleId,
            employeeId: emp.id,
            structureId: '',
            monthlyCtc: 0,
            workingDays: 0,
            presentDays: 0,
            lopDays: 0,
            grossEarnings: 0,
            totalDeductions: 0,
            netPayable: 0,
            status: 'HELD',
            notes: err.message,
          });
        } else {
          const message = err instanceof Error ? err.message : 'Unknown error';
          this.logger.error({ employeeId: emp.id, error: message }, 'Payroll computation failed');
          errors.push({ employeeId: emp.id, error: message });
          entries.push({
            cycleId,
            employeeId: emp.id,
            structureId: '',
            monthlyCtc: 0,
            workingDays: 0,
            presentDays: 0,
            lopDays: 0,
            grossEarnings: 0,
            totalDeductions: 0,
            netPayable: 0,
            status: 'HELD',
            notes: `Computation error: ${message}`,
          });
        }
      }

      job.updateProgress(Math.round(5 + (i + 1) / totalEmployees * 85));
    }

    // 8. Save everything in a single transaction
    try {
      await this.prisma.unscopedClient.$transaction(async (tx) => {
        for (let i = 0; i < entries.length; i++) {
          const entry = entries[i]!;
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { entryIndex: _, ...rest } = { entryIndex: i, ...entry };
          // Need to save entry first
          const created = await tx.payrollEntry.create({ data: entry as any });

          // Save components for this entry
          const entryComps = componentsData.filter((c) => c.entryIndex === i);
          for (const comp of entryComps) {
            await tx.payrollEntryComponent.create({
              data: {
                entryId: created.id,
                componentId: comp.componentId,
                componentCode: comp.componentCode,
                componentName: comp.componentName,
                type: comp.type as any,
                amount: comp.amount,
              },
            });
          }
        }

        // Aggregate totals
        const computedEntries = entries.filter((e) => e.status === 'COMPUTED');
        const totalGross = round2dp(computedEntries.reduce((s, e) => s + e.grossEarnings, 0));
        const totalDeductions = round2dp(computedEntries.reduce((s, e) => s + e.totalDeductions, 0));
        const totalNet = round2dp(computedEntries.reduce((s, e) => s + e.netPayable, 0));

        await tx.payrollCycle.update({
          where: { id: cycleId },
          data: {
            status: 'COMPUTED',
            totalGross,
            totalDeductions,
            totalNet,
            employeeCount: computedEntries.length + entries.filter((e) => e.status === 'HELD').length,
          },
        });
      });
    } catch (err) {
      // Transaction failure: rollback by setting cycle back to draft
      await this.prisma.unscopedClient.payrollCycle.update({
        where: { id: cycleId },
        data: { status: 'DRAFT' },
      });
      this.logger.error({ cycleId, error: (err as Error).message }, 'Payroll transaction failed, cycle reverted to draft');
      throw err;
    }

    job.updateProgress(100);
    this.logger.log({ cycleId, totalEmployees, errors: errors.length }, 'Payroll run completed');
  }
}
