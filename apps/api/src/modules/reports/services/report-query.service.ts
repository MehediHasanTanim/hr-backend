import { Inject, Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '@hr/prisma';
import { round2dp } from '../../payroll/utils/round2dp';
import { ReportKey } from '../enums/report-key.enum';
import type { ReportQueryDto } from '../dto/report-query.dto';
import type { ReportResultDto } from '../dto/report-result.dto';

@Injectable()
export class ReportQueryService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async run(query: ReportQueryDto): Promise<ReportResultDto> {
    if (!Object.values(ReportKey).includes(query.reportKey)) {
      throw new BadRequestException(`Invalid report key: ${query.reportKey}`);
    }
    if (new Date(query.startDate) > new Date(query.endDate)) {
      throw new BadRequestException('startDate must be before or equal to endDate');
    }

    let rows: Record<string, unknown>[];

    switch (query.reportKey) {
      case ReportKey.HEADCOUNT:
        rows = await this.headcount(query);
        break;
      case ReportKey.ATTRITION:
        rows = await this.attrition(query);
        break;
      case ReportKey.PAYROLL_SUMMARY:
        rows = await this.payrollSummary(query);
        break;
      case ReportKey.LEAVE_UTILIZATION:
        rows = await this.leaveUtilization(query);
        break;
      case ReportKey.ATTENDANCE_SUMMARY:
        rows = await this.attendanceSummary(query);
        break;
      case ReportKey.NEW_HIRES:
        rows = await this.newHires(query);
        break;
      case ReportKey.EXITS:
        rows = await this.exits(query);
        break;
      default:
        throw new BadRequestException(`Unsupported report key: ${query.reportKey}`);
    }

    return {
      reportKey: query.reportKey,
      generatedAt: new Date(),
      rows: rows.slice(0, 500),
      totalRows: rows.length,
    };
  }

  private async headcount(query: ReportQueryDto): Promise<Record<string, unknown>[]> {
    const rows = await this.prisma.unscopedClient.$queryRawUnsafe<
      Array<Record<string, unknown>>
    >(
      `SELECT
        d.name AS department,
        e.employment_type,
        COUNT(e.id)::int AS active_count
      FROM employees e
      LEFT JOIN departments d ON d.id = e.department_id
      WHERE e.status = 'ACTIVE'
        AND e.joined_at <= $2::date
        AND (e.exited_at IS NULL OR e.exited_at > $1::date)
        ${query.departmentId ? 'AND e.department_id = $3::uuid' : ''}
      GROUP BY d.name, e.employment_type
      ORDER BY d.name, e.employment_type`,
      query.departmentId
        ? [query.startDate, query.endDate, query.departmentId]
        : [query.startDate, query.endDate],
    );
    return rows;
  }

  private async attrition(query: ReportQueryDto): Promise<Record<string, unknown>[]> {
    const rows = await this.prisma.unscopedClient.$queryRawUnsafe<
      Array<Record<string, unknown>>
    >(
      `WITH opening AS (
        SELECT d.name AS department, COUNT(e.id)::int AS opening_count
        FROM employees e
        LEFT JOIN departments d ON d.id = e.department_id
        WHERE e.joined_at <= $1::date
          AND (e.exited_at IS NULL OR e.exited_at > $1::date)
          ${query.departmentId ? 'AND e.department_id = $3::uuid' : ''}
        GROUP BY d.name
      ),
      closing AS (
        SELECT d.name AS department, COUNT(e.id)::int AS closing_count
        FROM employees e
        LEFT JOIN departments d ON d.id = e.department_id
        WHERE e.joined_at <= $2::date
          AND (e.exited_at IS NULL OR e.exited_at > $2::date)
          ${query.departmentId ? 'AND e.department_id = $3::uuid' : ''}
        GROUP BY d.name
      ),
      exits AS (
        SELECT d.name AS department, COUNT(e.id)::int AS exit_count
        FROM employees e
        LEFT JOIN departments d ON d.id = e.department_id
        WHERE e.exited_at >= $1::date AND e.exited_at <= $2::date
          ${query.departmentId ? 'AND e.department_id = $3::uuid' : ''}
        GROUP BY d.name
      )
      SELECT
        COALESCE(o.department, e.department) AS department,
        COALESCE(o.opening_count, 0) AS opening_headcount,
        COALESCE(c.closing_count, 0) AS closing_headcount,
        COALESCE(e.exit_count, 0) AS exits,
        ROUND(
          CASE
            WHEN (COALESCE(o.opening_count, 0) + COALESCE(c.closing_count, 0)) > 0
            THEN COALESCE(e.exit_count, 0)::numeric
              / ((COALESCE(o.opening_count, 0) + COALESCE(c.closing_count, 0)) / 2.0)
            ELSE 0
          END,
          4
        ) AS attrition_rate
      FROM opening o
      FULL OUTER JOIN closing c ON o.department = c.department
      FULL OUTER JOIN exits e ON COALESCE(o.department, c.department) = e.department
      ORDER BY department`,
      query.departmentId
        ? [query.startDate, query.endDate, query.departmentId]
        : [query.startDate, query.endDate],
    );
    return rows;
  }

  private async payrollSummary(query: ReportQueryDto): Promise<Record<string, unknown>[]> {
    let sql: string;
    let params: string[];

    if (query.departmentId) {
      sql = `SELECT
        d.name AS department,
        pe.cycle_id AS payroll_period,
        SUM(pe.gross_earnings) AS total_gross,
        SUM(pe.total_deductions) AS total_deductions,
        SUM(pe.net_payable) AS total_net,
        COUNT(DISTINCT pe.employee_id)::int AS employee_count
      FROM payroll_entries pe
      JOIN employees e ON e.id = pe.employee_id
      LEFT JOIN departments d ON d.id = e.department_id
      WHERE e.department_id = $3::uuid
        AND pe.created_at >= $1::timestamptz AND pe.created_at <= $2::timestamptz
      GROUP BY d.name, pe.cycle_id
      ORDER BY d.name, pe.cycle_id`;
      params = [query.startDate, query.endDate, query.departmentId];
    } else {
      sql = `SELECT
        d.name AS department,
        pe.cycle_id AS payroll_period,
        SUM(pe.gross_earnings) AS total_gross,
        SUM(pe.total_deductions) AS total_deductions,
        SUM(pe.net_payable) AS total_net,
        COUNT(DISTINCT pe.employee_id)::int AS employee_count
      FROM payroll_entries pe
      JOIN employees e ON e.id = pe.employee_id
      LEFT JOIN departments d ON d.id = e.department_id
      WHERE pe.created_at >= $1::timestamptz AND pe.created_at <= $2::timestamptz
      GROUP BY d.name, pe.cycle_id
      ORDER BY d.name, pe.cycle_id`;
      params = [query.startDate, query.endDate];
    }

    const rows = await this.prisma.unscopedClient.$queryRawUnsafe<
      Array<Record<string, unknown>>
    >(sql, ...params);

    return rows.map((row) => ({
      ...row,
      total_gross: round2dp(Number(row.total_gross ?? 0)),
      total_deductions: round2dp(Number(row.total_deductions ?? 0)),
      total_net: round2dp(Number(row.total_net ?? 0)),
    }));
  }

  private async leaveUtilization(query: ReportQueryDto): Promise<Record<string, unknown>[]> {
    let sql: string;
    let params: (string | undefined)[];

    if (query.departmentId && query.leaveType) {
      sql = `SELECT
        lt.name AS leave_type,
        d.name AS department,
        e.id AS employee_id,
        u.first_name || ' ' || u.last_name AS employee_name,
        lb.entitled AS days_entitled,
        lb.used AS days_taken,
        lb.balance AS days_remaining
      FROM leave_balances lb
      JOIN employees e ON e.id = lb.employee_id
      JOIN users u ON u.id = e.user_id
      JOIN leave_types lt ON lt.id = lb.leave_type_id
      LEFT JOIN departments d ON d.id = e.department_id
      WHERE e.department_id = $3::uuid
        AND lt.code = $4
        AND lb.year = EXTRACT(YEAR FROM $2::date)::int
      ORDER BY d.name, u.first_name, u.last_name`;
      params = [query.startDate, query.endDate, query.departmentId, query.leaveType];
    } else if (query.departmentId) {
      sql = `SELECT
        lt.name AS leave_type,
        d.name AS department,
        e.id AS employee_id,
        u.first_name || ' ' || u.last_name AS employee_name,
        lb.entitled AS days_entitled,
        lb.used AS days_taken,
        lb.balance AS days_remaining
      FROM leave_balances lb
      JOIN employees e ON e.id = lb.employee_id
      JOIN users u ON u.id = e.user_id
      JOIN leave_types lt ON lt.id = lb.leave_type_id
      LEFT JOIN departments d ON d.id = e.department_id
      WHERE e.department_id = $3::uuid
        AND lb.year = EXTRACT(YEAR FROM $2::date)::int
      ORDER BY lt.name, d.name, u.first_name, u.last_name`;
      params = [query.startDate, query.endDate, query.departmentId];
    } else if (query.leaveType) {
      sql = `SELECT
        lt.name AS leave_type,
        d.name AS department,
        e.id AS employee_id,
        u.first_name || ' ' || u.last_name AS employee_name,
        lb.entitled AS days_entitled,
        lb.used AS days_taken,
        lb.balance AS days_remaining
      FROM leave_balances lb
      JOIN employees e ON e.id = lb.employee_id
      JOIN users u ON u.id = e.user_id
      JOIN leave_types lt ON lt.id = lb.leave_type_id
      LEFT JOIN departments d ON d.id = e.department_id
      WHERE lt.code = $3
        AND lb.year = EXTRACT(YEAR FROM $2::date)::int
      ORDER BY d.name, u.first_name, u.last_name`;
      params = [query.startDate, query.endDate, query.leaveType];
    } else {
      sql = `SELECT
        lt.name AS leave_type,
        d.name AS department,
        e.id AS employee_id,
        u.first_name || ' ' || u.last_name AS employee_name,
        lb.entitled AS days_entitled,
        lb.used AS days_taken,
        lb.balance AS days_remaining
      FROM leave_balances lb
      JOIN employees e ON e.id = lb.employee_id
      JOIN users u ON u.id = e.user_id
      JOIN leave_types lt ON lt.id = lb.leave_type_id
      LEFT JOIN departments d ON d.id = e.department_id
      WHERE lb.year = EXTRACT(YEAR FROM $2::date)::int
      ORDER BY lt.name, d.name, u.first_name, u.last_name`;
      params = [query.startDate, query.endDate];
    }

    const rows = await this.prisma.unscopedClient.$queryRawUnsafe<
      Array<Record<string, unknown>>
    >(sql, ...params);
    return rows;
  }

  private async attendanceSummary(query: ReportQueryDto): Promise<Record<string, unknown>[]> {
    let sql: string;
    let params: string[];

    if (query.departmentId) {
      sql = `SELECT
        d.name AS department,
        e.id AS employee_id,
        u.first_name || ' ' || u.last_name AS employee_name,
        COUNT(CASE WHEN al.status = 'PRESENT' THEN 1 END)::int AS present_days,
        COUNT(CASE WHEN al.status = 'ABSENT' THEN 1 END)::int AS absent_days,
        COUNT(CASE WHEN al.status = 'LATE' THEN 1 END)::int AS late_days,
        COUNT(CASE WHEN al.status = 'WFH' THEN 1 END)::int AS wfh_days
      FROM attendance_logs al
      JOIN employees e ON e.id = al.employee_id
      JOIN users u ON u.id = e.user_id
      LEFT JOIN departments d ON d.id = e.department_id
      WHERE al.date >= $1::date AND al.date <= $2::date
        AND e.department_id = $3::uuid
      GROUP BY d.name, e.id, u.first_name, u.last_name
      ORDER BY d.name, u.first_name, u.last_name`;
      params = [query.startDate, query.endDate, query.departmentId];
    } else {
      sql = `SELECT
        d.name AS department,
        e.id AS employee_id,
        u.first_name || ' ' || u.last_name AS employee_name,
        COUNT(CASE WHEN al.status = 'PRESENT' THEN 1 END)::int AS present_days,
        COUNT(CASE WHEN al.status = 'ABSENT' THEN 1 END)::int AS absent_days,
        COUNT(CASE WHEN al.status = 'LATE' THEN 1 END)::int AS late_days,
        COUNT(CASE WHEN al.status = 'WFH' THEN 1 END)::int AS wfh_days
      FROM attendance_logs al
      JOIN employees e ON e.id = al.employee_id
      JOIN users u ON u.id = e.user_id
      LEFT JOIN departments d ON d.id = e.department_id
      WHERE al.date >= $1::date AND al.date <= $2::date
      GROUP BY d.name, e.id, u.first_name, u.last_name
      ORDER BY d.name, u.first_name, u.last_name`;
      params = [query.startDate, query.endDate];
    }

    const rows = await this.prisma.unscopedClient.$queryRawUnsafe<
      Array<Record<string, unknown>>
    >(sql, ...params);
    return rows;
  }

  private async newHires(query: ReportQueryDto): Promise<Record<string, unknown>[]> {
    let sql: string;
    let params: string[];

    if (query.departmentId) {
      sql = `SELECT
        d.name AS department,
        e.id AS employee_id,
        u.first_name || ' ' || u.last_name AS employee_name,
        e.employment_type,
        e.joined_at AS joining_date,
        jt.title AS job_title
      FROM employees e
      JOIN users u ON u.id = e.user_id
      LEFT JOIN departments d ON d.id = e.department_id
      LEFT JOIN job_titles jt ON jt.id = e.job_title_id
      WHERE e.joined_at >= $1::date AND e.joined_at <= $2::date
        AND e.department_id = $3::uuid
      ORDER BY d.name, e.joined_at DESC`;
      params = [query.startDate, query.endDate, query.departmentId];
    } else {
      sql = `SELECT
        d.name AS department,
        e.id AS employee_id,
        u.first_name || ' ' || u.last_name AS employee_name,
        e.employment_type,
        e.joined_at AS joining_date,
        jt.title AS job_title
      FROM employees e
      JOIN users u ON u.id = e.user_id
      LEFT JOIN departments d ON d.id = e.department_id
      LEFT JOIN job_titles jt ON jt.id = e.job_title_id
      WHERE e.joined_at >= $1::date AND e.joined_at <= $2::date
      ORDER BY d.name, e.joined_at DESC`;
      params = [query.startDate, query.endDate];
    }

    const rows = await this.prisma.unscopedClient.$queryRawUnsafe<
      Array<Record<string, unknown>>
    >(sql, ...params);
    return rows;
  }

  private async exits(query: ReportQueryDto): Promise<Record<string, unknown>[]> {
    let sql: string;
    let params: string[];

    if (query.departmentId) {
      sql = `SELECT
        d.name AS department,
        e.id AS employee_id,
        u.first_name || ' ' || u.last_name AS employee_name,
        e.exit_reason,
        e.exited_at AS exit_date,
        e.last_working_date
      FROM employees e
      JOIN users u ON u.id = e.user_id
      LEFT JOIN departments d ON d.id = e.department_id
      WHERE e.exited_at >= $1::date AND e.exited_at <= $2::date
        AND e.department_id = $3::uuid
      ORDER BY d.name, e.exited_at DESC`;
      params = [query.startDate, query.endDate, query.departmentId];
    } else {
      sql = `SELECT
        d.name AS department,
        e.id AS employee_id,
        u.first_name || ' ' || u.last_name AS employee_name,
        e.exit_reason,
        e.exited_at AS exit_date,
        e.last_working_date
      FROM employees e
      JOIN users u ON u.id = e.user_id
      LEFT JOIN departments d ON d.id = e.department_id
      WHERE e.exited_at >= $1::date AND e.exited_at <= $2::date
      ORDER BY d.name, e.exited_at DESC`;
      params = [query.startDate, query.endDate];
    }

    const rows = await this.prisma.unscopedClient.$queryRawUnsafe<
      Array<Record<string, unknown>>
    >(sql, ...params);
    return rows;
  }
}
