import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@hr/prisma';
import type { Prisma } from '@prisma/client';
import { AuditService } from '../../audit/audit.service';

interface AccrualError {
  employeeId: string;
  error: string;
}

@Injectable()
export class LeaveAccrualEngine {
  private readonly logger = new Logger(LeaveAccrualEngine.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async runForCompany(companyId: string, month: number, year: number): Promise<void> {
    // Idempotency check
    const existingRun = await this.prisma.unscopedClient.accrualRunLog.findUnique({
      where: { companyId_month_year: { companyId, month, year } },
    });
    if (existingRun) {
      this.logger.warn({ companyId, month, year }, 'Accrual run already completed for this period, skipping');
      return;
    }

    const employees = await this.prisma.unscopedClient.employee.findMany({
      where: { companyId, status: 'ACTIVE', deletedAt: null },
      select: { id: true, joinedAt: true },
    });

    const leaveTypes = await this.prisma.unscopedClient.leaveType.findMany({
      where: { companyId, isActive: true, accrualType: { not: 'NONE' } },
    });

    if (employees.length === 0 || leaveTypes.length === 0) {
      this.logger.debug({ companyId, month, year }, 'No employees or leave types to process');
      return;
    }

    const errors: AccrualError[] = [];

    await this.prisma.unscopedClient.$transaction(async (tx) => {
      for (const employee of employees) {
        try {
          for (const leaveType of leaveTypes) {
            await this.processAccrual(tx, employee, leaveType, month, year);
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Unknown error';
          this.logger.error({ employeeId: employee.id, error: message }, 'Accrual failed for employee');
          errors.push({ employeeId: employee.id, error: message });
        }
      }

      await tx.accrualRunLog.create({
        data: { companyId, month, year, employeesCount: employees.length },
      });
    });

    // Audit log
    await this.audit.record({
      companyId,
      entityType: 'leave_balance',
      action: 'LEAVE_ACCRUAL_RUN',
      newValue: {
        month,
        year,
        employeesProcessed: employees.length,
        leaveTypesProcessed: leaveTypes.length,
        errorsCount: errors.length,
      } as any,
    });

    if (errors.length > 0) {
      throw new Error(
        `Accrual completed with ${errors.length} error(s) out of ${employees.length} employee(s): ${errors.map((e) => `[${e.employeeId}] ${e.error}`).join('; ')}`,
      );
    }
  }

  private async processAccrual(
    tx: Prisma.TransactionClient,
    employee: { id: string; joinedAt: Date },
    leaveType: { id: string; accrualType: string; accrualAmount: number; maxBalance: number; maxCarryForward: number },
    month: number,
    year: number,
  ): Promise<void> {
    const hireDate = new Date(employee.joinedAt);
    let creditAmount = Number(leaveType.accrualAmount);

    // Pro-rated accrual for mid-year hires
    if (hireDate.getUTCFullYear() === year && hireDate.getUTCMonth() + 1 === month) {
      const daysInMonth = new Date(year, month, 0).getDate();
      const daysRemaining = daysInMonth - hireDate.getUTCDate() + 1;
      creditAmount = this.roundHalfUp(creditAmount * (daysRemaining / daysInMonth), 2);
    } else if (hireDate.getUTCFullYear() > year || (hireDate.getUTCFullYear() === year && hireDate.getUTCMonth() + 1 > month)) {
      // Not yet active in this month
      return;
    }

    // Upsert leave balance
    const existingBalance = await tx.leaveBalance.findUnique({
      where: {
        employeeId_leaveTypeId_year: {
          employeeId: employee.id,
          leaveTypeId: leaveType.id,
          year,
        },
      },
    });

    if (existingBalance) {
      const newEntitled = Number(existingBalance.entitled) + creditAmount;
      let newBalance = Number(existingBalance.carriedForward) + newEntitled - Number(existingBalance.used);

      // Clamp to maxBalance
      if (leaveType.maxBalance > 0 && newBalance > leaveType.maxBalance) {
        newBalance = leaveType.maxBalance;
      }

      await tx.leaveBalance.update({
        where: { id: existingBalance.id },
        data: {
          entitled: newEntitled,
          balance: newBalance,
        },
      });
    } else {
      let balance = creditAmount;
      if (leaveType.maxBalance > 0 && balance > leaveType.maxBalance) {
        balance = leaveType.maxBalance;
      }

      await tx.leaveBalance.create({
        data: {
          employeeId: employee.id,
          leaveTypeId: leaveType.id,
          year,
          entitled: creditAmount,
          balance,
        },
      });
    }

    // Year-end carry-forward
    if (month === 12) {
      const currentBalance = await tx.leaveBalance.findUnique({
        where: {
          employeeId_leaveTypeId_year: {
            employeeId: employee.id,
            leaveTypeId: leaveType.id,
            year,
          },
        },
      });

      if (currentBalance) {
        const carryAmount = Math.min(Number(currentBalance.balance), Number(leaveType.maxCarryForward));

        if (carryAmount > 0) {
          const nextYearBalance = await tx.leaveBalance.findUnique({
            where: {
              employeeId_leaveTypeId_year: {
                employeeId: employee.id,
                leaveTypeId: leaveType.id,
                year: year + 1,
              },
            },
          });

          if (nextYearBalance) {
            await tx.leaveBalance.update({
              where: { id: nextYearBalance.id },
              data: {
                carriedForward: carryAmount,
                balance: carryAmount + Number(nextYearBalance.entitled) - Number(nextYearBalance.used),
              },
            });
          } else {
            await tx.leaveBalance.create({
              data: {
                employeeId: employee.id,
                leaveTypeId: leaveType.id,
                year: year + 1,
                carriedForward: carryAmount,
                balance: carryAmount,
              },
            });
          }
        }
      }
    }
  }

  private roundHalfUp(value: number, decimals: number): number {
    const factor = Math.pow(10, decimals);
    return Math.round(value * factor + Number.EPSILON) / factor;
  }
}
