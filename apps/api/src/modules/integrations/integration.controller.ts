import { Controller, Get, Post, Delete, Body, Param, Query, Inject } from '@nestjs/common';
import { ApiKeyService } from './services/api-key.service';
import { WebhookService } from './services/webhook.service';
import { SlackIntegrationService } from './services/slack-integration.service';

@Controller('integrations')
export class IntegrationController {
  constructor(
    @Inject(ApiKeyService) private readonly apiKeys: ApiKeyService,
    @Inject(WebhookService) private readonly webhooks: WebhookService,
    @Inject(SlackIntegrationService) private readonly slack: SlackIntegrationService,
  ) {}

  // API Keys
  @Post('api-keys') createKey(@Body() dto: any) { return this.apiKeys.createKey(dto.companyId, dto, dto.actorId); }
  @Get('api-keys') listKeys(@Query('companyId') companyId: string) { return this.apiKeys.listKeys(companyId); }
  @Delete('api-keys/:id') revokeKey(@Param('id') id: string, @Body() dto: any) { return this.apiKeys.revokeKey(dto.companyId, id, dto.actorId); }

  // Webhooks
  @Post('webhooks') registerWebhook(@Body() dto: any) { return this.webhooks.register(dto.companyId, { url: dto.url, subscribedEvents: dto.subscribedEvents }, dto.actorId); }
  @Get('webhooks') listWebhooks(@Query('companyId') companyId: string) { return this.webhooks.listDeliveries(companyId); }
  @Post('webhooks/:id/test-ping') testPing(@Param('id') id: string, @Body() dto: any) { return this.webhooks.testPing(dto.companyId, id); }
  @Post('webhooks/:id/rotate-secret') rotateSecret(@Param('id') id: string, @Body() dto: any) { return this.webhooks.rotateSecret(dto.companyId, id, dto.actorId); }

  // Slack
  @Get('slack/auth-url') getSlackAuthUrl(@Query('companyId') companyId: string, @Query('userId') userId: string) { return this.slack.getAuthUrl(companyId, userId); }
  @Get('slack/status') getSlackStatus(@Query('companyId') companyId: string) { return this.slack.getStatus(companyId); }
  @Post('slack/channel-mappings') updateSlackMappings(@Body() dto: any) { return this.slack.updateChannelMappings(dto.companyId, dto.mappings); }
  @Delete('slack/disconnect') disconnectSlack(@Body() dto: any) { return this.slack.disconnect(dto.companyId, dto.actorId); }
}
