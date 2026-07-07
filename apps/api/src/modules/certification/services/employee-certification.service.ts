import { Inject, Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '@hr/prisma';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AuditService } from '../../audit/audit.service';

@Injectable()
export class EmployeeCertificationService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(EventEmitter2) private readonly events: EventEmitter2,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async recordCertification(employeeId: string, dto: {
    certificationId: string; credentialNumber?: string; issuedDate: string;
    evidenceDocumentKey?: string; companyId: string;
  }) {
    const cert = await this.prisma.unscopedClient.certification.findUnique({ where: { id: dto.certificationId } });
    if (!cert) throw new NotFoundException('Certification not found');

    const expiryDate = cert.validityMonths
      ? new Date(new Date(dto.issuedDate).setMonth(new Date(dto.issuedDate).getMonth() + cert.validityMonths))
      : null;

    return this.prisma.unscopedClient.employeeCertification.create({
      data: {
        employeeId,
        certificationId: dto.certificationId,
        credentialNumber: dto.credentialNumber,
        issuedDate: new Date(dto.issuedDate),
        expiryDate,
        evidenceDocumentKey: dto.evidenceDocumentKey,
      },
    });
  }

  async verifyCertification(id: string, actorId: string) {
    const ec = await this.prisma.unscopedClient.employeeCertification.findUnique({ where: { id } });
    if (!ec) throw new NotFoundException('Employee certification not found');
    if (ec.verificationStatus === 'VERIFIED') throw new BadRequestException('Already verified');

    const result = await this.prisma.unscopedClient.employeeCertification.update({
      where: { id },
      data: { verificationStatus: 'VERIFIED', verifiedById: actorId, verifiedAt: new Date() },
    });

    this.events.emit('certification.verified', { id, certificationId: ec.certificationId, employeeId: ec.employeeId });
    this.audit.logAsync({ companyId: '', entityType: 'EmployeeCertification', entityId: id, action: 'CERTIFICATION_VERIFIED', newValue: { certificationId: ec.certificationId, employeeId: ec.employeeId, verifiedById: actorId } });

    return result;
  }

  async revokeCertification(id: string, actorId: string, reason: string) {
    const ec = await this.prisma.unscopedClient.employeeCertification.findUnique({ where: { id } });
    if (!ec) throw new NotFoundException('Employee certification not found');

    return this.prisma.unscopedClient.employeeCertification.update({
      where: { id },
      data: { verificationStatus: 'REVOKED' },
    });
  }

  async findByEmployee(employeeId: string) {
    return this.prisma.unscopedClient.employeeCertification.findMany({
      where: { employeeId },
      include: { certification: true },
      orderBy: { issuedDate: 'desc' },
    });
  }

  async findById(id: string) {
    const ec = await this.prisma.unscopedClient.employeeCertification.findUnique({
      where: { id }, include: { certification: true },
    });
    if (!ec) throw new NotFoundException('Employee certification not found');
    return ec;
  }
}
