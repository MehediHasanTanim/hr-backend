import { CanActivate, ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { FastifyRequest } from 'fastify';
import { ForbiddenError } from '@hr/shared';
import type { RequestContext } from '../../../common/context/request-context';
import {
  type PermissionRequirement,
  PERMISSIONS_KEY,
} from '../decorators/permissions.decorator';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(@Inject(Reflector) private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<PermissionRequirement[]>(
      PERMISSIONS_KEY,
      [ctx.getHandler(), ctx.getClass()],
    );

    if (!required || required.length === 0) return true;

    const request = ctx.switchToHttp().getRequest<FastifyRequest & { user?: RequestContext }>();
    const permissions = request.user?.permissions ?? [];
    const hasAll = required.every((req) =>
      permissions.includes(`${req.resource}:${req.action}`));

    if (!hasAll) {
      throw new ForbiddenError('Insufficient permissions');
    }
    return true;
  }
}
