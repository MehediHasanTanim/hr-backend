import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '@hr/prisma';

@Injectable()
export class CertificateGenerationProcessor {
  private readonly logger = new Logger(CertificateGenerationProcessor.name);

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async process(enrollmentId: string) {
    // Idempotency guard: skip if certificate already generated
    const enrollment = await this.prisma.unscopedClient.courseEnrollment.findUnique({ where: { id: enrollmentId } });
    if (!enrollment) {
      this.logger.warn(`Enrollment ${enrollmentId} not found — skipping`);
      return;
    }
    if (enrollment.certificateKey) {
      this.logger.log(`Certificate already generated for enrollment ${enrollmentId} — skipping`);
      return;
    }

    // In production: render PDF via pdf-lib, upload to S3, persist key
    const certificateKey = `certificates/${enrollmentId}.pdf`;

    await this.prisma.unscopedClient.courseEnrollment.update({
      where: { id: enrollmentId },
      data: { certificateKey },
    });

    this.logger.log(`Certificate generated for enrollment ${enrollmentId}: ${certificateKey}`);
  }
}
