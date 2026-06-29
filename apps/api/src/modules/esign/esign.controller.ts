import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { EsignService } from './esign.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Require } from '../auth/decorators/permissions.decorator';
import { CreateEsignRequestDto, SignDocumentDto, DeclineEsignDto } from './dto/esign.dto';
import type { RequestContext } from '../../common/context/request-context';

@Controller('esign')
export class EsignController {
  constructor(private readonly esignService: EsignService) {}

  @Post('requests')
  @HttpCode(HttpStatus.CREATED)
  @Require.write('admin')
  async createRequest(
    @Body() dto: CreateEsignRequestDto,
    @CurrentUser() user: RequestContext,
  ) {
    return this.esignService.createRequest(dto, user);
  }

  @Get('requests')
  @Require.read('admin')
  async listRequests(
    @CurrentUser() user: RequestContext,
    @Query('documentId') documentId?: string,
    @Query('status') status?: string,
  ) {
    return this.esignService.listRequests(user.companyId, documentId, status);
  }

  @Get('requests/:id')
  async getRequest(
    @Param('id') id: string,
    @CurrentUser() user: RequestContext,
  ) {
    return this.esignService.getRequest(id, user.companyId);
  }

  @Post('requests/:id/sign')
  @HttpCode(HttpStatus.OK)
  async signDocument(
    @Param('id') id: string,
    @Body() dto: SignDocumentDto,
    @CurrentUser() user: RequestContext,
  ) {
    return this.esignService.signDocument(id, user.userId, dto);
  }

  @Post('requests/:id/decline')
  @HttpCode(HttpStatus.OK)
  async declineRequest(
    @Param('id') id: string,
    @Body() dto: DeclineEsignDto,
    @CurrentUser() user: RequestContext,
  ) {
    return this.esignService.declineRequest(id, user.userId, dto);
  }
}
