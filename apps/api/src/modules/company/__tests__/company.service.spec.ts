import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '@hr/prisma';
import { CompanyService } from '../company.service';

/* eslint-disable @typescript-eslint/no-explicit-any */

describe('CompanyService', () => {
  let service: CompanyService;
  let mockPrisma: any;

  const mockCompany = { id: 'comp-1', name: 'Acme Corp', slug: 'acme-corp', isActive: true };

  beforeEach(async () => {
    mockPrisma = {
      unscopedClient: {
        company: {
          findFirst: vi.fn().mockResolvedValue(mockCompany),
          update: vi.fn().mockImplementation((args: any) => ({ ...mockCompany, ...args.data })),
        },
        companySetting: {
          upsert: vi.fn().mockImplementation((args: any) => ({ ...args.create })),
        },
        employee: { count: vi.fn().mockResolvedValue(50) },
        leaveRequest: { count: vi.fn().mockResolvedValue(5) },
      },
      forCompany: vi.fn().mockReturnValue({
        companySetting: { findMany: vi.fn().mockResolvedValue([]) },
        employee: { count: vi.fn().mockResolvedValue(50) },
        leaveRequest: { count: vi.fn().mockResolvedValue(5) },
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [CompanyService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    service = module.get(CompanyService);
  });

  afterEach(() => vi.clearAllMocks());

  it('gets company by id', async () => {
    const result = await service.getCompany('comp-1');
    expect(result.name).toBe('Acme Corp');
  });

  it('updates company', async () => {
    const result = await service.updateCompany('comp-1', { name: 'Updated' });
    expect(result.name).toBe('Updated');
  });

  it('gets settings', async () => {
    const result = await service.getSettings('comp-1');
    expect(result).toEqual([]);
  });

  it('upserts a setting', async () => {
    await service.upsertSetting('comp-1', 'timezone', 'UTC');
    expect(mockPrisma.unscopedClient.companySetting.upsert).toHaveBeenCalled();
  });

  it('gets company stats', async () => {
    const result = await service.getStats('comp-1');
    expect(result.headcount).toBe(50);
    expect(result.activeEmployees).toBe(50);
    expect(result.pendingRequests).toBe(5);
  });
});
