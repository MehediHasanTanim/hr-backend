import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@hr/prisma';
import {
  SurveyBuilderService, SurveyLaunchService, SurveyResponseService, SurveyResultsService,
} from '../survey.service';
import { makeSurvey, makeSurveyQuestion, makeSurveyAssignment, makeSurveyResponse } from '../../../../../../../test/factories/sprint10.factory';

/* eslint-disable @typescript-eslint/no-explicit-any */

describe('SurveyBuilderService', () => {
  let service: SurveyBuilderService;
  let mockPrisma: any;

  beforeEach(async () => {
    mockPrisma = {
      unscopedClient: {
        survey: {
          findUnique: vi.fn().mockResolvedValue(makeSurvey()),
          create: vi.fn().mockImplementation((args: any) => ({ id: 'sv-001', ...args.data, questions: args.data.questions?.create ?? [] })),
        },
        surveyQuestion: {
          create: vi.fn().mockImplementation((args: any) => ({ id: 'sq-001', ...args.data })),
          update: vi.fn().mockResolvedValue({}),
        },
        $transaction: vi.fn().mockImplementation(async (arg: any) => {
          if (Array.isArray(arg)) return Promise.all(arg);
          return arg(mockPrisma.unscopedClient);
        }),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [SurveyBuilderService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    service = module.get(SurveyBuilderService);
  });

  afterEach(() => vi.clearAllMocks());

  describe('createSurvey', () => {
    it('creates survey with questions', async () => {
      const result = await service.createSurvey({
        companyId: 'comp-1', title: 'Engagement Survey', createdBy: 'admin-1',
        questions: [{ prompt: 'How satisfied are you?', type: 'LIKERT_5', orderIndex: 1 }],
      });
      expect(result.title).toBe('Engagement Survey');
    });
  });

  describe('addQuestion', () => {
    it('adds question to DRAFT survey', async () => {
      mockPrisma.unscopedClient.survey.findUnique.mockResolvedValue(
        makeSurvey({ status: 'DRAFT', questions: [] }),
      );
      const result = await service.addQuestion('sv-001', { prompt: 'New Q', type: 'FREE_TEXT' });
      expect(result.prompt).toBe('New Q');
    });

    it('rejects adding to non-DRAFT survey', async () => {
      mockPrisma.unscopedClient.survey.findUnique.mockResolvedValue(
        makeSurvey({ status: 'LAUNCHED', questions: [] }),
      );
      await expect(service.addQuestion('sv-001', { prompt: 'Q', type: 'FREE_TEXT' })).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException for missing survey', async () => {
      mockPrisma.unscopedClient.survey.findUnique.mockResolvedValue(null);
      await expect(service.addQuestion('bad-id', { prompt: 'Q', type: 'LIKERT_5' })).rejects.toThrow(NotFoundException);
    });
  });

  describe('reorderQuestions', () => {
    it('reassigns order indices', async () => {
      mockPrisma.unscopedClient.survey.findUnique.mockResolvedValue(makeSurvey());
      await service.reorderQuestions('sv-001', ['sq-3', 'sq-1', 'sq-2']);
      expect(mockPrisma.unscopedClient.surveyQuestion.update).toHaveBeenCalledTimes(3);
    });
  });
});

describe('SurveyResponseService', () => {
  let service: SurveyResponseService;
  let mockPrisma: any;

  beforeEach(async () => {
    mockPrisma = {
      unscopedClient: {
        survey: { findUnique: vi.fn().mockResolvedValue(makeSurvey({ status: 'LAUNCHED' })) },
        surveyAssignment: { findUnique: vi.fn().mockResolvedValue(makeSurveyAssignment()), update: vi.fn().mockResolvedValue({}) },
        surveyResponse: { create: vi.fn().mockResolvedValue({}) },
        $transaction: vi.fn().mockImplementation(async (arg: any) => {
          if (Array.isArray(arg)) return Promise.all(arg);
          return arg(mockPrisma.unscopedClient);
        }),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [SurveyResponseService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    service = module.get(SurveyResponseService);
  });

  afterEach(() => vi.clearAllMocks());

  describe('submitResponse', () => {
    it('writes anonymous responses and marks assignment COMPLETED', async () => {
      await service.submitResponse('sv-001', 'emp-1', [{ questionId: 'sq-001', answer: { value: '4' } }]);
      expect(mockPrisma.unscopedClient.surveyResponse.create).toHaveBeenCalled();
      // Verify anonymousToken is NOT derived from employeeId
      const responseCall = mockPrisma.unscopedClient.surveyResponse.create.mock.calls[0][0];
      expect(responseCall.data.anonymousToken).toBeDefined();
      expect(responseCall.data.anonymousToken).not.toBe('emp-1');
      expect(responseCall.data.employeeId).toBeUndefined(); // structural anonymity
      expect(mockPrisma.unscopedClient.surveyAssignment.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: 'COMPLETED' } }),
      );
    });

    it('rejects double submission', async () => {
      mockPrisma.unscopedClient.surveyAssignment.findUnique.mockResolvedValue(
        makeSurveyAssignment({ status: 'COMPLETED' }),
      );
      await expect(service.submitResponse('sv-001', 'emp-1', [{ questionId: 'sq-001', answer: {} }])).rejects.toThrow(BadRequestException);
    });

    it('rejects submission for non-LAUNCHED survey', async () => {
      mockPrisma.unscopedClient.survey.findUnique.mockResolvedValue(makeSurvey({ status: 'CLOSED' }));
      await expect(service.submitResponse('sv-001', 'emp-1', [{ questionId: 'sq-001', answer: {} }])).rejects.toThrow(BadRequestException);
    });
  });
});

describe('SurveyResultsService', () => {
  let service: SurveyResultsService;
  let mockPrisma: any;

  beforeEach(async () => {
    mockPrisma = {
      unscopedClient: {
        survey: {
          findUnique: vi.fn().mockResolvedValue(
            makeSurvey({ status: 'CLOSED', questions: [makeSurveyQuestion()] }),
          ),
        },
        surveyResponse: {
          findMany: vi.fn().mockResolvedValue([makeSurveyResponse()]),
        },
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [SurveyResultsService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    service = module.get(SurveyResultsService);
  });

  afterEach(() => vi.clearAllMocks());

  describe('getAggregateResults', () => {
    it('returns results when above min-N threshold', async () => {
      const responses = Array.from({ length: 5 }, () => makeSurveyResponse({ answer: { value: '4' } }));
      mockPrisma.unscopedClient.surveyResponse.findMany.mockResolvedValue(responses);

      const result = await service.getAggregateResults('sv-001');
      expect(result.results[0].aggregated).not.toBeNull();
    });

    it('suppresses results below min-N threshold', async () => {
      mockPrisma.unscopedClient.surveyResponse.findMany.mockResolvedValue([makeSurveyResponse()]); // only 1

      const result = await service.getAggregateResults('sv-001', 5);
      expect(result.results[0].aggregated).toBeNull();
      expect(result.results[0].totalResponses).toBe(1);
    });

    it('rejects non-CLOSED surveys', async () => {
      mockPrisma.unscopedClient.survey.findUnique.mockResolvedValue(makeSurvey({ status: 'LAUNCHED' }));
      await expect(service.getAggregateResults('sv-001')).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException for missing survey', async () => {
      mockPrisma.unscopedClient.survey.findUnique.mockResolvedValue(null);
      await expect(service.getAggregateResults('bad-id')).rejects.toThrow(NotFoundException);
    });
  });
});

describe('SurveyLaunchService', () => {
  let service: SurveyLaunchService;
  let mockPrisma: any;

  beforeEach(async () => {
    mockPrisma = {
      unscopedClient: {
        survey: { findUnique: vi.fn().mockResolvedValue(makeSurvey({ status: 'DRAFT' })), update: vi.fn().mockResolvedValue({}) },
        surveyAssignment: { create: vi.fn().mockResolvedValue({}) },
        $transaction: vi.fn().mockImplementation(async (arg: any) => {
          if (Array.isArray(arg)) return Promise.all(arg);
          return arg(mockPrisma.unscopedClient);
        }),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [SurveyLaunchService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    service = module.get(SurveyLaunchService);
  });

  afterEach(() => vi.clearAllMocks());

  describe('launch', () => {
    it('launches survey and creates assignments', async () => {
      await service.launch('sv-001', ['emp-1', 'emp-2', 'emp-3']);
      const updateCall = mockPrisma.unscopedClient.survey.update.mock.calls[0][0];
      expect(updateCall.data.status).toBe('LAUNCHED');
      expect(updateCall.data.launchedAt).toBeDefined();
      expect(mockPrisma.unscopedClient.surveyAssignment.create).toHaveBeenCalledTimes(3);
    });

    it('rejects launching non-DRAFT survey', async () => {
      mockPrisma.unscopedClient.survey.findUnique.mockResolvedValue(makeSurvey({ status: 'LAUNCHED' }));
      await expect(service.launch('sv-001', ['emp-1'])).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException for missing survey', async () => {
      mockPrisma.unscopedClient.survey.findUnique.mockResolvedValue(null);
      await expect(service.launch('bad-id', ['emp-1'])).rejects.toThrow(NotFoundException);
    });

    it('handles empty employee list', async () => {
      await service.launch('sv-001', []);
      expect(mockPrisma.unscopedClient.surveyAssignment.create).not.toHaveBeenCalled();
    });
  });
});
