import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@hr/prisma';
import type { RequestContext } from '../../common/context/request-context';
import { EmployeesService } from '../employees/employees.service';
import type { EmployeeWriteDto } from '../employees/dto/employee.dto';

interface RowError {
  row: number;
  errors: string[];
}

@Injectable()
export class BulkImportService {
  private readonly logger = new Logger(BulkImportService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(EmployeesService) private readonly employees: EmployeesService,
  ) {}

  async createEmployeeImportJob(user: RequestContext, csv: string) {
    const job = await this.prisma.unscopedClient.bulkImportJob.create({
      data: {
        companyId: user.companyId,
        type: 'EMPLOYEES',
        status: 'PENDING',
        createdById: user.userId,
      },
    });

    setImmediate(() => {
      void this.processEmployeeImport(user, job.id, csv);
    });

    return job;
  }

  async getJob(user: RequestContext, jobId: string) {
    return this.prisma.unscopedClient.bulkImportJob.findFirstOrThrow({
      where: { id: jobId, companyId: user.companyId },
    });
  }

  private async processEmployeeImport(user: RequestContext, jobId: string, csv: string): Promise<void> {
    await this.prisma.unscopedClient.bulkImportJob.update({
      where: { id: jobId },
      data: { status: 'PROCESSING', startedAt: new Date() },
    });

    const rows = this.parseCsv(csv);
    const errors: RowError[] = [];
    let successfulRows = 0;

    for (const row of rows) {
      const validationErrors = await this.validateRow(user.companyId, row.data);
      if (validationErrors.length > 0) {
        errors.push({ row: row.rowNumber, errors: validationErrors });
        continue;
      }

      try {
        await this.employees.hireEmployee(user, this.rowToEmployee(row.data));
        successfulRows += 1;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unable to import row';
        errors.push({ row: row.rowNumber, errors: [message] });
      }
    }

    await this.prisma.unscopedClient.bulkImportJob.update({
      where: { id: jobId },
      data: {
        status: 'COMPLETED',
        totalRows: rows.length,
        successfulRows,
        failedRows: errors.length,
        errors: errors as unknown as object,
        completedAt: new Date(),
      },
    });
    this.logger.log({ jobId, successfulRows, failedRows: errors.length }, 'Employee import completed');
  }

  private parseCsv(csv: string): Array<{ rowNumber: number; data: Record<string, string> }> {
    const lines = csv.split(/\r?\n/).filter((line) => line.trim().length > 0);
    if (lines.length === 0) return [];
    const headers = this.parseCsvLine(lines[0]).map((header) => header.trim());
    return lines.slice(1).map((line, index) => {
      const values = this.parseCsvLine(line);
      return {
        rowNumber: index + 2,
        data: Object.fromEntries(headers.map((header, i) => [header, values[i]?.trim() ?? ''])),
      };
    });
  }

  private parseCsvLine(line: string): string[] {
    const values: string[] = [];
    let current = '';
    let quoted = false;

    for (let i = 0; i < line.length; i += 1) {
      const char = line[i];
      const next = line[i + 1];
      if (char === '"' && quoted && next === '"') {
        current += '"';
        i += 1;
      } else if (char === '"') {
        quoted = !quoted;
      } else if (char === ',' && !quoted) {
        values.push(current);
        current = '';
      } else {
        current += char;
      }
    }
    values.push(current);
    return values;
  }

  private async validateRow(companyId: string, row: Record<string, string>): Promise<string[]> {
    const errors: string[] = [];
    if (!row.employeeNumber) errors.push('employeeNumber is required');
    if (!row.workEmail) errors.push('workEmail is required');
    if (row.workEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.workEmail)) {
      errors.push('workEmail must be a valid email');
    }
    if (!row.joinedAt) errors.push('joinedAt is required');

    if (row.employeeNumber || row.workEmail) {
      const existing = await this.prisma.unscopedClient.employee.findFirst({
        where: {
          companyId,
          deletedAt: null,
          OR: [
            ...(row.employeeNumber ? [{ employeeNumber: row.employeeNumber }] : []),
            ...(row.workEmail ? [{ workEmail: row.workEmail }] : []),
          ],
        },
      });
      if (existing) errors.push('employeeNumber or workEmail already exists');
    }
    return errors;
  }

  private rowToEmployee(row: Record<string, string>): EmployeeWriteDto {
    return {
      employeeNumber: row.employeeNumber,
      workEmail: row.workEmail,
      workPhone: row.workPhone || undefined,
      joinedAt: new Date(row.joinedAt),
      employmentType: (row.employmentType as EmployeeWriteDto['employmentType']) || 'FULL_TIME',
      departmentId: row.departmentId || undefined,
      jobTitleId: row.jobTitleId || undefined,
      locationId: row.locationId || undefined,
      payGradeId: row.payGradeId || undefined,
      managerId: row.managerId || undefined,
    };
  }
}
