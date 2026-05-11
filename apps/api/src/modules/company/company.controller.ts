import { Body, Controller, Get, Param, Patch, Put } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Require } from '../auth/decorators/permissions.decorator';
import type { RequestContext } from '../../common/context/request-context';
import { CompanyService } from './company.service';
import { UpdateCompanyBody, type UpdateCompanyDto, UpsertSettingBody, type UpsertSettingDto } from './dto/company.dto';

@Controller('company')
export class CompanyController {
  constructor(private readonly companyService: CompanyService) {}

  @Get()
  @Require.read('company')
  getCompany(@CurrentUser() user: RequestContext) {
    return this.companyService.getCompany(user.companyId);
  }

  @Patch()
  @Require.write('company')
  updateCompany(@CurrentUser() user: RequestContext, @Body() dto: UpdateCompanyBody) {
    return this.companyService.updateCompany(user.companyId, dto as UpdateCompanyDto);
  }

  @Get('settings')
  @Require.read('company')
  getSettings(@CurrentUser() user: RequestContext) {
    return this.companyService.getSettings(user.companyId);
  }

  @Put('settings/:key')
  @Require.write('company')
  upsertSetting(
    @CurrentUser() user: RequestContext,
    @Param('key') key: string,
    @Body() dto: UpsertSettingBody,
  ) {
    return this.companyService.upsertSetting(user.companyId, key, (dto as UpsertSettingDto).value);
  }

  @Get('stats')
  @Require.read('company')
  getStats(@CurrentUser() user: RequestContext) {
    return this.companyService.getStats(user.companyId);
  }
}
