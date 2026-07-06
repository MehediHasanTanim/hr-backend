import { Inject, Injectable, ConflictException } from '@nestjs/common';
import { PrismaService } from '@hr/prisma';
import { S3Service } from '../../../common/s3/s3.service';
import type { PublicApplyDto } from '../dto/careers.dto';
import type { CreateCandidateDto, UpdateCandidateDto } from '../dto/candidate.dto';
import type { Prisma } from '@prisma/client';

@Injectable()
export class CandidateService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(S3Service) private readonly s3: S3Service,
  ) {}

  async findOrCreateByEmail(dto: PublicApplyDto & { resumeS3Key?: string }): Promise<{ id: string; isNew: boolean }> {
    const normalizedEmail = dto.email.toLowerCase();

    const existing = await this.prisma.unscopedClient.candidate.findUnique({
      where: { email: normalizedEmail },
    });

    if (existing) {
      // Merge: update phone + resume if provided
      if (dto.phone || dto.resumeS3Key) {
        await this.prisma.unscopedClient.candidate.update({
          where: { id: existing.id },
          data: {
            ...(dto.phone ? { phone: dto.phone } : {}),
            ...(dto.resumeS3Key ? { resumeS3Key: dto.resumeS3Key } : {}),
          },
        });
      }
      return { id: existing.id, isNew: false };
    }

    const created = await this.prisma.unscopedClient.candidate.create({
      data: {
        email: normalizedEmail,
        fullName: dto.fullName,
        phone: dto.phone,
        resumeS3Key: dto.resumeS3Key,
        source: 'CAREERS_PAGE',
      },
    });

    return { id: created.id, isNew: true };
  }

  async create(dto: CreateCandidateDto): Promise<unknown> {
    const existing = await this.prisma.unscopedClient.candidate.findUnique({
      where: { email: dto.email.toLowerCase() },
    });
    if (existing) throw new ConflictException('Candidate with this email already exists');

    return this.prisma.unscopedClient.candidate.create({
      data: {
        email: dto.email.toLowerCase(),
        fullName: dto.fullName,
        phone: dto.phone,
        source: dto.source,
        referredByEmployeeId: dto.referredByEmployeeId,
      },
    });
  }

  async update(id: string, dto: UpdateCandidateDto): Promise<unknown> {
    return this.prisma.unscopedClient.candidate.update({
      where: { id },
      data: dto,
    });
  }

  async findById(id: string): Promise<unknown> {
    return this.prisma.unscopedClient.candidate.findUnique({ where: { id } });
  }

  async findAll(page = 1, limit = 20): Promise<unknown> {
    return this.prisma.unscopedClient.candidate.findMany({
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' },
    });
  }

  async parseResumeStub(candidateId: string, s3Key: string): Promise<void> {
    // STUB: Real AI integration deferred to future sprint.
    // This is a placeholder that writes mocked structured JSON to profileData.
    const mockProfile = {
      skills: ['JavaScript', 'TypeScript', 'Node.js'],
      experienceYears: 5,
      education: "Bachelor's Degree",
      parsedAt: new Date().toISOString(),
    };

    await this.prisma.unscopedClient.candidate.update({
      where: { id: candidateId },
      data: { profileData: mockProfile },
    });
  }
}
