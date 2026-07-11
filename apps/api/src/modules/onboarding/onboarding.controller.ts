import { Controller, Get, Post, Body, Param, Inject } from '@nestjs/common';
import { OnboardingTemplate, OnboardingAssignmentService } from '../onboarding/services';

@Controller('onboarding')
export class OnboardingController {
  constructor(@Inject(OnboardingAssignmentService) private readonly onboarding: OnboardingAssignmentService) {}

  @Post('assign') assign(@Body() dto: any) { return this.onboarding.assignTemplateToEmployee(dto.employeeId, dto.templateId, new Date(dto.hireDate), dto.assignedBy); }
  @Get('employee/:employeeId') getByEmployee(@Param('employeeId') employeeId: string) { return this.onboarding.getEmployeeOnboarding(employeeId); }
}
