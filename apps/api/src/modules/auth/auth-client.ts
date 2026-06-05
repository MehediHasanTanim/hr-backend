import type { FastifyRequest } from 'fastify';

export function isMobileClientValue(value: string | string[] | undefined): boolean {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw?.toLowerCase() === 'mobile';
}

export function isMobileAuthClient(req: Pick<FastifyRequest, 'headers'>): boolean {
  return isMobileClientValue(req.headers['x-client-type'])
    || isMobileClientValue(req.headers['x-client-platform']);
}
