import {
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { DocumentsService } from './documents.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Require } from '../auth/decorators/permissions.decorator';
import type { RequestContext } from '../../common/context/request-context';

@Controller('documents')
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @Post('employees/:employeeId/upload')
  @HttpCode(HttpStatus.CREATED)
  @Require.write('admin')
  async uploadDocument(
    @Param('employeeId') employeeId: string,
    @CurrentUser() user: RequestContext,
    // Note: multipart file handling is done via @fastify/multipart
    // The file and body fields are extracted in a Fastify request handler
  ) {
    // This is a placeholder - actual multipart handling requires Fastify-specific decorators
    // In production, use a custom multipart decorator or Fastify request directly
    return { message: 'Upload endpoint - use multipart/form-data' };
  }

  @Get('employees/:employeeId')
  @Require.read('admin')
  async listDocuments(
    @Param('employeeId') employeeId: string,
    @Query('category') category: string | undefined,
    @CurrentUser() user: RequestContext,
  ) {
    return this.documentsService.listDocuments(employeeId, user.companyId, category);
  }

  @Get(':id/signed-url')
  async getSignedUrl(
    @Param('id') id: string,
    @CurrentUser() user: RequestContext,
  ) {
    return this.documentsService.getSignedUrl(id, user);
  }
}
