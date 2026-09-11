import { API_BASE_URL } from '../lib/constants';
import { useAuthStore } from '../store/auth.store';

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

type RequestOptions = {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
  auth?: boolean;
};

export async function apiClient<T = unknown>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const { method = 'GET', body, headers = {}, auth = true } = options;

  const requestHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    ...headers,
  };

  if (auth) {
    const token = useAuthStore.getState().token;
    if (token) {
      requestHeaders.Authorization = `Bearer ${token}`;
    }
  }

  const url = `${API_BASE_URL}${path}`;

  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: requestHeaders,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(
      `Cannot reach the API at ${url}. Use the same Wi-Fi as your computer, keep the server on port 3000, then reload the app.`,
      0,
    );
  }

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new ApiError(data.error || data.message || 'Request failed', res.status);
  }

  return data as T;
}
