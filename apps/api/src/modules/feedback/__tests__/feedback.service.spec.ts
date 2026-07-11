import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '@hr/prisma';
import { FeedbackService } from '../services/feedback.service';

/* eslint-disable @typescript-eslint/no-explicit-any */

describe('FeedbackService', () => {
  let service: FeedbackService;
  let mockPrisma: any;

  beforeEach(async () => {
    mockPrisma = {
      unscopedClient: {
        feedback: {
          create: vi.fn().mockImplementation((args: any) => ({ id: 'fb-1', ...args.data })),
          findMany: vi.fn().mockResolvedValue([]),
        },
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [FeedbackService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    service = module.get(FeedbackService);
  });

  afterEach(() => vi.clearAllMocks());

  it('gives feedback via dto', async () => {
    const result = await service.giveFeedback({ givenBy: 'user-1', receivedBy: 'user-2', message: 'Great work!', category: 'PRAISE', visibility: 'SHARED_WITH_MANAGER' });
    expect(result.message).toBe('Great work!');
    expect(result.category).toBe('PRAISE');
  });

  it('lists received feedback', async () => {
    mockPrisma.unscopedClient.feedback.findMany.mockResolvedValue([
      { id: 'fb-1', givenBy: 'user-2', message: 'Great!', category: 'PRAISE' },
    ]);
    const result = await service.listReceived('user-1');
    expect(result).toHaveLength(1);
  });

  it('lists given feedback', async () => {
    const result = await service.listGiven('user-1');
    expect(result).toEqual([]);
  });

  it('supports pagination for listReceived', async () => {
    await service.listReceived('user-1', 2, 10);
    const call = mockPrisma.unscopedClient.feedback.findMany.mock.calls[0][0];
    expect(call.skip).toBe(10);
    expect(call.take).toBe(10);
  });
});
