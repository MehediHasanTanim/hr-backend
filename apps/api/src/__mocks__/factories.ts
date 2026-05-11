import { vi, type Mock } from 'vitest';
import type { PrismaService } from '@hr/prisma';
import type { RedisService } from '../common/redis/redis.service';
import type { TokenService } from '../modules/auth/token.service';
import type { PasswordService } from '../modules/auth/password.service';
import type { RbacCacheService } from '../modules/roles/rbac-cache.service';
import type { MailService } from '../common/mail/mail.service';
import type { AppConfigService } from '../config/config.service';
import type { AppConfig } from '../config/config.interface';
import type { RequestContext } from '../common/context/request-context';
import type { EmailVerificationService } from '../modules/auth/email-verification.service';

export type DeepMockProxy<T> = {
  [K in keyof T]: T[K] extends (...args: infer A) => infer R
    ? Mock<(...args: A) => R>
    : DeepMockProxy<T[K]>;
};

function modelMock() {
  return {
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    findUniqueOrThrow: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    createMany: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    upsert: vi.fn(),
    delete: vi.fn(),
    deleteMany: vi.fn(),
    count: vi.fn(),
  };
}

export function createPrismaMock(): DeepMockProxy<PrismaService> {
  const scopedClient = {
    user: modelMock(),
    employee: modelMock(),
    company: modelMock(),
    companySetting: modelMock(),
    role: modelMock(),
    leaveType: modelMock(),
    salaryComponent: modelMock(),
    auditLog: modelMock(),
    permission: modelMock(),
    rolePermission: modelMock(),
    employeeRole: modelMock(),
    $transaction: vi.fn().mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) =>
      cb(scopedClient)),
  };

  return {
    forCompany: vi.fn().mockReturnValue(scopedClient),
    unscopedClient: scopedClient,
    $transaction: vi.fn().mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) =>
      cb(scopedClient)),
  } as unknown as DeepMockProxy<PrismaService>;
}

export function createRedisMock(): DeepMockProxy<RedisService> {
  return {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue(undefined),
    del: vi.fn().mockResolvedValue(undefined),
    exists: vi.fn().mockResolvedValue(false),
    keys: vi.fn().mockResolvedValue([]),
    hSet: vi.fn().mockResolvedValue(undefined),
    hGet: vi.fn().mockResolvedValue(undefined),
    hGetAll: vi.fn().mockResolvedValue({}),
    expire: vi.fn().mockResolvedValue(undefined),
    incr: vi.fn().mockResolvedValue(1),
  } as unknown as DeepMockProxy<RedisService>;
}

export function createTokenServiceMock(): DeepMockProxy<TokenService> {
  return {
    signAccessToken: vi.fn().mockReturnValue('mock-access-token'),
    verifyAccessToken: vi.fn(),
    issueRefreshToken: vi.fn().mockResolvedValue('mock-refresh-token'),
    rotateRefreshToken: vi.fn(),
    revokeSession: vi.fn().mockResolvedValue(undefined),
    revokeUser: vi.fn().mockResolvedValue(undefined),
    setRefreshTokenCookie: vi.fn(),
    clearRefreshTokenCookie: vi.fn(),
    sha256: vi.fn().mockReturnValue('mock-sha256'),
  } as unknown as DeepMockProxy<TokenService>;
}

export function createPasswordServiceMock(): DeepMockProxy<PasswordService> {
  return {
    hash: vi.fn().mockResolvedValue('$argon2id$mock-hash'),
    verify: vi.fn().mockResolvedValue(true),
    needsRehash: vi.fn().mockReturnValue(false),
  } as unknown as DeepMockProxy<PasswordService>;
}

export function createRbacCacheMock(): DeepMockProxy<RbacCacheService> {
  return {
    getUserPermissions: vi.fn().mockResolvedValue([]),
    invalidateUser: vi.fn().mockResolvedValue(undefined),
    invalidateCompany: vi.fn().mockResolvedValue(undefined),
  } as unknown as DeepMockProxy<RbacCacheService>;
}

