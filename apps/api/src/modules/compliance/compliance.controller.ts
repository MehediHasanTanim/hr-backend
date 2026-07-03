import { Controller, Inject } from '@nestjs/common';
import { PrismaService } from '@hr/prisma';

@Controller('compliance')
export class ComplianceController {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  // Audit log routes have been moved to AuditLogController for proper pagination and filtering.
}
