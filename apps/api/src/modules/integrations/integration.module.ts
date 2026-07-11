import { Module } from '@nestjs/common';
import { PrismaModule } from '@hr/prisma';
import { ApiKeyService } from './services/api-key.service';
import { WebhookService } from './services/webhook.service';
import { WebhookEmitterListener } from './services/webhook-emitter.listener';
import { SlackIntegrationService } from './services/slack-integration.service';
import { AuditService } from '../audit/audit.service';

@Module({
  imports: [PrismaModule],
  providers: [ApiKeyService, WebhookService, WebhookEmitterListener, SlackIntegrationService, AuditService],
  exports: [ApiKeyService, WebhookService, SlackIntegrationService],
})
export class IntegrationModule {}
