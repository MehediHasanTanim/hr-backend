import { ConfigService } from '@nestjs/config';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { AppConfigService } from './config.service';

const privateKeyPath = fileURLToPath(new URL('../../../../keys/private.pem', import.meta.url));
const publicKeyPath = fileURLToPath(new URL('../../../../keys/public.pem', import.meta.url));

describe('AppConfigService', () => {
  it('returns db config shape', () => {
    const config = new ConfigService({
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
      DATABASE_POOL_MIN: 2,
      DATABASE_POOL_MAX: 10,
      REDIS_URL: 'redis://localhost:6379',
      MINIO_ENDPOINT: 'localhost',
      MINIO_ACCESS_KEY: 'a',
      MINIO_SECRET_KEY: 's',
      JWT_PRIVATE_KEY_PATH: privateKeyPath,
      JWT_PUBLIC_KEY_PATH: publicKeyPath,
      COOKIE_SECRET: '12345678901234567890123456789012',
      ENCRYPTION_KEY: Buffer.from('12345678901234567890123456789012').toString('base64'),
      MAIL_HOST: 'localhost',
      MAIL_FROM: 'test@example.com',
    });

    const service = new AppConfigService(config);
    expect(service.get('db')).toEqual({
      url: 'postgresql://u:p@localhost:5432/db',
      poolMin: 2,
      poolMax: 10,
    });
  });

  it('returns file logging config shape', () => {
    const config = new ConfigService({
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
      REDIS_URL: 'redis://localhost:6379',
      MINIO_ENDPOINT: 'localhost',
      MINIO_ACCESS_KEY: 'a',
      MINIO_SECRET_KEY: 's',
      JWT_PRIVATE_KEY_PATH: privateKeyPath,
      JWT_PUBLIC_KEY_PATH: publicKeyPath,
      COOKIE_SECRET: '12345678901234567890123456789012',
      ENCRYPTION_KEY: Buffer.from('12345678901234567890123456789012').toString('base64'),
      MAIL_HOST: 'localhost',
      MAIL_FROM: 'test@example.com',
      LOG_LEVEL: 'debug',
      LOG_FILE_ENABLED: true,
      LOG_FILE_PATH: 'logs/test-api.log',
      LOG_FILE_LEVEL: 'info',
    });

    const service = new AppConfigService(config);
    expect(service.get('log')).toEqual({
      level: 'debug',
      fileEnabled: true,
      filePath: 'logs/test-api.log',
      fileLevel: 'info',
    });
  });
});
