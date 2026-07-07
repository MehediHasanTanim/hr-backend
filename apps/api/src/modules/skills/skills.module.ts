import { Module } from '@nestjs/common';
import { PrismaModule } from '@hr/prisma';
import { SkillTaxonomyService } from './services/skill-taxonomy.service';
import { EmployeeSkillService } from './services/employee-skill.service';

@Module({
  imports: [PrismaModule],
  providers: [SkillTaxonomyService, EmployeeSkillService],
  exports: [SkillTaxonomyService, EmployeeSkillService],
})
export class SkillsModule {}
