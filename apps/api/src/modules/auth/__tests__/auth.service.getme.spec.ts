import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '@hr/prisma';
import { AuthService } from '../auth.service';
import { PasswordService } from '../password.service';
import { TokenService } from '../token.service';
import { EmailVerificationService } from '../email-verification.service';
import { RedisService } from '../../../common/redis/redis.service';
import { MailService } from '../../../common/mail/mail.service';
import { AppConfigService } from '../../../config/config.service';
import { RbacCacheService } from '../../roles/rbac-cache.service';

/* eslint-disable @typescript-eslint/no-explicit-any */

describe('AuthService.getMe() — Sprint 6 enrichment', () => {
  let service: AuthService;
  let mockPrisma: any;

  const USER_ID = 'user-uuid-001';
  const COMPANY_ID = 'company-001';

  const mockEmployeeRecord = {
    id: 'emp-uuid-001',
    companyId: COMPANY_ID,
    userId: USER_ID,
    user: { firstName: 'Jane', lastName: 'Doe', email: 'jane@test.com' },
    department: { id: 'dept-1', name: 'Engineering' },
    jobTitle: { title: 'Software Engineer' },
    roles: [{ role: { name: 'EMPLOYEE' } }],
  };

  beforeEach(async () => {
    mockPrisma = {
      unscopedClient: {
        employee: {
          findFirst: vi.fn().mockResolvedValue(mockEmployeeRecord),
        },
        leaveBalance: {
          findMany: vi.fn().mockResolvedValue([]),
        },
        esignRequest: {
          count: vi.fn().mockResolvedValue(0),
        },
        leaveApprovalStep: {
          count: vi.fn().mockResolvedValue(0),
        },
        notification: {
          count: vi.fn().mockResolvedValue(0),
        },
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: PasswordService, useValue: { hash: vi.fn(), verify: vi.fn(), needsRehash: vi.fn() } },
        { provide: TokenService, useValue: { signAccessToken: vi.fn(), issueRefreshToken: vi.fn(), sha256: vi.fn(), rotateRefreshToken: vi.fn(), revokeUser: vi.fn() } },
        { provide: EmailVerificationService, useValue: { generateAndSend: vi.fn(), verify: vi.fn() } },
        { provide: RedisService, useValue: { get: vi.fn(), set: vi.fn(), del: vi.fn() } },
        { provide: MailService, useValue: { send: vi.fn(), renderTemplate: vi.fn() } },
        { provide: AppConfigService, useValue: { get: vi.fn(() => ({ nodeEnv: 'test', port: 3000, host: '0.0.0.0' })) } },
        { provide: RbacCacheService, useValue: { invalidateUser: vi.fn() } },
      ],
    }).compile();

    service = module.get(AuthService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ─── Profile fields ────────────────────────────────────────────────────

  it('returns core profile fields', async () => {
    const result = await service.getMe(USER_ID);

    expect(result.id).toBe('emp-uuid-001');
    expect(result.email).toBe('jane@test.com');
    expect(result.name).toBe('Jane Doe');
    expect(result.role).toBe('EMPLOYEE');
    expect(result.departmentId).toBe('dept-1');
    expect(result.departmentName).toBe('Engineering');
    expect(result.jobTitle).toBe('Software Engineer');
  });

  // ─── leaveBalances ─────────────────────────────────────────────────────

  it('returns leaveBalances with correct remaining = entitled - taken', async () => {
    mockPrisma.unscopedClient.leaveBalance.findMany.mockResolvedValue([
      { leaveType: { name: 'Annual' }, entitled: '20', used: '5', balance: '15' },
      { leaveType: { name: 'Sick' }, entitled: '10', used: '2', balance: '8' },
    ]);

    const result = await service.getMe(USER_ID);

    expect(result.leaveBalances).toHaveLength(2);
    expect(result.leaveBalances[0]).toMatchObject({
      leaveType: 'Annual',
      entitled: 20,
      taken: 5,
      remaining: 15,
    });
    expect(result.leaveBalances[1]).toMatchObject({
      leaveType: 'Sick',
      entitled: 10,
      taken: 2,
      remaining: 8,
    });
  });

  it('leaveBalances is empty array when none exist', async () => {
    const result = await service.getMe(USER_ID);
    expect(result.leaveBalances).toEqual([]);
  });

  // ─── pendingTaskCount ──────────────────────────────────────────────────

  it('pendingTaskCount sums eSign + approval pending tasks', async () => {
    mockPrisma.unscopedClient.esignRequest.count.mockResolvedValue(3);
    mockPrisma.unscopedClient.leaveApprovalStep.count.mockResolvedValue(1);

    const result = await service.getMe(USER_ID);

    expect(result.pendingTaskCount).toBe(4);
  });

  // ─── unreadNotificationCount ───────────────────────────────────────────

  it('unreadNotificationCount reflects notification count', async () => {
    mockPrisma.unscopedClient.notification.count.mockResolvedValue(7);

    const result = await service.getMe(USER_ID);
    expect(result.unreadNotificationCount).toBe(7);
  });

  // ─── Parallel queries ──────────────────────────────────────────────────

  it('fires all three supplementary queries (not awaited sequentially)', async () => {
    await service.getMe(USER_ID);

    expect(mockPrisma.unscopedClient.leaveBalance.findMany).toHaveBeenCalled();
    expect(mockPrisma.unscopedClient.esignRequest.count).toHaveBeenCalled();
    expect(mockPrisma.unscopedClient.notification.count).toHaveBeenCalled();
  });

  // ─── Safe defaults on failure ──────────────────────────────────────────

  it('returns leaveBalances: [] when leave balance query fails', async () => {
    mockPrisma.unscopedClient.leaveBalance.findMany.mockRejectedValue(new Error('DB down'));
    mockPrisma.unscopedClient.esignRequest.count.mockResolvedValue(2);
    mockPrisma.unscopedClient.notification.count.mockResolvedValue(3);

    const result = await service.getMe(USER_ID);

    expect(result.leaveBalances).toEqual([]);
    expect(result.pendingTaskCount).toBe(2);
    expect(result.unreadNotificationCount).toBe(3);
  });

  it('returns pendingTaskCount: 0 when task query fails', async () => {
    mockPrisma.unscopedClient.esignRequest.count.mockRejectedValue(new Error('Task DB down'));
    mockPrisma.unscopedClient.leaveBalance.findMany.mockResolvedValue([]);
    mockPrisma.unscopedClient.notification.count.mockResolvedValue(5);

    const result = await service.getMe(USER_ID);

    expect(result.pendingTaskCount).toBe(0);
    expect(result.unreadNotificationCount).toBe(5);
  });

  it('returns unreadNotificationCount: 0 when notification query fails', async () => {
    mockPrisma.unscopedClient.notification.count.mockRejectedValue(new Error('Notification DB down'));

    const result = await service.getMe(USER_ID);

    expect(result.unreadNotificationCount).toBe(0);
  });

  it('resolves with safe defaults when ALL supplementary queries fail', async () => {
    mockPrisma.unscopedClient.leaveBalance.findMany.mockRejectedValue(new Error('Down'));
    mockPrisma.unscopedClient.esignRequest.count.mockRejectedValue(new Error('Down'));
    mockPrisma.unscopedClient.notification.count.mockRejectedValue(new Error('Down'));

    const result = await service.getMe(USER_ID);

    expect(result.leaveBalances).toEqual([]);
    expect(result.pendingTaskCount).toBe(0);
    expect(result.unreadNotificationCount).toBe(0);
  });

  it('getMe() never throws due to supplementary query failure', async () => {
    mockPrisma.unscopedClient.leaveBalance.findMany.mockRejectedValue(new Error('All down'));
    mockPrisma.unscopedClient.esignRequest.count.mockRejectedValue(new Error('All down'));
    mockPrisma.unscopedClient.notification.count.mockRejectedValue(new Error('All down'));

    await expect(service.getMe(USER_ID)).resolves.toBeDefined();
  });
});
