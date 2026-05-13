import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import fastifyCookie from '@fastify/cookie';
import type { SuperTest, Test } from 'supertest';
import supertest from 'supertest';
import { AppModule } from '../../app.module';
import { bootstrapFilters } from '../../filters/filters.bootstrap';
import { bootstrapPipes } from '../../pipes/pipes.bootstrap';
import { bootstrapInterceptors } from '../../interceptors/interceptors.bootstrap';
import { PARSER_BODY_LIMIT_BYTES, registerRequestBodyLimit } from '../../security/request-body-limit';
import { registerSecurityHeaders } from '../../security/security-headers';

let app: NestFastifyApplication | undefined;
let request: SuperTest<Test> | undefined;

export async function startApp(): Promise<{ app: NestFastifyApplication; request: SuperTest<Test> }> {
  if (app && request) return { app, request };

  const adapter = new FastifyAdapter({ logger: false, trustProxy: true, bodyLimit: PARSER_BODY_LIMIT_BYTES });
  app = await NestFactory.create<NestFastifyApplication>(AppModule, adapter, {
    bufferLogs: true,
    logger: false,
    abortOnError: false,
  });

  await app.register(fastifyCookie, {
    secret: process.env.COOKIE_SECRET ?? 'test-cookie-secret-with-at-least-32-characters',
  });
  app.setGlobalPrefix('api/v1', { exclude: ['/health'] });
  registerRequestBodyLimit(app);
  registerSecurityHeaders(app);
  bootstrapFilters(app);
  bootstrapPipes(app);
  bootstrapInterceptors(app);
  await app.init();
  await app.getHttpAdapter().getInstance().ready();

  request = supertest(app.getHttpAdapter().getInstance().server);
  return { app, request };
}

export async function stopApp(): Promise<void> {
  await app?.close();
  app = undefined;
  request = undefined;
}

export function getRequest(): SuperTest<Test> {
  if (!request) throw new Error('Test app has not been started');
  return request;
}
