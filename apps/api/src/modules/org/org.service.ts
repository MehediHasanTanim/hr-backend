import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '@hr/prisma';
import { ConflictError, NotFoundError } from '@hr/shared';
import { Prisma } from '@prisma/client';
import type { RequestContext } from '../../common/context/request-context';
import type { DepartmentDto, JobTitleDto, LocationDto, PayGradeDto } from './dto/org.dto';

type OrgChartRow = {
  id: string;
  name: string;
  managerId: string | null;
  jobTitle: string | null;
  department: string | null;
  depth: number;
};

@Injectable()
export class OrgService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  listLocations(user: RequestContext) {
    return this.prisma.unscopedClient.location.findMany({
      where: { companyId: user.companyId, deletedAt: null },
      orderBy: { code: 'asc' },
    });
  }

  async getLocation(user: RequestContext, id: string) {
    const location = await this.prisma.unscopedClient.location.findFirst({
      where: { id, companyId: user.companyId, deletedAt: null },
    });
    if (!location) throw new NotFoundError('Location not found');
    return location;
  }

  createLocation(user: RequestContext, dto: LocationDto) {
    return this.prisma.unscopedClient.location.create({
      data: { companyId: user.companyId, ...dto },
    });
  }

  async updateLocation(user: RequestContext, id: string, dto: LocationDto) {
    await this.getLocation(user, id);
    return this.prisma.unscopedClient.location.update({ where: { id }, data: dto });
  }

  async deleteLocation(user: RequestContext, id: string) {
    await this.getLocation(user, id);
    await this.prisma.unscopedClient.location.update({ where: { id }, data: { deletedAt: new Date() } });
    return { id, deleted: true };
  }

  listDepartments(user: RequestContext) {
    return this.prisma.unscopedClient.department.findMany({
      where: { companyId: user.companyId, deletedAt: null },
      include: { children: { where: { deletedAt: null } } },
      orderBy: { code: 'asc' },
    });
  }

  async getDepartment(user: RequestContext, id: string) {
    const department = await this.prisma.unscopedClient.department.findFirst({
      where: { id, companyId: user.companyId, deletedAt: null },
      include: { parent: true, children: { where: { deletedAt: null } } },
    });
    if (!department) throw new NotFoundError('Department not found');
    return department;
  }

  async createDepartment(user: RequestContext, dto: DepartmentDto) {
    if (dto.parentId) await this.getDepartment(user, dto.parentId);
    return this.prisma.unscopedClient.department.create({
      data: { companyId: user.companyId, ...dto },
    });
  }

  async updateDepartment(user: RequestContext, id: string, dto: DepartmentDto) {
    await this.getDepartment(user, id);
    if (dto.parentId) await this.assertNoDepartmentCycle(user.companyId, id, dto.parentId);
    return this.prisma.unscopedClient.department.update({ where: { id }, data: dto });
  }

  async deleteDepartment(user: RequestContext, id: string) {
    const department = await this.getDepartment(user, id);
    if (department.children.length > 0) throw new ConflictError('Cannot delete department with child departments');
    await this.prisma.unscopedClient.department.update({ where: { id }, data: { deletedAt: new Date() } });
    return { id, deleted: true };
  }

  listJobTitles(user: RequestContext) {
    return this.prisma.unscopedClient.jobTitle.findMany({
      where: { companyId: user.companyId, deletedAt: null },
      orderBy: [{ level: 'asc' }, { title: 'asc' }],
    });
  }

  async getJobTitle(user: RequestContext, id: string) {
    const jobTitle = await this.prisma.unscopedClient.jobTitle.findFirst({
      where: { id, companyId: user.companyId, deletedAt: null },
    });
    if (!jobTitle) throw new NotFoundError('Job title not found');
    return jobTitle;
  }

  createJobTitle(user: RequestContext, dto: JobTitleDto) {
    return this.prisma.unscopedClient.jobTitle.create({
      data: { companyId: user.companyId, ...dto },
    });
  }

  async updateJobTitle(user: RequestContext, id: string, dto: JobTitleDto) {
    await this.getJobTitle(user, id);
    return this.prisma.unscopedClient.jobTitle.update({ where: { id }, data: dto });
  }

  async deleteJobTitle(user: RequestContext, id: string) {
    await this.getJobTitle(user, id);
    await this.prisma.unscopedClient.jobTitle.update({ where: { id }, data: { deletedAt: new Date() } });
    return { id, deleted: true };
  }

  listPayGrades(user: RequestContext) {
    return this.prisma.unscopedClient.payGrade.findMany({
      where: { companyId: user.companyId, deletedAt: null },
      orderBy: { code: 'asc' },
    });
  }

  async getPayGrade(user: RequestContext, id: string) {
    const payGrade = await this.prisma.unscopedClient.payGrade.findFirst({
      where: { id, companyId: user.companyId, deletedAt: null },
    });
    if (!payGrade) throw new NotFoundError('Pay grade not found');
    return payGrade;
  }

  createPayGrade(user: RequestContext, dto: PayGradeDto) {
    return this.prisma.unscopedClient.payGrade.create({
      data: { companyId: user.companyId, ...dto },
    });
  }

  async updatePayGrade(user: RequestContext, id: string, dto: PayGradeDto) {
    await this.getPayGrade(user, id);
    return this.prisma.unscopedClient.payGrade.update({ where: { id }, data: dto });
  }

  async deletePayGrade(user: RequestContext, id: string) {
    await this.getPayGrade(user, id);
    await this.prisma.unscopedClient.payGrade.update({ where: { id }, data: { deletedAt: new Date() } });
    return { id, deleted: true };
  }

  async orgChart(user: RequestContext) {
    const rows = await this.prisma.unscopedClient.$queryRaw<OrgChartRow[]>(Prisma.sql`
      WITH RECURSIVE reporting_tree AS (
        SELECT
          e.id,
          e."managerId" AS "managerId",
          e."employeeNumber" AS name,
          jt.title AS "jobTitle",
          d.name AS department,
          0 AS depth
        FROM employees e
        LEFT JOIN job_titles jt ON jt.id = e."jobTitleId"
        LEFT JOIN departments d ON d.id = e."departmentId"
        WHERE e."companyId" = ${user.companyId}::uuid
          AND e."deletedAt" IS NULL
          AND e."managerId" IS NULL
        UNION ALL
        SELECT
          child.id,
          child."managerId" AS "managerId",
          child."employeeNumber" AS name,
          jt.title AS "jobTitle",
          d.name AS department,
          parent.depth + 1 AS depth
        FROM employees child
        INNER JOIN reporting_tree parent ON parent.id = child."managerId"
        LEFT JOIN job_titles jt ON jt.id = child."jobTitleId"
        LEFT JOIN departments d ON d.id = child."departmentId"
        WHERE child."companyId" = ${user.companyId}::uuid
          AND child."deletedAt" IS NULL
      )
      SELECT * FROM reporting_tree ORDER BY depth ASC, name ASC
    `);
    return this.buildOrgTree(rows);
  }

  private async assertNoDepartmentCycle(companyId: string, id: string, parentId: string) {
    if (id === parentId) throw new ConflictError('Department cannot be its own parent');
    const ancestors = await this.prisma.unscopedClient.$queryRaw<{ id: string }[]>(Prisma.sql`
      WITH RECURSIVE ancestors AS (
        SELECT id, "parentId"
        FROM departments
        WHERE id = ${parentId}::uuid AND "companyId" = ${companyId}::uuid
        UNION ALL
        SELECT d.id, d."parentId"
        FROM departments d
        INNER JOIN ancestors a ON d.id = a."parentId"
      )
      SELECT id FROM ancestors
    `);
    if (ancestors.some((row) => row.id === id)) {
      throw new ConflictError('Circular department hierarchy is not allowed');
    }
  }

  private buildOrgTree(rows: OrgChartRow[]) {
    const byId = new Map<string, OrgChartRow & { children: unknown[] }>();
    rows.forEach((row) => byId.set(row.id, { ...row, children: [] }));

    const roots: Array<OrgChartRow & { children: unknown[] }> = [];
    byId.forEach((node) => {
      if (node.managerId && byId.has(node.managerId)) {
        byId.get(node.managerId)?.children.push(node);
      } else {
        roots.push(node);
      }
    });

    return roots.map((node) => this.stripDepth(node));
  }

  private stripDepth(node: OrgChartRow & { children: unknown[] }): unknown {
    return {
      id: node.id,
      name: node.name,
      jobTitle: node.jobTitle,
      department: node.department,
      managerId: node.managerId,
      children: node.children.map((child) => this.stripDepth(child as OrgChartRow & { children: unknown[] })),
    };
  }
}
