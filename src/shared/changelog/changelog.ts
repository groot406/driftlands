export type ChangelogTarget = 'frontend' | 'backend' | 'both';

export interface ReleaseChangelogEntry {
  id: string;
  releasedAt: number;
  target: ChangelogTarget;
  title: string;
  bullets: string[];
  gitHead?: string;
}

export function mergeChangelogEntries(
  clientEntries: ReleaseChangelogEntry[],
  serverEntries: ReleaseChangelogEntry[],
): ReleaseChangelogEntry[] {
  const merged = new Map<string, ReleaseChangelogEntry>();

  for (const entry of serverEntries) {
    merged.set(entry.id, cloneEntry(entry));
  }
  for (const entry of clientEntries) {
    merged.set(entry.id, cloneEntry(entry));
  }

  return Array.from(merged.values())
    .sort((left, right) => left.releasedAt - right.releasedAt || left.id.localeCompare(right.id));
}

export function getUnseenChangelogEntries(
  entries: ReleaseChangelogEntry[],
  lastSeenChangelogAt: number | null | undefined,
): ReleaseChangelogEntry[] {
  const seenAt = typeof lastSeenChangelogAt === 'number' ? lastSeenChangelogAt : -Infinity;
  return entries
    .filter((entry) => entry.releasedAt > seenAt)
    .sort((left, right) => left.releasedAt - right.releasedAt || left.id.localeCompare(right.id))
    .map((entry) => cloneEntry(entry));
}

export function getLatestChangelogTimestamp(entries: ReleaseChangelogEntry[]): number | null {
  let latest: number | null = null;
  for (const entry of entries) {
    latest = latest === null ? entry.releasedAt : Math.max(latest, entry.releasedAt);
  }
  return latest;
}

function cloneEntry(entry: ReleaseChangelogEntry): ReleaseChangelogEntry {
  return {
    ...entry,
    bullets: entry.bullets.slice(),
  };
}
