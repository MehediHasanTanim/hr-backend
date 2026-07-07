import { Module } from '@nestjs/common';
import { PrismaModule } from '@hr/prisma';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { CourseService } from './services/course.service';
import { CourseEnrollmentService } from './services/course-enrollment.service';
import { LearningPathService } from './services/learning-path.service';
import { TrainingAssignmentService } from './services/training-assignment.service';
import { CertificateGenerationProcessor } from './processors/certificate-generation.processor';
import { TrainingDeadlineReminderProcessor } from './processors/training-deadline-reminder.processor';
import { AuditService } from '../audit/audit.service';

@Module({
  imports: [PrismaModule],
  providers: [
    CourseService,
    CourseEnrollmentService,
    LearningPathService,
    TrainingAssignmentService,
    CertificateGenerationProcessor,
    TrainingDeadlineReminderProcessor,
    AuditService,
  ],
  exports: [
    CourseService,
    CourseEnrollmentService,
    LearningPathService,
    TrainingAssignmentService,
    CertificateGenerationProcessor,
    TrainingDeadlineReminderProcessor,
  ],
})
export class LmsModule {}