export function createMailMock(): DeepMockProxy<MailService> {
  return {
    send: vi.fn().mockResolvedValue(undefined),
    renderTemplate: vi.fn().mockReturnValue('<html>mock email</html>'),
  } as unknown as DeepMockProxy<MailService>;
}

export function createEmailVerificationMock(): DeepMockProxy<EmailVerificationService> {
  return {
    generateAndSend: vi.fn().mockResolvedValue(undefined),
    verify: vi.fn().mockResolvedValue(undefined),
  } as unknown as DeepMockProxy<EmailVerificationService>;
}

export function createConfigMock(overrides: Partial<AppConfig> = {}): DeepMockProxy<AppConfigService> {
  const defaults: AppConfig = {
    app: {
      nodeEnv: 'test',
      port: 3000,
      host: '0.0.0.0',
      apiBaseUrl: 'http://localhost:3000',
      webBaseUrl: 'http://localhost:5173',
      corsOrigin: ['http://localhost:5173'],
      swaggerEnabled: false,
    },
    db: { url: 'postgresql://user:pass@localhost:5432/db', poolMin: 1, poolMax: 2 },
    redis: { url: 'redis://localhost:6379' },
    minio: {
      endpoint: 'localhost',
      port: 9000,
      accessKey: 'minio',
      secretKey: 'minio-secret',
      useSsl: false,
      bucketName: 'hr-uploads',
    },
    jwt: { privateKey: 'mock-private-key', publicKey: 'mock-public-key' },
    cookie: { secret: 'cookie-secret' },
    mail: { host: 'localhost', port: 1025, from: 'noreply@test.com', user: undefined, pass: undefined },
    sso: { enabled: false, google: { clientId: '', clientSecret: '' } },
    log: { level: 'silent' },
    otel: { serviceName: 'hr-api', exporterEndpoint: undefined, samplerArg: 0 },
  };
  const merged = { ...defaults, ...overrides };

  return {
    get: vi.fn().mockImplementation(<K extends keyof AppConfig>(key: K) => merged[key]),
  } as unknown as DeepMockProxy<AppConfigService>;
}

export function buildRequestContext(overrides: Partial<RequestContext> = {}): RequestContext {
  return {
    userId: 'user-uuid-001',
    companyId: 'company-uuid-001',
    email: 'admin@demo-corp.hr',
    roles: ['role-admin-uuid'],
    permissions: ['employee:read', 'employee:write', 'payroll:read', 'admin:read', 'admin:write'],
    sessionId: 'session-uuid-001',
    traceId: 'trace-abc123',
    ...overrides,
  };
}

export function buildRole(overrides: Record<string, unknown> = {}) {
  return { role: { id: 'role-admin-uuid', name: 'Admin', ...overrides } };
}

export function buildUser(overrides: Record<string, unknown> = {}) {
  return {
    id: 'user-uuid-001',
    email: 'admin@demo-corp.hr',
    passwordHash: '$argon2id$mock-hash',
    firstName: 'Admin',
    lastName: 'User',
    isActive: true,
    mfaEnabled: false,
    mfaSecret: null,
    emailVerifiedAt: new Date('2024-01-01T00:00:00.000Z'),
    lastLoginAt: null,
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
    updatedAt: new Date('2024-01-01T00:00:00.000Z'),
    deletedAt: null,
    ...overrides,
  };
}

export function buildEmployee(overrides: Record<string, unknown> = {}) {
  return {
    id: 'employee-uuid-001',
    companyId: 'company-uuid-001',
    userId: 'user-uuid-001',
    employeeNumber: 'EMP001',
    status: 'ACTIVE',
    workEmail: 'admin@demo-corp.hr',
    joinedAt: new Date('2024-01-01T00:00:00.000Z'),
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
    updatedAt: new Date('2024-01-01T00:00:00.000Z'),
    deletedAt: null,
    roles: [buildRole()],
    ...overrides,
  };
}
