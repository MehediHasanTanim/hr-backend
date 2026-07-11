import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@hr/prisma';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AuditService } from '../../../../modules/audit/audit.service';
import { WebhookService } from '../webhook.service';

/* eslint-disable @typescript-eslint/no-explicit-any */

describe('WebhookService', () => {
  let service: WebhookService;
  let mockPrisma: any;
  let mockEvents: { emit: ReturnType<typeof vi.fn> };
  let mockAudit: { logAsync: ReturnType<typeof vi.fn> };

  const mockHook = { id: 'wh-001', companyId: 'comp-1', url: 'https://example.com/webhook', events: ['employee.created'], signingSecret: 'secret123', status: 'ACTIVE', consecutiveFailures: 0, isActive: true };

  beforeEach(async () => {
    mockEvents = { emit: vi.fn() };
    mockAudit = { logAsync: vi.fn().mockResolvedValue(undefined) };

    mockPrisma = {
      unscopedClient: {
        webhook: {
          findUnique: vi.fn().mockResolvedValue(mockHook),
          findMany: vi.fn().mockResolvedValue([]),
          create: vi.fn().mockImplementation((args: any) => ({ id: 'wh-001', ...args.data, createdAt: new Date() })),
          update: vi.fn().mockImplementation((args: any) => ({ ...mockHook, ...args.data })),
        },
        webhookDelivery: {
          findMany: vi.fn().mockResolvedValue([]),
        },
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebhookService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: EventEmitter2, useValue: mockEvents },
        { provide: AuditService, useValue: mockAudit },
      ],
    }).compile();

    service = module.get(WebhookService);
  });

  afterEach(() => vi.clearAllMocks());

  describe('register', () => {
    it('creates webhook with signing secret returned once', async () => {
      const result = await service.register('comp-1', { url: 'https://example.com/webhook', subscribedEvents: ['employee.created'] }, 'user-1');
      expect(result.signingSecret).toBeDefined();
      expect(result.signingSecret.length).toBeGreaterThan(20);
      expect(result.url).toBe('https://example.com/webhook');
    });

    it('rejects non-HTTPS URL', async () => {
      await expect(service.register('comp-1', { url: 'http://example.com/webhook', subscribedEvents: ['employee.created'] }, 'user-1')).rejects.toThrow(BadRequestException);
    });

    it('rejects localhost URL (SSRF guard)', async () => {
      await expect(service.register('comp-1', { url: 'https://localhost:3000/webhook', subscribedEvents: ['employee.created'] }, 'user-1')).rejects.toThrow(BadRequestException);
    });

    it('rejects 127.0.0.1 (SSRF guard)', async () => {
      await expect(service.register('comp-1', { url: 'https://127.0.0.1/webhook', subscribedEvents: ['employee.created'] }, 'user-1')).rejects.toThrow(BadRequestException);
    });

    it('rejects cloud metadata endpoint (SSRF guard)', async () => {
      await expect(service.register('comp-1', { url: 'https://169.254.169.254/latest/meta-data/', subscribedEvents: ['employee.created'] }, 'user-1')).rejects.toThrow(BadRequestException);
    });

    it('rejects RFC1918 private range (SSRF guard)', async () => {
      await expect(service.register('comp-1', { url: 'https://192.168.1.1/webhook', subscribedEvents: ['employee.created'] }, 'user-1')).rejects.toThrow(BadRequestException);
    });

    it('rejects 10.x.x.x private range (SSRF guard)', async () => {
      await expect(service.register('comp-1', { url: 'https://10.0.0.1/webhook', subscribedEvents: ['employee.created'] }, 'user-1')).rejects.toThrow(BadRequestException);
    });

    it('audit log fires WEBHOOK_REGISTERED', async () => {
      await service.register('comp-1', { url: 'https://example.com/webhook', subscribedEvents: ['employee.created'] }, 'user-1');
      await new Promise<void>((r) => setImmediate(r));
      expect(mockAudit.logAsync).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'WEBHOOK_REGISTERED' }),
      );
    });
  });

  describe('update', () => {
    it('updates URL and events', async () => {
      const result = await service.update('comp-1', 'wh-001', { url: 'https://new.example.com/webhook' }, 'user-1');
      expect(result).toBeDefined();
    });

    it('rejects SSRF-unsafe URL on update', async () => {
      await expect(service.update('comp-1', 'wh-001', { url: 'http://localhost/webhook' }, 'user-1')).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException for wrong companyId', async () => {
      mockPrisma.unscopedClient.webhook.findUnique.mockResolvedValue({ ...mockHook, companyId: 'other-comp' });
      await expect(service.update('comp-1', 'wh-001', { url: 'https://example.com/webhook' }, 'user-1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('testPing', () => {
    it('re-validates SSRF at ping time', async () => {
      mockPrisma.unscopedClient.webhook.findUnique.mockResolvedValue({ ...mockHook, url: 'http://localhost/webhook' });
      await expect(service.testPing('comp-1', 'wh-001')).rejects.toThrow(BadRequestException);
    });

    it('succeeds for valid URL', async () => {
      const result = await service.testPing('comp-1', 'wh-001');
      expect(result.success).toBe(true);
    });
  });

  describe('rotateSecret', () => {
    it('returns new signing secret', async () => {
      const result = await service.rotateSecret('comp-1', 'wh-001', 'user-1');
      expect(result.signingSecret).toBeDefined();
      expect(result.signingSecret).not.toBe('secret123');
    });
  });

  describe('deactivateOnFailureThreshold', () => {
    it('increments consecutiveFailures below threshold', async () => {
      mockPrisma.unscopedClient.webhook.findUnique.mockResolvedValue({ ...mockHook, consecutiveFailures: 5 });
      await service.deactivateOnFailureThreshold('wh-001');
      expect(mockPrisma.unscopedClient.webhook.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ consecutiveFailures: 6 }) }),
      );
    });

    it('deactivates at 10 failures', async () => {
      mockPrisma.unscopedClient.webhook.findUnique.mockResolvedValue({ ...mockHook, consecutiveFailures: 9 });
      await service.deactivateOnFailureThreshold('wh-001');
      expect(mockEvents.emit).toHaveBeenCalledWith('webhook.deactivated', expect.any(Object));
    });

    it('resets counter on success', async () => {
      await service.resetFailureCount('wh-001');
      expect(mockPrisma.unscopedClient.webhook.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ consecutiveFailures: 0 }) }),
      );
    });
  });

  describe('signPayload', () => {
    it('produces HMAC-SHA256 signature', async () => {
      const result = await service.signPayload('wh-001', '{"test": true}');
      expect(result.signature).toBeDefined();
      expect(result.timestamp).toBeDefined();
      expect(result.signature.length).toBe(64); // sha256 hex
    });
  });
});
