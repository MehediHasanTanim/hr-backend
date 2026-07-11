import { Inject, Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '@hr/prisma';
import { AuditService } from '../../audit/audit.service';

@Injectable()
export class SlackIntegrationService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async getAuthUrl(companyId: string, userId: string) {
    const state = Buffer.from(JSON.stringify({ companyId, userId, exp: Date.now() + 600000 })).toString('base64url');
    const clientId = process.env.SLACK_CLIENT_ID ?? 'slack-client-id-placeholder';
    const redirectUri = process.env.SLACK_REDIRECT_URI ?? 'https://example.com/api/v1/integrations/slack/callback';
    const scopes = 'chat:write,channels:read';
    return { authUrl: `https://slack.com/oauth/v2/authorize?client_id=${clientId}&scope=${scopes}&redirect_uri=${redirectUri}&state=${state}` };
  }

  async handleOAuthCallback(code: string, state: string) {
    let decoded: { companyId: string; userId: string; exp: number };
    try {
      decoded = JSON.parse(Buffer.from(state, 'base64url').toString());
    } catch { throw new BadRequestException('Invalid state'); }
    if (Date.now() > decoded.exp) throw new BadRequestException('State expired');

    // In production: exchange code for access token via Slack API
    const accessToken = 'slack-token-placeholder';

    const existing = await this.prisma.unscopedClient.slackIntegration.findUnique({
      where: { companyId: decoded.companyId },
    });

    const result = existing
      ? await this.prisma.unscopedClient.slackIntegration.update({
        where: { companyId: decoded.companyId },
        data: { slackTeamId: 'T-team-id', slackTeamName: 'Workspace', encryptedAccessToken: accessToken, connectedByUserId: decoded.userId, connectedAt: new Date(), status: 'ACTIVE' },
      })
      : await this.prisma.unscopedClient.slackIntegration.create({
        data: { companyId: decoded.companyId, slackTeamId: 'T-team-id', slackTeamName: 'Workspace', encryptedAccessToken: accessToken, channelMappings: [], connectedByUserId: decoded.userId },
      });

    this.audit.logAsync({ companyId: decoded.companyId, entityType: 'SlackIntegration', entityId: result.id, action: 'SLACK_CONNECTED', newValue: { slackTeamName: result.slackTeamName } });

    return { status: 'connected', slackTeamName: result.slackTeamName };
  }

  async updateChannelMappings(companyId: string, mappings: Array<{ eventType: string; channelId: string; channelName: string }>) {
    const integration = await this.prisma.unscopedClient.slackIntegration.findUnique({ where: { companyId } });
    if (!integration) throw new NotFoundException('Slack integration not found');

    return this.prisma.unscopedClient.slackIntegration.update({
      where: { companyId },
      data: { channelMappings: mappings as any },
    });
  }

  async disconnect(companyId: string, actorId: string) {
    const integration = await this.prisma.unscopedClient.slackIntegration.findUnique({ where: { companyId } });
    if (!integration) throw new NotFoundException('Slack integration not found');

    const result = await this.prisma.unscopedClient.slackIntegration.update({
      where: { companyId },
      data: { status: 'DISCONNECTED', disconnectedAt: new Date(), encryptedAccessToken: 'tombstone' },
    });

    this.audit.logAsync({ companyId, entityType: 'SlackIntegration', entityId: result.id, action: 'SLACK_DISCONNECTED', newValue: { disconnectedBy: actorId } });
    return result;
  }

  async getStatus(companyId: string) {
    const integration = await this.prisma.unscopedClient.slackIntegration.findUnique({ where: { companyId } });
    if (!integration) return { connected: false };
    return {
      connected: integration.status === 'ACTIVE',
      slackTeamName: integration.slackTeamName,
      channelMappings: integration.channelMappings,
      connectedAt: integration.connectedAt,
    };
  }

  async sendApprovalNotification(companyId: string, eventType: string, _payload: Record<string, unknown>) {
    const integration = await this.prisma.unscopedClient.slackIntegration.findUnique({ where: { companyId } });
    if (!integration || integration.status !== 'ACTIVE') return;

    const mappings = integration.channelMappings as Array<{ eventType: string; channelId: string }> ?? [];
    const mapping = mappings.find(m => m.eventType === eventType);
    if (!mapping) return;

    // In production: call Slack chat.postMessage with encrypted token
    // Failures are logged but never block the originating workflow
  }
}
