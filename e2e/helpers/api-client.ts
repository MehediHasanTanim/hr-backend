import type { APIRequestContext } from '@playwright/test';

export class HrApiClient {
  private token: string | null = null;

  constructor(private readonly req: APIRequestContext) {}

  async login(email: string, password: string): Promise<void> {
    const res = await this.req.post('/api/v1/auth/login', {
      data: { email, password },
    });
    if (!res.ok()) {
      throw new Error(`Login failed: ${await res.text()}`);
    }
    const body = await res.json();
    this.token = body.accessToken as string;
  }

  private get headers(): Record<string, string> {
    if (!this.token) throw new Error('Not authenticated. Call login() first.');
    return { Authorization: `Bearer ${this.token}` };
  }

  async get(path: string) {
    return this.req.get(path, { headers: this.headers });
  }

  async post(path: string, data?: unknown) {
    return this.req.post(path, { data, headers: this.headers });
  }

  async patch(path: string, data?: unknown) {
    return this.req.patch(path, { data, headers: this.headers });
  }

  async delete(path: string) {
    return this.req.delete(path, { headers: this.headers });
  }
}
