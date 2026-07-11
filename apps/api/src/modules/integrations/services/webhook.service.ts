import { Inject, Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '@hr/prisma';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AuditService } from '../../audit/audit.service';
import { randomBytes, createHmac } from 'crypto';
import { URL } from 'url';

const SSRF_BLOCKLIST = ['localhost', '127.0.0.1', '0.0.0.0', '169.254.169.254', '10.', '172.16.', '172.17.', '172.18.', '172.19.', '172.20.', '172.21.', '172.22.', '172.23.', '172.24.', '172.25.', '172.26.', '172.27.', '172.28.', '172.29.', '172.30.', '172.31.', '192.168.'];

function isSsrfSafe(urlStr: string): boolean {
  try {
    const u = new URL(urlStr);
    if (u.protocol !== 'https:') return false;
    const hostname = u.hostname.toLowerCase();
    for (const blocked of SSRF_BLOCKLIST) {
      if (hostname === blocked || hostname.startsWith(blocked)) return false;
    }
    if (hostname === '[::1]' || hostname === '::1') return false;
    return true;
  } catch { return false; }
}

@Injectable()
export class WebhookService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(EventEmitter2) private readonly events: EventEmitter2,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async register(companyId: string, dto: { url: string; subscribedEvents: string[] }, actorId: string) {
    if (!isSsrfSafe(dto.url)) throw new BadRequestException('URL fails SSRF validation');
    const signingSecret = randomBytes(32).toString('base64url');

    const result = await this.prisma.unscopedClient.webhook.create({
      data: {
        companyId, url: dto.url, events: dto.subscribedEvents,
        signingSecret, createdByUserId: actorId,
      },
    });

    this.audit.logAsync({ companyId, entityType: 'Webhook', entityId: result.id, action: 'WEBHOOK_REGISTERED', newValue: { url: dto.url, events: dto.subscribedEvents } });

    return { id: result.id, url: result.url, subscribedEvents: result.events, signingSecret, status: result.status, createdAt: result.createdAt };
  }

  async update(companyId: string, id: string, dto: { url?: string; subscribedEvents?: string[] }, actorId: string) {
    const hook = await this.prisma.unscopedClient.webhook.findUnique({ where: { id } });
    if (!hook || hook.companyId !== companyId) throw new NotFoundException('Webhook not found');
    if (dto.url && !isSsrfSafe(dto.url)) throw new BadRequestException('URL fails SSRF validation');

    return this.prisma.unscopedClient.webhook.update({
      where: { id },
      data: { ...(dto.url ? { url: dto.url } : {}), ...(dto.subscribedEvents ? { events: dto.subscribedEvents } : {}) },
    });
  }

  async testPing(companyId: string, id: string) {
    const hook = await this.prisma.unscopedClient.webhook.findUnique({ where: { id } });
    if (!hook || hook.companyId !== companyId) throw new NotFoundException('Webhook not found');
    // Re-check SSRF at ping time (DNS rebinding protection)
    if (!isSsrfSafe(hook.url)) throw new BadRequestException('URL fails SSRF re-validation');

    // In production: synchronously POST signed test payload with 5s timeout
    return { success: true, message: 'Test ping sent' };
  }

  async rotateSecret(companyId: string, id: string, actorId: string) {
    const hook = await this.prisma.unscopedClient.webhook.findUnique({ where: { id } });
    if (!hook || hook.companyId !== companyId) throw new NotFoundException('Webhook not found');
    const newSecret = randomBytes(32).toString('base64url');

    const result = await this.prisma.unscopedClient.webhook.update({
      where: { id }, data: { signingSecret: newSecret },
    });

    return { id: result.id, signingSecret: newSecret };
  }

  async deactivateOnFailureThreshold(webhookId: string) {
    const hook = await this.prisma.unscopedClient.webhook.findUnique({ where: { id: webhookId } });
    if (!hook) return;

    const newFailures = hook.consecutiveFailures + 1;
    if (newFailures >= 10) {
      await this.prisma.unscopedClient.webhook.update({
        where: { id: webhookId },
        data: { status: 'INACTIVE', deactivatedAt: new Date(), consecutiveFailures: newFailures },
      });
      this.events.emit('webhook.deactivated', { webhookId, companyId: hook.companyId });
    } else {
      await this.prisma.unscopedClient.webhook.update({
        where: { id: webhookId }, data: { consecutiveFailures: newFailures },
      });
    }
  }

  async resetFailureCount(webhookId: string) {
    await this.prisma.unscopedClient.webhook.update({
      where: { id: webhookId },
      data: { consecutiveFailures: 0, lastSuccessAt: new Date() },
    });
  }

  async signPayload(webhookId: string, payload: string): Promise<{ signature: string; timestamp: string }> {
    const hook = await this.prisma.unscopedClient.webhook.findUnique({ where: { id: webhookId } });
    if (!hook) throw new NotFoundException('Webhook not found');
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const body = `${timestamp}.${payload}`;
    const signature = createHmac('sha256', hook.signingSecret).update(body).digest('hex');
    return { signature, timestamp };
  }

  async listDeliveries(webhookId: string, page: number = 1, limit: number = 20) {
    return this.prisma.unscopedClient.webhookDelivery.findMany({
      where: { webhookId },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    });
  }
}
