import { Inject, Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '@hr/prisma';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AuditService } from '../../audit/audit.service';
import { randomBytes, createHash, timingSafeEqual } from 'crypto';

@Injectable()
export class ApiKeyService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(EventEmitter2) private readonly events: EventEmitter2,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async createKey(companyId: string, dto: { name: string; scopes: string[]; expiresAt?: Date }, actorId: string) {
    const rawBytes = randomBytes(24);
    const rawKey = `hrp_live_${rawBytes.toString('base64url')}`;
    const keyPrefix = rawKey.slice(0, 12);
    const keyHash = createHash('sha256').update(rawKey).digest('hex');

    const result = await this.prisma.unscopedClient.apiKey.create({
      data: {
        companyId, name: dto.name, keyPrefix, keyHash,
        scopes: dto.scopes, createdByUserId: actorId,
        expiresAt: dto.expiresAt ?? undefined,
      },
    });

    this.events.emit('apikey.created', { apiKeyId: result.id, companyId });
    this.audit.logAsync({ companyId, entityType: 'ApiKey', entityId: result.id, action: 'API_KEY_CREATED', newValue: { name: dto.name, scopes: dto.scopes } });

    return { id: result.id, name: result.name, scopes: result.scopes, rawKey, keyPrefix, createdAt: result.createdAt };
  }

  async listKeys(companyId: string) {
    return this.prisma.unscopedClient.apiKey.findMany({
      where: { companyId },
      select: { id: true, keyPrefix: true, name: true, scopes: true, status: true, lastUsedAt: true, expiresAt: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async revokeKey(companyId: string, keyId: string, actorId: string) {
    const key = await this.prisma.unscopedClient.apiKey.findUnique({ where: { id: keyId } });
    if (!key || key.companyId !== companyId) throw new NotFoundException('API key not found');
    if (key.status === 'REVOKED') throw new BadRequestException('Key already revoked');

    const result = await this.prisma.unscopedClient.apiKey.update({
      where: { id: keyId },
      data: { status: 'REVOKED', revokedAt: new Date(), revokedByUserId: actorId },
    });

    this.events.emit('apikey.revoked', { apiKeyId: keyId, companyId });
    this.audit.logAsync({ companyId, entityType: 'ApiKey', entityId: keyId, action: 'API_KEY_REVOKED', newValue: { revokedBy: actorId } });

    return { id: result.id, status: result.status };
  }

  async validateKey(rawKey: string): Promise<{ companyId: string; scopes: string[] } | null> {
    const keyPrefix = rawKey.slice(0, 12);
    const keyHash = createHash('sha256').update(rawKey).digest('hex');

    const candidates = await this.prisma.unscopedClient.apiKey.findMany({
      where: { keyPrefix, status: 'ACTIVE' },
    });

    for (const candidate of candidates) {
      const candidateHash = Buffer.from(candidate.keyHash, 'hex');
      const inputHash = Buffer.from(keyHash, 'hex');
      if (candidateHash.length === inputHash.length && timingSafeEqual(candidateHash, inputHash)) {
        if (candidate.expiresAt && new Date() > candidate.expiresAt) return null;
        // Fire-and-forget lastUsedAt update
        this.prisma.unscopedClient.apiKey.update({
          where: { id: candidate.id }, data: { lastUsedAt: new Date() },
        }).catch(() => {});
        return { companyId: candidate.companyId, scopes: candidate.scopes };
      }
    }

    return null;
  }
}
