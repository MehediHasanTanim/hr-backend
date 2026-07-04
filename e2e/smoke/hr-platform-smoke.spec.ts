import { test, expect, APIRequestContext } from '@playwright/test';
import { HrApiClient } from '../helpers/api-client';

// E2E smoke tests run against a live server at BASE_URL.
// Users must be pre-seeded via scripts/seed-e2e-users.ts before running.
// Credentials come from environment variables.

const HR_ADMIN_EMAIL = process.env.E2E_HR_ADMIN_EMAIL!;
const HR_ADMIN_PASSWORD = process.env.E2E_HR_ADMIN_PASSWORD ?? 'SmokeTest@1234';
const EMPLOYEE_EMAIL = process.env.E2E_EMPLOYEE_EMAIL!;
const EMPLOYEE_PASSWORD = process.env.E2E_EMPLOYEE_PASSWORD ?? 'SmokeTest@1234';
const MANAGER_EMAIL = process.env.E2E_MANAGER_EMAIL!;
const MANAGER_PASSWORD = process.env.E2E_MANAGER_PASSWORD ?? 'SmokeTest@1234';

// ─── Step 1: Platform health & security ─────────────────────────────────

test.describe('Step 1: Platform health & security', () => {
  test('health check confirms server is running', async ({ request }) => {
    const res = await request.get('/api/health');
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.status).toMatch(/ok|healthy/i);
  });

  test('security headers are present', async ({ request }) => {
    const res = await request.get('/api/health');
    expect(res.headers()['x-content-type-options']).toBe('nosniff');
    expect(res.headers()['x-frame-options']).toBe('DENY');
    expect(res.headers()['content-security-policy']).toBeDefined();
  });

  test('unauthenticated request returns 401', async ({ request }) => {
    const res = await request.get('/api/v1/auth/me');
    expect(res.status()).toBe(401);
  });

  test('expired/invalid JWT returns 401', async ({ request }) => {
    const res = await request.get('/api/v1/auth/me', {
      headers: { Authorization: 'Bearer invalid.jwt.token' },
    });
    expect(res.status()).toBe(401);
  });

  test('HR admin can log in', async ({ request }) => {
    const client = new HrApiClient(request);
    await expect(client.login(HR_ADMIN_EMAIL, HR_ADMIN_PASSWORD)).resolves.toBeUndefined();
  });

  test('HR admin GET /auth/me returns enriched profile', async ({ request }) => {
    const client = new HrApiClient(request);
    await client.login(HR_ADMIN_EMAIL, HR_ADMIN_PASSWORD);

    const res = await client.get('/api/v1/auth/me');
    expect(res.ok()).toBeTruthy();

    const body = await res.json();
    expect(body.leaveBalances).toBeDefined();
    expect(Array.isArray(body.leaveBalances)).toBeTruthy();
    expect(typeof body.pendingTaskCount).toBe('number');
    expect(typeof body.unreadNotificationCount).toBe('number');
  });
});

// ─── Step 2: Employee access ────────────────────────────────────────────

test.describe('Step 2: Employee access', () => {
  test('employee can log in and access own profile', async ({ request }) => {
    const client = new HrApiClient(request);
    await client.login(EMPLOYEE_EMAIL, EMPLOYEE_PASSWORD);

    const res = await client.get('/api/v1/auth/me');
    expect(res.ok()).toBeTruthy();

    const body = await res.json();
    expect(body.email).toBe(EMPLOYEE_EMAIL);
  });

  test('employee cannot access admin employee list', async ({ request }) => {
    const client = new HrApiClient(request);
    await client.login(EMPLOYEE_EMAIL, EMPLOYEE_PASSWORD);

    const res = await client.get('/api/v1/employees');
    expect(res.status()).toBe(403);
  });
});

// ─── Step 3: Manager Self-Service ───────────────────────────────────────

test.describe('Step 3: Manager Self-Service', () => {
  test('manager can fetch team leave requests', async ({ request }) => {
    const client = new HrApiClient(request);
    await client.login(MANAGER_EMAIL, MANAGER_PASSWORD);

    const res = await client.get('/api/v1/leave/requests/team?page=1&limit=10');
    expect(res.ok()).toBeTruthy();

    const body = await res.json();
    expect(Array.isArray(body.data)).toBeTruthy();
    expect(typeof body.total).toBe('number');
  });

  test('employee cannot access team leave endpoint', async ({ request }) => {
    const client = new HrApiClient(request);
    await client.login(EMPLOYEE_EMAIL, EMPLOYEE_PASSWORD);

    const res = await client.get('/api/v1/leave/requests/team');
    expect(res.status()).toBe(403);
  });

  test('manager GET /auth/me includes unreadNotificationCount', async ({ request }) => {
    const client = new HrApiClient(request);
    await client.login(MANAGER_EMAIL, MANAGER_PASSWORD);

    const res = await client.get('/api/v1/auth/me');
    expect(res.ok()).toBeTruthy();

    const body = await res.json();
    expect(typeof body.unreadNotificationCount).toBe('number');
    expect(body.unreadNotificationCount).toBeGreaterThanOrEqual(0);
  });
});

