import { getDriftlandsServerUrl } from './driftlandsServerUrl.ts';

const DRIFTLANDS_API_PATH = '/api/driftlands';

export function getDriftlandsApiUrl(path: string): string {
  return `${getDriftlandsServerUrl()}${DRIFTLANDS_API_PATH}${path}`;
}
