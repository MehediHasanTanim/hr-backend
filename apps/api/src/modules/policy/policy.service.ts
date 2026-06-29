import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '@hr/prisma';
import { AuditService } from '../audit/audit.service';
import { DomainEventsService } from '../employees/events/domain-events.service';
import {
  POLICY_CREATED,
  POLICY_UPDATED,
  POLICY_PUBLISHED,
  POLICY_ARCHIVED,
  POLICY_ACKNOWLEDGED,
  AUDIT_ACTIONS,
} from '../../common/events/hr-events.constants';
import type { RequestContext } from '../../common/context/request-context';
import type { CreatePolicyDto, UpdatePolicyDto } from './dto/policy.dto';
import type { PolicyStatus } from '@prisma/client';

@Injectable()
export class PolicyService {
  private readonly logger = new Logger(PolicyService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(DomainEventsService) private readonly events: DomainEventsService,
  ) {}

  async createPolicy(dto: CreatePolicyDto, actor: RequestContext) {
    const policy = await this.prisma.unscopedClient.policy.create({
      data: {
        companyId: actor.companyId,
        title: dto.title,
        content: dto.content,
        category: dto.category,
        status: 'DRAFT',
        createdBy: actor.userId,
      },
    });

    await this.audit.record({
      actor,
      companyId: actor.companyId,
      entityType: 'policy',
      entityId: policy.id,
      action: AUDIT_ACTIONS.POLICY_CREATED,
      newValue: { policyId: policy.id, title: dto.title, category: dto.category },
    });

    return policy;
  }

  async updatePolicy(id: string, dto: UpdatePolicyDto, actor: RequestContext) {
    const existing = await this.getOrThrow(id, actor.companyId);

    if (existing.status !== 'DRAFT') {
      throw new BadRequestException('Only draft policies can be updated');
    }

    const changedFields: string[] = [];
    if (dto.title && dto.title !== existing.title) changedFields.push('title');
    if (dto.content && dto.content !== existing.content) changedFields.push('content');
    if (dto.category && dto.category !== existing.category) changedFields.push('category');

    const policy = await this.prisma.unscopedClient.policy.update({
      where: { id },
      data: {
        ...(dto.title ? { title: dto.title } : {}),
        ...(dto.content ? { content: dto.content } : {}),
        ...(dto.category ? { category: dto.category } : {}),
        version: existing.version + 1,
      },
    });

    await this.audit.record({
      actor,
      companyId: actor.companyId,
      entityType: 'policy',
      entityId: policy.id,
      action: AUDIT_ACTIONS.POLICY_UPDATED,
      newValue: { policyId: id, changedFields, newVersion: policy.version },
    });

    return policy;
  }

  async publishPolicy(id: string, actor: RequestContext) {
    const existing = await this.getOrThrow(id, actor.companyId);

    if (existing.status !== 'DRAFT') {
      throw new BadRequestException('Only draft policies can be published');
    }

    const policy = await this.prisma.unscopedClient.$transaction(async (tx) => {
      const updated = await tx.policy.update({
        where: { id },
        data: {
          status: 'PUBLISHED',
          publishedBy: actor.userId,
          publishedAt: new Date(),
        },
      });

      await this.audit.record({
        actor,
        companyId: actor.companyId,
        entityType: 'policy',
        entityId: id,
        action: AUDIT_ACTIONS.POLICY_PUBLISHED,
        newValue: { policyId: id, version: updated.version, publishedBy: actor.userId },
      });

      return updated;
    });

    this.events.emit(POLICY_PUBLISHED, {
      policyId: policy.id,
      policyTitle: policy.title,
      category: policy.category,
      publishedBy: actor.userId,
      companyId: actor.companyId,
    });

    return policy;
  }

  async archivePolicy(id: string, actor: RequestContext) {
    const existing = await this.getOrThrow(id, actor.companyId);

    if (existing.status !== 'PUBLISHED') {
      throw new BadRequestException('Only published policies can be archived');
    }

    const policy = await this.prisma.unscopedClient.policy.update({
      where: { id },
      data: { status: 'ARCHIVED' },
    });

    await this.audit.record({
      actor,
      companyId: actor.companyId,
      entityType: 'policy',
      entityId: id,
      action: AUDIT_ACTIONS.POLICY_ARCHIVED,
      newValue: { policyId: id },
    });

    return policy;
  }

  async acknowledgePolicy(policyId: string, actor: RequestContext) {
    const policy = await this.getOrThrow(policyId, actor.companyId);

    if (policy.status !== 'PUBLISHED') {
      throw new BadRequestException('Only published policies can be acknowledged');
    }

    // Check if already acknowledged (idempotent)
    const existing = await this.prisma.unscopedClient.policyAcknowledgement.findUnique({
      where: {
        policyId_employeeId: {
          policyId,
          employeeId: actor.userId,
        },
      },
    });

    if (existing) {
      return existing;
    }

    const acknowledgement =
      await this.prisma.unscopedClient.$transaction(async (tx) => {
        const ack = await tx.policyAcknowledgement.create({
          data: {
            policyId,
            employeeId: actor.userId,
            companyId: actor.companyId,
          },
        });

        await this.audit.record({
          actor,
          companyId: actor.companyId,
          entityType: 'policy_acknowledgement',
          entityId: ack.id,
          action: AUDIT_ACTIONS.POLICY_ACKNOWLEDGED,
          newValue: { policyId, employeeId: actor.userId },
        });

        return ack;
      });

    return acknowledgement;
  }

  async listPolicies(companyId: string, status?: string, isAdmin = false) {
    const where: Record<string, unknown> = { companyId };
    if (status) {
      where.status = status;
    } else if (!isAdmin) {
      // Non-admins only see published policies
      where.status = 'PUBLISHED';
    }

    return this.prisma.unscopedClient.policy.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
    });
  }

  async getPolicy(id: string, companyId: string) {
    return this.getOrThrow(id, companyId);
  }

  async listAcknowledgements(policyId: string, companyId: string) {
    // Verify policy exists
    await this.getOrThrow(policyId, companyId);

    const acks = await this.prisma.unscopedClient.policyAcknowledgement.findMany({
      where: { policyId, companyId },
      select: {
        employeeId: true,
        acknowledgedAt: true,
      },
      orderBy: { acknowledgedAt: 'desc' },
    });

    return acks;
  }

  /**
   * Returns the count of employees who have and have not acknowledged a mandatory policy.
   */
  async getMandatoryAcknowledgementCount(
    policyId: string,
    companyId: string,
  ): Promise<{ acknowledgedCount: number; pendingCount: number; totalEmployees: number }> {
    // Verify policy exists
    await this.getOrThrow(policyId, companyId);

    const [acknowledgedCount, totalEmployees] =
      await this.prisma.unscopedClient.$transaction([
        this.prisma.unscopedClient.policyAcknowledgement.count({
          where: { policyId, companyId },
        }),
        this.prisma.unscopedClient.employee.count({
          where: { companyId, status: 'ACTIVE' },
        }),
      ]);

    return {
      acknowledgedCount,
      pendingCount: totalEmployees - acknowledgedCount,
      totalEmployees,
    };
  }

  private async getOrThrow(id: string, companyId: string) {
    const policy = await this.prisma.unscopedClient.policy.findFirst({
      where: { id, companyId },
    });
    if (!policy) {
      throw new NotFoundException('Policy not found');
    }
    return policy;
  }
}
