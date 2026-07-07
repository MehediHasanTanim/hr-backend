import { Inject, Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '@hr/prisma';

@Injectable()
export class LearningPathService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async createPath(dto: { companyId: string; title: string; description?: string; createdById: string }) {
    return this.prisma.unscopedClient.learningPath.create({ data: dto });
  }

  async updatePath(id: string, dto: { title?: string; description?: string }) {
    const p = await this.prisma.unscopedClient.learningPath.findUnique({ where: { id } });
    if (!p) throw new NotFoundException('Learning path not found');
    return this.prisma.unscopedClient.learningPath.update({ where: { id }, data: dto });
  }

  async publishPath(id: string) {
    const path = await this.prisma.unscopedClient.learningPath.findUnique({ where: { id }, include: { courses: true } });
    if (!path) throw new NotFoundException('Learning path not found');
    if (path.courses.length === 0) throw new BadRequestException('Must have at least one course to publish');
    return this.prisma.unscopedClient.learningPath.update({ where: { id }, data: { status: 'PUBLISHED' } });
  }

  async addCourseToSequence(pathId: string, courseId: string, sequenceOrder: number) {
    const path = await this.prisma.unscopedClient.learningPath.findUnique({ where: { id: pathId } });
    if (!path) throw new NotFoundException('Learning path not found');
    const course = await this.prisma.unscopedClient.course.findUnique({ where: { id: courseId } });
    if (!course) throw new NotFoundException('Course not found');

    return this.prisma.unscopedClient.learningPathCourse.create({
      data: { learningPathId: pathId, courseId, sequenceOrder },
    });
  }

  async reorderSequence(pathId: string, orderedCourseIds: string[]) {
    const path = await this.prisma.unscopedClient.learningPath.findUnique({ where: { id: pathId } });
    if (!path) throw new NotFoundException('Learning path not found');

    return this.prisma.unscopedClient.$transaction(async (tx) => {
      for (let i = 0; i < orderedCourseIds.length; i++) {
        await tx.learningPathCourse.updateMany({
          where: { learningPathId: pathId, courseId: orderedCourseIds[i] },
          data: { sequenceOrder: i + 1 },
        });
      }
    });
  }

  async removeCourseFromSequence(pathId: string, courseId: string, force?: boolean) {
    const path = await this.prisma.unscopedClient.learningPath.findUnique({ where: { id: pathId } });
    if (!path) throw new NotFoundException('Learning path not found');

    if (!force) {
      // Check for active enrollments
      const activeCount = await this.prisma.unscopedClient.courseEnrollment.count({
        where: { courseId, status: { in: ['NOT_STARTED', 'IN_PROGRESS'] } },
      });
      if (activeCount > 0) throw new BadRequestException('Active enrollments exist — use force=true to override');
    }

    await this.prisma.unscopedClient.learningPathCourse.deleteMany({ where: { learningPathId: pathId, courseId } });
  }

  async getPathById(id: string) {
    const p = await this.prisma.unscopedClient.learningPath.findUnique({
      where: { id }, include: { courses: { include: { course: true }, orderBy: { sequenceOrder: 'asc' } } },
    });
    if (!p) throw new NotFoundException('Learning path not found');
    return p;
  }

  async listPaths(companyId: string) {
    return this.prisma.unscopedClient.learningPath.findMany({
      where: { companyId },
      include: { courses: { include: { course: true }, orderBy: { sequenceOrder: 'asc' } } },
    });
  }
}
