import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@hr/prisma';
import { AuditService } from '../../../../modules/audit/audit.service';
import { SlackIntegrationService } from '../slack-integration.service';

/* eslint-disable @typescript-eslint/no-explicit-any */

describe('SlackIntegrationService', () => {
  let service: SlackIntegrationService;
  let mockPrisma: any;
  let mockAudit: { logAsync: ReturnType<typeof vi.fn> };

  const mockIntegration = {
    id: 'si-001', companyId: 'comp-1', slackTeamId: 'T-123', slackTeamName: 'Acme Corp',
    encryptedAccessToken: 'enc-token', channelMappings: [], status: 'ACTIVE',
    connectedByUserId: 'user-1', connectedAt: new Date(), disconnectedAt: null,
  };

  beforeEach(async () => {
    mockAudit = { logAsync: vi.fn().mockResolvedValue(undefined) };
    mockPrisma = {
      unscopedClient: {
        slackIntegration: {
          findUnique: vi.fn().mockResolvedValue(mockIntegration),
          findFirst: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockImplementation((args: any) => ({ id: 'si-001', ...args.data })),
          update: vi.fn().mockImplementation((args: any) => ({ ...args.data })),
          upsert: vi.fn().mockImplementation((args: any) => ({ id: 'si-001', ...args.create })),
        },
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SlackIntegrationService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditService, useValue: mockAudit },
      ],
    }).compile();

    service = module.get(SlackIntegrationService);
  });

  afterEach(() => vi.clearAllMocks());

  describe('getAuthUrl', () => {
    it('returns Slack OAuth URL with state parameter', async () => {
      const result = await service.getAuthUrl('comp-1', 'user-1');
      expect(result.authUrl).toContain('https://slack.com/oauth/v2/authorize');
      expect(result.authUrl).toContain('state=');
      expect(result.authUrl).toContain('client_id=');
      expect(result.authUrl).toContain('scope=');
    });

    it('state parameter contains companyId and userId', async () => {
      const result = await service.getAuthUrl('comp-1', 'user-1');
      const stateParam = new URL(result.authUrl).searchParams.get('state')!;
      const decoded = JSON.parse(Buffer.from(stateParam, 'base64url').toString());
      expect(decoded.companyId).toBe('comp-1');
      expect(decoded.userId).toBe('user-1');
      expect(decoded.exp).toBeGreaterThan(Date.now());
    });
  });

  describe('handleOAuthCallback', () => {
    it('creates integration for new org', async () => {
      mockPrisma.unscopedClient.slackIntegration.findUnique.mockResolvedValue(null);
      const state = Buffer.from(JSON.stringify({ companyId: 'comp-1', userId: 'user-1', exp: Date.now() + 600000 })).toString('base64url');
      const result = await service.handleOAuthCallback('slack-code', state);
      expect(result.status).toBe('connected');
    });

    it('updates integration for reconnecting org', async () => {
      const state = Buffer.from(JSON.stringify({ companyId: 'comp-1', userId: 'user-1', exp: Date.now() + 600000 })).toString('base64url');
      const result = await service.handleOAuthCallback('slack-code', state);
      expect(result.status).toBe('connected');
    });

    it('rejects invalid state JSON', async () => {
      await expect(service.handleOAuthCallback('code', 'invalid-state')).rejects.toThrow(BadRequestException);
    });

    it('rejects expired state', async () => {
      const state = Buffer.from(JSON.stringify({ companyId: 'comp-1', userId: 'user-1', exp: Date.now() - 600000 })).toString('base64url');
      await expect(service.handleOAuthCallback('code', state)).rejects.toThrow(BadRequestException);
    });

    it('audit log fires SLACK_CONNECTED', async () => {
      const state = Buffer.from(JSON.stringify({ companyId: 'comp-1', userId: 'user-1', exp: Date.now() + 600000 })).toString('base64url');
      await service.handleOAuthCallback('code', state);
      await new Promise<void>((r) => setImmediate(r));
      expect(mockAudit.logAsync).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'SLACK_CONNECTED' }),
      );
    });
  });

  describe('updateChannelMappings', () => {
    it('saves channel mappings', async () => {
      const result = await service.updateChannelMappings('comp-1', [
        { eventType: 'leave.approval_requested', channelId: 'C-123', channelName: 'hr-approvals' },
      ]);
      expect(result).toBeDefined();
    });

    it('throws NotFoundException when not connected', async () => {
      mockPrisma.unscopedClient.slackIntegration.findUnique.mockResolvedValue(null);
      await expect(service.updateChannelMappings('comp-1', [])).rejects.toThrow(NotFoundException);
    });
  });

  describe('disconnect', () => {
    it('sets DISCONNECTED and clears token', async () => {
      const result = await service.disconnect('comp-1', 'user-1');
      expect(result.status).toBe('DISCONNECTED');
      expect(result.encryptedAccessToken).toBe('tombstone');
    });

    it('audit log fires SLACK_DISCONNECTED', async () => {
      await service.disconnect('comp-1', 'user-1');
      await new Promise<void>((r) => setImmediate(r));
      expect(mockAudit.logAsync).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'SLACK_DISCONNECTED' }),
      );
    });

    it('throws NotFoundException when not connected', async () => {
      mockPrisma.unscopedClient.slackIntegration.findUnique.mockResolvedValue(null);
      await expect(service.disconnect('comp-1', 'user-1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('getStatus', () => {
    it('returns connected status for active integration', async () => {
      const result = await service.getStatus('comp-1');
      expect(result.connected).toBe(true);
      expect(result.slackTeamName).toBe('Acme Corp');
    });

    it('returns disconnected when not found', async () => {
      mockPrisma.unscopedClient.slackIntegration.findUnique.mockResolvedValue(null);
      const result = await service.getStatus('comp-1');
      expect(result.connected).toBe(false);
    });
  });

  describe('sendApprovalNotification', () => {
    it('skips when no integration exists', async () => {
      mockPrisma.unscopedClient.slackIntegration.findUnique.mockResolvedValue(null);
      // Should not throw
      await expect(service.sendApprovalNotification('comp-1', 'leave.approval_requested', {})).resolves.toBeUndefined();
    });

    it('skips when disconnected', async () => {
      mockPrisma.unscopedClient.slackIntegration.findUnique.mockResolvedValue({ ...mockIntegration, status: 'DISCONNECTED' });
      await expect(service.sendApprovalNotification('comp-1', 'leave.approval_requested', {})).resolves.toBeUndefined();
    });
  });
});
