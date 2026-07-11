import { Controller, Get, Post, Body, Param, Inject } from '@nestjs/common';
import { ReviewCycleService } from '../performance/services';
import { GoalService } from '../performance/services/goal.service';
import { ReviewService } from '../performance/services/review.service';

@Controller('performance')
export class PerformanceController {
  constructor(
    @Inject(GoalService) private readonly goals: GoalService,
    @Inject(ReviewService) private readonly reviews: ReviewService,
  ) {}

  @Post('goals') createGoal(@Body() dto: any) { return this.goals.createGoal(dto); }
  @Get('goals/employee/:employeeId') getEmployeeGoals(@Param('employeeId') employeeId: string) { return this.goals.getOkrTree(employeeId); }
  @Get('goals/:id') getGoal(@Param('id') id: string) { return this.goals.findById(id); }
  @Patch('goals/:id') updateGoal(@Param('id') id: string, @Body() dto: any) { return this.goals.updateGoal(id, dto); }
  @Post('goals/:id/checkin') postCheckIn(@Param('id') goalId: string, @Body() dto: any) { return this.goals.postCheckIn(goalId, dto, dto.statusAtCheckIn); }

  @Post('reviews/:id/responses') saveResponse(@Param('id') reviewId: string, @Body() dto: any) { return this.reviews.saveResponse(reviewId, dto.respondentRole, dto.sectionKey, dto.responseJson); }
  @Post('reviews/:id/submit') submitReview(@Param('id') reviewId: string, @Body() dto: any) { return this.reviews.submitReview(reviewId, dto.respondentRole); }
  @Post('reviews/:id/acknowledge') acknowledge(@Param('id') reviewId: string) { return this.reviews.acknowledgeReview(reviewId); }
  @Post('reviews/:id/calibrate') calibrate(@Param('id') reviewId: string, @Body() dto: any) { return this.reviews.applyCalibrationOverride(reviewId, dto, dto.overriddenBy); }
  @Get('reviews/cycle/:cycleId') getByCycle(@Param('cycleId') cycleId: string) { return this.reviews.findByCycle(cycleId); }
}
