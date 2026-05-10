import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { fastifySwagger } from '@fastify/swagger';

export async function bootstrapSwagger(
  app: NestFastifyApplication,
): Promise<void> {
  if (
    process.env.NODE_ENV === 'production'
    && process.env.SWAGGER_ENABLED !== 'true'
  ) {
    return;
  }

  const config = new DocumentBuilder()
    .setTitle('HR API')
    .setDescription('Internal HR & IVR management API')
    .setVersion('1.0.0')
    .setContact('Engineering', '', 'eng@company.internal')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      'jwt',
    )
    .addApiKey({ type: 'apiKey', in: 'header', name: 'x-api-key' }, 'api-key')
    .addServer(process.env.API_BASE_URL ?? 'http://localhost:3000')
    .build();

  const document = SwaggerModule.createDocument(app, config, {
    operationIdFactory: (_controllerKey: string, methodKey: string) => methodKey,
    deepScanRoutes: true,
  });

  await app
    .getHttpAdapter()
    .getInstance()
    .register(fastifySwagger, { mode: 'static', specification: { document } });

  SwaggerModule.setup('api/docs', app, document, {
    jsonDocumentUrl: '/api/docs-json',
  });
}
