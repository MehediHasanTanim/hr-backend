import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Require } from '../auth/decorators/permissions.decorator';
import type { RequestContext } from '../../common/context/request-context';
import { CreateRoleBody, type CreateRoleDto, ReplacePermissionsBody, type ReplacePermissionsDto, UpdateRoleBody, type UpdateRoleDto } from './dto/roles.dto';
import { RolesService } from './roles.service';

@Controller()
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Post('roles')
  @Require.write('admin')
  createRole(@CurrentUser() user: RequestContext, @Body() dto: CreateRoleBody) {
    return this.rolesService.createRole(user.companyId, dto as CreateRoleDto);
  }

  @Get('roles')
  @Require.read('admin')
  listRoles(@CurrentUser() user: RequestContext) {
    return this.rolesService.listRoles(user.companyId);
  }

  @Get('roles/:id')
  @Require.read('admin')
  getRole(@CurrentUser() user: RequestContext, @Param('id') id: string) {
    return this.rolesService.getRole(user.companyId, id);
  }

  @Patch('roles/:id')
  @Require.write('admin')
  updateRole(
    @CurrentUser() user: RequestContext,
    @Param('id') id: string,
    @Body() dto: UpdateRoleBody,
  ) {
    return this.rolesService.updateRole(user.companyId, id, dto as UpdateRoleDto);
  }

  @Delete('roles/:id')
  @Require.write('admin')
  @HttpCode(204)
  async deleteRole(@CurrentUser() user: RequestContext, @Param('id') id: string): Promise<void> {
    await this.rolesService.deleteRole(user.companyId, id);
  }

  @Get('permissions')
  @Require.read('admin')
  listPermissions() {
    return this.rolesService.listPermissions();
  }

  @Put('roles/:id/permissions')
  @Require.write('admin')
  @HttpCode(204)
  async replacePermissions(
    @CurrentUser() user: RequestContext,
    @Param('id') id: string,
    @Body() dto: ReplacePermissionsBody,
  ): Promise<void> {
    await this.rolesService.replacePermissions(user.companyId, id, dto as ReplacePermissionsDto);
  }
}
