import { Controller, Get, Post, Patch, Body, Query, Param, Inject } from '@nestjs/common';
import { CourseService } from './services/course.service';
import { CourseEnrollmentService } from './services/course-enrollment.service';
import { LearningPathService } from './services/learning-path.service';
import { TrainingAssignmentService } from './services/training-assignment.service';

@Controller('lms')
export class LmsController {
  constructor(
    @Inject(CourseService) private readonly courses: CourseService,
    @Inject(CourseEnrollmentService) private readonly enrollments: CourseEnrollmentService,
    @Inject(LearningPathService) private readonly paths: LearningPathService,
    @Inject(TrainingAssignmentService) private readonly training: TrainingAssignmentService,
  ) {}

  @Post('courses') createCourse(@Body() dto: any) { return this.courses.createCourse(dto); }
  @Get('courses') listCourses(@Query() filters: any) { return this.courses.listCourses(filters); }
  @Get('courses/:id') getCourse(@Param('id') id: string) { return this.courses.getCourseById(id); }
  @Patch('courses/:id') updateCourse(@Param('id') id: string, @Body() dto: any) { return this.courses.updateCourse(id, dto, dto.actorId); }

  @Post('enrollments') enroll(@Body() dto: any) { return this.enrollments.enroll(dto.courseId, dto.employeeId, dto.assignmentId); }
  @Patch('enrollments/:id/progress') updateProgress(@Param('id') id: string, @Body() dto: any) { return this.enrollments.updateProgress(id, dto.progressPercent, dto.actorId); }
  @Post('enrollments/:id/complete') completeCourse(@Param('id') id: string, @Body() dto: any) { return this.enrollments.completeCourse(id, dto.actorId); }
  @Get('enrollments/employee/:employeeId') getEnrollments(@Param('employeeId') employeeId: string) { return this.enrollments.findByEmployee(employeeId); }

  @Post('paths') createPath(@Body() dto: any) { return this.paths.createPath(dto); }
  @Get('paths') listPaths(@Query('companyId') companyId: string) { return this.paths.listPaths(companyId); }
  @Get('paths/:id') getPath(@Param('id') id: string) { return this.paths.getPathById(id); }
  @Post('paths/:id/courses') addCourse(@Param('id') id: string, @Body() dto: any) { return this.paths.addCourseToSequence(id, dto.courseId, dto.sequenceOrder); }
  @Post('paths/:id/publish') publishPath(@Param('id') id: string) { return this.paths.publishPath(id); }

  @Post('training/assign') bulkAssign(@Body() dto: any) { return this.training.bulkAssign(dto); }
  @Get('training/compliance/:id') getCompliance(@Param('id') id: string) { return this.training.getComplianceStatus(id); }
}
