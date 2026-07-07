import { Inject, Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '@hr/prisma';
import { randomUUID } from 'crypto';

@Injectable()
export class SurveyBuilderService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async createSurvey(dto: {
    companyId: string; title: string; description?: string;
    questions: Array<{ prompt: string; type: string; options?: string[]; required?: boolean; orderIndex: number }>;
    createdBy: string; closesAt?: Date;
  }) {
    return this.prisma.unscopedClient.survey.create({
      data: {
        companyId: dto.companyId, title: dto.title, description: dto.description,
        createdBy: dto.createdBy, closesAt: dto.closesAt,
        questions: { create: dto.questions.map((q, i) => ({
          orderIndex: q.orderIndex ?? i, prompt: q.prompt, type: q.type as any,
          options: q.options ?? undefined, required: q.required ?? false,
        })) },
      },
      include: { questions: { orderBy: { orderIndex: 'asc' } } },
    });
  }

  async addQuestion(surveyId: string, dto: { prompt: string; type: string; options?: string[]; required?: boolean }) {
    const survey = await this.prisma.unscopedClient.survey.findUnique({ where: { id: surveyId }, include: { questions: true } });
    if (!survey) throw new NotFoundException('Survey not found');
    if (survey.status !== 'DRAFT') throw new BadRequestException('Can only modify DRAFT surveys');

    const nextOrder = (survey.questions.length ?? 0) + 1;
    return this.prisma.unscopedClient.surveyQuestion.create({
      data: { surveyId, orderIndex: nextOrder, prompt: dto.prompt, type: dto.type as any, options: dto.options ?? undefined, required: dto.required ?? false },
    });
  }

  async reorderQuestions(surveyId: string, orderedQuestionIds: string[]) {
    const survey = await this.prisma.unscopedClient.survey.findUnique({ where: { id: surveyId } });
    if (!survey) throw new NotFoundException('Survey not found');

    return this.prisma.unscopedClient.$transaction(async (tx) => {
      for (let i = 0; i < orderedQuestionIds.length; i++) {
        await tx.surveyQuestion.update({ where: { id: orderedQuestionIds[i] }, data: { orderIndex: i + 1 } });
      }
    });
  }

  async getById(id: string) {
    const s = await this.prisma.unscopedClient.survey.findUnique({ where: { id }, include: { questions: { orderBy: { orderIndex: 'asc' } } } });
    if (!s) throw new NotFoundException('Survey not found');
    return s;
  }
}

@Injectable()
export class SurveyLaunchService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {}

  async launch(surveyId: string, employeeIds: string[]) {
    const survey = await this.prisma.unscopedClient.survey.findUnique({ where: { id: surveyId } });
    if (!survey) throw new NotFoundException('Survey not found');
    if (survey.status !== 'DRAFT') throw new BadRequestException('Only DRAFT surveys can be launched');

    return this.prisma.unscopedClient.$transaction(async (tx) => {
      await tx.survey.update({ where: { id: surveyId }, data: { status: 'LAUNCHED', launchedAt: new Date() } });
      for (const empId of employeeIds) {
        await tx.surveyAssignment.create({ data: { surveyId, employeeId: empId } });
      }
    });
  }
}

@Injectable()
export class SurveyResponseService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async submitResponse(surveyId: string, employeeId: string, answers: Array<{ questionId: string; answer: unknown }>) {
    const assignment = await this.prisma.unscopedClient.surveyAssignment.findUnique({
      where: { surveyId_employeeId: { surveyId, employeeId } },
    });
    if (!assignment) throw new NotFoundException('Assignment not found');
    if (assignment.status === 'COMPLETED') throw new BadRequestException('Already submitted');

    const survey = await this.prisma.unscopedClient.survey.findUnique({ where: { id: surveyId } });
    if (!survey || survey.status !== 'LAUNCHED') throw new BadRequestException('Survey is not accepting responses');

    const anonymousToken = randomUUID();

    return this.prisma.unscopedClient.$transaction(async (tx) => {
      for (const ans of answers) {
        await tx.surveyResponse.create({
          data: { surveyId, questionId: ans.questionId, answer: ans.answer as any, anonymousToken },
        });
      }
      await tx.surveyAssignment.update({
        where: { surveyId_employeeId: { surveyId, employeeId } },
        data: { status: 'COMPLETED' },
      });
    });
  }
}

@Injectable()
export class SurveyResultsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async getAggregateResults(surveyId: string, minN: number = 5) {
    const survey = await this.prisma.unscopedClient.survey.findUnique({
      where: { id: surveyId }, include: { questions: { orderBy: { orderIndex: 'asc' } } },
    });
    if (!survey) throw new NotFoundException('Survey not found');
    if (survey.status !== 'CLOSED') throw new BadRequestException('Survey must be closed to view results');

    const results: Array<{ questionId: string; prompt: string; totalResponses: number; aggregated: unknown }> = [];

    for (const question of survey.questions) {
      const responses = await this.prisma.unscopedClient.surveyResponse.findMany({
        where: { questionId: question.id }, select: { answer: true },
      });
      if (responses.length < minN) {
        results.push({ questionId: question.id, prompt: question.prompt, totalResponses: responses.length, aggregated: null });
        continue;
      }

      if (question.type === 'LIKERT_5' || question.type === 'SINGLE_CHOICE') {
        const distribution: Record<string, number> = {};
        for (const r of responses) {
          const key = String((r.answer as any)?.value ?? r.answer);
          distribution[key] = (distribution[key] ?? 0) + 1;
        }
        results.push({ questionId: question.id, prompt: question.prompt, totalResponses: responses.length, aggregated: { distribution } });
      } else {
        results.push({ questionId: question.id, prompt: question.prompt, totalResponses: responses.length, aggregated: { count: responses.length } });
      }
    }

    return { surveyId, surveyTitle: survey.title, minN, results };
  }
}
