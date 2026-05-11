import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Require } from '../auth/decorators/permissions.decorator';
import type { RequestContext } from '../../common/context/request-context';
import { AssignRolesBody, type AssignRolesDto, InviteUserBody, type InviteUserDto, UpdateUserBody, type UpdateUserDto } from './dto/users.dto';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post('invite')
  @Require.write('admin')
  invite(@CurrentUser() user: RequestContext, @Body() dto: InviteUserBody) {
    return this.usersService.inviteUser(user.companyId, dto as InviteUserDto, user.userId);
  }

  @Get()
  @Require.read('admin')
  list(
    @CurrentUser() user: RequestContext,
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '20',
    @Query('search') search?: string,
    @Query('isActive') isActive?: string,
  ) {
    return this.usersService.listUsers(user.companyId, {
      page: Math.max(Number(page), 1),
      pageSize: Math.min(Math.max(Number(pageSize), 1), 100),
      search,
      ...(isActive === undefined ? {} : { isActive: isActive === 'true' }),
    });
  }

  @Get(':id')
  @Require.read('admin')
  get(@CurrentUser() user: RequestContext, @Param('id') id: string) {
    return this.usersService.getUser(user.companyId, id);
  }

  @Patch(':id')
  @Require.write('admin')
  update(
    @CurrentUser() user: RequestContext,
    @Param('id') id: string,
    @Body() dto: UpdateUserBody,
  ) {
    return this.usersService.updateUser(user.companyId, id, dto as UpdateUserDto);
  }

  @Post(':id/deactivate')
  @Require.write('admin')
  deactivate(@CurrentUser() user: RequestContext, @Param('id') id: string) {
    return this.usersService.setActive(user.companyId, id, false);
  }

  @Post(':id/activate')
  @Require.write('admin')
  activate(@CurrentUser() user: RequestContext, @Param('id') id: string) {
    return this.usersService.setActive(user.companyId, id, true);
  }

  @Post(':id/roles')
  @Require.write('admin')
  @HttpCode(204)
  async assignRoles(
    @CurrentUser() user: RequestContext,
    @Param('id') id: string,
    @Body() dto: AssignRolesBody,
  ): Promise<void> {
    await this.usersService.assignRoles(user.companyId, id, dto as AssignRolesDto);
  }

  @Delete(':id/roles/:roleId')
  @Require.write('admin')
  @HttpCode(204)
  async removeRole(
    @CurrentUser() user: RequestContext,
    @Param('id') id: string,
    @Param('roleId') roleId: string,
  ): Promise<void> {
    await this.usersService.removeRole(user.companyId, id, roleId);
  }

  @Post(':id/resend-invite')
  @Require.write('admin')
  resendInvite(@CurrentUser() user: RequestContext, @Param('id') id: string) {
    return this.usersService.resendInvite(user.companyId, id);
  }
}
