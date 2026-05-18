const DRIFTLANDS_API_PATH = '/api/driftlands';

export function getDriftlandsApiUrl(path: string): string {
  const serverUrl = (import.meta.env.VITE_SERVER_URL || '').replace(/\/$/, '');
  return `${serverUrl}${DRIFTLANDS_API_PATH}${path}`;
}
