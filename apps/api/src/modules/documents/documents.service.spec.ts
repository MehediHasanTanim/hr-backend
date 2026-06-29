import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Test } from '@nestjs/testing';
import { DocumentsService } from './documents.service';
import { PrismaService } from '@hr/prisma';
import { AuditService } from '../audit/audit.service';
import { DomainEventsService } from '../employees/events/domain-events.service';
import { S3Service } from '../../common/s3/s3.service';
import { DOCUMENT_UPLOADED } from '../../common/events/hr-events.constants';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { PassThrough } from 'node:stream';

describe('DocumentsService', () => {
  let service: DocumentsService;
  let mockPrisma: Record<string, unknown>;
  let mockAudit: { record: ReturnType<typeof vi.fn> };
  let mockEvents: { emit: ReturnType<typeof vi.fn> };
  let mockS3: { uploadStream: ReturnType<typeof vi.fn>; getSignedUrl: ReturnType<typeof vi.fn> };

  const mockUser = {
    userId: 'user-1',
    companyId: 'company-1',
    email: 'admin@test.com',
    roles: ['admin'],
    permissions: ['admin:read', 'admin:write'],
    sessionId: 'session-1',
    traceId: 'trace-1',
  };

  beforeEach(async () => {
    mockAudit = { record: vi.fn().mockResolvedValue(undefined) };
    mockEvents = { emit: vi.fn() };
    mockS3 = {
      uploadStream: vi.fn().mockResolvedValue(undefined),
      getSignedUrl: vi.fn().mockResolvedValue('https://signed.url/test'),
    };

    mockPrisma = {
      unscopedClient: {
        employeeDocument: {
          findMany: vi.fn().mockResolvedValue([]),
          findUnique: vi.fn(),
          create: vi.fn(),
        },
        employee: {
          findUnique: vi.fn(),
        },
        $transaction: vi.fn((cb: (tx: unknown) => unknown) =>
          cb(mockPrisma.unscopedClient),
        ),
      },
    };

    const module = await Test.createTestingModule({
      providers: [
        DocumentsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditService, useValue: mockAudit },
        { provide: DomainEventsService, useValue: mockEvents },
        { provide: S3Service, useValue: mockS3 },
      ],
    }).compile();

    service = module.get(DocumentsService);
  });

  describe('getSignedUrl', () => {
    it('should return signed URL for authorized requester (owner)', async () => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      (mockPrisma.unscopedClient.employeeDocument.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'doc-1',
        employeeId: mockUser.userId,
        companyId: mockUser.companyId,
        s3Key: 'documents/emp-1/contract/uuid-v1.pdf',
      });

      const result = await service.getSignedUrl('doc-1', mockUser);

      expect(result.signedUrl).toBe('https://signed.url/test');
      expect(result.expiresInSeconds).toBe(900);
      expect(mockS3.getSignedUrl).toHaveBeenCalledWith(
        'documents/emp-1/contract/uuid-v1.pdf',
        900,
      );
    });

    it('should throw NotFoundException for missing document', async () => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      (mockPrisma.unscopedClient.employeeDocument.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      await expect(service.getSignedUrl('nonexistent', mockUser)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw ForbiddenException for unauthorized requester', async () => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      (mockPrisma.unscopedClient.employeeDocument.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'doc-1',
        employeeId: 'other-employee',
        companyId: mockUser.companyId,
        s3Key: 'documents/emp-1/contract/uuid-v1.pdf',
      });
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      (mockPrisma.unscopedClient.employee.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
        managerId: 'other-manager',
      });

      const nonAdminUser = { ...mockUser, permissions: [] };
      await expect(service.getSignedUrl('doc-1', nonAdminUser)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should allow manager access', async () => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      (mockPrisma.unscopedClient.employeeDocument.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'doc-1',
        employeeId: 'other-employee',
        companyId: mockUser.companyId,
        s3Key: 'documents/emp-1/contract/uuid-v1.pdf',
      });
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      (mockPrisma.unscopedClient.employee.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
        managerId: mockUser.userId,
      });

      const result = await service.getSignedUrl('doc-1', mockUser);
      expect(result.signedUrl).toBe('https://signed.url/test');
    });

    it('should not persist signed URL', async () => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      (mockPrisma.unscopedClient.employeeDocument.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'doc-1',
        employeeId: mockUser.userId,
        companyId: mockUser.companyId,
        s3Key: 'documents/emp-1/contract/uuid-v1.pdf',
      });

      await service.getSignedUrl('doc-1', mockUser);

      // Verify no update/upsert was called to persist the URL
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(mockPrisma.unscopedClient.employeeDocument.create).not.toHaveBeenCalled();
    });
  });

  describe('uploadDocument', () => {
    it('should upload document and emit event', async () => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      (mockPrisma.unscopedClient.employeeDocument.create as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'doc-new',
        employeeId: 'emp-1',
        category: 'CONTRACT',
        name: 'contract.pdf',
        mimeType: 'application/pdf',
        fileSize: 1024,
        s3Key: 'documents/emp-1/contract/uuid-v1.pdf',
        sha256Hash: 'abc123',
        version: 1,
        description: 'Test doc',
        uploadedById: mockUser.userId,
        createdAt: new Date(),
        type: 'CONTRACT',
      });

      const fileStream = new PassThrough();
      const file = {
        filename: 'contract.pdf',
        mimetype: 'application/pdf',
        file: fileStream,
      };

      // Write some data and end stream
      fileStream.write('test content');
      fileStream.end();

      const result = await service.uploadDocument(
        'emp-1',
        file,
        { category: 'CONTRACT', description: 'Test doc' },
        mockUser,
      );

      expect(result).toHaveProperty('id', 'doc-new');
      expect(result).toHaveProperty('category', 'CONTRACT');
      expect(mockS3.uploadStream).toHaveBeenCalled();
      expect(mockAudit.record).toHaveBeenCalled();
      expect(mockEvents.emit).toHaveBeenCalledWith(DOCUMENT_UPLOADED, expect.any(Object));
    });

    it('should increment version for existing documents', async () => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      (mockPrisma.unscopedClient.employeeDocument.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
        { version: 3 },
      ]);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      (mockPrisma.unscopedClient.employeeDocument.create as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'doc-new',
        employeeId: 'emp-1',
        category: 'CONTRACT',
        name: 'contract.pdf',
        mimeType: 'application/pdf',
        fileSize: 1024,
        s3Key: 'documents/emp-1/contract/uuid-v4.pdf',
        sha256Hash: 'abc123',
        version: 4,
        description: 'Test doc',
        uploadedById: mockUser.userId,
        createdAt: new Date(),
        type: 'CONTRACT',
      });

      const fileStream = new PassThrough();
      fileStream.write('test');
      fileStream.end();

      await service.uploadDocument(
        'emp-1',
        { filename: 'contract.pdf', mimetype: 'application/pdf', file: fileStream },
        { category: 'CONTRACT' },
        mockUser,
      );

      expect(mockS3.uploadStream).toHaveBeenCalledWith(
        expect.objectContaining({ key: expect.stringContaining('-v4') }),
      );
    });
  });

  describe('listDocuments', () => {
    it('should list documents for employee', async () => {
      const mockDocs = [
        {
          id: 'doc-1',
          employeeId: 'emp-1',
          category: 'CONTRACT',
          name: 'contract.pdf',
          mimeType: 'application/pdf',
          fileSize: 1024,
          version: 1,
          sha256Hash: 'abc',
          description: null,
          uploadedById: 'user-1',
          createdAt: new Date(),
          type: 'CONTRACT',
        },
      ];
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      (mockPrisma.unscopedClient.employeeDocument.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(mockDocs);

      const result = await service.listDocuments('emp-1', 'company-1');
      expect(result).toHaveLength(1);
      expect(result[0]).not.toHaveProperty('s3Key');
      expect(result[0]).toHaveProperty('originalName');
    });
  });
});
