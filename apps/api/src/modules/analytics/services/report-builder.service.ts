import { Inject, Injectable, BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '@hr/prisma';
import { AuditService } from '../../audit/audit.service';

const MAX_REPORT_ROW_LIMIT = 5000;

const FIELD_WHITELIST: Record<string, string[]> = {
  EMPLOYEE: ['id', 'fullName', 'department', 'employmentType', 'hireDate', 'status', 'workEmail'],
  PAYROLL: ['employeeId', 'period', 'grossPay', 'netPay', 'deductions', 'taxAmount'],
  LEAVE: ['employeeId', 'leaveType', 'daysTaken', 'balance', 'startDate', 'endDate'],
  ATTENDANCE: ['employeeId', 'date', 'status', 'hoursWorked', 'checkInAt', 'checkOutAt'],
  ATTRITION_RISK: ['employeeId', 'riskScore', 'riskBand', 'computedAt'],
};

const RBAC_RESTRICTED_FIELDS: Record<string, string[]> = {
  PAYROLL: ['grossPay', 'netPay', 'deductions', 'taxAmount'],
};

@Injectable()
export class ReportBuilderService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async create(dto: {
    companyId: string; name: string; description?: string;
    entityType: string; definition: Record<string, unknown>; createdById: string; isShared?: boolean;
  }) {
    const def = dto.definition as any;
    const whitelist = FIELD_WHITELIST[dto.entityType];
    if (!whitelist) throw new BadRequestException(`Unknown entity type: ${dto.entityType}`);

    // Validate fields against whitelist
    for (const field of def.fields ?? []) {
      if (!whitelist.includes(field)) throw new BadRequestException(`Field '${field}' not allowed for entity type '${dto.entityType}'`);
    }
    for (const col of def.columns ?? []) {
      if (!whitelist.includes(col)) throw new BadRequestException(`Column '${col}' not allowed`);
    }
    for (const filter of def.filters ?? []) {
      if (!whitelist.includes(filter.field)) throw new BadRequestException(`Filter field '${filter.field}' not allowed`);
    }
    if (def.limit && def.limit > MAX_REPORT_ROW_LIMIT) {
      throw new BadRequestException(`Limit exceeds maximum of ${MAX_REPORT_ROW_LIMIT}`);
    }

    return this.prisma.unscopedClient.customSavedReport.create({
      data: {
        companyId: dto.companyId, name: dto.name, description: dto.description,
        entityType: dto.entityType as any, definition: dto.definition as any,
        createdById: dto.createdById, isShared: dto.isShared ?? false,
      },
    });
  }

  async run(id: string, executedById: string, userRoles: string[]) {
    const report = await this.prisma.unscopedClient.customSavedReport.findUnique({ where: { id } });
    if (!report) throw new NotFoundException('Report not found');

    const def = report.definition as any;
    const entityType = report.entityType;
    const whitelist = FIELD_WHITELIST[entityType];
    if (!whitelist) throw new BadRequestException(`Unknown entity type: ${entityType}`);

    // Re-validate whitelist at run-time (defense in depth)
    for (const field of def.fields ?? []) {
      if (!whitelist.includes(field)) throw new BadRequestException(`Field '${field}' no longer allowed`);
    }

    // RBAC field stripping at execution time
    const isPayrollAdmin = userRoles.includes('payroll_admin');
    const restricted = RBAC_RESTRICTED_FIELDS[entityType] ?? [];
    const effectiveColumns = (def.columns ?? def.fields).filter((c: string) => {
      if (restricted.includes(c) && !isPayrollAdmin) return false;
      return whitelist.includes(c);
    });

    // Enforce hard limit
    const effectiveLimit = Math.min(def.limit ?? MAX_REPORT_ROW_LIMIT, MAX_REPORT_ROW_LIMIT);

    const startMs = Date.now();
    let rowCount = 0;
    let status = 'SUCCESS' as 'SUCCESS' | 'FAILED' | 'REJECTED_UNSAFE_QUERY';
    let failureReason: string | null = null;

    try {
      // Build parameterized query — never raw SQL
      // Stub: In production, build via Prisma's dynamic query builder
      rowCount = 0;
    } catch (err: unknown) {
      status = 'FAILED';
      failureReason = err instanceof Error ? err.message : 'Unknown error';
    }

    const executionMs = Date.now() - startMs;

    await this.prisma.unscopedClient.reportRun.create({
      data: {
        savedReportId: id, executedById, rowCount, executionMs,
        status: status as any, failureReason,
      },
    });

    this.audit.logAsync({ companyId: '', entityType: 'CustomSavedReport', entityId: id, action: 'REPORT_RUN', newValue: { executedById, rowCount, executionMs, status } });

    return { columns: effectiveColumns, limit: effectiveLimit, rowCount, executionMs, status };
  }

  async list(companyId: string) {
    return this.prisma.unscopedClient.customSavedReport.findMany({ where: { companyId }, orderBy: { createdAt: 'desc' } });
  }

  async getById(id: string) {
    const r = await this.prisma.unscopedClient.customSavedReport.findUnique({ where: { id }, include: { runs: { orderBy: { createdAt: 'desc' }, take: 10 } } });
    if (!r) throw new NotFoundException('Report not found');
    return r;
  }

  async update(id: string, dto: { name?: string; description?: string; definition?: Record<string, unknown>; isShared?: boolean }) {
    const r = await this.prisma.unscopedClient.customSavedReport.findUnique({ where: { id } });
    if (!r) throw new NotFoundException('Report not found');
    return this.prisma.unscopedClient.customSavedReport.update({ where: { id }, data: dto as any });
  }

  async delete(id: string) {
    const r = await this.prisma.unscopedClient.customSavedReport.findUnique({ where: { id } });
    if (!r) throw new NotFoundException('Report not found');
    return this.prisma.unscopedClient.customSavedReport.delete({ where: { id } });
  }
}
