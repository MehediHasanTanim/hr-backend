import { Controller, Get, Post, Body, Param, Inject } from '@nestjs/common';
import { SurveyBuilderService, SurveyLaunchService, SurveyResponseService, SurveyResultsService } from './services/survey.service';

@Controller('surveys')
export class SurveyController {
  constructor(
    @Inject(SurveyBuilderService) private readonly builder: SurveyBuilderService,
    @Inject(SurveyLaunchService) private readonly launch: SurveyLaunchService,
    @Inject(SurveyResponseService) private readonly responses: SurveyResponseService,
    @Inject(SurveyResultsService) private readonly results: SurveyResultsService,
  ) {}

  @Post() create(@Body() dto: any) { return this.builder.createSurvey(dto); }
  @Get(':id') getById(@Param('id') id: string) { return this.builder.getById(id); }
  @Post(':id/questions') addQuestion(@Param('id') id: string, @Body() dto: any) { return this.builder.addQuestion(id, dto); }

  @Post(':id/launch') launchSurvey(@Param('id') id: string, @Body() dto: any) { return this.launch.launch(id, dto.employeeIds); }
  @Post(':id/responses') submitResponse(@Param('id') surveyId: string, @Body() dto: any) { return this.responses.submitResponse(surveyId, dto.employeeId, dto.answers); }
  @Get(':id/results') getResults(@Param('id') surveyId: string) { return this.results.getAggregateResults(surveyId); }
}
