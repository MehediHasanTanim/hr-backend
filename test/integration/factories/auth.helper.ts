import * as request from 'supertest';
import type { INestApplication } from '@nestjs/common';

export async function loginAs(
  app: INestApplication,
  email: string,
  password: string = 'Test@1234',
): Promise<string> {
  const res = await request(app.getHttpServer())
    .post('/api/v1/auth/login')
    .send({ email, password });

  if (res.status !== 200) {
    throw new Error(
      `Login failed for ${email}: ${JSON.stringify(res.body)}`,
    );
  }
  return res.body.accessToken as string;
}
