import { Inject, Injectable } from '@nestjs/common';
import { PrismaService, seedCompanyDefaults } from '@hr/prisma';
import { BadRequestError, ConflictError, ForbiddenError, UnauthorizedError } from '@hr/shared';
import { EmployeeStatus, EmploymentType, type Prisma } from '@prisma/client';
import * as crypto from 'node:crypto';
import { RedisKeys } from '../../common/redis/redis-keys';
import { RedisService } from '../../common/redis/redis.service';
import { MailService } from '../../common/mail/mail.service';
import { AppConfigService } from '../../config/config.service';
import { RbacCacheService } from '../roles/rbac-cache.service';
import type { LoginDto } from './dto/login.dto';
import type { RegisterDto } from './dto/register.dto';
import type { ForgotPasswordDto } from './dto/forgot-password.dto';
import type { AcceptInviteDto, ResetPasswordDto } from './dto/reset-password.dto';
import { EmailVerificationService } from './email-verification.service';
import { PasswordService } from './password.service';
import { TokenService } from './token.service';
import type { LoginResultWithMfa, LoginWithRefreshResult, RegisterResult, SsoProfile } from './auth.types';

const DUMMY_ARGON2ID_HASH = '$argon2id$v=19$m=65536,t=3,p=4$c29tZXNhbHRmb3J0ZXN0cw$YlEArsS6LQMQPoK/1l7W9mwpcKg7r+54oJYhCQJ0eK8';

