import { CanActivate, ExecutionContext, Inject, Injectable, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { FastifyRequest } from 'fastify';
import { UnauthorizedError } from '@hr/shared';
import type { RequestContext } from '../../../common/context/request-context';
import { RbacCacheService } from '../../roles/rbac-cache.service';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { TokenService } from '../token.service';
import type { AccessTokenPayload } from '../auth.types';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly logger = new Logger(JwtAuthGuard.name);

  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(TokenService) private readonly tokenService: TokenService,
    @Inject(RbacCacheService) private readonly rbacCache: RbacCacheService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (isPublic) return true;

    const request = ctx.switchToHttp().getRequest<FastifyRequest>();
    if (request.url === '/health') return true;

    const token = this.extractBearerToken(request);
    if (!token) {
      throw new UnauthorizedError('Missing authorization token');
    }

    let payload: AccessTokenPayload;
    try {
      payload = this.tokenService.verifyAccessToken(token);
    } catch (err) {
      this.logger.debug({ err }, 'JWT verification failed');
      throw new UnauthorizedError('Invalid or expired token');
    }

    const permissions = await this.rbacCache.getUserPermissions(payload.sub, payload.companyId);
    const context: RequestContext = {
      userId: payload.sub,
      companyId: payload.companyId,
      email: payload.email,
      roles: payload.roles ?? [],
      permissions,
      sessionId: payload.sessionId,
      traceId: (request.headers['x-trace-id'] as string | undefined) ?? '',
    };

    (request as FastifyRequest & { user: RequestContext }).user = context;
    return true;
  }

  private extractBearerToken(req: FastifyRequest): string | null {
    const auth = req.headers.authorization;
    if (!auth?.startsWith('Bearer ')) return null;
    const token = auth.slice(7).trim();
    return token.length > 0 ? token : null;
  }
}
