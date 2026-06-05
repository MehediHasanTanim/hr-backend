import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { Require } from '../../auth/decorators/permissions.decorator';
import type { RequestContext } from '../../../common/context/request-context';
import {
  ClockInBody,
  ClockOutBody,
  CorrectAttendanceBody,
  AttendanceExceptionsQuerySchema,
} from '../dto/attendance.dto';
import { AttendanceService } from '../services/attendance.service';

@Controller('attendance')
export class AttendanceController {
  constructor(@Inject(AttendanceService) private readonly attendanceService: AttendanceService) {}

  @Post('clock-in')
  @Require.write('attendance')
  clockIn(
    @CurrentUser() user: RequestContext,
    @Body() dto: ClockInBody,
    @Req() req: FastifyRequest,
  ) {
    const ipAddress = req.ip;
    return this.attendanceService.clockIn(user.userId, user.companyId, dto as any, ipAddress);
  }

  @Post('clock-out')
  @Require.write('attendance')
  clockOut(@CurrentUser() user: RequestContext) {
    return this.attendanceService.clockOut(user.userId, user.companyId);
  }

  @Get('exceptions')
  @Require.read('attendance')
  getExceptions(
    @CurrentUser() user: RequestContext,
    @Query() query: unknown,
  ) {
    const parsed = AttendanceExceptionsQuerySchema.parse(query);
    return this.attendanceService.getExceptions(user.companyId, parsed);
  }

  @Patch(':id/correct')
  @Require.write('attendance')
  correctRecord(
    @CurrentUser() user: RequestContext,
    @Param('id') id: string,
    @Body() dto: CorrectAttendanceBody,
  ) {
    return this.attendanceService.correctRecord(id, user.companyId, user.userId, dto as any);
  }
}
