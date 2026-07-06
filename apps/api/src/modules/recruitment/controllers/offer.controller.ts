import { Body, Controller, Get, Inject, Param, Patch, Post } from '@nestjs/common';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { Require } from '../../auth/decorators/permissions.decorator';
import type { RequestContext } from '../../../common/context/request-context';
import { OfferService } from '../services/offer.service';
import { CreateOfferSchema, DeclineOfferSchema, RescindOfferSchema } from '../dto/offer.dto';
import type { CreateOfferDto, DeclineOfferDto, RescindOfferDto } from '../dto/offer.dto';

@Controller()
export class OfferController {
  constructor(@Inject(OfferService) private readonly service: OfferService) {}

  @Post('applications/:id/offers')
  @Require.write('recruitment')
  create(@CurrentUser() user: RequestContext, @Param('id') applicationId: string, @Body() dto: unknown) {
    return this.service.create(applicationId, CreateOfferSchema.parse(dto) as CreateOfferDto, user.userId);
  }

  @Patch('offers/:id/send')
  @Require.write('recruitment')
  send(@Param('id') id: string) {
    return this.service.send(id);
  }

  @Patch('offers/:id/accept')
  @Require.write('recruitment')
  accept(@Param('id') id: string) {
    return this.service.accept(id);
  }

  @Patch('offers/:id/decline')
  @Require.write('recruitment')
  decline(@Param('id') id: string, @Body() dto: unknown) {
    return this.service.decline(id, DeclineOfferSchema.parse(dto) as DeclineOfferDto);
  }

  @Patch('offers/:id/rescind')
  @Require.write('recruitment')
  rescind(@Param('id') id: string, @Body() dto: unknown) {
    return this.service.rescind(id, RescindOfferSchema.parse(dto) as RescindOfferDto);
  }

  @Get('offers/:id')
  @Require.read('recruitment')
  findById(@Param('id') id: string) {
    return this.service.findById(id);
  }
}
