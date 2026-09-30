/** Empty in Docker/prod builds so nginx can proxy `/api`. Set in `.env.development` for local Vite. */
export const API_ORIGIN = String(import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');

export function apiUrl(path: string): string {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${API_ORIGIN}${normalized}`;
}

/** Parse JSON from fetch; surfaces gateway/HTML failures instead of cryptic JSON parse errors. */
export async function parseApiJson<T = unknown>(res: Response): Promise<T> {
  const contentType = res.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    throw new Error(
      res.status >= 500
        ? 'Server error — please try again'
        : `Unexpected response (${res.status})`
    );
  }
  return res.json() as Promise<T>;
}
