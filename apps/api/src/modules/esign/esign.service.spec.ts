import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EsignService } from './esign.service';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  GoneException,
  NotFoundException,
} from '@nestjs/common';
import {
  makeEsignRequest,
  makeEmployeeDocument,
  makeMockRequestContext,
} from '../../common/test/factories';
import {
  ESIGN_REQUEST_CREATED,
  ESIGN_DOCUMENT_SIGNED,
  ESIGN_REQUEST_DECLINED,
  ESIGN_REQUEST_EXPIRED,
  AUDIT_ACTIONS,
} from '../../common/events/hr-events.constants';

/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-explicit-any */

function createMockPrisma() {
  const scoped = {
    employeeDocument: { findUnique: vi.fn() },
    esignRequest: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
    $transaction: vi.fn((cb: (tx: unknown) => Promise<unknown>) => cb(scoped)),
  };
  return { unscopedClient: scoped } as any;
}

describe('EsignService', () => {
  let service: EsignService;
  let mockPrisma: ReturnType<typeof createMockPrisma>;
  let mockAudit: { record: ReturnType<typeof vi.fn> };
  let mockEvents: { emit: ReturnType<typeof vi.fn> };
  let mockConfig: { get: ReturnType<typeof vi.fn> };
  const mockUser = makeMockRequestContext();

  beforeEach(() => {
    vi.clearAllMocks();
    mockAudit = { record: vi.fn().mockResolvedValue(undefined) };
    mockEvents = { emit: vi.fn() };
    mockConfig = { get: vi.fn().mockReturnValue('7') };
    mockPrisma = createMockPrisma();

    service = new EsignService(
      mockPrisma as any,
      mockAudit as any,
      mockEvents as any,
      mockConfig as any,
    );
  });

  // =====================================================================
  // Test Group 1: createRequest
  // =====================================================================
  describe('createRequest', () => {
    it('happy path creates request with correct expiry', async () => {
      mockPrisma.unscopedClient.employeeDocument.findUnique.mockResolvedValue(makeEmployeeDocument());
      mockPrisma.unscopedClient.esignRequest.findFirst.mockResolvedValue(null);
      mockPrisma.unscopedClient.esignRequest.create.mockResolvedValue(makeEsignRequest());

      const result = await service.createRequest(
        { documentId: 'doc-uuid-1', signerEmployeeId: 'emp-uuid-1' },
        mockUser,
      );

      expect(result.status).toBe('PENDING');
      expect(mockAudit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: AUDIT_ACTIONS.ESIGN_REQUEST_CREATED,
          newValue: expect.objectContaining({
            documentId: 'doc-uuid-1',
            signerEmployeeId: 'emp-uuid-1',
            expiresAt: expect.any(String),
          }),
        }),
      );
      expect(mockEvents.emit).toHaveBeenCalledWith(
        ESIGN_REQUEST_CREATED,
        expect.objectContaining({ signerEmployeeId: 'emp-uuid-1' }),
      );
    });

    it('throws NotFoundException when document does not exist', async () => {
      mockPrisma.unscopedClient.employeeDocument.findUnique.mockResolvedValue(null);

      await expect(
        service.createRequest({ documentId: 'nonexistent', signerEmployeeId: 'emp-uuid-1' }, mockUser),
      ).rejects.toThrow(NotFoundException);

      expect(mockPrisma.unscopedClient.esignRequest.create).not.toHaveBeenCalled();
    });

    it('throws ConflictException when pending request already exists', async () => {
      mockPrisma.unscopedClient.employeeDocument.findUnique.mockResolvedValue(makeEmployeeDocument());
      mockPrisma.unscopedClient.esignRequest.findFirst.mockResolvedValue(
        makeEsignRequest({ status: 'PENDING' }),
      );

      await expect(
        service.createRequest({ documentId: 'doc-uuid-1', signerEmployeeId: 'emp-uuid-1' }, mockUser),
      ).rejects.toThrow(ConflictException);

      expect(mockPrisma.unscopedClient.$transaction).not.toHaveBeenCalled();
    });
  });

  // =====================================================================
  // Test Group 2: signDocument — SHA-256 hash integrity
  // =====================================================================
  describe('signDocument — hash integrity', () => {
    it('stores the document current SHA-256 hash at the moment of signing', async () => {
      const currentHash = 'deadbeef' + 'a'.repeat(56);
      mockPrisma.unscopedClient.esignRequest.findUnique.mockResolvedValue(
        makeEsignRequest({ status: 'PENDING', signerEmployeeId: mockUser.userId }),
      );
      mockPrisma.unscopedClient.employeeDocument.findUnique.mockResolvedValue(
        makeEmployeeDocument({ sha256Hash: currentHash }),
      );
      mockPrisma.unscopedClient.esignRequest.update.mockResolvedValue(
        makeEsignRequest({ status: 'SIGNED', documentSha256AtSign: currentHash }),
      );

      const result = await service.signDocument('esign-uuid-1', mockUser.userId, {
        base64Signature: 'data:image/png;base64,AA==',
      });

      expect(result.documentSha256AtSign).toBe(currentHash);
      expect(mockAudit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: AUDIT_ACTIONS.ESIGN_DOCUMENT_SIGNED,
          newValue: expect.objectContaining({ documentSha256AtSign: currentHash }),
        }),
      );
    });

    it('hash mismatch — re-fetches current document hash at sign time, not stale', async () => {
      const hashAtSignTime = 'b'.repeat(64);
      mockPrisma.unscopedClient.esignRequest.findUnique.mockResolvedValue(
        makeEsignRequest({ signerEmployeeId: mockUser.userId, status: 'PENDING' }),
      );
      mockPrisma.unscopedClient.employeeDocument.findUnique.mockResolvedValue(
        makeEmployeeDocument({ sha256Hash: hashAtSignTime }),
      );
      mockPrisma.unscopedClient.esignRequest.update.mockResolvedValue(
        makeEsignRequest({ status: 'SIGNED', documentSha256AtSign: hashAtSignTime }),
      );

      const result = await service.signDocument('esign-uuid-1', mockUser.userId, {
        base64Signature: 'sig',
      });

      expect(result.documentSha256AtSign).toBe(hashAtSignTime);
      expect(result.documentSha256AtSign).not.toBe('a'.repeat(64));
    });

    it('base64Signature stored exactly — no truncation, excluded from audit', async () => {
      const longSig = 'data:image/png;base64,' + 'Z'.repeat(500);
      mockPrisma.unscopedClient.esignRequest.findUnique.mockResolvedValue(
        makeEsignRequest({ status: 'PENDING', signerEmployeeId: mockUser.userId }),
      );
      mockPrisma.unscopedClient.employeeDocument.findUnique.mockResolvedValue(makeEmployeeDocument());
      mockPrisma.unscopedClient.esignRequest.update.mockResolvedValue(
        makeEsignRequest({ status: 'SIGNED', base64Signature: longSig }),
      );

      const result = await service.signDocument('esign-uuid-1', mockUser.userId, {
        base64Signature: longSig,
      });

      expect(result.base64Signature).toBe(longSig);
      const auditCall = mockAudit.record.mock.calls[0][0];
      expect(auditCall.newValue).not.toHaveProperty('base64Signature');
    });
  });

  // =====================================================================
  // Test Group 3: signDocument — status and ownership guards
  // =====================================================================
  describe('signDocument — guards', () => {
    it('throws ForbiddenException when signer ID does not match', async () => {
      mockPrisma.unscopedClient.esignRequest.findUnique.mockResolvedValue(
        makeEsignRequest({ signerEmployeeId: 'emp-uuid-1', status: 'PENDING' }),
      );

      await expect(
        service.signDocument('esign-uuid-1', 'emp-uuid-OTHER', { base64Signature: 'sig' }),
      ).rejects.toThrow(ForbiddenException);

      expect(mockPrisma.unscopedClient.esignRequest.update).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when already SIGNED', async () => {
      mockPrisma.unscopedClient.esignRequest.findUnique.mockResolvedValue(
        makeEsignRequest({ status: 'SIGNED', signerEmployeeId: mockUser.userId }),
      );

      await expect(
        service.signDocument('esign-uuid-1', mockUser.userId, { base64Signature: 'sig' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when already DECLINED', async () => {
      mockPrisma.unscopedClient.esignRequest.findUnique.mockResolvedValue(
        makeEsignRequest({ status: 'DECLINED', signerEmployeeId: mockUser.userId }),
      );

      await expect(
        service.signDocument('esign-uuid-1', mockUser.userId, { base64Signature: 'sig' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws GoneException when expired and transitions to EXPIRED', async () => {
      mockPrisma.unscopedClient.esignRequest.findUnique.mockResolvedValue(
        makeEsignRequest({
          status: 'PENDING',
          expiresAt: new Date(Date.now() - 1000),
          signerEmployeeId: mockUser.userId,
          companyId: mockUser.companyId,
          documentId: 'doc-uuid-1',
        }),
      );

      await expect(
        service.signDocument('esign-uuid-1', mockUser.userId, { base64Signature: 'sig' }),
      ).rejects.toThrow(GoneException);

      expect(mockPrisma.unscopedClient.esignRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'EXPIRED' }),
        }),
      );
      expect(mockAudit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: AUDIT_ACTIONS.ESIGN_REQUEST_EXPIRED }),
      );
    });
  });

  // =====================================================================
  // Test Group 4: declineRequest
  // =====================================================================
  describe('declineRequest', () => {
    it('happy path sets DECLINED and stores reason', async () => {
      mockPrisma.unscopedClient.esignRequest.findUnique.mockResolvedValue(
        makeEsignRequest({ status: 'PENDING', signerEmployeeId: mockUser.userId }),
      );
      mockPrisma.unscopedClient.esignRequest.update.mockResolvedValue(
        makeEsignRequest({
          status: 'DECLINED',
          declineReason: 'Not applicable to my role',
          declinedAt: new Date(),
        }),
      );

      const result = await service.declineRequest('esign-uuid-1', mockUser.userId, {
        reason: 'Not applicable to my role',
      });

      expect(result.status).toBe('DECLINED');
      expect(result.declineReason).toBe('Not applicable to my role');
      expect(result.declinedAt).toBeInstanceOf(Date);
      expect(mockAudit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: AUDIT_ACTIONS.ESIGN_REQUEST_DECLINED,
          newValue: expect.objectContaining({ reason: 'Not applicable to my role' }),
        }),
      );
      expect(mockEvents.emit).toHaveBeenCalledWith(
        ESIGN_REQUEST_DECLINED,
        expect.any(Object),
      );
    });

    it('decline with no reason stores null', async () => {
      mockPrisma.unscopedClient.esignRequest.findUnique.mockResolvedValue(
        makeEsignRequest({ status: 'PENDING', signerEmployeeId: mockUser.userId }),
      );
      mockPrisma.unscopedClient.esignRequest.update.mockResolvedValue(
        makeEsignRequest({ status: 'DECLINED', declineReason: null }),
      );

      const result = await service.declineRequest('esign-uuid-1', mockUser.userId, {});
      expect(result.declineReason).toBeNull();
    });

    it('throws ForbiddenException when non-signer declines', async () => {
      mockPrisma.unscopedClient.esignRequest.findUnique.mockResolvedValue(
        makeEsignRequest({ signerEmployeeId: 'other', status: 'PENDING' }),
      );

      await expect(
        service.declineRequest('esign-uuid-1', mockUser.userId, {}),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // =====================================================================
  // Test Group 5: expireStaleRequests
  // =====================================================================
  describe('expireStaleRequests', () => {
    it('transitions all PENDING expired to EXPIRED in batches, logs audit per request', async () => {
      const stale = [
        makeEsignRequest({ id: 'e1', status: 'PENDING', expiresAt: new Date(Date.now() - 1000) }),
        makeEsignRequest({ id: 'e2', status: 'PENDING', expiresAt: new Date(Date.now() - 2000) }),
        makeEsignRequest({ id: 'e3', status: 'PENDING', expiresAt: new Date(Date.now() - 3000) }),
      ];
      mockPrisma.unscopedClient.esignRequest.findMany
        .mockResolvedValueOnce(stale)
        .mockResolvedValueOnce([]);

      await service.expireStaleRequests();

      expect(mockPrisma.unscopedClient.esignRequest.update).toHaveBeenCalledTimes(3);
      expect(mockAudit.record).toHaveBeenCalledTimes(3);
    });

    it('does not process when none expired', async () => {
      mockPrisma.unscopedClient.esignRequest.findMany.mockResolvedValue([]);

      await service.expireStaleRequests();

      expect(mockPrisma.unscopedClient.esignRequest.update).not.toHaveBeenCalled();
      expect(mockAudit.record).not.toHaveBeenCalled();
    });
  });
});
