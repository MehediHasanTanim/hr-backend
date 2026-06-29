import {
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '@hr/prisma';
import type { NotificationType } from '@prisma/client';

export interface EmailDispatchJob {
  recipientId: string;
  recipientEmail: string;
  templateName: string;
  templateData: Record<string, unknown>;
  notificationPayload: {
    type: NotificationType;
    title: string;
    body: string;
    metadata?: Record<string, unknown>;
    companyId: string;
  };
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async list(recipientId: string, companyId: string, page = 1, limit = 20) {
    const skip = (page - 1) * limit;

    const [data, total, unreadCount] =
      await this.prisma.unscopedClient.$transaction([
        this.prisma.unscopedClient.notification.findMany({
          where: { userId: recipientId, companyId },
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit,
        }),
        this.prisma.unscopedClient.notification.count({
          where: { userId: recipientId, companyId },
        }),
        this.prisma.unscopedClient.notification.count({
          where: { userId: recipientId, companyId, isRead: false },
        }),
      ]);

    return {
      data: data.map((n) => ({
        id: n.id,
        type: n.type,
        title: n.title,
        body: n.body,
        metadata: n.metadata as Record<string, unknown> | null,
        isRead: n.isRead,
        createdAt: n.createdAt,
      })),
      total,
      page,
      limit,
      unreadCount,
    };
  }

  async markRead(notificationId: string, userId: string) {
    const notification =
      await this.prisma.unscopedClient.notification.findUnique({
        where: { id: notificationId },
      });

    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    if (notification.userId !== userId) {
      throw new ForbiddenException('You can only mark your own notifications as read');
    }

    await this.prisma.unscopedClient.notification.update({
      where: { id: notificationId },
      data: { isRead: true, readAt: new Date() },
    });
  }

  async markAllRead(userId: string, companyId: string) {
    const result = await this.prisma.unscopedClient.notification.updateMany({
      where: { userId, companyId, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });

    return { updated: result.count };
  }

  /**
   * Insert a notification record. Called by the email processor after send
   * or by in-app notification flows.
   */
  async create(payload: {
    userId: string;
    companyId: string;
    type: NotificationType;
    title: string;
    body: string;
    metadata?: Record<string, unknown>;
    channel?: 'IN_APP' | 'EMAIL';
    emailSent?: boolean;
    emailSentAt?: Date | null;
  }) {
    return this.prisma.unscopedClient.notification.create({
      data: {
        companyId: payload.companyId,
        userId: payload.userId,
        type: payload.type,
        title: payload.title,
        body: payload.body,
        metadata: payload.metadata ?? undefined,
        channel: payload.channel ?? 'IN_APP',
        emailSent: payload.emailSent ?? false,
        emailSentAt: payload.emailSentAt ?? null,
      },
    });
  }
}
