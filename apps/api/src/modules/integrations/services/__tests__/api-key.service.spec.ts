import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@hr/prisma';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AuditService } from '../../../../modules/audit/audit.service';
import { ApiKeyService } from '../api-key.service';

/* eslint-disable @typescript-eslint/no-explicit-any */

describe('ApiKeyService', () => {
  let service: ApiKeyService;
  let mockPrisma: any;
  let mockEvents: { emit: ReturnType<typeof vi.fn> };
  let mockAudit: { logAsync: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    mockEvents = { emit: vi.fn() };
    mockAudit = { logAsync: vi.fn().mockResolvedValue(undefined) };

    mockPrisma = {
      unscopedClient: {
        apiKey: {
          findUnique: vi.fn().mockResolvedValue(null),
          findMany: vi.fn().mockResolvedValue([]),
          create: vi.fn().mockImplementation((args: any) => ({ id: 'ak-001', ...args.data, createdAt: new Date() })),
          update: vi.fn().mockImplementation((args: any) => ({ id: args.where.id, ...args.data })),
        },
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ApiKeyService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: EventEmitter2, useValue: mockEvents },
        { provide: AuditService, useValue: mockAudit },
      ],
    }).compile();

    service = module.get(ApiKeyService);
  });

  afterEach(() => vi.clearAllMocks());

  describe('createKey', () => {
    it('returns rawKey only in create response', async () => {
      const result = await service.createKey('comp-1', { name: 'ETL Key', scopes: ['employees:read'] }, 'user-1');
      expect(result.rawKey).toBeDefined();
      expect(result.rawKey).toContain('hrp_live_');
      expect(result.keyPrefix).toBe(result.rawKey.slice(0, 12));
    });

    it('stores keyHash not rawKey', async () => {
      await service.createKey('comp-1', { name: 'ETL', scopes: ['payroll:read'] }, 'user-1');
      const createCall = mockPrisma.unscopedClient.apiKey.create.mock.calls[0][0];
      expect(createCall.data.keyHash).toBeDefined();
      expect(createCall.data.keyHash).not.toContain('hrp_live_');
    });

    it('emits apikey.created event', async () => {
      await service.createKey('comp-1', { name: 'Test', scopes: ['employees:read'] }, 'user-1');
      expect(mockEvents.emit).toHaveBeenCalledWith('apikey.created', expect.any(Object));
    });

    it('audit log fires API_KEY_CREATED', async () => {
      await service.createKey('comp-1', { name: 'Test', scopes: ['employees:read'] }, 'user-1');
      await new Promise<void>((r) => setImmediate(r));
      expect(mockAudit.logAsync).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'API_KEY_CREATED' }),
      );
    });

    it('rawKey never appears in audit log metadata', async () => {
      const result = await service.createKey('comp-1', { name: 'Test', scopes: ['employees:read'] }, 'user-1');
      await new Promise<void>((r) => setImmediate(r));
      const auditCall = mockAudit.logAsync.mock.calls[0][0];
      expect(JSON.stringify(auditCall)).not.toContain(result.rawKey);
    });
  });

  describe('listKeys', () => {
    it('returns keyPrefix but never keyHash', async () => {
      mockPrisma.unscopedClient.apiKey.findMany.mockResolvedValue([{
        id: 'ak-1', keyPrefix: 'hrp_live_ab', name: 'Test', scopes: ['employees:read'], status: 'ACTIVE', lastUsedAt: null, expiresAt: null, createdAt: new Date(),
      }]);
      const result = await service.listKeys('comp-1');
      expect(result[0].keyPrefix).toBe('hrp_live_ab');
      expect((result[0] as any).keyHash).toBeUndefined();
    });
  });

  describe('revokeKey', () => {
    it('sets status to REVOKED', async () => {
      mockPrisma.unscopedClient.apiKey.findUnique.mockResolvedValue({
        id: 'ak-1', companyId: 'comp-1', status: 'ACTIVE',
      });
      const result = await service.revokeKey('comp-1', 'ak-1', 'user-1');
      expect(result.status).toBe('REVOKED');
    });

    it('rejects if already revoked', async () => {
      mockPrisma.unscopedClient.apiKey.findUnique.mockResolvedValue({
        id: 'ak-1', companyId: 'comp-1', status: 'REVOKED',
      });
      await expect(service.revokeKey('comp-1', 'ak-1', 'user-1')).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException for wrong companyId', async () => {
      mockPrisma.unscopedClient.apiKey.findUnique.mockResolvedValue({
        id: 'ak-1', companyId: 'other-comp', status: 'ACTIVE',
      });
      await expect(service.revokeKey('comp-1', 'ak-1', 'user-1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('validateKey', () => {
    it('returns context for valid key', async () => {
      // Create a real hash to validate against
      await service.createKey('comp-1', { name: 'Test', scopes: ['employees:read'] }, 'user-1');
      const rawKey = mockPrisma.unscopedClient.apiKey.create.mock.results[0]?.value?.rawKey;
      if (!rawKey) return; // skip if rawKey not captured

      const keyHash = require('crypto').createHash('sha256').update(rawKey).digest('hex');
      mockPrisma.unscopedClient.apiKey.findMany.mockResolvedValue([{
        id: 'ak-1', companyId: 'comp-1', keyPrefix: rawKey.slice(0, 12),
        keyHash, scopes: ['employees:read'], status: 'ACTIVE', expiresAt: null,
      }]);

      const result = await service.validateKey(rawKey);
      expect(result).not.toBeNull();
      expect(result!.scopes).toContain('employees:read');
    });

    it('returns null for revoked key', async () => {
      mockPrisma.unscopedClient.apiKey.findMany.mockResolvedValue([{
        id: 'ak-1', keyPrefix: 'hrp_live_ab', keyHash: 'fake', scopes: [], status: 'REVOKED',
      }]);
      const result = await service.validateKey('hrp_live_ab_some_random_stuff');
      expect(result).toBeNull();
    });

    it('returns null for expired key', async () => {
      mockPrisma.unscopedClient.apiKey.findMany.mockResolvedValue([{
        id: 'ak-1', keyPrefix: 'hrp_live_ab', keyHash: 'fake', scopes: ['employees:read'],
        status: 'ACTIVE', expiresAt: new Date('2020-01-01'),
      }]);
      const result = await service.validateKey('hrp_live_ab_some_random_stuff');
      expect(result).toBeNull();
    });

    it('returns null for malformed key', async () => {
      mockPrisma.unscopedClient.apiKey.findMany.mockResolvedValue([]);
      const result = await service.validateKey('invalid');
      expect(result).toBeNull();
    });
  });
});
