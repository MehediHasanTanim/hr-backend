import { Module } from '@nestjs/common';
import { PrismaModule } from '@hr/prisma';
import {
  SurveyBuilderService, SurveyLaunchService,
  SurveyResponseService, SurveyResultsService,
} from './services/survey.service';
import { SurveyController } from './survey.controller';

@Module({
  controllers: [SurveyController],
  imports: [PrismaModule],
  providers: [SurveyBuilderService, SurveyLaunchService, SurveyResponseService, SurveyResultsService],
  exports: [SurveyBuilderService, SurveyLaunchService, SurveyResponseService, SurveyResultsService],
})
export class SurveyModule {}