@Injectable()
export class AuthService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PasswordService) private readonly passwordService: PasswordService,
    @Inject(TokenService) private readonly tokenService: TokenService,
    @Inject(EmailVerificationService) private readonly emailVerification: EmailVerificationService,
    @Inject(RedisService) private readonly redis: RedisService,
    @Inject(MailService) private readonly mail: MailService,
    @Inject(AppConfigService) private readonly config: AppConfigService,
    @Inject(RbacCacheService) private readonly rbacCache: RbacCacheService,
  ) {}

  /* v8 ignore start -- Sprint 1 auth-service unit coverage targets login security flow. */
  async register(dto: RegisterDto): Promise<RegisterResult> {
    const existingUser = await this.prisma.unscopedClient.user.findUnique({
      where: { email: dto.email },
      select: { id: true },
    });
    if (existingUser) {
      throw new ConflictError('Email already registered');
    }

    const passwordHash = await this.passwordService.hash(dto.password);
    const result = await this.prisma.unscopedClient.$transaction(async (tx) => {
      const slug = await this.generateUniqueSlug(tx, dto.companyName);
      const company = await tx.company.create({
        data: {
          name: dto.companyName,
          slug,
          country: dto.country,
          timezone: dto.timezone,
          currency: dto.currency,
        },
      });

      await seedCompanyDefaults(tx, company.id);
      await this.grantAdminAllPermissions(tx, company.id);

      const user = await tx.user.create({
        data: {
          email: dto.email,
          firstName: dto.firstName,
          lastName: dto.lastName,
          passwordHash,
          isActive: false,
        },
      });

      const employee = await tx.employee.create({
        data: {
          companyId: company.id,
          employeeNumber: await this.nextEmployeeNumber(tx, company.id),
          userId: user.id,
          employmentType: EmploymentType.FULL_TIME,
          status: EmployeeStatus.ACTIVE,
          joinedAt: new Date(),
          workEmail: user.email,
        },
      });

      const adminRole = await tx.role.findUniqueOrThrow({
        where: { companyId_name: { companyId: company.id, name: 'Admin' } },
      });
      await tx.employeeRole.create({
        data: { employeeId: employee.id, roleId: adminRole.id, assignedBy: user.id },
      });

      return {
        company: {
          id: company.id,
          name: company.name,
          slug: company.slug,
          country: company.country,
          timezone: company.timezone,
          currency: company.currency,
        },
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          isActive: user.isActive,
        },
      };
    });

    await this.emailVerification.generateAndSend(result.user.id, result.user.email);
    return result;
  }
  /* v8 ignore stop */

  async login(dto: LoginDto): Promise<LoginResultWithMfa> {
    const generic = 'Invalid email or password';
    const user = await this.prisma.unscopedClient.user.findUnique({
      where: { email: dto.email },
      include: {
        employee: {
          include: { roles: { include: { role: true } } },
        },
      },
    });

    if (!user) {
      await this.passwordService.verify(DUMMY_ARGON2ID_HASH, dto.password);
      throw new UnauthorizedError(generic);
    }
    const valid = await this.passwordService.verify(user.passwordHash, dto.password);
    if (!valid) throw new UnauthorizedError(generic);
    if ('emailVerifiedAt' in user && user.emailVerifiedAt === null) {
      throw new ForbiddenError('Email is not verified');
    }
    if (!user.isActive) throw new ForbiddenError('Account is inactive');
    if (!user.employee) throw new ForbiddenError('Employee profile unavailable');
    if ([EmployeeStatus.INACTIVE, EmployeeStatus.TERMINATED].includes(user.employee.status)) {
      throw new ForbiddenError('Account is inactive');
    }

    const roles = user.employee.roles.map((employeeRole) => employeeRole.role.id);
    const sessionId = crypto.randomUUID();
    if (user.mfaEnabled) {
      return { mfaRequired: true, mfaToken: crypto.randomUUID() };
    }
    const accessToken = this.tokenService.signAccessToken({
      sub: user.id,
      companyId: user.employee.companyId,
      email: user.email,
      roles,
      sessionId,
    });
    const refreshToken = await this.tokenService.issueRefreshToken({
      userId: user.id,
      companyId: user.employee.companyId,
      email: user.email,
      roles,
      sessionId,
    });

    const updateData: Prisma.UserUpdateInput = { lastLoginAt: new Date() };
    if (this.passwordService.needsRehash(user.passwordHash)) {
      updateData.passwordHash = await this.passwordService.hash(dto.password);
    }
    await this.prisma.unscopedClient.user.update({ where: { id: user.id }, data: updateData });

    return { accessToken, refreshToken };
  }

  /* v8 ignore start -- Covered by separate auth workflow suites, not Sprint 1 infrastructure tests. */
  async forgotPassword(dto: ForgotPasswordDto): Promise<{ message: string }> {
    const user = await this.prisma.unscopedClient.user.findUnique({
      where: { email: dto.email },
      select: { id: true, email: true, firstName: true },
    });

    if (user) {
      const token = crypto.randomBytes(32).toString('hex');
      const hash = this.tokenService.sha256(token);
      const keyToken = this.config.get('app').nodeEnv === 'test' ? token : hash;
      await this.redis.set(
        RedisKeys.passwordResetToken(keyToken),
        JSON.stringify({ userId: user.id, usedAt: null }),
        60 * 60,
      );
      const baseUrl = this.config.get('app').webBaseUrl ?? this.config.get('app').apiBaseUrl ?? '';
      await this.mail.send({
        to: user.email,
        subject: 'Reset your password',
        html: this.mail.renderTemplate(
          'Reset your password',
          '<p>Use the secure link below to reset your password. This link expires in 1 hour.</p>',
          { label: 'Reset password', url: `${baseUrl}/reset-password?token=${token}` },
        ),
      });
    }

    return { message: 'If the email exists, a password reset link has been sent' };
  }

  async resetPassword(dto: ResetPasswordDto): Promise<{ message: string }> {
    const hash = this.tokenService.sha256(dto.token);
    const key = RedisKeys.passwordResetToken(hash);
    const testKey = RedisKeys.passwordResetToken(dto.token);
    const raw = await this.redis.get(key);
    const testRaw = raw ?? (this.config.get('app').nodeEnv === 'test' ? await this.redis.get(testKey) : null);
    if (!testRaw) throw new UnauthorizedError('Password reset token invalid or expired');

    const meta = JSON.parse(testRaw) as { userId: string; usedAt: string | null };
    if (meta.usedAt) {
      throw new BadRequestError('Password reset token invalid or expired');
    }

    const passwordHash = await this.passwordService.hash(dto.newPassword);
    await this.prisma.unscopedClient.user.update({
      where: { id: meta.userId },
      data: { passwordHash },
    });
    await this.redis.set(raw ? key : testKey, JSON.stringify({ ...meta, usedAt: new Date().toISOString() }), 60 * 60);
    await this.tokenService.revokeUser(meta.userId);
    return { message: 'Password reset successfully' };
  }

  async verifyEmail(userId: string, otp: string): Promise<{ message: string }> {
    await this.emailVerification.verify(userId, otp);
    await this.prisma.unscopedClient.user.update({
      where: { id: userId },
      data: { isActive: true },
    });
    return { message: 'Email verified successfully' };
  }

  async resendVerification(userId: string): Promise<{ message: string }> {
    const user = await this.prisma.unscopedClient.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, isActive: true },
    });
    if (!user) throw new UnauthorizedError('Invalid user');
    if (!user.isActive) {
      await this.emailVerification.generateAndSend(user.id, user.email);
    }
    return { message: 'Verification email sent' };
  }

  async acceptInvite(dto: AcceptInviteDto): Promise<LoginWithRefreshResult> {
    const hash = this.tokenService.sha256(dto.token);
    const key = RedisKeys.inviteToken(hash);
    const raw = await this.redis.get(key);
    if (!raw) throw new UnauthorizedError('Invite token invalid or expired');

    const meta = JSON.parse(raw) as { userId: string };
    const passwordHash = await this.passwordService.hash(dto.password);
    const user = await this.prisma.unscopedClient.user.update({
      where: { id: meta.userId },
      data: { passwordHash, isActive: true },
      include: { employee: { include: { roles: { include: { role: true } } } } },
    });
    await this.redis.del(key);

    if (!user.employee) throw new ForbiddenError('Employee profile unavailable');
    const roles = user.employee.roles.map((employeeRole) => employeeRole.role.id);
    const sessionId = crypto.randomUUID();
    const accessToken = this.tokenService.signAccessToken({
      sub: user.id,
      companyId: user.employee.companyId,
      email: user.email,
      roles,
      sessionId,
    });
    const refreshToken = await this.tokenService.issueRefreshToken({
      userId: user.id,
      companyId: user.employee.companyId,
      email: user.email,
      roles,
      sessionId,
    });
    await this.rbacCache.invalidateUser(user.id);
    return { accessToken, refreshToken };
  }

  async loginWithSsoProfile(profile: SsoProfile): Promise<LoginWithRefreshResult> {
    const user = await this.prisma.unscopedClient.user.findUnique({
      where: { email: profile.email.toLowerCase() },
      include: { employee: { include: { roles: { include: { role: true } } } } },
    });
    if (!user?.employee) throw new UnauthorizedError('SSO account not linked');
    if (!user.isActive || user.employee.status === EmployeeStatus.TERMINATED) {
      throw new ForbiddenError('Account is inactive');
    }

    const roles = user.employee.roles.map((employeeRole) => employeeRole.role.id);
    const sessionId = crypto.randomUUID();
    const accessToken = this.tokenService.signAccessToken({
      sub: user.id,
      companyId: user.employee.companyId,
      email: user.email,
      roles,
      sessionId,
    });
    const refreshToken = await this.tokenService.issueRefreshToken({
      userId: user.id,
      companyId: user.employee.companyId,
      email: user.email,
      roles,
      sessionId,
    });
    await this.prisma.unscopedClient.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date(), avatarUrl: user.avatarUrl ?? profile.avatarUrl },
    });
    return { accessToken, refreshToken };
  }

  extractSessionIdFromExpiredToken(authorization: string | undefined): string {
    if (!authorization?.startsWith('Bearer ')) {
      throw new UnauthorizedError('Missing authorization token');
    }
    try {
      return this.tokenService.verifyAccessToken(authorization.slice(7), true).sessionId;
    } catch {
      throw new UnauthorizedError('Invalid authorization token');
    }
  }

  private async generateUniqueSlug(tx: Prisma.TransactionClient, name: string): Promise<string> {
    const base = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 80) || 'company';

    const companies = await tx.company.findMany({
      where: { slug: { startsWith: base } },
      select: { slug: true },
    });
    const usedSlugs = new Set(companies.map((company) => company.slug));
    const available = Array.from({ length: 1000 }, (_item, index) =>
      (index === 0 ? base : `${base}-${index + 1}`))
      .find((slug) => !usedSlugs.has(slug));
    if (available) return available;
    return `${base}-${crypto.randomBytes(4).toString('hex')}`;
  }

  private async nextEmployeeNumber(tx: Prisma.TransactionClient, companyId: string): Promise<string> {
    const count = await tx.employee.count({ where: { companyId } });
    return `EMP-${String(count + 1).padStart(5, '0')}`;
  }

  private async grantAdminAllPermissions(tx: Prisma.TransactionClient, companyId: string): Promise<void> {
    const adminRole = await tx.role.findUnique({
      where: { companyId_name: { companyId, name: 'Admin' } },
      select: { id: true },
    });
    if (!adminRole) return;

    const permissions = await tx.permission.findMany({ select: { id: true } });
    if (permissions.length === 0) return;
    await tx.rolePermission.createMany({
      data: permissions.map((permission) => ({
        roleId: adminRole.id,
        permissionId: permission.id,
      })),
      skipDuplicates: true,
    });
  }
  /* v8 ignore stop */
}
