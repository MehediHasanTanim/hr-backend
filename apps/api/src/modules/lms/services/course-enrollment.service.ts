import { Inject, Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '@hr/prisma';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { QUEUE_NAMES } from '../../../common/queues.constants';

// Pure function for property-based testing
export function computeEnrollmentTransition(
  current: { status: string; progressPercent: number },
  action: { type: 'UPDATE_PROGRESS' | 'COMPLETE' | 'EXPIRE'; progressPercent?: number },
): { status: string; progressPercent: number; startedAt?: 'now' | null } | null {
  if (current.status === 'COMPLETED' || current.status === 'EXPIRED') return null;

  if (action.type === 'UPDATE_PROGRESS') {
    const p = action.progressPercent ?? current.progressPercent;
    if (p < current.progressPercent) return null; // monotonic
    if (p === 100) return { status: 'COMPLETED', progressPercent: 100 };
    return { status: current.status === 'NOT_STARTED' ? 'IN_PROGRESS' : current.status, progressPercent: p, startedAt: current.status === 'NOT_STARTED' ? 'now' : null };
  }
  if (action.type === 'COMPLETE') return { status: 'COMPLETED', progressPercent: 100 };
  if (action.type === 'EXPIRE') return { status: 'EXPIRED', progressPercent: current.progressPercent };
  return null;
}

@Injectable()
export class CourseEnrollmentService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(EventEmitter2) private readonly events: EventEmitter2,
  ) {}

  async enroll(courseId: string, employeeId: string, assignmentId?: string) {
    const existing = await this.prisma.unscopedClient.courseEnrollment.findUnique({
      where: { courseId_employeeId: { courseId, employeeId } },
    });
    if (existing) throw new ConflictException('Already enrolled');

    // Check sequential lock: if course is in a learning path with sequential lock
    const pathCourse = await this.prisma.unscopedClient.learningPathCourse.findFirst({
      where: { courseId },
      include: { learningPath: true },
    });
    if (pathCourse?.isSequentialLockEnabled && pathCourse.sequenceOrder > 1) {
      const prevCourses = await this.prisma.unscopedClient.learningPathCourse.findMany({
        where: { learningPathId: pathCourse.learningPathId, sequenceOrder: { lt: pathCourse.sequenceOrder } },
      });
      for (const pc of prevCourses) {
        const enrollment = await this.prisma.unscopedClient.courseEnrollment.findUnique({
          where: { courseId_employeeId: { courseId: pc.courseId, employeeId } },
        });
        if (!enrollment || enrollment.status !== 'COMPLETED') {
          throw new BadRequestException('Prerequisite courses must be completed first');
        }
      }
    }

    return this.prisma.unscopedClient.courseEnrollment.create({
      data: { courseId, employeeId, assignmentId },
    });
  }

  async updateProgress(enrollmentId: string, progressPercent: number, actorId: string) {
    const enrollment = await this.prisma.unscopedClient.courseEnrollment.findUnique({ where: { id: enrollmentId } });
    if (!enrollment) throw new NotFoundException('Enrollment not found');

    const transition = computeEnrollmentTransition(enrollment, { type: 'UPDATE_PROGRESS', progressPercent });
    if (!transition) throw new BadRequestException('Progress must be monotonic and enrollment must be active');

    return this.prisma.unscopedClient.courseEnrollment.update({
      where: { id: enrollmentId },
      data: {
        status: transition.status as any,
        progressPercent: transition.progressPercent,
        ...(transition.startedAt === 'now' ? { startedAt: new Date() } : {}),
      },
    });
  }

  async completeCourse(enrollmentId: string, actorId: string) {
    const enrollment = await this.prisma.unscopedClient.courseEnrollment.findUnique({ where: { id: enrollmentId } });
    if (!enrollment) throw new NotFoundException('Enrollment not found');
    if (enrollment.status === 'COMPLETED') throw new BadRequestException('Already completed');

    await this.prisma.unscopedClient.$transaction(async (tx) => {
      await tx.courseEnrollment.update({
        where: { id: enrollmentId },
        data: { status: 'COMPLETED', progressPercent: 100, completedAt: new Date() },
      });
    });

    // Emit post-commit event for certificate generation
    this.events.emit('course.completed', { enrollmentId, courseId: enrollment.courseId, employeeId: enrollment.employeeId });
  }

  async getCertificateDownloadUrl(enrollmentId: string) {
    const enrollment = await this.prisma.unscopedClient.courseEnrollment.findUnique({ where: { id: enrollmentId } });
    if (!enrollment) throw new NotFoundException('Enrollment not found');
    if (!enrollment.certificateKey) throw new NotFoundException('Certificate not yet generated');
    // Signed URL would be generated via S3Service at read time — returning key as placeholder
    return { certificateKey: enrollment.certificateKey, downloadUrl: null };
  }

  async findByEmployee(employeeId: string) {
    return this.prisma.unscopedClient.courseEnrollment.findMany({
      where: { employeeId },
      include: { course: true },
      orderBy: { createdAt: 'desc' },
    });
  }
}
