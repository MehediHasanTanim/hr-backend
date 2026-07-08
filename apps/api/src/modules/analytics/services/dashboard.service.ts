import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '@hr/prisma';

@Injectable()
export class WorkforceDemographicsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async getDemographics(companyId: string) {
    // Read-replica query — aggregate by department, employment type, tenure band
    const employees = await this.prisma.unscopedClient.employee.findMany({
      where: { companyId, status: 'ACTIVE' },
      select: { department: { select: { name: true } }, employmentType: true, joinedAt: true },
    });

    const byDepartment: Record<string, number> = {};
    const byType: Record<string, number> = {};
    const byTenure: Record<string, number> = { '0-1yr': 0, '1-3yr': 0, '3-5yr': 0, '5yr+': 0 };

    for (const emp of employees) {
      const dept = emp.department?.name ?? 'Unassigned';
      byDepartment[dept] = (byDepartment[dept] ?? 0) + 1;
      byType[emp.employmentType] = (byType[emp.employmentType] ?? 0) + 1;

      const years = (Date.now() - new Date(emp.joinedAt).getTime()) / (365.25 * 86400000);
      if (years < 1) byTenure['0-1yr']++;
      else if (years < 3) byTenure['1-3yr']++;
      else if (years < 5) byTenure['3-5yr']++;
      else byTenure['5yr+']++;
    }

    return { totalEmployees: employees.length, byDepartment, byType, byTenure };
  }
}

@Injectable()
export class PayrollTrendsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async getTrends(companyId: string, months: number = 12) {
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - months);

    const runs = await this.prisma.unscopedClient.payrollRun.findMany({
      where: { companyId, processedAt: { gte: cutoff } },
      select: { totalGross: true, totalNet: true, totalTax: true, processedAt: true },
      orderBy: { processedAt: 'asc' },
    });

    return {
      months,
      data: runs.map(r => ({
        date: r.processedAt?.toISOString().slice(0, 7),
        gross: Number(r.totalGross),
        net: Number(r.totalNet),
        tax: Number(r.totalTax),
      })),
    };
  }
}

@Injectable()
export class LeaveLiabilityService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async getLiability(companyId: string) {
    const balances = await this.prisma.unscopedClient.leaveBalance.findMany({
      where: { employee: { companyId, status: 'ACTIVE' } },
      include: {
        leaveType: { select: { isPaid: true, code: true } },
        employee: {
          include: { employeeSalaries: { where: { status: 'APPROVED' }, take: 1, orderBy: { effectiveFrom: 'desc' } } },
        },
      },
    });

    let totalLiability = 0;
    const items: Array<{ employeeId: string; leaveType: string; unusedDays: number; dailyRate: number; liability: number }> = [];

    for (const b of balances) {
      if (!b.leaveType.isPaid) continue;
      const unusedDays = Number(b.balance);
      if (unusedDays <= 0) continue;

      const salary = b.employee.employeeSalaries?.[0];
      const annualSalary = salary ? Number(salary.ctc) : 0;
      const dailyRate = annualSalary / 260; // Working days per year
      const liability = Math.round(unusedDays * dailyRate * 100) / 100;

      totalLiability += liability;
      items.push({ employeeId: b.employeeId, leaveType: b.leaveType.code, unusedDays, dailyRate: Math.round(dailyRate * 100) / 100, liability });
    }

    return { totalLiability: Math.round(totalLiability * 100) / 100, count: items.length, items };
  }
}
