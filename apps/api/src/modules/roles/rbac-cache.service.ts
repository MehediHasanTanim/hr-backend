import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '@hr/prisma';
import { RedisKeys } from '../../common/redis/redis-keys';
import { RedisService } from '../../common/redis/redis.service';

@Injectable()
export class RbacCacheService {
  private readonly cacheTtl = 5 * 60;

  constructor(
    @Inject(RedisService) private readonly redis: RedisService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {}

  async getUserPermissions(userId: string, companyId: string): Promise<string[]> {
    const key = RedisKeys.userRoles(userId);
    const cached = await this.redis.get(key);
    if (cached) {
      const payload = JSON.parse(cached) as { companyId?: string; permissions?: string[] } | string[];
      if (Array.isArray(payload)) return payload;
      if (payload.companyId === companyId) return payload.permissions ?? [];
    }

    const permissions = await this.loadPermissionsFromDb(userId, companyId);
    await this.redis.set(key, JSON.stringify({ companyId, permissions }), this.cacheTtl);
    return permissions;
  }

  async invalidateUser(userId: string): Promise<void> {
    await this.redis.del(RedisKeys.userRoles(userId));
  }

  async invalidateCompany(companyId: string): Promise<void> {
    void companyId;
    const keys = await this.redis.keys('rbac:user:*:roles');
    if (keys.length > 0) {
      await this.redis.del(...keys);
    }
  }

  private async loadPermissionsFromDb(userId: string, companyId: string): Promise<string[]> {
    const employee = await this.prisma.forCompany(companyId).employee.findFirst({
      where: { userId },
      include: {
        roles: {
          include: {
            role: {
              include: { permissions: { include: { permission: true } } },
            },
          },
        },
      },
    });

    if (!employee) return [];

    return [
      ...new Set(employee.roles.flatMap((employeeRole) =>
        employeeRole.role.permissions.map((rolePermission) =>
          `${rolePermission.permission.resource}:${rolePermission.permission.action}`))),
    ];
  }
}
