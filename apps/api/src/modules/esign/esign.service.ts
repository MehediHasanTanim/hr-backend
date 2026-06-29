import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  GoneException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '@hr/prisma';
import { AuditService } from '../audit/audit.service';
import { DomainEventsService } from '../employees/events/domain-events.service';
import { AppConfigService } from '../../config/config.service';
import {
  ESIGN_REQUEST_CREATED,
  ESIGN_DOCUMENT_SIGNED,
  ESIGN_REQUEST_DECLINED,
  ESIGN_REQUEST_EXPIRED,
  AUDIT_ACTIONS,
} from '../../common/events/hr-events.constants';
import type { RequestContext } from '../../common/context/request-context';
import type { CreateEsignRequestDto, SignDocumentDto, DeclineEsignDto } from './dto/esign.dto';

@Injectable()
export class EsignService {
  private readonly logger = new Logger(EsignService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(DomainEventsService) private readonly events: DomainEventsService,
    @Inject(AppConfigService) private readonly config: AppConfigService,
  ) {}

  async createRequest(dto: CreateEsignRequestDto, requestedBy: RequestContext) {
    // Validate document exists
    const doc = await this.prisma.unscopedClient.employeeDocument.findUnique({
      where: { id: dto.documentId },
    });
    if (!doc || doc.companyId !== requestedBy.companyId) {
      throw new NotFoundException('Document not found');
    }

    // Check no existing PENDING request for same (documentId, signerEmployeeId)
    const existing = await this.prisma.unscopedClient.esignRequest.findFirst({
      where: {
        documentId: dto.documentId,
        signerEmployeeId: dto.signerEmployeeId,
        status: 'PENDING',
      },
    });
    if (existing) {
      throw new ConflictException(
        'A pending e-signature request already exists for this document and signer',
      );
    }

    const expiryDays = parseInt(
      this.config.get('app')?.esignExpiryDays ?? '7',
      10,
    );
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + expiryDays);

    const request = await this.prisma.unscopedClient.$transaction(async (tx) => {
      const created = await tx.esignRequest.create({
        data: {
          companyId: requestedBy.companyId,
          documentId: dto.documentId,
          requestedBy: requestedBy.userId,
          signerEmployeeId: dto.signerEmployeeId,
          status: 'PENDING',
          expiresAt,
        },
      });

      await this.audit.record({
        actor: requestedBy,
        companyId: requestedBy.companyId,
        entityType: 'esign_request',
        entityId: created.id,
        action: AUDIT_ACTIONS.ESIGN_REQUEST_CREATED,
        newValue: {
          documentId: dto.documentId,
          signerEmployeeId: dto.signerEmployeeId,
          expiresAt: expiresAt.toISOString(),
        },
      });

      return created;
    });

    this.events.emit(ESIGN_REQUEST_CREATED, {
      esignRequestId: request.id,
      signerEmployeeId: dto.signerEmployeeId,
      documentId: dto.documentId,
      expiresAt: expiresAt.toISOString(),
      companyId: requestedBy.companyId,
    });

