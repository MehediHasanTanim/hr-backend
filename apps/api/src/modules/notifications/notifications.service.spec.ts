import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotificationsService } from './notifications.service';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { makeNotification } from '../../common/test/factories';

/* eslint-disable @typescript-eslint/no-unsafe-call, @typescript-eslint/no-explicit-any */

function createMockPrisma() {
  const scoped: Record<string, any> = {
    notification: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 4 }),
      create: vi.fn(),
    },
    $transaction: vi.fn((arr: Promise<unknown>[]) => Promise.all(arr)),
  };
  return { unscopedClient: scoped } as any;
}

describe('NotificationsService', () => {
  let service: NotificationsService;
  let mockPrisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma = createMockPrisma();
    service = new NotificationsService(mockPrisma as any);
  });

  // =====================================================================
  // Test Group: list
  // =====================================================================
  describe('list', () => {
    it('returns paginated notifications with unread count', async () => {
      mockPrisma.unscopedClient.notification.findMany.mockResolvedValue([
        makeNotification({ id: 'n-1', type: 'LEAVE_APPROVED' }),
      ]);
      mockPrisma.unscopedClient.notification.count
        .mockResolvedValueOnce(10) // total
        .mockResolvedValueOnce(3); // unread

      const result = await service.list('emp-uuid-1', 'company-1', 1, 20);

      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(10);
      expect(result.unreadCount).toBe(3);
      // Public DTO must not expose emailSent, recipientId
      expect(result.data[0]).not.toHaveProperty('emailSent');
      expect(result.data[0]).not.toHaveProperty('userId');
    });
  });

  // =====================================================================
  // Test Group: markRead (single)
  // =====================================================================
  describe('markRead', () => {
    it('marks notification as read for owner', async () => {
      mockPrisma.unscopedClient.notification.findUnique.mockResolvedValue(
        makeNotification({ id: 'n-1', userId: 'emp-uuid-1' }),
      );

      await service.markRead('n-1', 'emp-uuid-1');

      expect(mockPrisma.unscopedClient.notification.update).toHaveBeenCalledWith({
        where: { id: 'n-1' },
        data: { isRead: true, readAt: expect.any(Date) },
      });
    });

    it('throws ForbiddenException when notification belongs to different user', async () => {
      mockPrisma.unscopedClient.notification.findUnique.mockResolvedValue(
        makeNotification({ id: 'n-1', userId: 'emp-uuid-OTHER' }),
      );

      await expect(
        service.markRead('n-1', 'emp-uuid-1'),
      ).rejects.toThrow(ForbiddenException);

      expect(mockPrisma.unscopedClient.notification.update).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when notification does not exist', async () => {
      mockPrisma.unscopedClient.notification.findUnique.mockResolvedValue(null);

      await expect(
        service.markRead('n-1', 'emp-uuid-1'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // =====================================================================
  // Test Group: markAllRead
  // =====================================================================
  describe('markAllRead', () => {
    it('marks all unread notifications for the recipient as read', async () => {
      const result = await service.markAllRead('emp-uuid-1', 'company-1');

      expect(result.updated).toBe(4);
      expect(mockPrisma.unscopedClient.notification.updateMany).toHaveBeenCalledWith({
        where: { userId: 'emp-uuid-1', companyId: 'company-1', isRead: false },
        data: { isRead: true, readAt: expect.any(Date) },
      });
    });

    it('does not touch notifications belonging to other users', async () => {
      await service.markAllRead('emp-uuid-1', 'company-1');

      expect(mockPrisma.unscopedClient.notification.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ userId: 'emp-uuid-1' }),
        }),
      );
    });

    it('returns zero updated when all already read', async () => {
      mockPrisma.unscopedClient.notification.updateMany.mockResolvedValue({ count: 0 });

      const result = await service.markAllRead('emp-uuid-1', 'company-1');

      expect(result.updated).toBe(0);
    });
  });
});
