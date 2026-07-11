import { Controller, Get, Post, Patch, Body, Query, Param, Inject } from '@nestjs/common';
import { SkillTaxonomyService } from './services/skill-taxonomy.service';
import { EmployeeSkillService } from './services/employee-skill.service';

@Controller('skills')
export class SkillsController {
  constructor(
    @Inject(SkillTaxonomyService) private readonly taxonomy: SkillTaxonomyService,
    @Inject(EmployeeSkillService) private readonly employeeSkills: EmployeeSkillService,
  ) {}

  @Post('taxonomy') createSkill(@Body() dto: any) { return this.taxonomy.createSkill(dto); }
  @Get('taxonomy') listSkills(@Query() filters: any) { return this.taxonomy.listSkills(filters); }
  @Get('taxonomy/:id') getSkill(@Param('id') id: string) { return this.taxonomy.getSkillById(id); }
  @Patch('taxonomy/:id') updateSkill(@Param('id') id: string, @Body() dto: any) { return this.taxonomy.updateSkill(id, dto); }
  @Post('taxonomy/:id/deprecate') deprecateSkill(@Param('id') id: string) { return this.taxonomy.deprecateSkill(id); }

  @Post('employee/assess') selfAssess(@Body() dto: any) { return this.employeeSkills.selfAssess(dto.employeeId, dto.skillId, dto.level); }
  @Post('employee/:id/validate') managerValidate(@Param('id') id: string, @Body() dto: any) { return this.employeeSkills.managerValidate(id, dto.validatedLevel, dto.actorId); }
  @Get('matrix') getMatrix(@Query() filters: any) { return this.employeeSkills.getSkillsMatrix(filters); }
  @Post('gap-analysis') getGapAnalysis(@Body() dto: any) { return this.employeeSkills.getGapAnalysis(dto.targetRoleId, dto.targetSkillProfile); }
  @Get('employee/:employeeId') getEmployeeSkills(@Param('employeeId') employeeId: string) { return this.employeeSkills.getByEmployee(employeeId); }
}