    return request;
  }

  async getRequest(id: string, companyId: string) {
    const request = await this.prisma.unscopedClient.esignRequest.findFirst({
      where: { id, companyId },
    });
    if (!request) {
      throw new NotFoundException('E-signature request not found');
    }
    return request;
  }

  async listRequests(companyId: string, documentId?: string, status?: string) {
    const where: Record<string, unknown> = { companyId };
    if (documentId) where.documentId = documentId;
    if (status) where.status = status;

    return this.prisma.unscopedClient.esignRequest.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
  }

  async signDocument(requestId: string, signerId: string, dto: SignDocumentDto) {
    const request = await this.prisma.unscopedClient.esignRequest.findUnique({
      where: { id: requestId },
    });
    if (!request) {
      throw new NotFoundException('E-signature request not found');
    }

    // Ownership guard
    if (request.signerEmployeeId !== signerId) {
      throw new ForbiddenException('Only the designated signer can sign this document');
    }

    // Status guard
    if (request.status !== 'PENDING') {
      throw new BadRequestException(
        `Cannot sign a request with status: ${request.status}`,
      );
    }

    // Expiry check (synchronous guard)
    if (new Date() > request.expiresAt) {
      // Transition to EXPIRED inline
      await this.prisma.unscopedClient.esignRequest.update({
        where: { id: requestId },
        data: { status: 'EXPIRED' },
      });
      await this.audit.record({
        companyId: request.companyId,
        entityType: 'esign_request',
        entityId: requestId,
        action: AUDIT_ACTIONS.ESIGN_REQUEST_EXPIRED,
      });
      throw new GoneException('E-signature request has expired');
    }

    // Fetch document SHA-256 hash for integrity proof
    const doc = await this.prisma.unscopedClient.employeeDocument.findUnique({
      where: { id: request.documentId },
      select: { sha256Hash: true },
    });
    const documentSha256AtSign = doc?.sha256Hash ?? null;

    const updated = await this.prisma.unscopedClient.$transaction(async (tx) => {
      const result = await tx.esignRequest.update({
        where: { id: requestId },
        data: {
          status: 'SIGNED',
          base64Signature: dto.base64Signature,
          documentSha256AtSign,
          signedAt: new Date(),
        },
      });

      await this.audit.record({
        companyId: request.companyId,
        entityType: 'esign_request',
        entityId: requestId,
        action: AUDIT_ACTIONS.ESIGN_DOCUMENT_SIGNED,
        newValue: {
          requestId,
          documentId: request.documentId,
          signerEmployeeId: signerId,
          documentSha256AtSign,
        },
      });

      return result;
    });

    this.events.emit(ESIGN_DOCUMENT_SIGNED, {
      esignRequestId: requestId,
      signerEmployeeId: signerId,
      companyId: request.companyId,
    });

    return updated;
  }

  async declineRequest(requestId: string, signerId: string, dto: DeclineEsignDto) {
    const request = await this.prisma.unscopedClient.esignRequest.findUnique({
      where: { id: requestId },
    });
    if (!request) {
      throw new NotFoundException('E-signature request not found');
    }

    if (request.signerEmployeeId !== signerId) {
      throw new ForbiddenException('Only the designated signer can decline this document');
    }

    if (request.status !== 'PENDING') {
      throw new BadRequestException(
        `Cannot decline a request with status: ${request.status}`,
      );
    }

    if (new Date() > request.expiresAt) {
      await this.prisma.unscopedClient.esignRequest.update({
        where: { id: requestId },
        data: { status: 'EXPIRED' },
      });
      throw new GoneException('E-signature request has expired');
    }

    const updated = await this.prisma.unscopedClient.$transaction(async (tx) => {
      const result = await tx.esignRequest.update({
        where: { id: requestId },
        data: {
          status: 'DECLINED',
          declineReason: dto.reason ?? null,
          declinedAt: new Date(),
        },
      });

      await this.audit.record({
        companyId: request.companyId,
        entityType: 'esign_request',
        entityId: requestId,
        action: AUDIT_ACTIONS.ESIGN_REQUEST_DECLINED,
        newValue: {
          requestId,
          signerEmployeeId: signerId,
          reason: dto.reason ?? null,
        },
      });

      return result;
    });

    this.events.emit(ESIGN_REQUEST_DECLINED, {
      esignRequestId: requestId,
      companyId: request.companyId,
    });

    return updated;
  }

  /**
   * Background job to expire stale pending requests.
   * Called by @Cron every hour or via BullMQ scheduler.
   */
  @Cron(CronExpression.EVERY_HOUR)
  async expireStaleRequests(): Promise<void> {
    const batchSize = 50;
    let processed = 0;

    try {
      while (true) {
        // eslint-disable-next-line no-await-in-loop
        const stale = await this.prisma.unscopedClient.esignRequest.findMany({
          where: {
            status: 'PENDING',
            expiresAt: { lt: new Date() },
          },
          take: batchSize,
        });

        if (stale.length === 0) break;

        for (const request of stale) {
          // eslint-disable-next-line no-await-in-loop
          await this.prisma.unscopedClient.$transaction(async (tx) => {
            await tx.esignRequest.update({
              where: { id: request.id },
              data: { status: 'EXPIRED' },
            });

            await this.audit.record({
              companyId: request.companyId,
              entityType: 'esign_request',
              entityId: request.id,
              action: AUDIT_ACTIONS.ESIGN_REQUEST_EXPIRED,
              newValue: {
                requestId: request.id,
                documentId: request.documentId,
                signerEmployeeId: request.signerEmployeeId,
              },
            });
          });

          this.events.emit(ESIGN_REQUEST_EXPIRED, {
            esignRequestId: request.id,
            companyId: request.companyId,
          });
        }

        processed += stale.length;
      }

      if (processed > 0) {
        this.logger.log(`Expired ${processed} stale e-signature requests`);
      }
    } catch (err) {
      this.logger.error('Failed to expire stale e-signature requests', err);
    }
  }
}
