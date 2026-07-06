import { Inject, Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@hr/prisma';
import { AuditService } from '../../audit/audit.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { RequestContext } from '../../../common/context/request-context';
import type { CreateJobRequisitionDto, ApproveRequisitionDto, CloseRequisitionDto } from '../dto/job-requisition.dto';
import type { Prisma } from '@prisma/client';
import { round2dp } from '../../payroll/utils/round2dp';

@Injectable()
export class JobRequisitionService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(EventEmitter2) private readonly events: EventEmitter2,
  ) {}

  async create(dto: CreateJobRequisitionDto & { requestedById: string }): Promise<unknown> {
    const req = await this.prisma.unscopedClient.jobRequisition.create({
      data: {
        title: dto.title,
        departmentId: dto.departmentId,
        requestedById: dto.requestedById,
        employmentType: dto.employmentType,
        locationType: dto.locationType,
        headcountApproved: dto.headcountApproved,
        jobDescription: dto.jobDescription,
        requirements: dto.requirements,
        salaryRangeMin: dto.salaryRangeMin,
        salaryRangeMax: dto.salaryRangeMax,
      },
    });
    return req;
  }

  async submitForApproval(id: string): Promise<unknown> {
    const req = await this.prisma.unscopedClient.jobRequisition.findUnique({ where: { id } });
    if (!req) throw new NotFoundException('Requisition not found');
    if (req.status !== 'DRAFT') throw new BadRequestException('Only draft requisitions can be submitted');

    return this.prisma.unscopedClient.jobRequisition.update({
      where: { id },
      data: { status: 'PENDING_APPROVAL' },
    });
  }

  async approve(id: string, approverId: string, dto: ApproveRequisitionDto): Promise<unknown> {
    const req = await this.prisma.unscopedClient.jobRequisition.findUnique({ where: { id } });
    if (!req) throw new NotFoundException('Requisition not found');
    if (req.status !== 'PENDING_APPROVAL') throw new BadRequestException('Only pending requisitions can be approved');

    const slug = await this.generateUniqueSlug(req.title);

    const updated = await this.prisma.unscopedClient.jobRequisition.update({
      where: { id },
      data: {
        status: 'OPEN',
        approvedById: approverId,
        publicSlug: dto.publish ? slug : null,
        publishedAt: dto.publish ? new Date() : null,
      },
    });

    // Post-commit: emit event + audit log
    this.events.emit('requisition.approved', { requisitionId: id, slug });
    this.audit.logAsync({
      companyId: '',
      entityType: 'job_requisition',
      entityId: id,
      action: 'REQUISITION_APPROVED',
    });

    return updated;
  }

  async hold(id: string): Promise<unknown> {
    const req = await this.prisma.unscopedClient.jobRequisition.findUnique({ where: { id } });
    if (!req) throw new NotFoundException('Requisition not found');
    if (req.status !== 'OPEN') throw new BadRequestException('Only open requisitions can be put on hold');

    return this.prisma.unscopedClient.jobRequisition.update({
      where: { id },
      data: { status: 'ON_HOLD' },
    });
  }

  async close(id: string, dto: CloseRequisitionDto): Promise<unknown> {
    const req = await this.prisma.unscopedClient.jobRequisition.findUnique({ where: { id } });
    if (!req) throw new NotFoundException('Requisition not found');
    if (!['OPEN', 'ON_HOLD'].includes(req.status)) throw new BadRequestException('Cannot close this requisition');

    if (req.headcountFilled < req.headcountApproved && !dto.force) {
      throw new BadRequestException('Requisition has unfilled headcount. Use force=true to override.');
    }

    return this.prisma.unscopedClient.jobRequisition.update({
      where: { id },
      data: { status: 'CLOSED', closedAt: new Date() },
    });
  }

  async cancel(id: string): Promise<unknown> {
    const req = await this.prisma.unscopedClient.jobRequisition.findUnique({ where: { id } });
    if (!req) throw new NotFoundException('Requisition not found');
    if (['CLOSED'].includes(req.status)) throw new BadRequestException('Cannot cancel a closed requisition');

    return this.prisma.unscopedClient.jobRequisition.update({
      where: { id },
      data: { status: 'CANCELLED' },
    });
  }

  async incrementHeadcountFilled(id: string, tx?: Prisma.TransactionClient): Promise<void> {
    const client = tx ?? this.prisma.unscopedClient;
    await client.jobRequisition.update({
      where: { id },
      data: { headcountFilled: { increment: 1 } },
    });

    const updated = await client.jobRequisition.findUnique({ where: { id } });
    if (updated && updated.headcountFilled >= updated.headcountApproved) {
      await client.jobRequisition.update({
        where: { id },
        data: { status: 'CLOSED', closedAt: new Date() },
      });
    }
  }

  async findAll(status?: string): Promise<unknown> {
    return this.prisma.unscopedClient.jobRequisition.findMany({
      where: status ? { status: status as any } : {},
      orderBy: { createdAt: 'desc' },
    });
  }

  async findById(id: string): Promise<unknown> {
    const req = await this.prisma.unscopedClient.jobRequisition.findUnique({ where: { id } });
    if (!req) throw new NotFoundException('Requisition not found');
    return req;
  }

  async findOpenForCareers(page = 1, limit = 20): Promise<unknown> {
    return this.prisma.unscopedClient.jobRequisition.findMany({
      where: { status: 'OPEN', publicSlug: { not: null } },
      select: { id: true, title: true, publicSlug: true, locationType: true, employmentType: true, jobDescription: true, departmentId: true, publishedAt: true },
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { publishedAt: 'desc' },
    });
  }

  async findBySlug(slug: string): Promise<unknown> {
    const req = await this.prisma.unscopedClient.jobRequisition.findUnique({
      where: { publicSlug: slug, status: 'OPEN' },
    });
    if (!req) throw new NotFoundException('Job not found');
    return req;
  }

  private async generateUniqueSlug(title: string): Promise<string> {
    const base = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    const suffix = Math.random().toString(36).slice(2, 8);
    const slug = `${base}-${suffix}`;
    return slug;
  }
}
