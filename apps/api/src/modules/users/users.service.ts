import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '@hr/prisma';
import { ConflictError, NotFoundError } from '@hr/shared';
import { EmployeeStatus, EmploymentType, type Prisma, type User } from '@prisma/client';
import * as crypto from 'node:crypto';
import { AppConfigService } from '../../config/config.service';
import { MailService } from '../../common/mail/mail.service';
import { RedisKeys } from '../../common/redis/redis-keys';
import { RedisService } from '../../common/redis/redis.service';
import { TokenService } from '../auth/token.service';
import { RbacCacheService } from '../roles/rbac-cache.service';
import type { AssignRolesDto, InviteUserDto, UpdateUserDto } from './dto/users.dto';

@Injectable()
export class UsersService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(RedisService) private readonly redis: RedisService,
    @Inject(TokenService) private readonly tokenService: TokenService,
    @Inject(MailService) private readonly mail: MailService,
    @Inject(AppConfigService) private readonly config: AppConfigService,
    @Inject(RbacCacheService) private readonly rbacCache: RbacCacheService,
  ) {}

  async inviteUser(companyId: string, dto: InviteUserDto, invitedBy: string): Promise<User> {
    const existing = await this.prisma.unscopedClient.user.findFirst({
      where: { email: dto.email, employee: { companyId } },
      select: { id: true },
    });
    if (existing) throw new ConflictError('User already exists');

    const token = crypto.randomBytes(32).toString('hex');
    const hash = this.tokenService.sha256(token);

    const user = await this.prisma.unscopedClient.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email: dto.email,
          firstName: dto.firstName,
          lastName: dto.lastName,
          passwordHash: '$argon2id$v=19$m=65536,t=3,p=4$inviteinviteinvite$inviteinviteinviteinviteinviteinvite',
          isActive: false,
        },
      });
      const employee = await tx.employee.create({
        data: {
          companyId,
          employeeNumber: await this.nextEmployeeNumber(tx, companyId),
          userId: created.id,
          employmentType: EmploymentType.FULL_TIME,
          status: EmployeeStatus.ACTIVE,
          joinedAt: new Date(),
          workEmail: created.email,
        },
      });
      if (dto.roleIds.length > 0) {
        await tx.employeeRole.createMany({
          data: dto.roleIds.map((roleId) => ({ employeeId: employee.id, roleId, assignedBy: invitedBy })),
          skipDuplicates: true,
        });
      }
      return created;
    });

    await this.redis.set(RedisKeys.inviteToken(hash), JSON.stringify({ userId: user.id }), 72 * 60 * 60);
    const baseUrl = this.config.get('app').webBaseUrl ?? this.config.get('app').apiBaseUrl ?? '';
    await this.mail.send({
      to: user.email,
      subject: 'You are invited to HR Platform',
      html: this.mail.renderTemplate(
        'Accept your invite',
        '<p>You have been invited to join HR Platform.</p>',
        { label: 'Accept invite', url: `${baseUrl}/accept-invite?token=${token}` },
      ),
    });
    return user;
  }

  async listUsers(companyId: string, params: { page: number; pageSize: number; search?: string; isActive?: boolean }) {
    const { page, pageSize, search, isActive } = params;
    const skip = (page - 1) * pageSize;
    const where: Prisma.UserWhereInput = {
      deletedAt: null,
      employee: { companyId, deletedAt: null },
      ...(isActive !== undefined && { isActive }),
      ...(search && {
        OR: [
          { firstName: { contains: search, mode: 'insensitive' } },
          { lastName: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };

    const [users, total] = await Promise.all([
      this.prisma.unscopedClient.user.findMany({
        where,
        skip,
        take: pageSize,
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          isActive: true,
          lastLoginAt: true,
          createdAt: true,
          employee: {
            select: {
              id: true,
              employeeNumber: true,
              department: { select: { id: true, name: true } },
              roles: { include: { role: { select: { id: true, name: true } } } },
            },
          },
        },
        orderBy: { lastName: 'asc' },
      }),
      this.prisma.unscopedClient.user.count({ where }),
    ]);

    return { users, meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } };
  }

  async getUser(companyId: string, id: string) {
    const user = await this.prisma.unscopedClient.user.findFirst({
      where: { id, deletedAt: null, employee: { companyId } },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        avatarUrl: true,
        locale: true,
        isActive: true,
        lastLoginAt: true,
        employee: { include: { roles: { include: { role: true } } } },
      },
    });
    if (!user) throw new NotFoundError('User not found');
    return user;
  }

  async updateUser(companyId: string, id: string, dto: UpdateUserDto) {
    await this.getUser(companyId, id);
    return this.prisma.unscopedClient.user.update({
      where: { id },
      data: dto,
      select: { id: true, firstName: true, lastName: true, email: true, avatarUrl: true, locale: true, isActive: true },
    });
  }

  async setActive(companyId: string, id: string, isActive: boolean) {
    await this.getUser(companyId, id);
    const user = await this.prisma.unscopedClient.user.update({
      where: { id },
      data: { isActive },
      select: { id: true, email: true, isActive: true },
    });
    await this.tokenService.revokeUser(id);
    return user;
  }

  async assignRoles(companyId: string, id: string, dto: AssignRolesDto): Promise<void> {
    const user = await this.getUser(companyId, id);
    const employeeId = user.employee?.id;
    if (!employeeId) throw new NotFoundError('Employee not found');
    await this.prisma.unscopedClient.employeeRole.createMany({
      data: [...new Set(dto.roleIds)].map((roleId) => ({ employeeId, roleId })),
      skipDuplicates: true,
    });
    await this.rbacCache.invalidateUser(id);
  }

  async removeRole(companyId: string, id: string, roleId: string): Promise<void> {
    const user = await this.getUser(companyId, id);
    const employeeId = user.employee?.id;
    if (!employeeId) throw new NotFoundError('Employee not found');
    await this.prisma.unscopedClient.employeeRole.delete({
      where: { employeeId_roleId: { employeeId, roleId } },
    });
    await this.rbacCache.invalidateUser(id);
  }

  async resendInvite(companyId: string, id: string): Promise<{ message: string }> {
    const user = await this.getUser(companyId, id);
    const token = crypto.randomBytes(32).toString('hex');
    await this.redis.set(RedisKeys.inviteToken(this.tokenService.sha256(token)), JSON.stringify({ userId: id }), 72 * 60 * 60);
    const baseUrl = this.config.get('app').webBaseUrl ?? this.config.get('app').apiBaseUrl ?? '';
    await this.mail.send({
      to: user.email,
      subject: 'Your HR Platform invite',
      html: this.mail.renderTemplate('Accept your invite', '<p>Use this link to accept your invite.</p>', {
        label: 'Accept invite',
        url: `${baseUrl}/accept-invite?token=${token}`,
      }),
    });
    return { message: 'Invite sent' };
  }

  private async nextEmployeeNumber(tx: Prisma.TransactionClient, companyId: string): Promise<string> {
    const count = await tx.employee.count({ where: { companyId } });
    return `EMP-${String(count + 1).padStart(5, '0')}`;
  }
}
