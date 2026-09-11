/** Empty in Docker/prod builds so nginx can proxy `/api`. Set in `.env.development` for local Vite. */
export const API_ORIGIN = String(import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');

export function apiUrl(path: string): string {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${API_ORIGIN}${normalized}`;
}
