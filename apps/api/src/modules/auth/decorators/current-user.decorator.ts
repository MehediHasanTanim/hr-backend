import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { UnauthorizedError } from '@hr/shared';
import type { RequestContext } from '../../../common/context/request-context';

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): RequestContext => {
    const request = ctx.switchToHttp().getRequest<FastifyRequest & { user?: RequestContext }>();
    if (!request.user) {
      throw new UnauthorizedError('No user context');
    }
    return request.user;
  },
);
