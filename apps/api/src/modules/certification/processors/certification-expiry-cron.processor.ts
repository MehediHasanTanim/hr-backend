import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@hr/prisma';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AuditService } from '../../audit/audit.service';

@Injectable()
export class CertificationExpiryCronProcessor {
  private readonly logger = new Logger(CertificationExpiryCronProcessor.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(EventEmitter2) private readonly events: EventEmitter2,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async processDailyExpiryCheck() {
    const today = new Date();
    const thirtyDaysFromNow = new Date(today.getTime() + 30 * 86400000);

    // Find all certs where expiryDate is within [today, today + 30d] and not already EXPIRED
    const expiringCerts = await this.prisma.unscopedClient.employeeCertification.findMany({
      where: {
        expiryDate: { not: null, lte: thirtyDaysFromNow },
        verificationStatus: { not: 'EXPIRED' },
      },
    });

    for (const ec of expiringCerts) {
      const expiryDate = new Date(ec.expiryDate!);

      if (expiryDate <= today) {
        // Past expiry: transition to EXPIRED
        await this.prisma.unscopedClient.$transaction(async (tx) => {
          await tx.employeeCertification.update({
            where: { id: ec.id },
            data: { verificationStatus: 'EXPIRED' },
          });
        });
        this.events.emit('certification.expired', { id: ec.id, certificationId: ec.certificationId, employeeId: ec.employeeId, expiryDate });
        this.audit.logAsync({ companyId: '', entityType: 'EmployeeCertification', entityId: ec.id, action: 'CERTIFICATION_EXPIRED', newValue: { certificationId: ec.certificationId, employeeId: ec.employeeId, expiryDate: ec.expiryDate } });
      } else {
        // Within warning window: emit warning event (notification only, no state change)
        const daysUntilExpiry = Math.ceil((expiryDate.getTime() - today.getTime()) / 86400000);
        if ([30, 14, 7].includes(daysUntilExpiry)) {
          this.events.emit('certification.expiry-warning', { id: ec.id, certificationId: ec.certificationId, employeeId: ec.employeeId, daysUntilExpiry });
        }
      }
    }

    this.logger.log(`Expiry check complete: ${expiringCerts.length} certifications processed`);
  }
}
