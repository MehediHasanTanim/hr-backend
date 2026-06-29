import {
  Controller,
  Get,
  Post,
  Put,
  Param,
  Body,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { PolicyService } from './policy.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Require } from '../auth/decorators/permissions.decorator';
import { CreatePolicyDto, UpdatePolicyDto } from './dto/policy.dto';
import type { RequestContext } from '../../common/context/request-context';

@Controller('compliance')
export class PolicyController {
  constructor(private readonly policyService: PolicyService) {}

  @Post('policies')
  @HttpCode(HttpStatus.CREATED)
  @Require.write('admin')
  async createPolicy(
    @Body() dto: CreatePolicyDto,
    @CurrentUser() user: RequestContext,
  ) {
    return this.policyService.createPolicy(dto, user);
  }

  @Get('policies')
  async listPolicies(
    @CurrentUser() user: RequestContext,
    @Query('status') status?: string,
  ) {
    const isAdmin = user.permissions?.includes('admin:read') ?? false;
    return this.policyService.listPolicies(user.companyId, status, isAdmin);
  }

  @Get('policies/:id')
  async getPolicy(
    @Param('id') id: string,
    @CurrentUser() user: RequestContext,
  ) {
    return this.policyService.getPolicy(id, user.companyId);
  }

  @Put('policies/:id')
  @Require.write('admin')
  async updatePolicy(
    @Param('id') id: string,
    @Body() dto: UpdatePolicyDto,
    @CurrentUser() user: RequestContext,
  ) {
    return this.policyService.updatePolicy(id, dto, user);
  }

  @Post('policies/:id/publish')
  @Require.write('admin')
  async publishPolicy(
    @Param('id') id: string,
    @CurrentUser() user: RequestContext,
  ) {
    return this.policyService.publishPolicy(id, user);
  }

  @Post('policies/:id/archive')
  @Require.write('admin')
  async archivePolicy(
    @Param('id') id: string,
    @CurrentUser() user: RequestContext,
  ) {
    return this.policyService.archivePolicy(id, user);
  }

  @Post('policies/:id/acknowledge')
  @HttpCode(HttpStatus.OK)
  async acknowledgePolicy(
    @Param('id') id: string,
    @CurrentUser() user: RequestContext,
  ) {
    return this.policyService.acknowledgePolicy(id, user);
  }

  @Get('policies/:id/acknowledgements')
  @Require.read('admin')
  async listAcknowledgements(
    @Param('id') id: string,
    @CurrentUser() user: RequestContext,
  ) {
    return this.policyService.listAcknowledgements(id, user.companyId);
  }
}
