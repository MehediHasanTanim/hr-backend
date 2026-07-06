import { Body, Controller, Get, Inject, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { Require } from '../../auth/decorators/permissions.decorator';
import type { RequestContext } from '../../../common/context/request-context';
import { CandidateService } from '../services/candidate.service';
import { CreateCandidateSchema, UpdateCandidateSchema } from '../dto/candidate.dto';
import type { CreateCandidateDto, UpdateCandidateDto } from '../dto/candidate.dto';

@Controller('candidates')
export class CandidateController {
  constructor(@Inject(CandidateService) private readonly service: CandidateService) {}

  @Post()
  @Require.write('recruitment')
  create(@Body() dto: unknown) {
    return this.service.create(CreateCandidateSchema.parse(dto) as CreateCandidateDto);
  }

  @Get()
  @Require.read('recruitment')
  findAll(@Query('page') page = '1', @Query('limit') limit = '20') {
    return this.service.findAll(Number(page), Number(limit));
  }

  @Get(':id')
  @Require.read('recruitment')
  findById(@Param('id') id: string) {
    return this.service.findById(id);
  }

  @Patch(':id')
  @Require.write('recruitment')
  update(@Param('id') id: string, @Body() dto: unknown) {
    return this.service.update(id, UpdateCandidateSchema.parse(dto) as UpdateCandidateDto);
  }
}
