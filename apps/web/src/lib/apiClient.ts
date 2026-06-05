const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8025/api/v1';

export interface ApiResponse<T> {
  data: T;
}

export async function apiRequest<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
    credentials: 'include',
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.detail ?? `Request failed with status ${response.status}`);
  }

  const body = await response.json() as ApiResponse<T>;
  return body.data;
}
