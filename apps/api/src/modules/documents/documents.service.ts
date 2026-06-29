import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '@hr/prisma';
import { AuditService, type AuditEntry } from '../audit/audit.service';
import { DomainEventsService } from '../employees/events/domain-events.service';
import { S3Service } from '../../common/s3/s3.service';
import {
  DOCUMENT_UPLOADED,
  DOCUMENT_SIGNED_URL_GENERATED,
  AUDIT_ACTIONS,
} from '../../common/events/hr-events.constants';
import type { RequestContext } from '../../common/context/request-context';
import type { UploadDocumentDto } from './dto/upload-document.dto';
import * as crypto from 'node:crypto';
import { extname } from 'node:path';
import { PassThrough } from 'node:stream';

@Injectable()
export class DocumentsService {
  private readonly logger = new Logger(DocumentsService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(DomainEventsService) private readonly events: DomainEventsService,
    @Inject(S3Service) private readonly s3: S3Service,
  ) {}

  /**
   * Upload a document. Receives a multipart file stream, computes SHA-256 on-the-fly,
   * determines version, uploads to S3 via streaming, and saves metadata.
   */
  async uploadDocument(
    employeeId: string,
    file: { filename: string; mimetype: string; file: NodeJS.ReadableStream },
    dto: UploadDocumentDto,
    uploadedBy: RequestContext,
  ): Promise<Record<string, unknown>> {
    // Determine version
    const existing = await this.prisma.unscopedClient.employeeDocument.findMany({
      where: {
        employeeId,
        category: dto.category,
        name: file.filename,
        companyId: uploadedBy.companyId,
      },
      orderBy: { version: 'desc' },
      take: 1,
    });
    const version = existing.length > 0 ? existing[0].version + 1 : 1;

    const ext = extname(file.filename).toLowerCase() || '.bin';
    const s3Key = `documents/${employeeId}/${dto.category.toLowerCase()}/${crypto.randomUUID()}-v${version}${ext}`;

    // Compute SHA-256 hash while uploading to S3
    const hash = crypto.createHash('sha256');
    const passThrough = new PassThrough();

    // Pipe file through hash and passthrough simultaneously
    let fileSize = 0;
    const hashPromise = new Promise<string>((resolve, reject) => {
      file.file.on('data', (chunk: Buffer) => {
        fileSize += chunk.length;
        hash.update(chunk);
        passThrough.write(chunk);
      });
      file.file.on('end', () => {
        passThrough.end();
        resolve(hash.digest('hex'));
      });
      file.file.on('error', (err: Error) => {
        passThrough.destroy(err);
        reject(err);
      });
    });

    // Upload stream to S3
    const uploadPromise = this.s3.uploadStream({
      key: s3Key,
      body: passThrough,
      contentType: file.mimetype,
    });

    const [sha256Hash] = await Promise.all([hashPromise, uploadPromise]);

    // Save to database inside a transaction
    const doc = await this.prisma.unscopedClient.$transaction(async (tx) => {
      const created = await tx.employeeDocument.create({
        data: {
          companyId: uploadedBy.companyId,
          employeeId,
          category: dto.category,
          name: file.filename,
          type: dto.category,
          mimeType: file.mimetype,
          fileSize,
          s3Key,
          sha256Hash,
          version,
          description: dto.description ?? null,
          uploadedById: uploadedBy.userId,
        },
      });

      // Audit log inside transaction
      await this.audit.record({
        actor: uploadedBy,
        companyId: uploadedBy.companyId,
        entityType: 'employee_document',
        entityId: created.id,
        action: AUDIT_ACTIONS.DOCUMENT_UPLOADED,
        newValue: {
          employeeId,
          category: dto.category,
          version,
          sha256Hash,
          fileSize,
        },
      });

      return created;
    });

    // Emit event post-commit
    this.events.emit(DOCUMENT_UPLOADED, {
      documentId: doc.id,
      employeeId,
      category: dto.category,
      companyId: uploadedBy.companyId,
    });

    return this.toResponseDto(doc);
  }

  /**
   * Generate a pre-signed URL for viewing a document.
   * Authorization: requester must be the employee, their manager, or HR admin.
   */
  async getSignedUrl(
    documentId: string,
    requester: RequestContext,
  ): Promise<{ signedUrl: string; expiresInSeconds: number }> {
    const doc = await this.prisma.unscopedClient.employeeDocument.findUnique({
      where: { id: documentId },
    });

    if (!doc || doc.companyId !== requester.companyId) {
      throw new NotFoundException('Document not found');
    }

    // Authorization check
    const isOwner = doc.employeeId === requester.userId;
    let isManager = false;
    let isHrAdmin = false;

    if (!isOwner) {
      // Check if requester is manager of the document's employee
      const employee = await this.prisma.unscopedClient.employee.findUnique({
        where: { id: doc.employeeId },
        select: { managerId: true },
      });
      isManager = employee?.managerId === requester.userId;

      // Check if requester has admin role
      isHrAdmin = requester.permissions?.includes('admin:read') ?? false;
    }

    if (!isOwner && !isManager && !isHrAdmin) {
      throw new ForbiddenException('You do not have permission to access this document');
    }

    if (!doc.s3Key) {
      throw new NotFoundException('Document file not found in storage');
    }

    const expiresInSeconds = 900;
    const signedUrl = await this.s3.getSignedUrl(doc.s3Key, expiresInSeconds);

    // Fire-and-forget audit for signed URL generation (no URL in metadata)
    this.audit
      .record({
        actor: requester,
        companyId: requester.companyId,
        entityType: 'employee_document',
        entityId: doc.id,
        action: AUDIT_ACTIONS.DOCUMENT_SIGNED_URL_GENERATED,
        newValue: { documentId: doc.id, requesterId: requester.userId },
      })
      .catch((err: Error) =>
        this.logger.error('Failed to record signed URL audit', err),
      );

    return { signedUrl, expiresInSeconds };
  }

  /**
   * List documents for an employee, optionally filtered by category.
   */
  async listDocuments(
    employeeId: string,
    companyId: string,
    category?: string,
  ): Promise<Record<string, unknown>[]> {
    const where: Record<string, unknown> = {
      employeeId,
      companyId,
      deletedAt: null,
    };
    if (category) {
      where.category = category;
    }

    const docs = await this.prisma.unscopedClient.employeeDocument.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    return docs.map((d) => this.toResponseDto(d));
  }

  private toResponseDto(doc: Record<string, unknown>): Record<string, unknown> {
    return {
      id: doc.id,
      employeeId: doc.employeeId,
      category: doc.category ?? doc.type,
      originalName: doc.name,
      mimeType: doc.mimeType,
      sizeBytes: doc.fileSize,
      version: doc.version,
      sha256Hash: doc.sha256Hash,
      description: doc.description,
      uploadedBy: doc.uploadedById,
      createdAt: doc.createdAt,
    };
  }
}
