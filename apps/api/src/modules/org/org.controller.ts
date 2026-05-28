import { Body, Controller, Delete, Get, Inject, Param, Patch, Post } from '@nestjs/common';
import type { RequestContext } from '../../common/context/request-context';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Require } from '../auth/decorators/permissions.decorator';
import { uuidSchema } from '../employees/dto/employee.dto';
import {
  DepartmentBody,
  JobTitleBody,
  LocationBody,
  PayGradeBody,
  type DepartmentDto,
  type JobTitleDto,
  type LocationDto,
  type PayGradeDto,
} from './dto/org.dto';
import { OrgService } from './org.service';

@Controller()
export class OrgController {
  constructor(@Inject(OrgService) private readonly org: OrgService) {}

  @Get('locations')
  @Require.read('employee')
  listLocations(@CurrentUser() user: RequestContext) {
    return this.org.listLocations(user);
  }

  @Post('locations')
  @Require.write('employee')
  createLocation(@CurrentUser() user: RequestContext, @Body() dto: LocationBody) {
    return this.org.createLocation(user, dto as LocationDto);
  }

  @Get('locations/:id')
  @Require.read('employee')
  getLocation(@CurrentUser() user: RequestContext, @Param('id') id: string) {
    return this.org.getLocation(user, uuidSchema.parse(id));
  }

  @Patch('locations/:id')
  @Require.write('employee')
  updateLocation(@CurrentUser() user: RequestContext, @Param('id') id: string, @Body() dto: LocationBody) {
    return this.org.updateLocation(user, uuidSchema.parse(id), dto as LocationDto);
  }

  @Delete('locations/:id')
  @Require.delete('employee')
  deleteLocation(@CurrentUser() user: RequestContext, @Param('id') id: string) {
    return this.org.deleteLocation(user, uuidSchema.parse(id));
  }

  @Get('departments')
  @Require.read('employee')
  listDepartments(@CurrentUser() user: RequestContext) {
    return this.org.listDepartments(user);
  }

  @Post('departments')
  @Require.write('employee')
  createDepartment(@CurrentUser() user: RequestContext, @Body() dto: DepartmentBody) {
    return this.org.createDepartment(user, dto as DepartmentDto);
  }

  @Get('departments/:id')
  @Require.read('employee')
  getDepartment(@CurrentUser() user: RequestContext, @Param('id') id: string) {
    return this.org.getDepartment(user, uuidSchema.parse(id));
  }

  @Patch('departments/:id')
  @Require.write('employee')
  updateDepartment(@CurrentUser() user: RequestContext, @Param('id') id: string, @Body() dto: DepartmentBody) {
    return this.org.updateDepartment(user, uuidSchema.parse(id), dto as DepartmentDto);
  }

  @Delete('departments/:id')
  @Require.delete('employee')
  deleteDepartment(@CurrentUser() user: RequestContext, @Param('id') id: string) {
    return this.org.deleteDepartment(user, uuidSchema.parse(id));
  }

  @Get('job-titles')
  @Require.read('employee')
  listJobTitles(@CurrentUser() user: RequestContext) {
    return this.org.listJobTitles(user);
  }

  @Post('job-titles')
  @Require.write('employee')
  createJobTitle(@CurrentUser() user: RequestContext, @Body() dto: JobTitleBody) {
    return this.org.createJobTitle(user, dto as JobTitleDto);
  }

  @Get('job-titles/:id')
  @Require.read('employee')
  getJobTitle(@CurrentUser() user: RequestContext, @Param('id') id: string) {
    return this.org.getJobTitle(user, uuidSchema.parse(id));
  }

  @Patch('job-titles/:id')
  @Require.write('employee')
  updateJobTitle(@CurrentUser() user: RequestContext, @Param('id') id: string, @Body() dto: JobTitleBody) {
    return this.org.updateJobTitle(user, uuidSchema.parse(id), dto as JobTitleDto);
  }

  @Delete('job-titles/:id')
  @Require.delete('employee')
  deleteJobTitle(@CurrentUser() user: RequestContext, @Param('id') id: string) {
    return this.org.deleteJobTitle(user, uuidSchema.parse(id));
  }

  @Get('pay-grades')
  @Require.read('employee')
  listPayGrades(@CurrentUser() user: RequestContext) {
    return this.org.listPayGrades(user);
  }

  @Post('pay-grades')
  @Require.write('employee')
  createPayGrade(@CurrentUser() user: RequestContext, @Body() dto: PayGradeBody) {
    return this.org.createPayGrade(user, dto as PayGradeDto);
  }

  @Get('pay-grades/:id')
  @Require.read('employee')
  getPayGrade(@CurrentUser() user: RequestContext, @Param('id') id: string) {
    return this.org.getPayGrade(user, uuidSchema.parse(id));
  }

  @Patch('pay-grades/:id')
  @Require.write('employee')
  updatePayGrade(@CurrentUser() user: RequestContext, @Param('id') id: string, @Body() dto: PayGradeBody) {
    return this.org.updatePayGrade(user, uuidSchema.parse(id), dto as PayGradeDto);
  }

  @Delete('pay-grades/:id')
  @Require.delete('employee')
  deletePayGrade(@CurrentUser() user: RequestContext, @Param('id') id: string) {
    return this.org.deletePayGrade(user, uuidSchema.parse(id));
  }

  @Get('org-chart')
  @Require.read('employee')
  orgChart(@CurrentUser() user: RequestContext) {
    return this.org.orgChart(user);
  }
}
