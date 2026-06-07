import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { AuditModule } from '../audit/audit.module';
import { PAYROLL_RUN_QUEUE, PAYSLIP_GEN_QUEUE } from './constants/queues';

import { PayrollCycleController } from './controllers/payroll-cycle.controller';
import { SalaryComponentController } from './controllers/salary-component.controller';
import { SalaryStructureController } from './controllers/salary-structure.controller';
import { EmployeeSalaryController } from './controllers/employee-salary.controller';
import { PayslipController } from './controllers/payslip.controller';

import { SalaryComponentService } from './services/salary-component.service';
import { SalaryStructureService } from './services/salary-structure.service';
import { EmployeeSalaryService } from './services/employee-salary.service';
import { PayrollEngine } from './services/payroll-engine';
import { PayrollCycleService } from './services/payroll-cycle.service';
import { BankFileService } from './services/bank-file.service';
import { PayslipService } from './services/payslip.service';

import { PayrollRunProcessor } from './processors/payroll-run.processor';
import { PayslipGenProcessor } from './processors/payslip-gen.processor';

@Module({
  imports: [
    AuditModule,
    BullModule.registerQueue(
      { name: PAYROLL_RUN_QUEUE },
      { name: PAYSLIP_GEN_QUEUE },
    ),
  ],
  controllers: [
    PayrollCycleController,
    SalaryComponentController,
    SalaryStructureController,
    EmployeeSalaryController,
    PayslipController,
  ],
  providers: [
    SalaryComponentService,
    SalaryStructureService,
    EmployeeSalaryService,
    PayrollEngine,
    PayrollCycleService,
    BankFileService,
    PayslipService,
    PayrollRunProcessor,
    PayslipGenProcessor,
  ],
  exports: [EmployeeSalaryService, PayrollEngine],
})
export class PayrollModule {}
