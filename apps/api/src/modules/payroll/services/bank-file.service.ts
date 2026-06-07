import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@hr/prisma';
import { BadRequestError, NotFoundError } from '@hr/shared';
import { AuditService } from '../../audit/audit.service';
import type { RequestContext } from '../../../common/context/request-context';

@Injectable()
export class BankFileService {
  private readonly logger = new Logger(BankFileService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async exportBankFile(
    cycleId: string,
    format: 'neft' | 'ach',
    actor: RequestContext,
  ): Promise<{ content: string; filename: string; contentType: string }> {
    const cycle = await this.prisma.unscopedClient.payrollCycle.findFirst({
      where: { id: cycleId, companyId: actor.companyId },
    });
    if (!cycle) throw new NotFoundError('Payroll cycle not found');
    if (!['APPROVED', 'DISBURSED'].includes(cycle.status)) {
      throw new BadRequestError('Cycle must be approved or disbursed to export bank file');
    }

    const entries = await this.prisma.unscopedClient.payrollEntry.findMany({
      where: {
        cycleId,
        status: { in: ['APPROVED', 'DISBURSED'] },
        netPayable: { gt: 0 },
      },
      include: {
        employee: {
          include: {
            bankDetails: {
              where: { isPrimary: true, isActive: true },
              take: 1,
            },
          },
        },
      },
    });

    if (entries.length === 0) {
      throw new BadRequestError('No payable entries found for this cycle');
    }

    const rows: string[] = [];
    let totalAmount = 0;

    for (const entry of entries) {
      const bank = entry.employee.bankDetails[0];
      if (!bank) {
        this.logger.warn({ employeeId: entry.employeeId }, 'No bank details found, skipping');
        continue;
      }

      const amount = Number(entry.netPayable);
      totalAmount += amount;
      const remarks = `Salary ${cycle.month}/${cycle.year}`;

      if (format === 'neft') {
        // CSV: beneficiaryName, accountNumber, ifscCode, amount, remarks
        const csvRow = [
          this.escapeCsv(bank.accountHolderName),
          bank.accountNumber,
          bank.ifscCode,
          amount.toFixed(2),
          this.escapeCsv(remarks),
        ].join(',');
        rows.push(csvRow);
      } else {
        // ACH: pipe-separated with header
        const achRow = [
          bank.accountNumber,
          bank.ifscCode,
          bank.accountHolderName,
          amount.toFixed(2),
          remarks,
          new Date().toISOString().split('T')[0],
        ].join('|');
        rows.push(achRow);
      }
    }

    let content: string;
    let filename: string;

    if (format === 'ach') {
      const header = 'DEST_ACCT_NO|DEST_IFSC|BENE_NAME|AMOUNT|PAYMENT_REF|PAYMENT_DATE';
      content = [header, ...rows].join('\n');
      filename = `bank_file_${cycleId}_ach.csv`;
    } else {
      content = rows.join('\n');
      filename = `bank_file_${cycleId}_neft.csv`;
    }

    // Audit
    await this.audit.record({
      actor,
      companyId: actor.companyId,
      entityType: 'payroll_cycle',
      entityId: cycleId,
      action: 'BANK_FILE_EXPORTED',
      newValue: {
        format,
        entryCount: rows.length,
        totalAmount: Math.round(totalAmount * 100) / 100,
        exportedByUserId: actor.userId,
      } as any,
    });

    return { content, filename, contentType: 'text/csv' };
  }

  private escapeCsv(value: string): string {
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  }
}
