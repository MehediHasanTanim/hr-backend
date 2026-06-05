import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { HolidayModule } from '../holiday/holiday.module';
import { EmployeesModule } from '../employees/employees.module';
import { LeaveTypeController } from './controllers/leave-type.controller';
import { LeaveRequestController } from './controllers/leave-request.controller';
import { LeaveCalendarController } from './controllers/leave-calendar.controller';
import { LeaveTypeService } from './services/leave-type.service';
import { LeaveAccrualEngine } from './services/leave-accrual.engine';
import { LeaveRequestService } from './services/leave-request.service';
import { LeaveCalendarService } from './services/leave-calendar.service';

@Module({
  imports: [AuditModule, HolidayModule, EmployeesModule],
  controllers: [LeaveTypeController, LeaveRequestController, LeaveCalendarController],
  providers: [
    LeaveTypeService,
    LeaveAccrualEngine,
    LeaveRequestService,
    LeaveCalendarService,
  ],
  exports: [LeaveTypeService, LeaveAccrualEngine, LeaveRequestService],
})
export class LeaveModule {}
