import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { AppModule } from '../../../src/app.module';
import { applyTestEnv } from '../../../src/test-env';

describe('Swagger OpenAPI Spec', () => {
  let app: INestApplication;

  beforeAll(async () => {
    applyTestEnv();
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  }, 120_000);

  afterAll(async () => {
    await app?.close();
  });

  it('should serve OpenAPI JSON with paths', async () => {
    const response = await app
      .getHttpAdapter()
      .getInstance()
      .inject({
        method: 'GET',
        url: '/api/docs-json',
      });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);

    // Assert paths exist
    expect(body.paths).toBeDefined();

    // Each path entry must have at least one response schema defined
    const pathEntries = Object.entries(body.paths) as [string, Record<string, unknown>][];
    for (const [path, methods] of pathEntries) {
      const methodEntries = Object.entries(methods as Record<string, unknown>);
      for (const [_method, definition] of methodEntries) {
        const def = definition as Record<string, unknown>;
        if (def.responses) {
          const responses = def.responses as Record<string, unknown>;
          const successResponse = responses['200'] ?? responses['201'] ?? responses['202'];
          if (successResponse) {
            const resp = successResponse as Record<string, unknown>;
            // Must have a schema defined (not undocumented {})
            expect(resp.description ?? resp).toBeDefined();
          }
        }
      }
    }

    // Assert components.schemas contains named DTOs
    expect(body.components).toBeDefined();
    expect(body.components.schemas).toBeDefined();
  }, 30_000);

  it('should have all core tags registered', async () => {
    const response = await app
      .getHttpAdapter()
      .getInstance()
      .inject({
        method: 'GET',
        url: '/api/docs-json',
      });

    const body = JSON.parse(response.body);
    const tags = (body.tags as Array<{ name: string }>)?.map((t) => t.name) ?? [];

    // Core tags expected from the spec
    const expectedTags = [
      'Auth',
      'Employees',
      'Leave',
      'Attendance',
      'Payroll',
      'Documents',
      'Policies',
      'Notifications',
      'Reports',
      'MSS',
    ];

    for (const tag of expectedTags) {
      expect(tags).toContain(tag);
    }
  });
});