// ─── Step 4: Reports smoke ──────────────────────────────────────────────

test.describe('Step 4: Reports smoke', () => {
  const REPORT_KEYS = [
    'headcount',
    'attrition',
    'payroll_summary',
    'leave_utilization',
    'attendance_summary',
    'new_hires',
    'exits',
  ];

  for (const reportKey of REPORT_KEYS) {
    test(`HR admin can preview ${reportKey} report`, async ({ request }) => {
      const client = new HrApiClient(request);
      await client.login(HR_ADMIN_EMAIL, HR_ADMIN_PASSWORD);

      const res = await client.get(
        `/api/v1/reports/preview?reportKey=${reportKey}&startDate=2025-01-01&endDate=2025-06-30`,
      );

      expect(res.ok()).toBeTruthy();
      const body = await res.json();
      expect(body.reportKey).toBe(reportKey);
      expect(Array.isArray(body.rows)).toBeTruthy();
      expect(typeof body.totalRows).toBe('number');
    });
  }

  test('EMPLOYEE cannot access report preview', async ({ request }) => {
    const client = new HrApiClient(request);
    await client.login(EMPLOYEE_EMAIL, EMPLOYEE_PASSWORD);

    const res = await client.get(
      '/api/v1/reports/preview?reportKey=headcount&startDate=2025-01-01&endDate=2025-06-30',
    );
    expect(res.status()).toBe(403);
  });

  test('HR admin can save and delete a report definition', async ({ request }) => {
    const client = new HrApiClient(request);
    await client.login(HR_ADMIN_EMAIL, HR_ADMIN_PASSWORD);

    const saveRes = await client.post('/api/v1/reports/saved', {
      name: 'E2E Smoke Report',
      reportKey: 'headcount',
      parameters: {
        reportKey: 'headcount',
        startDate: '2025-01-01',
        endDate: '2025-06-30',
      },
    });

    expect([200, 201]).toContain(saveRes.status());
    const body = await saveRes.json();
    if (body.id) {
      await client.delete(`/api/v1/reports/saved/${body.id}`);
    }
  });

  test('on-demand export returns 202 Accepted', async ({ request }) => {
    const client = new HrApiClient(request);
    await client.login(HR_ADMIN_EMAIL, HR_ADMIN_PASSWORD);

    const saveRes = await client.post('/api/v1/reports/saved', {
      name: 'E2E Export Test',
      reportKey: 'headcount',
      parameters: {
        reportKey: 'headcount',
        startDate: '2025-01-01',
        endDate: '2025-03-31',
      },
    });
    const savedId = (await saveRes.json()).id;

    const exportRes = await client.post(`/api/v1/reports/saved/${savedId}/export`, {
      format: 'xlsx',
    });

    expect(exportRes.status()).toBe(202);
    const exportBody = await exportRes.json();
    expect(exportBody.jobId).toBeDefined();

    // Cleanup
    await client.delete(`/api/v1/reports/saved/${savedId}`);
  });
});

// ─── Step 5: Security regression ────────────────────────────────────────

test.describe('Step 5: Security regression', () => {
  test('SQL injection returns safe response', async ({ request }) => {
    const client = new HrApiClient(request);
    await client.login(HR_ADMIN_EMAIL, HR_ADMIN_PASSWORD);

    const injection = "'; DROP TABLE users; --";
    const res = await client.get(
      `/api/v1/employees?search=${encodeURIComponent(injection)}`,
    );

    // Must return 200 or 400 — never 500
    expect([200, 400]).toContain(res.status());
  });

  test('XSS payload in search is handled safely', async ({ request }) => {
    const client = new HrApiClient(request);
    await client.login(HR_ADMIN_EMAIL, HR_ADMIN_PASSWORD);

    const xss = '<script>alert("xss")</script>';
    const res = await client.get(
      `/api/v1/reports/preview?reportKey=headcount&startDate=2025-01-01&endDate=2025-06-30&search=${encodeURIComponent(xss)}`,
    );

    expect([200, 400]).toContain(res.status());
  });

  test('oversized request body returns 413', async ({ request }) => {
    const bigData = 'x'.repeat(11 * 1024 * 1024); // 11 MB
    const res = await request.post('/api/v1/reports/saved', {
      data: { data: bigData },
      headers: { 'Content-Type': 'application/json' },
    });

    expect(res.status()).toBe(413);
  });
});
