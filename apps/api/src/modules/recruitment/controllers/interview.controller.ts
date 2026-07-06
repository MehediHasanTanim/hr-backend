import { Body, Controller, Get, Inject, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { Require } from '../../auth/decorators/permissions.decorator';
import type { RequestContext } from '../../../common/context/request-context';
import { InterviewService } from '../services/interview.service';
import { SchedulePanelSchema, AssignPanelistsSchema, SubmitScorecardSchema, CancelPanelSchema } from '../dto/interview.dto';
import type { SchedulePanelDto, AssignPanelistsDto, SubmitScorecardDto, CancelPanelDto } from '../dto/interview.dto';

@Controller()
export class InterviewController {
  constructor(@Inject(InterviewService) private readonly service: InterviewService) {}

  @Post('applications/:id/interviews')
  @Require.write('recruitment')
  schedule(@CurrentUser() user: RequestContext, @Param('id') applicationId: string, @Body() dto: unknown) {
    return this.service.schedulePanel(applicationId, SchedulePanelSchema.parse(dto) as SchedulePanelDto, user.userId);
  }

  @Patch('interviews/:id/panelists')
  @Require.write('recruitment')
  assignPanelists(@Param('id') id: string, @Body() dto: unknown) {
    return this.service.assignPanelists(id, AssignPanelistsSchema.parse(dto) as AssignPanelistsDto);
  }

  @Post('interviews/:id/scorecards')
  @Require.write('recruitment')
  submitScorecard(@CurrentUser() user: RequestContext, @Param('id') id: string, @Body() dto: unknown) {
    return this.service.submitScorecard(id, user.userId, SubmitScorecardSchema.parse(dto) as SubmitScorecardDto);
  }

  @Patch('interviews/:id/cancel')
  @Require.write('recruitment')
  cancel(@Param('id') id: string, @Body() dto: unknown) {
    return this.service.cancelPanel(id, CancelPanelSchema.parse(dto) as CancelPanelDto);
  }

  @Get('applications/:id/interviews')
  @Require.read('recruitment')
  findByApplication(@Param('id') applicationId: string) {
    return this.service.findByApplication(applicationId);
  }
}
