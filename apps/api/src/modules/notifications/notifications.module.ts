import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { EmailDispatchProcessor } from './processors/email-dispatch.processor';
import { NotificationEventHandlers } from './notification-event-handlers';

@Module({
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    EmailDispatchProcessor,
    NotificationEventHandlers,
  ],
  exports: [NotificationsService, EmailDispatchProcessor],
})
export class NotificationsModule {}
