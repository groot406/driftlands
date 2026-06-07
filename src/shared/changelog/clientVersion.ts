import type { ReleaseChangelogEntry } from './changelog.ts';

export const CLIENT_VERSION_MANIFEST_PATH = 'driftlands-version.json';

export interface ClientVersionManifest {
  clientReleaseId: string;
  releasedAt: number | null;
  gitHead: string | null;
}

export function getLatestClientReleaseEntry(entries: ReleaseChangelogEntry[]): ReleaseChangelogEntry | null {
  return entries
    .filter((entry) => entry.target === 'frontend' || entry.target === 'both')
    .slice()
    .sort((left, right) => right.releasedAt - left.releasedAt || right.id.localeCompare(left.id))[0] ?? null;
}

export function buildClientVersionManifest(entries: ReleaseChangelogEntry[]): ClientVersionManifest {
  const latest = getLatestClientReleaseEntry(entries);
  if (!latest) {
    return {
      clientReleaseId: 'dev',
      releasedAt: null,
      gitHead: null,
    };
  }

  return {
    clientReleaseId: latest.id,
    releasedAt: latest.releasedAt,
    gitHead: latest.gitHead ?? null,
  };
}

export function isDifferentClientVersion(
  current: ClientVersionManifest,
  remote: ClientVersionManifest | null | undefined,
) {
  return !!remote?.clientReleaseId && remote.clientReleaseId !== current.clientReleaseId;
}
