import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ForbiddenError, UnauthorizedError } from '@hr/shared';
import {
  buildEmployee,
  buildUser,
  createConfigMock,
  createEmailVerificationMock,
  createMailMock,
  createPasswordServiceMock,
  createPrismaMock,
  createRbacCacheMock,
  createRedisMock,
  createTokenServiceMock,
} from '@/__mocks__/factories';
import { AuthService } from '../auth.service';

vi.mock('@hr/prisma', () => ({
  PrismaService: class PrismaService {},
  seedCompanyDefaults: vi.fn(),
}));

let service: AuthService;
let prisma: ReturnType<typeof createPrismaMock>;
let passwords: ReturnType<typeof createPasswordServiceMock>;
let tokens: ReturnType<typeof createTokenServiceMock>;

function userWithEmployee(userOverrides: Record<string, unknown> = {}, employeeOverrides: Record<string, unknown> = {}) {
  return { ...buildUser(userOverrides), employee: buildEmployee(employeeOverrides) };
}

beforeEach(() => {
  prisma = createPrismaMock();
  passwords = createPasswordServiceMock();
  tokens = createTokenServiceMock();

  service = new AuthService(
    prisma as never,
    passwords as never,
    tokens as never,
    createEmailVerificationMock() as never,
    createRedisMock() as never,
    createMailMock() as never,
    createConfigMock() as never,
    createRbacCacheMock() as never,
  );

  vi.useFakeTimers();
  vi.setSystemTime(new Date('2024-03-15T10:00:00.000Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('AuthService.login()', () => {
  describe('successful login', () => {
    it('returns access token and issues refresh token for valid credentials', async () => {
      prisma.unscopedClient.user.findUnique.mockResolvedValue(userWithEmployee());
      tokens.signAccessToken.mockReturnValue('access-token-abc');
      tokens.issueRefreshToken.mockResolvedValue('refresh-token-xyz');

      const result = await service.login({ email: 'admin@demo-corp.hr', password: 'Passw0rd!' });

      expect(result).toMatchObject({ accessToken: 'access-token-abc', refreshToken: 'refresh-token-xyz' });
    });

    it('calls tokens.signAccessToken with the authenticated user and tenant payload', async () => {
      const user = userWithEmployee();
      prisma.unscopedClient.user.findUnique.mockResolvedValue(user);

      await service.login({ email: user.email, password: 'Passw0rd!' });

      expect(tokens.signAccessToken).toHaveBeenCalledWith(
        expect.objectContaining({
          sub: user.id,
          companyId: user.employee.companyId,
          email: user.email,
          roles: ['role-admin-uuid'],
        }),
      );
    });

    it('updates user.lastLoginAt on successful login', async () => {
      const user = userWithEmployee();
      prisma.unscopedClient.user.findUnique.mockResolvedValue(user);

      await service.login({ email: user.email, password: 'Passw0rd!' });

      expect(prisma.unscopedClient.user.update).toHaveBeenCalledWith({
        where: { id: user.id },
        data: { lastLoginAt: new Date('2024-03-15T10:00:00.000Z') },
      });
    });

    it('rehashes password when argon2 parameters are outdated', async () => {
      const user = userWithEmployee();
      prisma.unscopedClient.user.findUnique.mockResolvedValue(user);
      passwords.needsRehash.mockReturnValue(true);
      passwords.hash.mockResolvedValue('$argon2id$new-stronger-hash');

      await service.login({ email: user.email, password: 'Passw0rd!' });

      expect(passwords.hash).toHaveBeenCalledWith('Passw0rd!');
      expect(prisma.unscopedClient.user.update).toHaveBeenCalledWith({
        where: { id: user.id },
        data: {
          lastLoginAt: new Date('2024-03-15T10:00:00.000Z'),
          passwordHash: '$argon2id$new-stronger-hash',
        },
      });
    });

    it('does not rehash password when hash parameters are current', async () => {
      prisma.unscopedClient.user.findUnique.mockResolvedValue(userWithEmployee());
      passwords.needsRehash.mockReturnValue(false);

      await service.login({ email: 'admin@demo-corp.hr', password: 'Passw0rd!' });

      expect(passwords.hash).not.toHaveBeenCalled();
    });
  });

  describe('invalid credentials', () => {
    it('returns 401 with generic message when password does not match hash', async () => {
      const user = userWithEmployee();
      prisma.unscopedClient.user.findUnique.mockResolvedValue(user);
      passwords.verify.mockResolvedValue(false);

      await expect(service.login({ email: user.email, password: 'WrongPass1!' })).rejects.toThrow(UnauthorizedError);
      await expect(service.login({ email: user.email, password: 'WrongPass1!' })).rejects.toMatchObject({
        message: 'Invalid email or password',
      });
    });

    it('returns 401 with the same generic message when email does not exist', async () => {
      prisma.unscopedClient.user.findUnique.mockResolvedValue(null);

      await expect(service.login({ email: 'missing@test.com', password: 'Pass1!' })).rejects.toThrow(UnauthorizedError);
      await expect(service.login({ email: 'missing@test.com', password: 'Pass1!' })).rejects.toMatchObject({
        message: 'Invalid email or password',
      });
    });

    it('uses identical error messages for missing email and wrong password to prevent enumeration', async () => {
      prisma.unscopedClient.user.findUnique.mockResolvedValueOnce(null);
      const missingEmailError = await service.login({ email: 'missing@test.com', password: 'Pass1!' })
        .catch((error: Error) => error);

      prisma.unscopedClient.user.findUnique.mockResolvedValueOnce(userWithEmployee());
      passwords.verify.mockResolvedValueOnce(false);
      const wrongPasswordError = await service.login({ email: 'admin@demo-corp.hr', password: 'WrongPass1!' })
        .catch((error: Error) => error);

      expect(missingEmailError.message).toBe('Invalid email or password');
      expect(wrongPasswordError.message).toBe('Invalid email or password');
      expect(missingEmailError.message).toBe(wrongPasswordError.message);
    });

    it('verifies a dummy argon2 hash when user is not found to keep the timing path comparable', async () => {
      prisma.unscopedClient.user.findUnique.mockResolvedValue(null);

      await service.login({ email: 'no@one.com', password: 'Pass1!' }).catch(() => undefined);

      expect(passwords.verify).toHaveBeenCalledWith(expect.stringContaining('$argon2id$'), 'Pass1!');
    });
  });

  describe('account state validation', () => {
    it('returns 403 when user.isActive is false', async () => {
      const user = userWithEmployee({ isActive: false, emailVerifiedAt: undefined });
      prisma.unscopedClient.user.findUnique.mockResolvedValue(user);

      await expect(service.login({ email: user.email, password: 'Passw0rd!' })).rejects.toThrow(ForbiddenError);
    });

    it('returns 403 when employee.status is TERMINATED', async () => {
      const user = userWithEmployee({}, { status: 'TERMINATED' });
      prisma.unscopedClient.user.findUnique.mockResolvedValue(user);

      await expect(service.login({ email: user.email, password: 'Passw0rd!' })).rejects.toThrow(ForbiddenError);
    });

    it('returns 403 when employee.status is INACTIVE', async () => {
      const user = userWithEmployee({}, { status: 'INACTIVE' });
      prisma.unscopedClient.user.findUnique.mockResolvedValue(user);

      await expect(service.login({ email: user.email, password: 'Passw0rd!' })).rejects.toThrow(ForbiddenError);
    });

    it('returns 403 with email verification message when emailVerifiedAt is null', async () => {
      const user = userWithEmployee({ emailVerifiedAt: null });
      prisma.unscopedClient.user.findUnique.mockResolvedValue(user);

      await expect(service.login({ email: user.email, password: 'Passw0rd!' })).rejects.toMatchObject({
        message: 'Email is not verified',
      });
    });

    it('sets mfaRequired flag in response when user.mfaEnabled is true', async () => {
      const user = userWithEmployee({ mfaEnabled: true, mfaSecret: 'TOTP_SECRET' });
      prisma.unscopedClient.user.findUnique.mockResolvedValue(user);

      const result = await service.login({ email: user.email, password: 'Passw0rd!' });

      expect(result).toMatchObject({ mfaRequired: true, mfaToken: expect.any(String) });
      expect('accessToken' in result).toBe(false);
    });

    it('does not issue tokens when MFA is required', async () => {
      const user = userWithEmployee({ mfaEnabled: true, mfaSecret: 'TOTP_SECRET' });
      prisma.unscopedClient.user.findUnique.mockResolvedValue(user);

      await service.login({ email: user.email, password: 'Passw0rd!' });

      expect(tokens.signAccessToken).not.toHaveBeenCalled();
      expect(tokens.issueRefreshToken).not.toHaveBeenCalled();
    });
  });
});
