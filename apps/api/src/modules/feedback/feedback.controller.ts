import { Controller, Get, Post, Body, Query, Param, Inject } from '@nestjs/common';
import { FeedbackService } from '../feedback/feedback.service';

@Controller('feedback')
export class FeedbackController {
  constructor(@Inject(FeedbackService) private readonly feedback: FeedbackService) {}

  @Post() give(@Body() dto: any) { return this.feedback.giveFeedback(dto.givenBy, dto.receivedBy, dto.message, dto.category, dto.visibility); }
  @Get('received/:userId') listReceived(@Param('userId') userId: string) { return this.feedback.listReceived(userId); }
  @Get('given/:userId') listGiven(@Param('userId') userId: string) { return this.feedback.listGiven(userId); }
}
