import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '@hr/prisma';
import { CertificateGenerationProcessor } from '../../processors/certificate-generation.processor';
import { makeEnrollment } from '../../../../../../../test/factories/sprint9.factory';

/* eslint-disable @typescript-eslint/no-explicit-any */

describe('CertificateGenerationProcessor', () => {
  let processor: CertificateGenerationProcessor;
  let mockPrisma: any;

  beforeEach(async () => {
    mockPrisma = {
      unscopedClient: {
        courseEnrollment: {
          findUnique: vi.fn().mockResolvedValue(makeEnrollment({ status: 'COMPLETED' })),
          update: vi.fn().mockResolvedValue({}),
        },
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CertificateGenerationProcessor,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    processor = module.get(CertificateGenerationProcessor);
  });

  afterEach(() => vi.clearAllMocks());

  describe('process', () => {
    it('generates certificate and persists key when not yet generated', async () => {
      mockPrisma.unscopedClient.courseEnrollment.findUnique.mockResolvedValue(
        makeEnrollment({ certificateKey: null }),
      );

      await processor.process('enr-001');

      expect(mockPrisma.unscopedClient.courseEnrollment.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { certificateKey: 'certificates/enr-001.pdf' } }),
      );
    });

    it('skips regeneration if certificateKey already set (idempotency)', async () => {
      mockPrisma.unscopedClient.courseEnrollment.findUnique.mockResolvedValue(
        makeEnrollment({ certificateKey: 'certificates/existing.pdf' }),
      );

      await processor.process('enr-001');

      expect(mockPrisma.unscopedClient.courseEnrollment.update).not.toHaveBeenCalled();
    });

    it('skips if enrollment not found', async () => {
      mockPrisma.unscopedClient.courseEnrollment.findUnique.mockResolvedValue(null);

      // Should not throw
      await expect(processor.process('bad-id')).resolves.toBeUndefined();
      expect(mockPrisma.unscopedClient.courseEnrollment.update).not.toHaveBeenCalled();
    });
  });
});
