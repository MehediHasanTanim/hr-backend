import { Controller, Get, Post, Patch, Body, Query, Param, Inject } from '@nestjs/common';
import { CertificationRegistryService } from './services/certification-registry.service';
import { EmployeeCertificationService } from './services/employee-certification.service';

@Controller('certifications')
export class CertificationController {
  constructor(
    @Inject(CertificationRegistryService) private readonly registry: CertificationRegistryService,
    @Inject(EmployeeCertificationService) private readonly employeeCerts: EmployeeCertificationService,
  ) {}

  @Post() create(@Body() dto: any) { return this.registry.create(dto); }
  @Get() list(@Query('companyId') companyId: string) { return this.registry.list(companyId); }
  @Get(':id') getById(@Param('id') id: string) { return this.registry.getById(id); }
  @Patch(':id') update(@Param('id') id: string, @Body() dto: any) { return this.registry.update(id, dto); }

  @Post('employee') record(@Body() dto: any) { return this.employeeCerts.recordCertification(dto.employeeId, dto); }
  @Get('employee/:employeeId') findByEmployee(@Param('employeeId') employeeId: string) { return this.employeeCerts.findByEmployee(employeeId); }
  @Post(':id/verify') verify(@Param('id') id: string, @Body() dto: any) { return this.employeeCerts.verifyCertification(id, dto.actorId); }
  @Post(':id/revoke') revoke(@Param('id') id: string, @Body() dto: any) { return this.employeeCerts.revokeCertification(id, dto.actorId, dto.reason); }
}
