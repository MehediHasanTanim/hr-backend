import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { EncryptionModule } from '../encryption/encryption.module';
import { EmployeesController } from './employees.controller';
import { EmployeesService } from './employees.service';
import { DomainEventsService } from './events/domain-events.service';
import { EmployeeEventHandlers } from './events/employee-event.handlers';
import { EmployeeRepository } from './repositories/employee.repository';

@Module({
  imports: [AuditModule, EncryptionModule],
  controllers: [EmployeesController],
  providers: [EmployeesService, EmployeeRepository, DomainEventsService, EmployeeEventHandlers],
  exports: [EmployeesService, DomainEventsService],
})
export class EmployeesModule {}
