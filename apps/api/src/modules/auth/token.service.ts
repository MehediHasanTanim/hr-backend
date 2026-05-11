import { Inject, Injectable } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import * as crypto from 'node:crypto';
import * as jwt from 'jsonwebtoken';
import { UnauthorizedError } from '@hr/shared';
import { AppConfigService } from '../../config/config.service';
import { RedisKeys } from '../../common/redis/redis-keys';
import { RedisService } from '../../common/redis/redis.service';
import type { AccessTokenPayload } from './auth.types';

interface RefreshTokenMeta {
  userId: string;
  companyId: string;
  email: string;
  roles: string[];
  sessionId: string;
  issuedAt: number;
}

@Injectable()
export class TokenService {
  constructor(
    @Inject(AppConfigService) private readonly config: AppConfigService,
    @Inject(RedisService) private readonly redis: RedisService,
  ) {}

  signAccessToken(payload: AccessTokenPayload): string {
    const jwtConfig = this.config.get('jwt');
    return jwt.sign(payload, jwtConfig.privateKey, {
      algorithm: 'RS256',
      expiresIn: '15m',
      issuer: 'hr-api',
      audience: 'hr-web',
    });
  }

  verifyAccessToken(token: string, ignoreExpiration = false): AccessTokenPayload {
    const jwtConfig = this.config.get('jwt');
    return jwt.verify(token, jwtConfig.publicKey, {
      algorithms: ['RS256'],
      issuer: 'hr-api',
      audience: 'hr-web',
      ignoreExpiration,
    }) as AccessTokenPayload;
  }

  async issueRefreshToken(meta: Omit<RefreshTokenMeta, 'issuedAt'>): Promise<string> {
    const raw = crypto.randomBytes(32).toString('hex');
    const hash = this.sha256(raw);
    const ttl = 7 * 24 * 60 * 60;

    await this.redis.set(
      RedisKeys.refreshToken(hash),
      JSON.stringify({ ...meta, issuedAt: Date.now() }),
      ttl,
    );

    return raw;
  }

  async rotateRefreshToken(
    rawToken: string,
    sessionId: string,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const hash = this.sha256(rawToken);
    const key = RedisKeys.refreshToken(hash);
    const raw = await this.redis.get(key);

    if (!raw) {
      await this.revokeSession(sessionId);
      throw new UnauthorizedError('Refresh token invalid or expired');
    }

    const meta = JSON.parse(raw) as RefreshTokenMeta;
    if (meta.sessionId !== sessionId) {
      throw new UnauthorizedError('Session mismatch');
    }

    await this.redis.del(key);

    const newSessionId = crypto.randomUUID();
    const refreshToken = await this.issueRefreshToken({
      userId: meta.userId,
      companyId: meta.companyId,
      email: meta.email,
      roles: meta.roles,
      sessionId: newSessionId,
    });
    const accessToken = this.signAccessToken({
      sub: meta.userId,
      companyId: meta.companyId,
      email: meta.email,
      roles: meta.roles,
      sessionId: newSessionId,
    });

    return { accessToken, refreshToken };
  }

  async revokeSession(sessionId: string): Promise<void> {
    const keys = await this.redis.keys('auth:refresh:*');
    await Promise.all(keys.map(async (key) => {
      const raw = await this.redis.get(key);
      if (!raw) return;
      const meta = JSON.parse(raw) as { sessionId: string };
      if (meta.sessionId === sessionId) {
        await this.redis.del(key);
      }
    }));
  }

  async revokeUser(userId: string): Promise<void> {
    const keys = await this.redis.keys('auth:refresh:*');
    await Promise.all(keys.map(async (key) => {
      const raw = await this.redis.get(key);
      if (!raw) return;
      const meta = JSON.parse(raw) as { userId: string };
      if (meta.userId === userId) {
        await this.redis.del(key);
      }
    }));
  }

  setRefreshTokenCookie(reply: FastifyReply, token: string): void {
    const isProd = this.config.get('app').nodeEnv === 'production';
    void reply.setCookie('__Secure-rt', token, {
      httpOnly: true,
      secure: isProd,
      sameSite: 'strict',
      path: '/api/v1/auth/refresh',
      maxAge: 7 * 24 * 60 * 60,
    });
  }

  clearRefreshTokenCookie(reply: FastifyReply): void {
    void reply.clearCookie('__Secure-rt', { path: '/api/v1/auth/refresh' });
  }

  sha256(value: string): string {
    return crypto.createHash('sha256').update(value).digest('hex');
  }
}
