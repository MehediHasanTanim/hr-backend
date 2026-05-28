import { Module } from '@nestjs/common';
import { EmployeesModule } from '../employees/employees.module';
import { BulkImportController } from './bulk-import.controller';
import { BulkImportService } from './bulk-import.service';

@Module({
  imports: [EmployeesModule],
  controllers: [BulkImportController],
  providers: [BulkImportService],
})
export class BulkImportModule {}
