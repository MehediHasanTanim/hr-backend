import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from './config.interface';

@Injectable()
export class AppConfigService {
  constructor(private readonly config: ConfigService) {}

  get<K extends keyof AppConfig>(key: K): AppConfig[K] {
    const app = {
      nodeEnv: this.config.getOrThrow<'development' | 'test' | 'production'>('NODE_ENV'),
      port: this.config.get<number>('PORT', 3000),
      host: this.config.get<string>('HOST', '0.0.0.0'),
      apiBaseUrl: this.config.get<string>('API_BASE_URL'),
      corsOrigin: this.config.get<string>('CORS_ORIGIN')?.split(','),
      swaggerEnabled: this.config.get<boolean>('SWAGGER_ENABLED', false),
    } satisfies AppConfig['app'];

    const mappedConfig: AppConfig = {
      app,
      db: {
        url: this.config.getOrThrow<string>('DATABASE_URL'),
        poolMin: this.config.get<number>('DATABASE_POOL_MIN', 2),
        poolMax: this.config.get<number>('DATABASE_POOL_MAX', 10),
      },
      redis: {
        url: this.config.getOrThrow<string>('REDIS_URL'),
      },
      minio: {
        endpoint: this.config.getOrThrow<string>('MINIO_ENDPOINT'),
        port: this.config.get<number>('MINIO_PORT', 9000),
        accessKey: this.config.getOrThrow<string>('MINIO_ACCESS_KEY'),
        secretKey: this.config.getOrThrow<string>('MINIO_SECRET_KEY'),
        useSsl: this.config.get<boolean>('MINIO_USE_SSL', false),
        bucketName: this.config.get<string>('MINIO_BUCKET_NAME', 'hr-uploads'),
      },
      auth: {
        jwtSecret: this.config.getOrThrow<string>('JWT_SECRET'),
        jwtExpiresIn: this.config.get<string>('JWT_EXPIRES_IN', '1h'),
        refreshTokenExpiresIn: this.config.get<string>('REFRESH_TOKEN_EXPIRES_IN', '7d'),
      },
      log: {
        level: this.config.get<string>('LOG_LEVEL', 'info'),
      },
      otel: {
        serviceName: this.config.get<string>('OTEL_SERVICE_NAME', 'hr-api'),
        exporterEndpoint: this.config.get<string>('OTEL_EXPORTER_OTLP_ENDPOINT'),
        samplerArg: this.config.get<number>('OTEL_TRACES_SAMPLER_ARG', 1.0),
      },
    };

    return mappedConfig[key];
  }
}
