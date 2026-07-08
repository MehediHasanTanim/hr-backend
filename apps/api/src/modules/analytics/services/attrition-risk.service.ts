import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '@hr/prisma';
import { computeAttritionRisk, type AttritionSignalInput } from '../domain/attrition-risk';
import { AuditService } from '../../audit/audit.service';

@Injectable()
export class AttritionRiskScoringService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async recomputeAllActive() {
    const employees = await this.prisma.unscopedClient.employee.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true, joinedAt: true },
    });

    let count = 0;
    for (const emp of employees) {
      const tenureMonths = this.computeTenureMonths(emp.joinedAt);

      // Stub: get last review rating and absence count from DB
      const input: AttritionSignalInput = {
        tenureMonths,
        lastReviewRating: null,
        absenceCountLast90d: 0,
      };

      const breakdown = computeAttritionRisk(input);

      await this.prisma.unscopedClient.$transaction(async (tx) => {
        // Flip isLatest flag on prior scores
        await tx.attritionRiskScore.updateMany({
          where: { employeeId: emp.id, isLatest: true },
          data: { isLatest: false },
        });
        // Insert new score
        await tx.attritionRiskScore.create({
          data: {
            employeeId: emp.id,
            riskScore: breakdown.totalScore,
            riskBand: breakdown.riskBand as any,
            signals: breakdown as any,
            computedAt: new Date(),
            isLatest: true,
          },
        });
      });
      count++;
    }

    this.audit.logAsync({ companyId: '', entityType: 'AttritionRiskScore', entityId: 'batch', action: 'ATTRITION_RISK_RECOMPUTED', newValue: { employeesProcessed: count } });
    return { processedCount: count };
  }

  private computeTenureMonths(joinedAt: Date): number {
    const now = new Date();
    return (now.getFullYear() - joinedAt.getFullYear()) * 12 + (now.getMonth() - joinedAt.getMonth());
  }

  async getLatestForEmployee(employeeId: string) {
    return this.prisma.unscopedClient.attritionRiskScore.findFirst({
      where: { employeeId, isLatest: true },
      orderBy: { computedAt: 'desc' },
    });
  }
}
