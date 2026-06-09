import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '@hr/prisma';
import { ConflictError, ForbiddenError, NotFoundError } from '@hr/shared';
import type { Role } from '@prisma/client';
import type { CreateRoleDto, ReplacePermissionsDto, UpdateRoleDto } from './dto/roles.dto';
import { RbacCacheService } from './rbac-cache.service';

@Injectable()
export class RolesService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(RbacCacheService) private readonly rbacCache: RbacCacheService,
  ) {}

  createRole(companyId: string, dto: CreateRoleDto): Promise<Role> {
    return this.prisma.forCompany(companyId).role.create({
      data: { companyId, name: dto.name, description: dto.description, isSystem: false },
    });
  }


  listRoles(companyId: string): Promise<Role[]> {
    return this.prisma.forCompany(companyId).role.findMany({
      include: { permissions: { include: { permission: true } } },
      orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
    });
  }

  async getRole(companyId: string, roleId: string): Promise<Role> {
    const role = await this.prisma.forCompany(companyId).role.findFirst({
      where: { id: roleId },
      include: { permissions: { include: { permission: true } } },
    });
    if (!role) throw new NotFoundError('Role not found');
    return role;
  }

  async updateRole(companyId: string, roleId: string, dto: UpdateRoleDto): Promise<Role> {
    const role = await this.prisma.forCompany(companyId).role.findFirst({ where: { id: roleId } });
    if (!role) throw new NotFoundError('Role not found');
    if (role.isSystem) throw new ForbiddenError('System roles cannot be updated');

    const updated = await this.prisma.forCompany(companyId).role.update({
      where: { id: roleId },
      data: dto,
    });
    await this.rbacCache.invalidateCompany(companyId);
    return updated;
  }

  async deleteRole(companyId: string, roleId: string): Promise<void> {
    const role = await this.prisma.forCompany(companyId).role.findFirst({
      where: { id: roleId },
      include: { _count: { select: { employees: true } } },
    });
    if (!role) throw new NotFoundError('Role not found');
    if (role.isSystem) throw new ForbiddenError('System roles cannot be deleted');
    // eslint-disable-next-line no-underscore-dangle
    const counts = role._count;
    const assignedEmployees = counts.employees;
    if (assignedEmployees > 0) {
      throw new ConflictError(`Cannot delete role with ${assignedEmployees} assigned employee(s)`);
    }
    await this.prisma.forCompany(companyId).role.delete({ where: { id: roleId } });
    await this.rbacCache.invalidateCompany(companyId);
  }

  listPermissions() {
    return this.prisma.unscopedClient.permission.findMany({
      orderBy: [{ resource: 'asc' }, { action: 'asc' }],
    });
  }

  async replacePermissions(
    companyId: string,
    roleId: string,
    dto: ReplacePermissionsDto,
  ): Promise<void> {
    const role = await this.prisma.forCompany(companyId).role.findFirst({ where: { id: roleId } });
    if (!role) throw new NotFoundError('Role not found');
    if (role.isSystem) throw new ForbiddenError('System roles cannot be updated');

    const uniquePermissionIds = [...new Set(dto.permissionIds)];
    const count = await this.prisma.unscopedClient.permission.count({
      where: { id: { in: uniquePermissionIds } },
    });
    if (count !== uniquePermissionIds.length) {
      throw new NotFoundError('Permission not found');
    }

    await this.prisma.unscopedClient.$transaction([
      this.prisma.unscopedClient.rolePermission.deleteMany({ where: { roleId } }),
      ...(uniquePermissionIds.length > 0
        ? [this.prisma.unscopedClient.rolePermission.createMany({
          data: uniquePermissionIds.map((permissionId) => ({ roleId, permissionId })),
        })]
        : []),
    ]);
    await this.rbacCache.invalidateCompany(companyId);
  }
}
