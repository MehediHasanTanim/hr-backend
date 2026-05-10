import { ConfigService } from '@nestjs/config';
import { describe, expect, it } from 'vitest';
import { AppConfigService } from './config.service';

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
      JWT_SECRET: '12345678901234567890123456789012',
    });

    const service = new AppConfigService(config);
    expect(service.get('db')).toEqual({
      url: 'postgresql://u:p@localhost:5432/db',
      poolMin: 2,
      poolMax: 10,
    });
  });
});
